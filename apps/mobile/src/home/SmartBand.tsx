import { useMemo } from "react";
import { StyleSheet, Text as RNText, View } from "react-native";
import { useRouter } from "expo-router";
import type { Portfolio } from "@mercury/types";
import { pct, toEvent, usd, usdSigned } from "@mercury/view";
import { useActivityFeed, useBorrow, useMoney, usePortfolio, type Borrow } from "../api";
import { useActions } from "../actions/Actions";
import { Icon, PressableScale, Skeleton, StockLogo } from "../ui";
import { color, font, radius, space } from "../theme";
import { Band, ON_BAND } from "./band";
import { MarketPulse } from "./MarketPulse";

const num = (v: string | number | null | undefined): number => Number(v ?? 0);

/** The smallest order the server takes; below it there is nothing to buy with. */
const MIN_ORDER = 5;

/**
 * The band between the home cards, saying the one thing that matters most for
 * this account right now, in this order:
 *
 *   1. a loan that needs attention — the only thing here that can cost money
 *      while nobody is looking, so it outranks everything;
 *   2. no shares yet — the next step, which is adding cash or a first buy;
 *   3. your day — today's move by holding, and any shares dividends added;
 *   4. otherwise, the market itself.
 *
 * One band that changes, rather than a row of buttons that never did: the
 * buttons repeated the + menu, and this is the part of the screen worth
 * reading every time it opens.
 */
export const SmartBand = ({ masked }: { masked: boolean }) => {
  const portfolio = usePortfolio();
  const borrow = useBorrow();
  const money = useMoney();
  const p = portfolio.data;
  const b = borrow.data;

  if (b !== undefined && num(b.debtUsd) > 0 && b.health !== "healthy") return <LoanBand borrow={b} />;
  if (portfolio.isError && p === undefined) return <MarketPulse />;
  if (p === undefined) return <LoadingBand />;
  if (p.holdings.length === 0) return <NextStep cash={num(money.data?.balanceUsd ?? p.cashUsd)} />;
  return <YourDay portfolio={p} masked={masked} />;
};

export const LoadingBand = () => (
  <Band id="loading">
    <View style={s.pad}>
      <Skeleton width={150} height={12} />
    </View>
    <View style={[s.pad, s.row]}>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} dark width={112} height={44} style={s.pill} />
      ))}
    </View>
  </Band>
);

/** The loan, in the web's words for each state, with how far prices could fall. */
const LOAN: Record<Exclude<Borrow["health"], "healthy">, { title: string; tone: string }> = {
  over_limit: { title: "Your loan is over target", tone: ON_BAND.warn },
  margin_call: { title: "Repay soon to keep your shares", tone: ON_BAND.down },
  liquidation: { title: "Kamino is selling collateral", tone: ON_BAND.down },
};

export const LoanBand = ({ borrow }: { borrow: Borrow }) => {
  const router = useRouter();
  const look = LOAN[borrow.health as Exclude<Borrow["health"], "healthy">];
  const drop = borrow.safeUntilDrop;
  return (
    <Band id="loan">
      <PressableScale onPress={() => router.push("/borrow")} activeScale={0.98} style={[s.pad, s.card]}>
        <View style={[s.glyph, { backgroundColor: ON_BAND.faint }]}>
          <Icon name="alert" size={18} color={look.tone} strokeWidth={1.8} />
        </View>
        <View style={s.fill}>
          <RNText style={[s.title, { color: look.tone }]}>{look.title}</RNText>
          <RNText style={s.sub}>
            {`${usd(num(borrow.debtUsd))} borrowed`}
            {drop !== null ? ` · safe until a ${pct(drop * 100, 0)} fall` : ""}
          </RNText>
          {drop !== null && (
            <View style={s.meter}>
              {/* How much of the fall it can take is left: shorter is closer to the line. */}
              <View
                style={[
                  s.meterFill,
                  { width: `${Math.min(1, drop / 0.5) * 100}%`, backgroundColor: look.tone },
                ]}
              />
            </View>
          )}
        </View>
        <Icon name="chevronRight" size={14} color={ON_BAND.muted} />
      </PressableScale>
    </Band>
  );
};

/** Nothing held yet: the one step that gets there. */
export const NextStep = ({ cash }: { cash: number }) => {
  const router = useRouter();
  const openActions = useActions();
  const funded = cash >= MIN_ORDER;
  return (
    <Band id={funded ? "first-buy" : "add-cash"}>
      <View style={[s.pad, s.card, s.stepCard]}>
        <View style={s.fill}>
          {funded && <RNText style={s.kicker}>Next step</RNText>}
          <RNText style={s.big}>{funded ? `${usd(cash)} ready to invest` : "Add cash to start"}</RNText>
          <RNText style={s.sub}>
            {funded
              ? "Buy your first share from $5, or start with a basket of the whole market."
              : "Send USDC on Solana to your Mercury address. It lands in seconds."}
          </RNText>
        </View>
      </View>
      <View style={[s.pad, s.row]}>
        {funded ? (
          <>
            <BandButton label="Buy a stock" icon="trend" primary onPress={() => router.navigate("/invest")} />
            <BandButton
              label="Core US basket"
              icon="blocks"
              onPress={() => router.push("/baskets/core-us")}
            />
          </>
        ) : (
          <>
            <BandButton label="Add cash" icon="plus" primary onPress={() => openActions("addCash")} />
            <BandButton label="Browse stocks" icon="trend" onPress={() => router.navigate("/invest")} />
          </>
        )}
      </View>
    </Band>
  );
};

/** A holding's dollar move today, from its value now and its percentage change. */
const todayUsd = (valueUsd: number, changePct: number) => valueUsd - valueUsd / (1 + changePct / 100);

/**
 * Your day: the account's move, then each holding's share of it as a chip,
 * biggest first. Under it, when dividends have added shares this month, the
 * latest — a share count that grew by itself, which no broker shows.
 */
const YourDay = ({ portfolio, masked }: { portfolio: Portfolio; masked: boolean }) => {
  const feed = useActivityFeed(25);
  const dividend = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7);
    const events = (feed.data?.items ?? []).map(toEvent).filter((e) => e.kind === "dividend");
    const recent = events.filter((e) => e.date.startsWith(month));
    return recent.length > 0 ? { title: recent[0]!.title, sub: recent[0]!.sub, count: recent.length } : null;
  }, [feed.data]);
  return <YourDayView portfolio={portfolio} masked={masked} dividend={dividend} />;
};

/** This month's dividends, as the band mentions them: the latest, and how many. */
export interface DividendNote {
  readonly title: string;
  readonly sub: string;
  readonly count: number;
}

export const YourDayView = ({
  portfolio,
  masked,
  dividend,
}: {
  portfolio: Portfolio;
  masked: boolean;
  dividend: DividendNote | null;
}) => {
  const router = useRouter();
  const change = num(portfolio.changeUsd);
  const up = change >= 0;

  const movers = useMemo(
    () =>
      portfolio.holdings
        .map((h) => ({ h, usd: todayUsd(num(h.valueUsd), num(h.changePct24h)), pct: num(h.changePct24h) }))
        .sort((a, b) => Math.abs(b.usd) - Math.abs(a.usd)),
    [portfolio.holdings],
  );

  const lead = movers[0];
  const most = Math.max(...movers.map((m) => Math.abs(m.usd)), 0.0001);
  const tone = (v: number) => (masked ? ON_BAND.muted : v >= 0 ? ON_BAND.up : ON_BAND.down);

  return (
    <Band id="day">
      {/* What happened, in a sentence, before the numbers that say it. */}
      <View style={[s.pad, s.dayHead]}>
        <View style={s.fill}>
          <RNText style={s.kicker}>Today</RNText>
          <RNText style={s.daySentence}>
            {masked
              ? "Your stocks moved today."
              : `${up ? "Up" : "Down"} ${usd(Math.abs(change))} today${
                  lead !== undefined && Math.abs(lead.usd) >= 0.005 ? `, led by ${lead.h.ticker}` : ""
                }.`}
          </RNText>
        </View>
        <View
          style={[
            s.dayChip,
            { backgroundColor: masked ? ON_BAND.faint : up ? color.upChip : color.fallChip },
          ]}
        >
          <Icon name={up ? "arrowUp" : "arrowDown"} size={11} color={tone(change)} strokeWidth={2.6} />
          <RNText style={[s.dayChipText, { color: tone(change) }]}>
            {masked ? "••" : pct(Math.abs(num(portfolio.changePct)))}
          </RNText>
        </View>
      </View>

      {/* Each holding's share of the day, as a bar from the middle: gains run right, falls left. */}
      <View style={[s.pad, s.contrib]}>
        {movers.slice(0, 4).map(({ h, usd: move }) => {
          const width = `${Math.max(4, (Math.abs(move) / most) * 100)}%` as const;
          return (
            <PressableScale
              key={h.ticker}
              onPress={() => router.push({ pathname: "/stock/[ticker]", params: { ticker: h.ticker } })}
              activeScale={0.98}
              style={s.contribRow}
              accessibilityRole="button"
              accessibilityLabel={`${h.name}, ${move >= 0 ? "up" : "down"} ${usd(Math.abs(move))} today`}
            >
              <StockLogo ticker={h.ticker} size={24} />
              <RNText style={s.contribTicker}>{h.ticker}</RNText>
              <View style={s.track}>
                <View style={[s.half, s.left]}>
                  {move < 0 && <View style={[s.fillBar, { width, backgroundColor: tone(move) }]} />}
                </View>
                <View style={s.axis} />
                <View style={s.half}>
                  {move >= 0 && <View style={[s.fillBar, { width, backgroundColor: tone(move) }]} />}
                </View>
              </View>
              <RNText style={[s.contribValue, { color: tone(move) }]}>
                {masked ? "••••" : usdSigned(move)}
              </RNText>
            </PressableScale>
          );
        })}
      </View>

      {dividend !== null && (
        <PressableScale
          onPress={() => router.navigate("/activity")}
          haptic={false}
          style={[s.pad, s.dividend]}
        >
          <View style={s.dividendMark}>
            <Icon name="refresh" size={13} color={ON_BAND.up} strokeWidth={1.8} />
          </View>
          <RNText style={s.dividendText} numberOfLines={1}>
            {dividend.count > 1
              ? `${dividend.count} dividends added shares this month`
              : `${dividend.title}${dividend.sub ? ` · ${dividend.sub}` : ""}`}
          </RNText>
          <Icon name="chevronRight" size={12} color={ON_BAND.muted} />
        </PressableScale>
      )}
    </Band>
  );
};

/** A pill for the ink: light when it is the step, quiet when it is the other way in. */
const BandButton = ({
  label,
  icon,
  primary,
  onPress,
}: {
  label: string;
  icon: "trend" | "plus" | "blocks";
  primary?: boolean;
  onPress: () => void;
}) => (
  <PressableScale
    onPress={onPress}
    activeScale={0.96}
    accessibilityRole="button"
    style={[s.button, primary === true ? s.buttonPrimary : s.buttonQuiet]}
  >
    <Icon name={icon} size={16} color={primary === true ? color.onBand : ON_BAND.ink} strokeWidth={1.7} />
    <RNText style={[s.buttonText, { color: primary === true ? color.onBand : ON_BAND.ink }]}>{label}</RNText>
  </PressableScale>
);

const s = StyleSheet.create({
  /* Inside the band card, its own inset. */
  pad: { paddingHorizontal: 16 },
  row: { flexDirection: "row", gap: space.sm },
  fill: { flex: 1, minWidth: 0 },
  pill: { borderRadius: radius.pill },
  card: { flexDirection: "row", alignItems: "center", gap: space.md },
  stepCard: { alignItems: "flex-start" },
  glyph: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  kicker: { fontFamily: font.medium, fontSize: 12, letterSpacing: 0.2, color: ON_BAND.muted },
  big: {
    fontFamily: font.medium,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: ON_BAND.ink,
    marginTop: 4,
  },
  title: { fontFamily: font.medium, fontSize: 15, lineHeight: 20, letterSpacing: -0.3 },
  sub: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: ON_BAND.muted, marginTop: 4 },
  meter: { height: 4, borderRadius: 2, backgroundColor: ON_BAND.faint, marginTop: 10, overflow: "hidden" },
  meterFill: { height: 4, borderRadius: 2 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  headFigure: { fontFamily: font.medium, fontSize: 14, letterSpacing: -0.28 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    height: 44,
    paddingLeft: 9,
    paddingRight: 14,
    borderRadius: radius.pill,
    backgroundColor: ON_BAND.faint,
    borderWidth: 1,
    borderColor: ON_BAND.edge,
  },
  ticker: { fontFamily: font.medium, fontSize: 13, lineHeight: 16, color: ON_BAND.ink },
  move: { fontFamily: font.medium, fontSize: 12, lineHeight: 15 },
  dividend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: ON_BAND.faint,
  },
  dividendMark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: color.upChip,
    alignItems: "center",
    justifyContent: "center",
  },
  dayHead: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  daySentence: {
    marginTop: 4,
    fontFamily: font.medium,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.34,
    color: ON_BAND.ink,
  },
  dayChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  dayChipText: { fontFamily: font.medium, fontSize: 12.5 },
  contrib: { gap: 10 },
  contribRow: { flexDirection: "row", alignItems: "center", gap: 10, height: 28 },
  contribTicker: { width: 46, fontFamily: font.medium, fontSize: 13, color: ON_BAND.ink },
  track: { flex: 1, flexDirection: "row", alignItems: "center", height: 8 },
  half: { flex: 1, height: 8, justifyContent: "center" },
  left: { alignItems: "flex-end" },
  axis: { width: 1, height: 14, backgroundColor: color.divider },
  fillBar: { height: 8, borderRadius: 4 },
  contribValue: { width: 62, textAlign: "right", fontFamily: font.medium, fontSize: 13 },
  dividendText: { flex: 1, fontFamily: font.regular, fontSize: 13, color: ON_BAND.ink },
  button: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  buttonPrimary: { backgroundColor: color.ink },
  buttonQuiet: { backgroundColor: ON_BAND.faint, borderWidth: 1, borderColor: ON_BAND.edge },
  buttonText: { fontFamily: font.medium, fontSize: 14, letterSpacing: -0.28 },
});
