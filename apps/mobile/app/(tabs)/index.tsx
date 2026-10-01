import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import type { Portfolio as PortfolioData } from "@mercury/types";
import { GROUPS, toEvent, usd, usdCompact, usdSigned, type Event, type EventKind } from "@mercury/view";
import {
  ActionStrip,
  CARD_RADIUS,
  Chip,
  HeroBalance,
  Icon,
  Mark,
  MoveChip,
  MovePill,
  PressableScale,
  Skeleton,
  StockLogo,
  Text,
  type Action,
  type IconName,
} from "../../src/ui";
import { useActivityFeed, useBorrow, useMoney, usePortfolio } from "../../src/api";
import { color, font, radius, space } from "../../src/theme";

/**
 * USDC's mark, as the web's `activity-mark.tsx` picks it: the Solana token
 * list's own asset, which is the file every wallet on this chain already shows
 * for this mint, rather than a mark of ours that would only half-match what
 * people recognise. Cash is not a holding, so it never resolves to an
 * instrument and cannot come from the API's logo column.
 */
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_LOGO = `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${USDC_MINT}/logo.png`;

/** The web's `activity-look.tsx`, tone for tone. */
const LOOK: Record<EventKind, { bg: string; fg: string; icon: IconName }> = {
  buy: { bg: color.brandTint, fg: color.brand, icon: "trend" },
  sell: { bg: color.chipTint, fg: color.inkSoft, icon: "arrowDown" },
  basket: { bg: color.brandTint, fg: color.brand, icon: "grid" },
  dividend: { bg: color.upTint, fg: color.upDeep, icon: "refresh" },
  receive: { bg: color.upTint, fg: color.upDeep, icon: "arrowDown" },
  send: { bg: color.chipTint, fg: color.inkSoft, icon: "arrowUp" },
  interest: { bg: color.upTint, fg: color.upDeep, icon: "plus" },
  queued: { bg: color.warnTint, fg: color.warn, icon: "clock" },
  // Money, so the same arrows cash uses. Borrowing is not a gain, so it takes
  // the neutral chip rather than the green one a dividend gets.
  borrow: { bg: color.chipTint, fg: color.inkSoft, icon: "arrowDown" },
  repay: { bg: color.chipTint, fg: color.inkSoft, icon: "arrowUp" },
  // Collateral, not money: a lock going on and coming off.
  pledge: { bg: color.chipTint, fg: color.inkSoft, icon: "lock" },
  unpledge: { bg: color.upTint, fg: color.upDeep, icon: "lock" },
  // The only row in the feed that is asking for something to be done.
  loan_alert: { bg: color.warnTint, fg: color.warn, icon: "alert" },
};

/** The three the home screen offers, out of the shared six. */
const FILTERS = ["all", "trades", "income"] as const;
type Filter = (typeof FILTERS)[number];

const KINDS_OF = (f: Filter): readonly EventKind[] => GROUPS.find((g) => g.key === f)?.kinds ?? [];

/** The logo's diameter wherever one leads a row. One number, so the rail, the
 *  loan row and the feed all indent their text to the same place. */
const MARK = 36;

/** Five, because the card below the fold is a summary and `/activity` is the list. */
const FEED_ROWS = 5;

const num = (v: string | number | null | undefined): number => Number(v ?? 0);

/** "Today", "Yesterday", else "27 Sep" — the web's `relDay`, said shorter. */
const whenLabel = (isoDate: string): string => {
  const today = Date.parse(new Date().toISOString().slice(0, 10));
  const days = Math.round((Date.parse(isoDate) - today) / 86_400_000);
  if (days === 0) return "Today";
  if (days === -1) return "Yesterday";
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
};

export default function Portfolio() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const portfolio = usePortfolio();
  const money = useMoney();
  const borrow = useBorrow();
  const activity = useActivityFeed();

  const p = portfolio.data;
  const holdings = p?.holdings ?? [];
  /*
   * Summed from the positions rather than derived as `total - cash`. The two
   * agree only when nothing is borrowed: the server's total is already net of
   * debt, so the subtraction quietly understates the stocks by the size of the
   * loan. That was a real defect on the web.
   */
  const stocksUsd = holdings.reduce((t, h) => t + num(h.valueUsd), 0);
  const debtUsd = num(p?.debtUsd);

  const events = useMemo(() => (activity.data?.items ?? []).map(toEvent), [activity.data]);
  const kinds = KINDS_OF(filter);
  const shown = (kinds.length === 0 ? events : events.filter((e) => kinds.includes(e.kind))).slice(
    0,
    FEED_ROWS,
  );

  const waiting = portfolio.isPending && portfolio.data === undefined;
  const failed = portfolio.isError;

  const actions: readonly Action[] = [
    { key: "invest", label: "Invest", icon: "trend", onPress: () => router.push("/invest") },
    { key: "cash", label: "Add cash", icon: "plus", onPress: () => undefined },
    { key: "send", label: "Send", icon: "arrowUp", tone: "brand", onPress: () => undefined },
    { key: "card", label: "Card", icon: "card", tone: "warm", onPress: () => undefined },
  ];

  const refreshAll = async (): Promise<void> => {
    setRefreshing(true);
    await Promise.all([portfolio.refetch(), money.refetch(), borrow.refetch(), activity.refetch()]);
    setRefreshing(false);
  };

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refreshAll()}
            tintColor={color.faint}
          />
        }
      >
        {/* ── Card one: who you are, what you are worth ─────────────────── */}
        <View style={[s.topCard, { paddingTop: insets.top + 6 }]}>
          <View style={s.brandRow}>
            <View style={s.brand}>
              <Mark size={19} color={color.ink} />
              <RNText style={s.wordmark}>Mercury</RNText>
            </View>
            <PressableScale
              onPress={() => setHidden((v) => !v)}
              accessibilityLabel={hidden ? "Show figures" : "Hide figures"}
              activeScale={0.9}
              style={s.iconBtn}
            >
              <Icon name={hidden ? "eyeOff" : "eye"} size={18} color={color.ink} />
            </PressableScale>
          </View>

          {/*
           * Missing is not zero. An account that could not be read shows the
           * banner and a dash; writing $0.00 there would be a figure somebody
           * could act on, and it would be wrong.
           */}
          {failed ? (
            <Unreachable onRetry={() => void portfolio.refetch()} />
          ) : waiting ? (
            <HeroSkeleton />
          ) : (
            <>
              <HeroBalance amount={num(p?.totalValueUsd)} label="Net worth" masked={hidden} />
              {!hidden && (
                <MovePill
                  pctText={`${Math.abs(num(p?.changePct)).toFixed(2)}%`}
                  usdText={usdSigned(num(p?.changeUsd))}
                  up={num(p?.changeUsd) >= 0}
                />
              )}
            </>
          )}

          <HoldingsRail holdings={holdings} masked={hidden} loading={waiting} />

          {/* Two halves of one number, split by a hairline rather than a gap:
              what is invested and what is not are not two unrelated things
              sitting next to each other. */}
          <View style={s.pots}>
            <Pot
              label="INVESTED"
              value={stocksUsd}
              note={holdings.length === 1 ? "1 position" : `${holdings.length} positions`}
              masked={hidden}
              loading={waiting}
            />
            <View style={s.potSplit} />
            <Pot
              label="CASH"
              value={num(p?.cashUsd)}
              note={
                money.data === undefined
                  ? "In your account"
                  : `Earning ${(num(money.data.yieldApr) * 100).toFixed(1)}% a year`
              }
              masked={hidden}
              loading={waiting}
            />
          </View>

          {debtUsd > 0 && (
            <Borrowed
              debtUsd={debtUsd}
              stale={p?.debtIsStale === true}
              borrow={borrow.data}
              masked={hidden}
            />
          )}
        </View>

        {/* ── The band: the dark ground between the two cards ───────────── */}
        <ActionStrip actions={actions} />

        {/* ── Card two: what has happened ───────────────────────────────── */}
        <View style={s.bottomCard}>
          <View style={s.grabber} />

          <PressableScale haptic={false} activeScale={1} onPress={() => undefined} style={s.sectionHead}>
            <Text variant="headline">Recent activity</Text>
            <View style={s.viewAll}>
              {/* The web's rail heads put this link in `--color-ds-link`, not in
                  the muted grey. It is the only tappable thing on the row. */}
              <RNText style={s.viewAllLabel}>View all</RNText>
              <Icon name="chevronRight" size={13} color={color.link} />
            </View>
          </PressableScale>

          {/* Inset by the chip's own padding, so a chip LABEL starts on the
              same 20 as the heading above it rather than its pill's edge. */}
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

          {activity.isPending && activity.data === undefined ? (
            <FeedSkeleton />
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
            shown.map((e, i) => <EventRow key={`${e.date}-${e.title}-${i}`} event={e} masked={hidden} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** The web's own words, which say the one thing that matters about a failed read. */
const Unreachable = ({ onRetry }: { onRetry: () => void }) => (
  <View style={s.unreachable}>
    <Icon name="alert" size={16} color={color.down} />
    <Text variant="small" style={s.unreachableText}>
      We could not reach your account. The figures below are missing, not zero.
    </Text>
    <PressableScale onPress={onRetry} style={s.retry} activeScale={0.94}>
      <RNText style={s.retryLabel}>Retry</RNText>
    </PressableScale>
  </View>
);

const HeroSkeleton = () => (
  <View style={s.heroSkeleton}>
    <Skeleton width={78} height={13} />
    <Skeleton width={236} height={40} />
    <Skeleton width={150} height={16} />
  </View>
);

const FeedSkeleton = () => (
  <View>
    {[0, 1, 2].map((i) => (
      <View key={i} style={s.row}>
        <Skeleton width={MARK} height={MARK} style={s.roundSkeleton} />
        <View style={s.rowMid}>
          <Skeleton width="62%" height={13} />
          <Skeleton width="38%" height={11} />
        </View>
        <View style={s.rowEnd}>
          <Skeleton width={62} height={13} />
          <Skeleton width={40} height={11} />
        </View>
      </View>
    ))}
  </View>
);

/**
 * The holdings rail: one card per position, scrolling sideways.
 *
 * No share count, following the web's holdings table and for its reason: the
 * value above it is that count times the price, so printing both is the same
 * number twice, and a fractional share count is the least useful way to say how
 * much of something somebody holds.
 */
const HoldingsRail = ({
  holdings,
  masked,
  loading,
}: {
  holdings: PortfolioData["holdings"];
  masked: boolean;
  loading: boolean;
}) => {
  const router = useRouter();
  if (loading) {
    return (
      <View style={s.railLoading}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={s.holdCard}>
            <Skeleton width={MARK} height={MARK} style={s.roundSkeleton} />
            <View style={s.holdText}>
              <Skeleton width="70%" height={12} />
              <Skeleton width="90%" height={18} />
            </View>
            <Skeleton width={56} height={20} />
          </View>
        ))}
      </View>
    );
  }

  if (holdings.length === 0) {
    return (
      <PressableScale style={s.railEmpty} onPress={() => router.push("/invest")}>
        <View style={s.railEmptyTile}>
          <Icon name="plus" size={17} color={color.ink} />
        </View>
        <View style={s.railEmptyMid}>
          <Text variant="label">Nothing here yet</Text>
          <Text variant="small" tone="muted">
            Add cash and buy your first share
          </Text>
        </View>
        <Icon name="chevronRight" size={15} color={color.muted} />
      </PressableScale>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={s.rail}
      contentContainerStyle={s.railRow}
    >
      {holdings.map((h) => (
        <PressableScale
          key={h.ticker}
          style={s.holdCard}
          onPress={() => router.push({ pathname: "/stock/[ticker]", params: { ticker: h.ticker } })}
        >
          <StockLogo ticker={h.ticker} size={MARK} />
          <View style={s.holdText}>
            <RNText style={s.holdName} numberOfLines={1}>
              {h.name}
            </RNText>
            <RNText style={s.holdValue} numberOfLines={1}>
              {masked ? "••••" : usd(h.valueUsd)}
            </RNText>
          </View>
          {masked ? (
            <View style={s.chipGhost} />
          ) : (
            <MoveChip value={h.changePct24h === null ? null : num(h.changePct24h)} />
          )}
        </PressableScale>
      ))}

      {/* At the END of the rail, so it is what scrolling reaches rather than a
          control competing with the first card. */}
      <PressableScale style={s.allCard} onPress={() => router.push("/invest")}>
        <View style={s.allMark}>
          <Icon name="chevronRight" size={15} color={color.surface} />
        </View>
        <RNText style={s.allLabel}>View all</RNText>
      </PressableScale>
    </ScrollView>
  );
};

const Pot = ({
  label,
  value,
  note,
  masked,
  loading,
}: {
  label: string;
  value: number;
  note: string;
  masked: boolean;
  loading: boolean;
}) => (
  <View style={s.pot}>
    <RNText style={s.potLabel}>{label}</RNText>
    {loading ? (
      <Skeleton width="80%" height={20} style={s.potSkeleton} />
    ) : (
      <RNText style={s.potFigure}>{masked ? "••••" : usd(value)}</RNText>
    )}
    <RNText style={s.potNote} numberOfLines={1}>
      {note}
    </RNText>
  </View>
);

/**
 * What is owed, and the fall that would cost somebody their shares.
 *
 * The line is the web's `borrowedSub`: once something is borrowed, the cushion
 * is the number that matters, not the headroom — it is the one that shrinks
 * every time a loan buys more collateral — and a reading we could not take is
 * said out loud rather than shown as a stale figure wearing a fresh one's face.
 */
const borrowedLine = (
  stale: boolean,
  b: { health: string; overTargetUsd: number; safeUntilDrop: number | null } | undefined,
): string => {
  if (stale) return "As of an hour ago — we could not reach Kamino";
  if (b === undefined) return "Against your shares";
  if (b.health === "liquidation") return "Being sold now — repay to stop it";
  if (b.health === "margin_call") return `Repay ${usdCompact(b.overTargetUsd)} now`;
  if (b.health === "over_limit") return `Over the limit — repay ${usdCompact(b.overTargetUsd)}`;
  return b.safeUntilDrop === null
    ? "Against your shares"
    : `Safe unless your shares fall ${(b.safeUntilDrop * 100).toFixed(0)}%`;
};

const Borrowed = ({
  debtUsd,
  stale,
  borrow,
  masked,
}: {
  debtUsd: number;
  stale: boolean;
  borrow: { health: string; overTargetUsd: number; safeUntilDrop: number | null } | undefined;
  masked: boolean;
}) => (
  <PressableScale activeScale={0.99} style={s.borrowed} onPress={() => undefined}>
    <View style={s.borrowedMark}>
      <Icon name="wallet" size={16} color={color.warn} />
    </View>
    <View style={s.borrowedMid}>
      <RNText style={s.potLabel}>BORROWED</RNText>
      <RNText style={s.borrowedNote} numberOfLines={1}>
        {borrowedLine(stale, borrow)}
      </RNText>
    </View>
    {/* The whole figure, not a compact one: this is what is owed, and "$2.5K"
        is the wrong precision for a number somebody repays. */}
    <RNText style={s.borrowedFigure}>{masked ? "••••" : `−${usd(debtUsd, 0)}`}</RNText>
    <Icon name="chevronRight" size={14} color={color.faint} />
  </PressableScale>
);

const EventRow = ({ event, masked }: { event: Event; masked: boolean }) => {
  const look = LOOK[event.kind];
  const credit = event.flow === "in";
  /* A stock's own art wins; cash falls back to the token's mark; a row with no
     asset behind it — a queued order, an alert — shows the kind alone. */
  const uri = event.logo ?? (event.mint === USDC_MINT ? USDC_LOGO : undefined);
  const amount =
    event.amount === null
      ? null
      : event.flow === null
        ? event.amount
        : `${credit ? "+" : "−"}${event.amount}`;

  return (
    <PressableScale haptic={false} activeScale={0.99} style={s.row} onPress={() => undefined}>
      {uri === undefined ? (
        <View style={[s.rowArt, { backgroundColor: look.bg }]}>
          <Icon name={look.icon} size={16} color={look.fg} />
        </View>
      ) : (
        <View>
          <StockLogo ticker={event.title.slice(0, 1)} uri={uri} size={MARK} />
          <View style={[s.rowBadge, { backgroundColor: look.bg }]}>
            <Icon name={look.icon} size={9} color={look.fg} strokeWidth={2.4} />
          </View>
        </View>
      )}
      <View style={s.rowMid}>
        <RNText style={s.rowTitle} numberOfLines={1}>
          {event.title}
        </RNText>
        {event.sub !== "" && (
          <RNText style={s.rowDetail} numberOfLines={1}>
            {event.sub}
          </RNText>
        )}
      </View>
      <View style={s.rowEnd}>
        {amount !== null && (
          <RNText style={[s.rowAmount, credit && s.rowCredit]}>{masked ? "••••" : amount}</RNText>
        )}
        <RNText style={s.rowWhen}>{whenLabel(event.date)}</RNText>
      </View>
    </PressableScale>
  );
};

const s = StyleSheet.create({
  /* The page is the CARD colour, not the band colour. Both ends of the content
     are a white card, and a dark page makes the overscroll bounce flash black. */
  root: { flex: 1, backgroundColor: color.surface },
  scroll: { flexGrow: 1 },

  topCard: {
    zIndex: 1,
    backgroundColor: color.surface,
    borderBottomLeftRadius: CARD_RADIUS,
    borderBottomRightRadius: CARD_RADIUS,
    paddingHorizontal: space.screen,
    paddingBottom: space.screen,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 18,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  wordmark: { fontFamily: font.bold, fontSize: 19, letterSpacing: -0.5, color: color.ink },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: color.tile,
    alignItems: "center",
    justifyContent: "center",
  },

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
  retry: {
    paddingHorizontal: 12,
    height: 30,
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: color.surface,
  },
  retryLabel: { fontFamily: font.medium, fontSize: 12.5, color: color.downDeep },

  heroSkeleton: { gap: 10, paddingTop: 4, paddingBottom: 6 },

  /* Negative margins so the rail scrolls edge to edge through the card's own
     padding instead of stopping short of both edges. */
  rail: { marginTop: 18, marginHorizontal: -space.screen },
  railRow: { flexDirection: "row", gap: 10, paddingHorizontal: space.screen },
  railLoading: { flexDirection: "row", gap: 10, marginTop: 18, overflow: "hidden" },
  holdCard: {
    width: 146,
    gap: 12,
    padding: 13,
    borderRadius: radius.xl,
    backgroundColor: color.tile,
    alignItems: "flex-start",
  },
  holdText: { gap: 3, alignSelf: "stretch" },
  holdName: { fontFamily: font.medium, fontSize: 13, letterSpacing: -0.26, color: color.muted },
  holdValue: { fontFamily: font.medium, fontSize: 19, letterSpacing: -0.5, color: color.ink },
  /* Holds the row's height while the figures are hidden, so masking does not
     make every card jump shorter. */
  chipGhost: { height: 20 },
  roundSkeleton: { borderRadius: MARK / 2 },

  allCard: {
    width: 104,
    padding: 13,
    borderRadius: radius.xl,
    backgroundColor: color.tile,
    justifyContent: "space-between",
  },
  allMark: {
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  allLabel: { fontFamily: font.medium, fontSize: 13.5, letterSpacing: -0.27, color: color.ink },

  railEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 18,
    padding: 13,
    borderRadius: radius.xl,
    backgroundColor: color.tile,
  },
  railEmptyTile: {
    width: MARK,
    height: MARK,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  railEmptyMid: { flex: 1, gap: 2 },

  pots: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 14,
    marginTop: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: color.tile,
  },
  pot: { flex: 1, gap: 4 },
  potSplit: { width: 1, backgroundColor: color.divider },
  potLabel: { fontFamily: font.medium, fontSize: 10, letterSpacing: 0.6, color: color.muted },
  potFigure: { fontFamily: font.medium, fontSize: 20, letterSpacing: -0.4, color: color.ink },
  potSkeleton: { marginVertical: 3 },
  potNote: { fontFamily: font.regular, fontSize: 11.5, letterSpacing: -0.1, color: color.muted },

  borrowed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: color.warnTint,
  },
  borrowedMark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  borrowedMid: { flex: 1, gap: 4 },
  borrowedNote: { fontFamily: font.regular, fontSize: 11.5, letterSpacing: -0.1, color: "#6B4A14" },
  borrowedFigure: { fontFamily: font.medium, fontSize: 17, letterSpacing: -0.34, color: color.warn },

  bottomCard: {
    zIndex: 1,
    flexGrow: 1,
    backgroundColor: color.surface,
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    /* Clears the floating tab bar. */
    paddingBottom: 108,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.divider,
    alignSelf: "center",
    marginTop: 9,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.screen,
    paddingTop: 16,
    paddingBottom: 10,
  },
  viewAll: { flexDirection: "row", alignItems: "center", gap: 3 },
  viewAllLabel: { fontFamily: font.medium, fontSize: 13, letterSpacing: -0.26, color: color.link },
  chips: { flexDirection: "row", gap: 4, paddingHorizontal: space.screen - 13, paddingBottom: 6 },

  empty: { paddingHorizontal: space.screen, paddingTop: 10, gap: 4 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: space.screen,
    paddingVertical: 11,
  },
  rowArt: {
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  /* The kind, on the logo. A ring of the card's own white cuts it out of the
     art rather than letting the two marks touch. */
  rowBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 17,
    height: 17,
    borderRadius: 8.5,
    borderWidth: 2,
    borderColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  rowMid: { flex: 1, gap: 3 },
  rowTitle: { fontFamily: font.medium, fontSize: 14, letterSpacing: -0.28, color: color.ink },
  rowDetail: { fontFamily: font.regular, fontSize: 12, letterSpacing: -0.12, color: color.muted },
  rowEnd: { alignItems: "flex-end", gap: 3 },
  rowAmount: { fontFamily: font.medium, fontSize: 14, letterSpacing: -0.28, color: color.ink },
  rowCredit: { color: color.up },
  rowWhen: { fontFamily: font.regular, fontSize: 12, letterSpacing: -0.12, color: color.muted },
});
