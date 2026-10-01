import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { pct, usd, usdSigned } from "@mercury/view";
import {
  ActionStrip,
  CARD_RADIUS,
  Chip,
  HeroBalance,
  Icon,
  Mark,
  MovePill,
  MoveChip,
  PressableScale,
  StockLogo,
  Text,
  type Action,
  type IconName,
} from "../../src/ui";
import { color, font, radius, space } from "../../src/theme";

/*
 * The figures are still fixed; the shapes are not.
 *
 * Every one of them is named and typed the way `GET /v1/portfolio` and
 * `GET /v1/events` return it, and every number on screen goes through `usd`,
 * `pct` and `usdSigned` from `@mercury/view` — the same functions the web
 * header calls. When this reads from the API the two clients will already round
 * and sign money identically rather than nearly so.
 */
const ACCOUNT = {
  totalUsd: 8073.11,
  stocksUsd: 6038.38,
  cashUsd: 4534.73,
  debtUsd: 2500,
  changeUsd: 39.32,
  changePct: 0.49,
  /** The server's `safeUntilDrop`, as a fraction. */
  safeUntilDrop: 0.32,
  yieldApr: 4.1,
};

interface Holding {
  readonly ticker: string;
  readonly name: string;
  readonly valueUsd: number;
  readonly changePct: number | null;
}

const HOLDINGS: readonly Holding[] = [
  { ticker: "NVDA", name: "NVIDIA", valueUsd: 1_742.2, changePct: 1.84 },
  { ticker: "TSLA", name: "Tesla", valueUsd: 1_308.55, changePct: -0.62 },
  { ticker: "AAPL", name: "Apple", valueUsd: 1_194.4, changePct: 0.31 },
  { ticker: "MSFT", name: "Microsoft", valueUsd: 988.1, changePct: 0.77 },
  { ticker: "SPCX", name: "SpaceX", valueUsd: 805.13, changePct: null },
];

type EventKind = "buy" | "dividend" | "send" | "borrow";

/**
 * USDC's mark, as the web's `activity-mark.tsx` picks it: the Solana token
 * list's own asset, which is the file every wallet on this chain already shows
 * for this mint, rather than a mark of ours that would only half-match what
 * people recognise. Cash is not a holding, so it never resolves to an
 * instrument and cannot come from the API's logo column.
 */
const USDC_LOGO =
  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png";

interface Event {
  readonly id: string;
  readonly kind: EventKind;
  /** The instrument whose art leads the row; null when no asset explains it. */
  readonly ticker: string | null;
  /** Overrides the ticker's art — money, which has no instrument. */
  readonly uri?: string;
  readonly title: string;
  readonly detail: string;
  readonly amountUsd: number;
  readonly when: string;
}

const EVENTS: readonly Event[] = [
  {
    id: "1",
    kind: "buy",
    ticker: "NVDA",
    title: "Bought NVIDIA",
    detail: "0.42 shares at $200.48",
    amountUsd: -84.2,
    when: "Today",
  },
  {
    id: "2",
    kind: "dividend",
    ticker: "AAPL",
    title: "Dividend from Apple",
    detail: "5.2 shares",
    amountUsd: 1.3,
    when: "Today",
  },
  {
    id: "3",
    kind: "borrow",
    ticker: "SPCX",
    title: "Borrowed against SpaceX",
    detail: "USDC into your account",
    amountUsd: 500,
    when: "Yesterday",
  },
  {
    id: "4",
    kind: "buy",
    ticker: "TSLA",
    title: "Bought Tesla",
    detail: "1.10 shares at $284.00",
    amountUsd: -312.4,
    when: "Yesterday",
  },
  {
    id: "5",
    kind: "send",
    ticker: "USDC",
    uri: USDC_LOGO,
    title: "Sent USDC",
    detail: "To 7xKq…9mPt",
    amountUsd: -120,
    when: "Mon",
  },
];

/* The web's activity look: a tinted circle, then the stroke, per kind. */
const LOOK: Record<EventKind, { bg: string; fg: string; icon: IconName }> = {
  buy: { bg: color.actBuyTint, fg: color.actBuy, icon: "trend" },
  dividend: { bg: color.actIncomeTint, fg: color.actIncome, icon: "plus" },
  send: { bg: color.actSendTint, fg: color.actSend, icon: "arrowUp" },
  borrow: { bg: color.warnTint, fg: color.warn, icon: "wallet" },
};

type Filter = "all" | "buys" | "income";

/** The logo's diameter wherever one leads a row. One number, so the rail, the
 *  loan row and the feed all indent their text to the same place. */
const MARK = 36;

export default function Portfolio() {
  const insets = useSafeAreaInsets();
  const [hidden, setHidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const up = ACCOUNT.changeUsd >= 0;

  const actions: readonly Action[] = [
    { key: "invest", label: "Invest", icon: "trend", onPress: () => undefined },
    { key: "cash", label: "Add cash", icon: "plus", onPress: () => undefined },
    { key: "send", label: "Send", icon: "arrowUp", tone: "brand", onPress: () => undefined },
    { key: "card", label: "Card", icon: "card", tone: "warm", onPress: () => undefined },
  ];

  const shown = EVENTS.filter((e) =>
    filter === "all" ? true : filter === "buys" ? e.kind === "buy" : e.kind === "dividend",
  );

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              setTimeout(() => setRefreshing(false), 700);
            }}
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

          <HeroBalance amount={ACCOUNT.totalUsd} label="Net worth" masked={hidden} />
          {!hidden && (
            <MovePill pctText={pct(ACCOUNT.changePct)} usdText={usdSigned(ACCOUNT.changeUsd)} up={up} />
          )}

          <HoldingsRail holdings={HOLDINGS} masked={hidden} />

          {/* Two halves of one number, split by a hairline rather than a gap:
              what is invested and what is not are not two unrelated things
              sitting next to each other. */}
          <View style={s.pots}>
            <Pot
              label="INVESTED"
              value={ACCOUNT.stocksUsd}
              note={`${HOLDINGS.length} positions`}
              masked={hidden}
            />
            <View style={s.potSplit} />
            <Pot
              label="CASH"
              value={ACCOUNT.cashUsd}
              note={`Earning ${ACCOUNT.yieldApr}% a year`}
              masked={hidden}
            />
          </View>

          {ACCOUNT.debtUsd > 0 && <Borrowed masked={hidden} />}
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
            {(["all", "buys", "income"] as const).map((k) => (
              <Chip
                key={k}
                label={k === "all" ? "All" : k === "buys" ? "Buys" : "Income"}
                selected={filter === k}
                onPress={() => setFilter(k)}
              />
            ))}
          </View>

          {shown.length === 0 ? (
            <View style={s.empty}>
              <Text variant="label">Nothing for this filter</Text>
              <Text variant="small" tone="muted">
                Your buys, dividends and transfers all land here.
              </Text>
            </View>
          ) : (
            shown.map((e) => <EventRow key={e.id} event={e} masked={hidden} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * The holdings rail: one card per position, scrolling sideways.
 *
 * No share count, following the web's holdings table and for its reason: the
 * value above it is that count times the price, so printing both is the same
 * number twice, and a fractional share count is the least useful way to say how
 * much of something somebody holds.
 */
const HoldingsRail = ({ holdings, masked }: { holdings: readonly Holding[]; masked: boolean }) => {
  if (holdings.length === 0) {
    return (
      <PressableScale style={s.railEmpty} onPress={() => undefined}>
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
        <PressableScale key={h.ticker} style={s.holdCard} onPress={() => undefined}>
          <StockLogo ticker={h.ticker} size={MARK} />
          <View style={s.holdText}>
            <RNText style={s.holdName} numberOfLines={1}>
              {h.name}
            </RNText>
            <RNText style={s.holdValue} numberOfLines={1}>
              {masked ? "••••" : usd(h.valueUsd)}
            </RNText>
          </View>
          {masked ? <View style={s.chipGhost} /> : <MoveChip value={h.changePct} />}
        </PressableScale>
      ))}

      {/* At the END of the rail, so it is what scrolling reaches rather than a
          control competing with the first card. */}
      <PressableScale style={s.allCard} onPress={() => undefined}>
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
}: {
  label: string;
  value: number;
  note: string;
  masked: boolean;
}) => (
  <View style={s.pot}>
    <RNText style={s.potLabel}>{label}</RNText>
    <RNText style={s.potFigure}>{masked ? "••••" : usd(value)}</RNText>
    <RNText style={s.potNote} numberOfLines={1}>
      {note}
    </RNText>
  </View>
);

/**
 * What is owed, and the fall that would cost somebody their shares.
 *
 * The line under the label is the web's `borrowedSub`: once something is
 * borrowed, the cushion is the number that matters, not the headroom — and it
 * is the one that shrinks every time a loan buys more collateral.
 */
const Borrowed = ({ masked }: { masked: boolean }) => (
  <PressableScale activeScale={0.99} style={s.borrowed} onPress={() => undefined}>
    <View style={s.borrowedMark}>
      <Icon name="wallet" size={16} color={color.warn} />
    </View>
    <View style={s.borrowedMid}>
      <RNText style={s.potLabel}>BORROWED</RNText>
      <RNText style={s.borrowedNote} numberOfLines={1}>
        Safe unless your shares fall {pct(ACCOUNT.safeUntilDrop * 100, 0)}
      </RNText>
    </View>
    {/* `usd(v, 0)`, not `usdCompact`: Hermes' Intl ignores `notation: "compact"`
        and silently returns the long form with one stray decimal — $2,500.0. */}
    <RNText style={s.borrowedFigure}>{masked ? "••••" : `−${usd(ACCOUNT.debtUsd, 0)}`}</RNText>
    <Icon name="chevronRight" size={14} color={color.faint} />
  </PressableScale>
);

const EventRow = ({ event, masked }: { event: Event; masked: boolean }) => {
  const look = LOOK[event.kind];
  const credit = event.amountUsd >= 0;
  return (
    <PressableScale haptic={false} activeScale={0.99} style={s.row} onPress={() => undefined}>
      {/* The stock's own logo where there is one, as the web's activity feed
          does; the tinted kind mark is for what no instrument explains. */}
      {event.ticker === null ? (
        <View style={[s.rowArt, { backgroundColor: look.bg }]}>
          <Icon name={look.icon} size={16} color={look.fg} />
        </View>
      ) : (
        <View>
          <StockLogo ticker={event.ticker} uri={event.uri} size={MARK} />
          <View style={[s.rowBadge, { backgroundColor: look.bg }]}>
            <Icon name={look.icon} size={9} color={look.fg} strokeWidth={2.4} />
          </View>
        </View>
      )}
      <View style={s.rowMid}>
        <RNText style={s.rowTitle} numberOfLines={1}>
          {event.title}
        </RNText>
        <RNText style={s.rowDetail} numberOfLines={1}>
          {event.detail}
        </RNText>
      </View>
      <View style={s.rowEnd}>
        <RNText style={[s.rowAmount, credit && { color: color.up }]}>
          {masked ? "••••" : usdSigned(event.amountUsd)}
        </RNText>
        <RNText style={s.rowWhen}>{event.when}</RNText>
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

  /* Negative margins so the rail scrolls edge to edge through the card's own
     padding instead of stopping short of both edges. */
  rail: { marginTop: 18, marginHorizontal: -space.screen },
  railRow: { flexDirection: "row", gap: 10, paddingHorizontal: space.screen },
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
  rowWhen: { fontFamily: font.regular, fontSize: 12, letterSpacing: -0.12, color: color.muted },
});
