import { useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GROUPS, displayBasketName, pct, toEvent, usd, usdSigned, type EventKind } from "@mercury/view";
import { TabScene } from "../../src/ui/TabScene";
import {
  Button,
  Chip,
  Icon,
  IconButton,
  Mark,
  MoveChip,
  MovePill,
  PressableScale,
  Skeleton,
  StockLogo,
  Text,
  type IconName,
} from "../../src/ui";
import { useActivityFeed, useBorrow, useMoney, usePortfolio, type Borrow } from "../../src/api";
import { useActions } from "../../src/actions/Actions";
import { Attention } from "../../src/home/Attention";
import { ComingUp } from "../../src/home/ComingUp";
import { Watching } from "../../src/home/Watching";
import { usePrefs } from "../../src/prefs";
import { EventRow, EventRowSkeleton } from "../../src/activity/EventRow";
import { color, font, radius, space } from "../../src/theme";

/** The three the home screen offers, out of the shared six. */
const FILTERS = ["all", "trades", "income"] as const;
type Filter = (typeof FILTERS)[number];
const KINDS_OF = (f: Filter): readonly EventKind[] => GROUPS.find((g) => g.key === f)?.kinds ?? [];

/** A summary, not the list: the rest is a tap away on Invest and Activity. */
const HOLDING_ROWS = 5;
const FEED_ROWS = 4;

/* The allocation bar's colours: stocks in the buy teal, baskets in its lighter
   tint, cash in the neutral grey — the web's allocation palette. */
const ALLOC = { stocks: "#007682", baskets: "#7CC3C9", cash: "#D9D7D0" };

const num = (v: string | number | null | undefined): number => Number(v ?? 0);
const MASK = "••••";

/**
 * Home, set the way the web's Portfolio page is: a white card for the account
 * — what it is worth, what moved today, the three things to do next, and the
 * figures it is made of — then what you hold, then what has happened. One page
 * of white cards on the grey ground, as every other tab is, rather than the
 * dark band and pulled-up sheet it used to be.
 */
function PortfolioScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const openActions = useActions();
  const prefs = usePrefs();
  /* Starts as Settings says, and follows it if it changes; the eye still flips it for now. */
  const [hidden, setHidden] = useState(prefs.hideBalances);
  useEffect(() => setHidden(prefs.hideBalances), [prefs.hideBalances]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const portfolio = usePortfolio();
  const money = useMoney();
  const borrow = useBorrow();
  const activity = useActivityFeed();

  const p = portfolio.data;
  const holdings = useMemo(
    () => [...(p?.holdings ?? [])].sort((a, b) => num(b.valueUsd) - num(a.valueUsd)),
    [p?.holdings],
  );
  /*
   * Summed from the positions rather than derived as `total - cash`: the
   * server's total is net of debt, so the subtraction would understate the
   * stocks by the size of the loan.
   */
  const stocksUsd = holdings.reduce((t, h) => t + num(h.valueUsd), 0);
  const baskets = p?.baskets ?? [];
  const basketUsd = num(p?.basketUsd);
  const cashUsd = num(p?.cashUsd);
  const debtUsd = num(p?.debtUsd);
  const apr = num(money.data?.yieldApr) * 100;

  const events = useMemo(() => (activity.data?.items ?? []).map(toEvent), [activity.data]);
  const kinds = KINDS_OF(filter);
  const shown = (kinds.length === 0 ? events : events.filter((e) => kinds.includes(e.kind))).slice(
    0,
    FEED_ROWS,
  );

  const waiting = portfolio.isPending && p === undefined;
  const failed = portfolio.isError && p === undefined;
  const figure = (v: number) => (hidden ? MASK : usd(v));
  /* A part's share of what the account holds, before any loan. */
  const share = (v: number) => {
    const whole = stocksUsd + basketUsd + cashUsd;
    return whole > 0 ? v / whole : 0;
  };
  const toYours = () => router.navigate({ pathname: "/invest", params: { shelf: "yours" } });

  const refreshAll = async (): Promise<void> => {
    setRefreshing(true);
    await Promise.all([portfolio.refetch(), money.refetch(), borrow.refetch(), activity.refetch()]);
    setRefreshing(false);
  };

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 6 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refreshAll()}
            tintColor={color.faint}
          />
        }
      >
        {/* ── Who you are ─────────────────────────────────────────────────── */}
        <View style={s.brandRow}>
          <View style={s.brand}>
            <View style={s.markRing}>
              <Mark size={18} color={color.ink} />
            </View>
            <View>
              <RNText style={s.greeting}>{greeting()}</RNText>
              <RNText style={s.date}>{today()}</RNText>
            </View>
          </View>
          <View style={s.headButtons}>
            <IconButton
              icon={hidden ? "eyeOff" : "eye"}
              label={hidden ? "Show figures" : "Hide figures"}
              onPress={() => setHidden((v) => !v)}
            />
            <IconButton icon="cog" label="Settings" onPress={() => router.push("/settings")} />
          </View>
        </View>

        {/* ── What you are worth, and what to do about it ─────────────────── */}
        <View style={s.card}>
          <View style={s.account}>
            <RNText style={s.label}>Net worth</RNText>
            {/*
             * Missing is not zero. An account that could not be read says so;
             * $0.00 there would be a figure somebody could act on, and wrong.
             */}
            {failed ? (
              <Unreachable onRetry={() => void portfolio.refetch()} />
            ) : waiting ? (
              <View style={s.gap}>
                <Skeleton width={210} height={40} />
                <Skeleton width={140} height={18} />
              </View>
            ) : (
              <>
                <RNText style={s.worth} numberOfLines={1} adjustsFontSizeToFit>
                  {figure(num(p?.totalValueUsd))}
                </RNText>
                {/* A move that rounds to nothing is not news, as on the web. */}
                {!hidden && Math.abs(num(p?.changeUsd)) >= 0.005 && (
                  <MovePill
                    pctText={`${Math.abs(num(p?.changePct)).toFixed(2)}%`}
                    usdText={usdSigned(num(p?.changeUsd))}
                    up={num(p?.changeUsd) >= 0}
                  />
                )}
              </>
            )}
          </View>

          {/*
           * What the total is made of, kept quiet: a hairline split in the parts'
           * colours, then the parts as plain columns — no panels, no icons. The
           * things to do with the money live behind the + button.
           */}
          <View style={s.split}>
            {!waiting && !hidden && share(stocksUsd) + share(basketUsd) + share(cashUsd) > 0 && (
              <View style={s.line}>
                {[
                  { key: "stocks", v: share(stocksUsd), tint: ALLOC.stocks },
                  { key: "baskets", v: share(basketUsd), tint: ALLOC.baskets },
                  { key: "cash", v: share(cashUsd), tint: ALLOC.cash },
                ]
                  .filter((part) => part.v > 0)
                  .map((part) => (
                    <View key={part.key} style={{ flex: part.v, backgroundColor: part.tint }} />
                  ))}
              </View>
            )}
            <View style={s.columns}>
              <Column
                tint={ALLOC.stocks}
                share={share(stocksUsd)}
                masked={hidden}
                label="Stocks"
                value={figure(stocksUsd)}
                sub={holdings.length === 1 ? "1 position" : `${holdings.length} positions`}
                loading={waiting}
                onPress={toYours}
              />
              {basketUsd > 0 && (
                <Column
                  tint={ALLOC.baskets}
                  share={share(basketUsd)}
                  masked={hidden}
                  label="Baskets"
                  value={figure(basketUsd)}
                  sub={baskets.length === 1 ? "1 basket" : `${baskets.length} baskets`}
                  loading={waiting}
                  onPress={() => router.push("/baskets")}
                />
              )}
              <Column
                tint={ALLOC.cash}
                share={share(cashUsd)}
                masked={hidden}
                label="Cash"
                value={figure(cashUsd)}
                sub={money.data ? `${pct(apr, 1)} a year` : "In your account"}
                loading={waiting}
                onPress={() => router.navigate("/money")}
              />
              {debtUsd > 0 && (
                <Column
                  tint={color.warn}
                  share={null}
                  masked={hidden}
                  label="Borrowed"
                  value={hidden ? MASK : `−${usd(debtUsd)}`}
                  sub={borrowedLine(p?.debtIsStale === true, borrow.data)}
                  warn={borrow.data !== undefined && borrow.data.health !== "healthy"}
                  loading={waiting}
                  onPress={() => router.push("/borrow")}
                />
              )}
            </View>
          </View>
        </View>

        {/* ── Something to act on, only when there is ────────────────────── */}
        <Attention
          borrow={borrow.data}
          empty={!waiting && !failed && holdings.length === 0 && basketUsd === 0}
          cash={cashUsd}
          onBorrow={() => router.push("/borrow")}
          onInvest={() => router.navigate("/invest")}
          onAddCash={() => openActions("addCash")}
        />

        {/* ── What you hold ──────────────────────────────────────────────── */}
        {(waiting || holdings.length > 0 || baskets.length > 0) && (
          <View style={s.card}>
            <SectionHead title="Holdings" action="See all" onAction={toYours} />
            <View style={s.list}>
              {waiting
                ? [0, 1].map((k) => (
                    <View key={k} style={s.row}>
                      <Skeleton width={36} height={36} style={s.round} />
                      <View style={[s.mid, s.gap]}>
                        <Skeleton width="55%" height={13} />
                        <Skeleton width="35%" height={11} />
                      </View>
                      <Skeleton width={60} height={13} />
                    </View>
                  ))
                : holdings.slice(0, HOLDING_ROWS).map((h) => (
                    <PressableScale
                      key={h.ticker}
                      style={s.row}
                      activeScale={0.985}
                      onPress={() =>
                        router.push({ pathname: "/stock/[ticker]", params: { ticker: h.ticker } })
                      }
                      accessibilityRole="button"
                    >
                      <StockLogo ticker={h.ticker} size={36} />
                      <View style={s.mid}>
                        <RNText style={s.name} numberOfLines={1}>
                          {h.name}
                        </RNText>
                        <RNText style={s.sub} numberOfLines={1}>
                          {`${num(h.shares).toFixed(4)} ${h.ticker}`}
                        </RNText>
                      </View>
                      <View style={s.end}>
                        <RNText style={s.value}>{figure(num(h.valueUsd))}</RNText>
                        <MoveChip value={num(h.changePct24h)} soft />
                      </View>
                    </PressableScale>
                  ))}
              {!waiting &&
                baskets.map((b) => (
                  <PressableScale
                    key={b.portfolioId}
                    style={s.row}
                    activeScale={0.985}
                    onPress={() =>
                      b.slug !== null
                        ? router.push({ pathname: "/baskets/[slug]", params: { slug: b.slug } })
                        : router.push("/baskets")
                    }
                    accessibilityRole="button"
                  >
                    <Glyph icon="blocks" />
                    <View style={s.mid}>
                      <RNText style={s.name} numberOfLines={1}>
                        {displayBasketName(b.name)}
                      </RNText>
                      <RNText style={s.sub}>{`Basket · ${b.holdings.length} assets`}</RNText>
                    </View>
                    <View style={s.end}>
                      <RNText style={s.value}>{figure(num(b.valueUsd))}</RNText>
                      {b.changePct24h !== null && <MoveChip value={num(b.changePct24h)} soft />}
                    </View>
                  </PressableScale>
                ))}
            </View>
          </View>
        )}

        {/* ── What you're watching, and what's ahead ─────────────────────── */}
        <Watching />
        {!hidden && <ComingUp borrow={borrow.data} cashUsd={cashUsd} apr={apr} />}

        {/* ── What has happened ─────────────────────────────────────────── */}
        <View style={s.card}>
          <SectionHead
            title="Recent activity"
            action="View all"
            onAction={() => router.navigate("/activity")}
          />
          <View style={s.chips}>
            {FILTERS.map((k) => (
              <Chip
                key={k}
                label={k === "all" ? "All" : k === "trades" ? "Trades" : "Income"}
                selected={filter === k}
                onPress={() => setFilter(k)}
              />
            ))}
          </View>
          <View style={s.list}>
            {activity.isPending && activity.data === undefined ? (
              <EventRowSkeleton rows={3} />
            ) : shown.length === 0 ? (
              <View style={s.empty}>
                <Text variant="label">
                  {events.length === 0 ? "Nothing here yet" : "Nothing for this filter"}
                </Text>
                <Text variant="small" tone="muted">
                  Your buys, dividends and transfers all land here.
                </Text>
              </View>
            ) : (
              shown.map((e, i) => (
                <EventRow key={e.signature ?? `${e.date}-${e.title}-${i}`} event={e} masked={hidden} when />
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

export default function Portfolio() {
  return (
    <TabScene index={0}>
      <PortfolioScreen />
    </TabScene>
  );
}

/* ── pieces ──────────────────────────────────────────────────────────────── */

const SectionHead = ({
  title,
  action,
  onAction,
}: {
  title: string;
  action: string;
  onAction: () => void;
}) => (
  <View style={s.sectionHead}>
    <RNText style={s.sectionTitle}>{title}</RNText>
    <PressableScale activeScale={0.96} onPress={onAction} style={s.link} accessibilityRole="link">
      {/* The web's rail heads put this link in its link teal, not in muted grey. */}
      <RNText style={s.linkLabel}>{action}</RNText>
      <Icon name="chevronRight" size={12} color={color.link} />
    </PressableScale>
  </View>
);

/** One part of the total as a plain column: its name, what it is worth, one line under it. */
const Column = ({
  tint,
  share,
  masked,
  label,
  value,
  sub,
  warn = false,
  loading,
  onPress,
}: {
  /** Its colour in the bar above, as a dot by its name. */
  tint: string;
  /** 0–1 of the whole; null for something outside it, like a loan. */
  share: number | null;
  masked: boolean;
  label: string;
  value: string;
  sub: string;
  warn?: boolean;
  loading: boolean;
  onPress: () => void;
}) => (
  <PressableScale style={s.column} activeScale={0.97} onPress={onPress} accessibilityRole="button">
    <View style={s.columnHead}>
      <View style={[s.columnDot, { backgroundColor: tint }]} />
      <RNText style={s.columnLabel}>
        {label}
        {share !== null && !masked && !loading ? (
          <RNText style={s.columnShare}>{`  ${pct(share * 100, 0)}`}</RNText>
        ) : null}
      </RNText>
    </View>
    {loading ? (
      <Skeleton width="70%" height={18} style={s.columnSkeleton} />
    ) : (
      <RNText style={[s.columnValue, warn && s.warnInk]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </RNText>
    )}
    <RNText style={s.columnSub} numberOfLines={1}>
      {sub}
    </RNText>
  </PressableScale>
);

/** A tinted round mark for a row with no logo of its own. */
const Glyph = ({ icon }: { icon: IconName }) => (
  <View style={s.glyph}>
    <Icon name={icon} size={16} color={color.actBuy} />
  </View>
);

/** "Good morning", by the phone's own clock. */
const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

/** "Friday, 9 October". */
const today = () =>
  new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** The web's borrowed line: once something is owed, the cushion is the number that matters. */
const borrowedLine = (stale: boolean, b: Borrow | undefined): string => {
  if (stale) return "As of an hour ago";
  if (b === undefined) return "Against your shares";
  if (b.health === "liquidation") return "Being sold now";
  if (b.health === "margin_call" || b.health === "over_limit") return "Repay to unlock";
  return b.safeUntilDrop === null ? "Against your shares" : `Safe to a ${pct(b.safeUntilDrop * 100, 0)} fall`;
};

/** The web's own words, which say the one thing that matters about a failed read. */
const Unreachable = ({ onRetry }: { onRetry: () => void }) => (
  <View style={s.unreachable}>
    <Icon name="alert" size={16} color={color.down} />
    <Text variant="small" style={s.unreachableText}>
      We could not reach your account. The figures are missing, not zero.
    </Text>
    <Button label="Retry" size="md" variant="secondary" onPress={onRetry} />
  </View>
);

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.page },
  /* Clears the floating tab bar. */
  scroll: { gap: space.md, paddingBottom: 116 },
  fill: { flex: 1 },
  gap: { gap: 8 },
  round: { borderRadius: 18 },
  warnInk: { color: color.warn },

  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.screen,
    paddingBottom: space.xs,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  markRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  greeting: { fontFamily: font.medium, fontSize: 17, letterSpacing: -0.34, color: color.ink },
  date: { fontFamily: font.regular, fontSize: 12.5, color: color.muted, marginTop: 1 },
  headButtons: { flexDirection: "row", gap: space.sm },

  /* A white card on the grey ground, its grey panel inset by four: the web's rail card. */
  card: {
    marginHorizontal: space.screen,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    padding: space.xs,
  },
  account: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 18, gap: 10 },
  label: { fontFamily: font.medium, fontSize: 14, color: color.ink },
  worth: { fontFamily: font.medium, fontSize: 40, letterSpacing: -1.4, lineHeight: 46, color: color.ink },

  /* One bar, then the columns it splits into: no rule above it, so it reads as one line, not two. */
  split: { marginHorizontal: 16, marginBottom: 18, marginTop: 8, gap: 18 },
  line: { flexDirection: "row", height: 6, borderRadius: 3, overflow: "hidden", gap: 3 },
  columns: { flexDirection: "row", gap: space.md },
  column: { flex: 1, minWidth: 0, gap: 3 },
  columnHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  columnDot: { width: 7, height: 7, borderRadius: 3.5 },
  columnLabel: { fontFamily: font.regular, fontSize: 12.5, color: color.muted },
  columnShare: { fontFamily: font.medium, color: color.ink },
  columnValue: { fontFamily: font.medium, fontSize: 18, letterSpacing: -0.36, color: color.ink },
  columnSkeleton: { marginVertical: 2 },
  columnSub: { fontFamily: font.regular, fontSize: 11.5, color: color.muted },

  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: space.md,
  },
  sectionTitle: { fontFamily: font.medium, fontSize: 16, letterSpacing: -0.32, color: color.ink },
  link: { flexDirection: "row", alignItems: "center", gap: 2 },
  linkLabel: { fontFamily: font.medium, fontSize: 13, color: color.link },
  chips: { flexDirection: "row", gap: 6, paddingHorizontal: space.md, paddingBottom: space.md },

  list: { borderRadius: radius.lg, backgroundColor: color.tile, padding: space.xs, gap: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 60,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
  },
  mid: { flex: 1, minWidth: 0, gap: 3 },
  end: { alignItems: "flex-end", gap: 4 },
  name: { fontFamily: font.medium, fontSize: 14.5, letterSpacing: -0.29, color: color.ink },
  sub: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  value: { fontFamily: font.medium, fontSize: 14.5, color: color.ink },
  glyph: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.actBuyTint,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { alignItems: "center", gap: 6, paddingVertical: space.xl, paddingHorizontal: space.lg },

  unreachable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: color.downTint,
  },
  unreachableText: { flex: 1, color: color.downDeep },
});
