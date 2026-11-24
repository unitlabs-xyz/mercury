import { useMemo, useState } from "react";
import { Linking, RefreshControl, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  displayBasketName,
  estimateMark,
  liquidationLine,
  manageOnWebUrl,
  pct,
  pledgedStocks,
  shortAddress,
  toEvent,
  usd,
  usdSigned,
  walletName,
} from "@mercury/view";
import {
  WEB_URL,
  useAccountWallets,
  usePortfolioSummary,
  useWalletActivity,
  useWalletBorrow,
  useWalletPortfolio,
  type Borrow,
} from "../../src/api";
import { EventRow, EventRowSkeleton } from "../../src/activity/EventRow";
import { usePrefs } from "../../src/prefs";
import {
  Button,
  Icon,
  IconButton,
  MoveChip,
  MovePill,
  PressableScale,
  Skeleton,
  StatusChip,
  StockLogo,
  Text,
  useBottomGap,
} from "../../src/ui";
import { color, font, radius, space } from "../../src/theme";

const MASK = "••••";
const num = (v: string | number | null | undefined): number => Number(v ?? 0);

/** The web's words for each state of a loan, as the borrow screen uses them. */
const HEALTH: Record<Borrow["health"], { tone: "up" | "warn" | "down"; label: string }> = {
  healthy: { tone: "up", label: "Healthy" },
  over_limit: { tone: "warn", label: "Over target" },
  margin_call: { tone: "down", label: "Margin call" },
  liquidation: { tone: "down", label: "Being sold" },
};

/**
 * A linked wallet, to look at: what it is worth and how it moved today, its
 * loan with each pledged stock's liquidation price, its holdings, cash, Earn
 * and baskets, and what has happened in it.
 *
 * Every wallet is shown on the phone; only the Mercury wallet is acted on,
 * because the phone cannot get a linked wallet's signature. So there are no
 * buy, sell, borrow, repay or send buttons here. In their place, one row:
 * "Manage on web", which opens the web app on this wallet.
 */
export default function LinkedWallet() {
  const router = useRouter();
  const bottom = useBottomGap();
  const { hideBalances } = usePrefs();
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const [refreshing, setRefreshing] = useState(false);

  const account = useAccountWallets();
  const wallet = account.data?.wallets.find((w) => w.id === id && !w.isPrimary);
  const portfolio = useWalletPortfolio(id);
  const borrow = useWalletBorrow(id);
  const activity = useWalletActivity(id, 10);
  const summary = usePortfolioSummary(true);

  const p = portfolio.data;
  const b = borrow.data;
  const calculating = summary.data?.wallets.find((w) => w.id === id)?.history === "calculating";
  const holdings = useMemo(
    () => [...(p?.holdings ?? [])].sort((x, y) => num(y.valueUsd) - num(x.valueUsd)),
    [p?.holdings],
  );
  const events = useMemo(() => (activity.data?.items ?? []).map(toEvent), [activity.data]);
  const figure = (v: string | number) => (hideBalances ? MASK : usd(v));

  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    await Promise.all([portfolio.refetch(), borrow.refetch(), activity.refetch(), summary.refetch()]);
    setRefreshing(false);
  };

  /* Unlinked on web while this was open, or a stale link: nothing to show for it. */
  if (account.data !== undefined && wallet === undefined) {
    return (
      <Shell title="Linked wallet" onBack={() => router.back()} bottom={bottom}>
        <View style={s.card}>
          <View style={s.empty}>
            <Text variant="label">This wallet isn't linked any more</Text>
            <Text variant="small" tone="muted">
              It was unlinked, so Mercury no longer follows it.
            </Text>
          </View>
        </View>
      </Shell>
    );
  }

  const name = wallet === undefined ? "Linked wallet" : walletName(wallet);
  const waiting = portfolio.isPending && p === undefined;

  return (
    <Shell
      title={name}
      onBack={() => router.back()}
      bottom={bottom}
      refresh={
        <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={color.faint} />
      }
    >
      {/* ── What it is worth ──────────────────────────────────────────── */}
      <View style={s.card}>
        <View style={s.hero}>
          <RNText style={s.label}>
            {wallet === undefined ? "Linked wallet" : `Linked wallet · ${shortAddress(wallet.address)}`}
          </RNText>
          {portfolio.isError && p === undefined ? (
            <Text variant="small" tone="muted">
              We could not read this wallet. The figures are missing, not zero.
            </Text>
          ) : waiting ? (
            <View style={s.gap}>
              <Skeleton width={190} height={36} />
              <Skeleton width={130} height={16} />
            </View>
          ) : (
            <>
              <RNText style={s.worth} numberOfLines={1} adjustsFontSizeToFit>
                {figure(num(p?.totalValueUsd))}
              </RNText>
              {!hideBalances && Math.abs(num(p?.changeUsd)) >= 0.005 && (
                <MovePill
                  pctText={`${Math.abs(num(p?.changePct)).toFixed(2)}%`}
                  usdText={usdSigned(num(p?.changeUsd))}
                  up={num(p?.changeUsd) >= 0}
                />
              )}
              {calculating && (
                <RNText style={s.sub}>P&L calculating: reading this wallet's past for what was paid.</RNText>
              )}
            </>
          )}
        </View>
      </View>

      {/* ── Where it is managed ──────────────────────────────────────── */}
      <View style={s.card}>
        <View style={s.manage}>
          <Text variant="small" tone="muted">
            {`Trading, borrowing and sending from ${name} happen on web, where ${name} approves each step. Here it is shown, not acted on.`}
          </Text>
          <Button
            label="Manage on web"
            variant="secondary"
            size="md"
            onPress={() => void Linking.openURL(manageOnWebUrl(WEB_URL, id))}
          />
        </View>
      </View>

      {/* ── Its loan, when it has one ────────────────────────────────── */}
      {b !== undefined && b.debtUsd > 0 && <Loan b={b} hidden={hideBalances} />}

      {/* ── What it holds ────────────────────────────────────────────── */}
      <View style={s.card}>
        <View style={s.head}>
          <RNText style={s.title}>Holdings</RNText>
          {!waiting && (
            <RNText style={s.meta}>
              {holdings.length === 1 ? "1 position" : `${holdings.length} positions`}
            </RNText>
          )}
        </View>
        <View style={s.list}>
          {waiting ? (
            [0, 1].map((k) => (
              <View key={k} style={s.row}>
                <Skeleton width={36} height={36} style={s.round} />
                <View style={[s.mid, s.gap]}>
                  <Skeleton width="55%" height={13} />
                  <Skeleton width="35%" height={11} />
                </View>
              </View>
            ))
          ) : (
            <>
              {holdings.map((h) => (
                <PressableScale
                  key={h.ticker}
                  style={s.row}
                  activeScale={0.985}
                  onPress={() => router.push({ pathname: "/stock/[ticker]", params: { ticker: h.ticker } })}
                  accessibilityRole="button"
                >
                  <StockLogo ticker={h.ticker} size={36} />
                  <View style={s.mid}>
                    <RNText style={s.name} numberOfLines={1}>
                      {h.name}
                    </RNText>
                    <RNText style={s.sub} numberOfLines={1}>
                      {calculating
                        ? `${num(h.shares).toFixed(4)} ${h.ticker} · P&L calculating`
                        : estimateMark(h) === "~"
                          ? `${num(h.shares).toFixed(4)} ${h.ticker} · ~ cost estimated`
                          : `${num(h.shares).toFixed(4)} ${h.ticker}`}
                    </RNText>
                  </View>
                  <View style={s.end}>
                    <RNText style={s.value}>{figure(num(h.valueUsd))}</RNText>
                    <MoveChip value={num(h.changePct24h)} soft />
                  </View>
                </PressableScale>
              ))}
              {(p?.baskets ?? []).map((bk) => (
                <View key={bk.portfolioId} style={s.row}>
                  <Glyph icon="blocks" />
                  <View style={s.mid}>
                    <RNText style={s.name} numberOfLines={1}>
                      {displayBasketName(bk.name)}
                    </RNText>
                    <RNText style={s.sub}>{`Basket · ${bk.holdings.length} assets`}</RNText>
                  </View>
                  <View style={s.end}>
                    <RNText style={s.value}>{figure(num(bk.valueUsd))}</RNText>
                    {bk.changePct24h !== null && <MoveChip value={num(bk.changePct24h)} soft />}
                  </View>
                </View>
              ))}
              <Line icon="wallet" label="Cash" sub="USDC in the wallet" value={figure(num(p?.cashUsd))} />
              {num(p?.earnUsd) > 0 && (
                <Line icon="trend" label="Earn" sub="In a Kamino vault" value={figure(num(p?.earnUsd))} />
              )}
            </>
          )}
        </View>
      </View>

      {/* ── What has happened ────────────────────────────────────────── */}
      <View style={s.card}>
        <View style={s.head}>
          <RNText style={s.title}>Recent activity</RNText>
        </View>
        <View style={s.list}>
          {activity.isPending && activity.data === undefined ? (
            <EventRowSkeleton rows={3} />
          ) : events.length === 0 ? (
            <View style={s.empty}>
              <Text variant="label">Nothing here yet</Text>
              <Text variant="small" tone="muted">
                Its trades, transfers and loan changes land here.
              </Text>
            </View>
          ) : (
            events.map((e, i) => (
              <EventRow
                key={e.signature ?? `${e.date}-${e.title}-${i}`}
                event={e}
                masked={hideBalances}
                when
              />
            ))
          )}
        </View>
      </View>
    </Shell>
  );
}

/**
 * The wallet's loan: its health, what is owed and how far prices can fall,
 * then each pledged stock with the price at which Kamino would start selling.
 */
const Loan = ({ b, hidden }: { b: Borrow; hidden: boolean }) => {
  const health = HEALTH[b.health];
  const stocks = pledgedStocks(b);
  return (
    <View style={s.card}>
      <View style={s.head}>
        <RNText style={s.title}>Loan</RNText>
        <StatusChip tone={health.tone}>{health.label}</StatusChip>
      </View>
      <View style={s.loanFigures}>
        <View style={s.figure}>
          <RNText style={s.figureLabel}>Borrowed</RNText>
          <RNText style={[s.figureValue, health.tone === "down" && s.downInk]}>
            {hidden ? MASK : usd(b.debtUsd)}
          </RNText>
        </View>
        <View style={s.figure}>
          <RNText style={s.figureLabel}>Collateral</RNText>
          <RNText style={s.figureValue}>{hidden ? MASK : usd(b.collateralUsd)}</RNText>
        </View>
        <View style={s.figure}>
          <RNText style={s.figureLabel}>Room to fall</RNText>
          <RNText style={s.figureValue}>
            {b.safeUntilDrop === null ? "—" : pct(b.safeUntilDrop * 100, 0)}
          </RNText>
        </View>
      </View>
      {stocks.length > 0 && (
        <View style={s.list}>
          {stocks.map((r) => (
            <View key={r.ticker} style={s.row}>
              <StockLogo ticker={r.ticker} size={32} />
              <View style={s.mid}>
                <RNText style={s.name} numberOfLines={1}>
                  {`${r.ticker} pledged`}
                </RNText>
                <RNText style={s.sub} numberOfLines={2}>
                  {liquidationLine(r)}
                </RNText>
              </View>
              <RNText style={s.value}>{hidden ? MASK : usd(r.depositedUsd)}</RNText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const Line = ({
  icon,
  label,
  sub,
  value,
}: {
  icon: "wallet" | "trend";
  label: string;
  sub: string;
  value: string;
}) => (
  <View style={s.row}>
    <Glyph icon={icon} />
    <View style={s.mid}>
      <RNText style={s.name}>{label}</RNText>
      <RNText style={s.sub}>{sub}</RNText>
    </View>
    <RNText style={s.value}>{value}</RNText>
  </View>
);

const Glyph = ({ icon }: { icon: "blocks" | "wallet" | "trend" }) => (
  <View style={s.glyph}>
    <Icon name={icon} size={16} color={color.actBuy} />
  </View>
);

const Shell = ({
  title,
  onBack,
  bottom,
  refresh,
  children,
}: {
  title: string;
  onBack: () => void;
  bottom: number;
  refresh?: React.ReactElement<React.ComponentProps<typeof RefreshControl>>;
  children: React.ReactNode;
}) => (
  <View style={s.root}>
    <StatusBar style="dark" />
    <SafeAreaView edges={["top"]} style={s.fill}>
      <View style={s.nav}>
        <IconButton icon="chevronRight" rotate="180deg" label="Back" onPress={onBack} />
        <RNText style={s.navTitle} numberOfLines={1}>
          {title}
        </RNText>
      </View>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: bottom + space.lg }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refresh}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  </View>
);

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.page },
  fill: { flex: 1 },
  gap: { gap: 8 },
  round: { borderRadius: 18 },
  downInk: { color: color.down },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.screen,
    paddingBottom: space.sm,
  },
  navTitle: { flex: 1, fontFamily: font.medium, fontSize: 17, letterSpacing: -0.34, color: color.ink },
  scroll: { gap: space.md, paddingTop: space.xs },

  card: {
    marginHorizontal: space.screen,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    padding: space.xs,
  },
  hero: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 18, gap: 10 },
  label: { fontFamily: font.medium, fontSize: 14, color: color.ink },
  worth: { fontFamily: font.medium, fontSize: 36, letterSpacing: -1.2, lineHeight: 42, color: color.ink },
  manage: { paddingHorizontal: 16, paddingVertical: 14, gap: space.md },

  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: space.md,
  },
  title: { fontFamily: font.medium, fontSize: 16, letterSpacing: -0.32, color: color.ink },
  meta: { fontFamily: font.regular, fontSize: 12.5, color: color.muted },

  loanFigures: { flexDirection: "row", gap: space.md, paddingHorizontal: 16, paddingBottom: space.md },
  figure: { flex: 1, minWidth: 0, gap: 3 },
  figureLabel: { fontFamily: font.regular, fontSize: 12.5, color: color.muted },
  figureValue: { fontFamily: font.medium, fontSize: 16, letterSpacing: -0.32, color: color.ink },

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
});
