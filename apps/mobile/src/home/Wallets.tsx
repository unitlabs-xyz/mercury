import { useState } from "react";
import { StyleSheet, Text as RNText, View } from "react-native";
import { useRouter } from "expo-router";
import Svg, { Circle, Path } from "react-native-svg";
import type { PortfolioSummary } from "@mercury/types";
import {
  arcs,
  ringPath,
  sharePct,
  summaryLines,
  updatedAgo,
  usd,
  walletCards,
  walletSlices,
  walletStatus,
  type Series,
  type WalletSlice,
} from "@mercury/view";
import { useAccountWallets, useAllWalletsPortfolio, usePortfolioSummary } from "../api";
import { Icon, MoveChip, PressableScale, Skeleton } from "../ui";
import { color, font, radius, space } from "../theme";

const MASK = "••••";

/** A wallet's colour on the phone: its chart series, or grey past the fifth, as on the web. */
const seriesColor = (series: Series | null): string =>
  series === null ? color.muted : color.series[series - 1]!;

/**
 * Every wallet, read once for Home: the summary from the server's records and
 * every wallet's live figures. Nothing is asked for until something is
 * linked, so with the Mercury wallet alone Home is what it always was.
 */
export const useWalletsOverview = () => {
  const account = useAccountWallets();
  const linked = (account.data?.wallets ?? []).filter((w) => !w.isPrimary);
  const any = linked.length > 0;
  const summary = usePortfolioSummary(any);
  const live = useAllWalletsPortfolio(any);
  const slices = summary.data === undefined ? [] : walletSlices(walletCards(summary.data, live.data));
  return {
    any,
    limit: account.data?.limit ?? 5,
    summary,
    live,
    slices,
    refetch: () => Promise.all([account.refetch(), summary.refetch(), live.refetch()]),
  };
};

type Overview = ReturnType<typeof useWalletsOverview>;

/**
 * Every wallet added up, at the top of Home once anything is linked: net
 * worth in the middle of a ring split by wallet, then P&L, income and loan
 * interest. Tapping a piece of the ring names that wallet in the middle.
 *
 * Net worth is live while Home is open and the last hourly reading when the
 * live read is not there, dated so nobody mistakes one for the other.
 */
export const AllWalletsCard = ({ overview, hidden }: { overview: Overview; hidden: boolean }) => {
  const [hot, setHot] = useState<string | null>(null);
  const { summary, live, slices } = overview;

  if (summary.data === undefined) {
    return (
      <View style={s.card}>
        <Head title="All wallets" />
        <View style={s.body}>
          {summary.isError ? (
            <RNText style={s.note}>Couldn't load every wallet. It will try again in a minute.</RNText>
          ) : (
            <>
              <Skeleton width={160} height={160} style={s.roundSkeleton} />
              <Skeleton width="80%" height={16} />
            </>
          )}
        </View>
      </View>
    );
  }

  const lines = summaryLines(summary.data);
  const liveWorth = live.data?.totalValueUsd;
  const picked = slices.find((x) => x.id === hot);

  return (
    <View style={s.card}>
      <Head title="All wallets" meta={lines.calculating ?? undefined} />
      <View style={s.body}>
        <Ring slices={slices} hot={hot} onPick={(id) => setHot(hot === id ? null : id)}>
          {picked === undefined ? (
            <>
              <RNText style={s.centreLabel}>Net worth</RNText>
              <RNText style={s.centreValue} numberOfLines={1} adjustsFontSizeToFit>
                {hidden ? MASK : liveWorth === undefined ? lines.netWorth : usd(liveWorth)}
              </RNText>
              {liveWorth === undefined && summary.data.asOf !== null && (
                <RNText style={s.centreSub}>{`Updated ${updatedAgo(summary.data.asOf)}`}</RNText>
              )}
            </>
          ) : (
            <>
              <RNText style={s.centreLabel} numberOfLines={1}>
                {picked.name}
              </RNText>
              <RNText style={s.centreValue} numberOfLines={1} adjustsFontSizeToFit>
                {hidden ? MASK : picked.valueUsd === null ? "—" : usd(picked.valueUsd)}
              </RNText>
              <RNText style={s.centreSub}>
                {picked.share === null ? "Reading this wallet…" : `${sharePct(picked.share)} of net worth`}
              </RNText>
            </>
          )}
        </Ring>

        <View style={s.figures}>
          <Figure
            label="P&L"
            value={hidden ? MASK : lines.pnl}
            sub={hidden ? null : lines.pnlSub}
            tone={hidden ? undefined : tone(summary.data, lines.pnl)}
          />
          <Figure label="Income" value={hidden ? MASK : lines.income} sub={null} />
          <Figure label="Loan interest" value={hidden ? MASK : lines.loanInterest} sub={null} />
        </View>
      </View>
    </View>
  );
};

/**
 * The linked wallets, each on its own row, after the Mercury wallet: its
 * colour in the ring, its name and loan, what it is worth and how it moved
 * today, and a line on where its figures stand. The phone only shows them;
 * acting for one is done on web.
 */
export const LinkedWalletsCard = ({ overview, hidden }: { overview: Overview; hidden: boolean }) => {
  const linked = overview.slices.filter((x) => !x.isPrimary);
  if (linked.length === 0) return null;
  return (
    <View style={s.card}>
      <Head title="Linked wallets" meta={`${linked.length} of ${overview.limit}`} />
      <View style={s.list}>
        {linked.map((w) => (
          <WalletRow key={w.id} wallet={w} hidden={hidden} />
        ))}
      </View>
    </View>
  );
};

/** One linked wallet; tapping it opens its page, which shows it without acting for it. */
const WalletRow = ({ wallet, hidden }: { wallet: WalletSlice; hidden: boolean }) => {
  const router = useRouter();
  return (
    <PressableScale
      style={s.row}
      activeScale={0.985}
      onPress={() => router.push({ pathname: "/wallet/[id]", params: { id: wallet.id } })}
      accessibilityRole="button"
      accessibilityLabel={rowLabel(wallet, hidden)}
    >
      <View style={[s.dot, { backgroundColor: seriesColor(wallet.series) }]} />
      <View style={s.mid}>
        <View style={s.nameLine}>
          <RNText style={s.name} numberOfLines={1}>
            {wallet.name}
          </RNText>
          {wallet.loan !== null && <Badge tone={wallet.loan.tone} label={wallet.loan.label} />}
        </View>
        <RNText style={s.sub} numberOfLines={1}>
          {walletStatus(wallet)}
        </RNText>
      </View>
      <View style={s.end}>
        <RNText style={s.value}>
          {hidden ? MASK : wallet.valueUsd === null ? "—" : usd(wallet.valueUsd)}
        </RNText>
        {/* Today's price move of what it holds: known from its balance, so a wallet still calculating has one. */}
        {!hidden && wallet.changePct !== null && <MoveChip value={Number(wallet.changePct)} soft />}
      </View>
      <Icon name="chevronRight" size={12} color={color.chevron} />
    </PressableScale>
  );
};

const rowLabel = (w: WalletSlice, hidden: boolean) =>
  [
    w.name,
    w.loan?.label,
    hidden ? undefined : w.valueUsd === null ? undefined : usd(w.valueUsd),
    hidden || w.changePct === null ? undefined : `${Number(w.changePct).toFixed(2)}% today`,
    walletStatus(w),
  ]
    .filter(Boolean)
    .join(", ");

const SIZE = 160;
const GEOMETRY = { cx: SIZE / 2, cy: SIZE / 2, outer: 78, inner: 60 };

/**
 * The ring, drawn from the same geometry as the web's: one piece per wallet
 * that holds something, a 2-point white gap between pieces, and whatever is
 * passed in written in the middle.
 */
const Ring = ({
  slices,
  hot,
  onPick,
  children,
}: {
  slices: readonly WalletSlice[];
  hot: string | null;
  onPick: (id: string) => void;
  children: React.ReactNode;
}) => {
  const pieces = arcs(slices.map((x) => x.value));
  const several = pieces.filter((p) => p.end > p.start).length > 1;
  return (
    <View
      style={s.ring}
      accessible
      accessibilityLabel={`Net worth by wallet: ${slices
        .filter((x) => x.share !== null)
        .map((x) => `${x.name} ${sharePct(x.share)}`)
        .join(", ")}`}
    >
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Circle
          cx={GEOMETRY.cx}
          cy={GEOMETRY.cy}
          r={(GEOMETRY.outer + GEOMETRY.inner) / 2}
          fill="none"
          stroke={color.page}
          strokeWidth={GEOMETRY.outer - GEOMETRY.inner}
        />
        {pieces.map((arc, i) => {
          const x = slices[i];
          const d = ringPath(arc, GEOMETRY);
          if (x === undefined || d === "") return null;
          return (
            <Path
              key={x.id}
              d={d}
              fill={seriesColor(x.series)}
              fillRule="evenodd"
              stroke={color.surface}
              strokeWidth={several ? 2 : 0}
              opacity={hot !== null && hot !== x.id ? 0.3 : 1}
              onPress={() => onPick(x.id)}
            />
          );
        })}
      </Svg>
      <View style={s.centre} pointerEvents="none">
        {children}
      </View>
    </View>
  );
};

const tone = (summary: PortfolioSummary, line: string): "up" | "down" | undefined =>
  line === "Calculating…"
    ? undefined
    : Number(summary.pnl.totalUsd) > 0
      ? "up"
      : Number(summary.pnl.totalUsd) < 0
        ? "down"
        : undefined;

const Head = ({ title, meta }: { title: string; meta?: string | undefined }) => (
  <View style={s.head}>
    <RNText style={s.title}>{title}</RNText>
    {meta !== undefined && <RNText style={s.meta}>{meta}</RNText>}
  </View>
);

const Figure = ({
  label,
  value,
  sub,
  tone: t,
}: {
  label: string;
  value: string;
  sub: string | null;
  tone?: "up" | "down" | undefined;
}) => (
  <View style={s.figure}>
    <RNText style={s.figureLabel}>{label}</RNText>
    <RNText
      style={[s.figureValue, t === "up" && s.upInk, t === "down" && s.downInk]}
      numberOfLines={1}
      adjustsFontSizeToFit
    >
      {value}
    </RNText>
    {sub !== null && (
      <RNText style={s.figureSub} numberOfLines={2}>
        {sub}
      </RNText>
    )}
  </View>
);

const BADGE = {
  up: { backgroundColor: color.upTint, color: color.up },
  warn: { backgroundColor: color.warnTint, color: color.warn },
  down: { backgroundColor: color.downTint, color: color.downDeep },
} as const;

/** A loan's health, named: never colour alone. */
const Badge = ({ tone: t, label }: { tone: keyof typeof BADGE; label: string }) => (
  <View style={[s.badge, { backgroundColor: BADGE[t].backgroundColor }]}>
    <RNText style={[s.badgeLabel, { color: BADGE[t].color }]}>{label}</RNText>
  </View>
);

const s = StyleSheet.create({
  card: {
    marginHorizontal: space.screen,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
    padding: space.xs,
  },
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  title: { fontFamily: font.medium, fontSize: 16, letterSpacing: -0.32, color: color.ink },
  meta: { fontFamily: font.regular, fontSize: 12.5, color: color.muted },
  body: {
    alignItems: "center",
    gap: space.lg,
    paddingHorizontal: 16,
    paddingTop: space.sm,
    paddingBottom: 18,
  },
  note: { fontFamily: font.regular, fontSize: 13, color: color.muted, textAlign: "center" },
  roundSkeleton: { borderRadius: SIZE / 2 },

  ring: { width: SIZE, height: SIZE },
  centre: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },
  centreLabel: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  centreValue: { fontFamily: font.medium, fontSize: 19, letterSpacing: -0.4, color: color.ink, marginTop: 2 },
  centreSub: {
    fontFamily: font.regular,
    fontSize: 10.5,
    color: color.faint,
    marginTop: 2,
    textAlign: "center",
  },

  figures: { flexDirection: "row", alignSelf: "stretch", gap: space.md },
  figure: { flex: 1, minWidth: 0, gap: 3 },
  figureLabel: { fontFamily: font.regular, fontSize: 12.5, color: color.muted },
  figureValue: { fontFamily: font.medium, fontSize: 16, letterSpacing: -0.32, color: color.ink },
  figureSub: { fontFamily: font.regular, fontSize: 11, color: color.muted },
  upInk: { color: color.up },
  downInk: { color: color.down },

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
  dot: { width: 10, height: 10, borderRadius: 5 },
  mid: { flex: 1, minWidth: 0, gap: 3 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flexShrink: 1, fontFamily: font.medium, fontSize: 14.5, letterSpacing: -0.29, color: color.ink },
  sub: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  end: { alignItems: "flex-end", gap: 4 },
  value: { fontFamily: font.medium, fontSize: 14.5, color: color.ink },
  badge: { borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  badgeLabel: { fontFamily: font.medium, fontSize: 11 },
});
