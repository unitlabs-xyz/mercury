import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text as RNText, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { usd, usdCompact } from "@mercury/view";
import { Chip, Icon, MoveChip, PressableScale, Skeleton, Sparkline, StockLogo, Text } from "../../src/ui";
import { useHistories, useInstruments, usePortfolio, type Instrument, type Shelf } from "../../src/api";
import { color, font, radius, space } from "../../src/theme";

const SHELVES: readonly { key: Shelf; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "movers", label: "Movers" },
  { key: "popular", label: "Popular" },
];

/** The logo's diameter, as everywhere else a row is led by one. */
const MARK = 36;

/** What the exchange calendar is saying, in words rather than a code. */
const SESSION: Record<string, string> = {
  open: "Market open",
  closed: "Market closed",
  pre: "Pre-market",
  post: "After hours",
};

export default function Invest() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [shelf, setShelf] = useState<Shelf>("featured");
  const [query, setQuery] = useState("");

  // Search the server once typing settles, not on every keystroke — the web
  // waits the same 250ms for the same reason.
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const list = useInstruments(shelf, term);
  const portfolio = usePortfolio();
  const instruments = useMemo(() => list.data?.instruments ?? [], [list.data]);

  const owned = useMemo(
    () => new Set((portfolio.data?.holdings ?? []).map((h) => h.ticker)),
    [portfolio.data],
  );

  /* One round trip for every line on screen. Capped: the server takes sixty
     tickers and a phone shows far fewer before anyone scrolls. */
  const tickers = useMemo(() => instruments.slice(0, 40).map((i) => i.ticker), [instruments]);
  const histories = useHistories(tickers);

  const searching = term.length > 0;
  const waiting = list.isPending && list.data === undefined;
  const session = instruments[0]?.status;

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={s.head}>
          <Text variant="title">Invest</Text>
          {session !== undefined && (
            <View style={s.session}>
              <View style={[s.dot, session === "open" && s.dotLive]} />
              <RNText style={s.sessionLabel}>{SESSION[session] ?? session}</RNText>
            </View>
          )}
        </View>

        <View style={s.search}>
          <Icon name="search" size={17} color={color.muted} />
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by company or ticker"
            placeholderTextColor={color.faint}
            selectionColor={color.brand}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        {/* The shelves are what a search replaces, so they go when one starts
            rather than sitting there describing a list they no longer order. */}
        {!searching && (
          <View style={s.chips}>
            {SHELVES.map((sh) => (
              <Chip
                key={sh.key}
                label={sh.label}
                selected={shelf === sh.key}
                onPress={() => setShelf(sh.key)}
              />
            ))}
          </View>
        )}

        <View style={s.list}>
          {waiting ? (
            [0, 1, 2, 3, 4, 5].map((i) => <RowSkeleton key={i} />)
          ) : instruments.length === 0 ? (
            <View style={s.empty}>
              <Text variant="label">{searching ? `Nothing matching "${term}"` : "No stocks to show"}</Text>
              <Text variant="small" tone="muted">
                {searching
                  ? "Try a ticker, or part of a company's name."
                  : "This usually means we could not reach the market."}
              </Text>
            </View>
          ) : (
            instruments.map((i) => (
              <Line
                key={i.ticker}
                instrument={i}
                owned={owned.has(i.ticker)}
                points={histories.data?.series[i.ticker]?.points}
                onPress={() => router.push({ pathname: "/stock/[ticker]", params: { ticker: i.ticker } })}
              />
            ))
          )}
        </View>

        {/* The web says this under its screener, and it is the one thing a
            short list here needs explaining. */}
        {!searching && !waiting && instruments.length > 0 && (
          <Text variant="small" tone="muted" style={s.footnote}>
            Showing the stocks with pools deep enough for a normal order. Search finds any other tokenised
            stock we support.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const Line = ({
  instrument: i,
  owned,
  points,
  onPress,
}: {
  onPress: () => void;
  instrument: Instrument;
  owned: boolean;
  points: readonly (readonly [number, string])[] | undefined;
}) => {
  const move = Number(i.changePct24h);
  const values = useMemo(() => (points ?? []).map(([, p]) => Number(p)), [points]);

  return (
    <PressableScale haptic={false} activeScale={0.99} style={s.row} onPress={onPress}>
      <StockLogo ticker={i.ticker} uri={i.logoUrl ?? undefined} size={MARK} />

      <View style={s.mid}>
        <View style={s.nameRow}>
          <RNText style={s.name} numberOfLines={1}>
            {i.name}
          </RNText>
          {owned && (
            <View style={s.ownedChip}>
              <RNText style={s.ownedLabel}>Owned</RNText>
            </View>
          )}
        </View>
        <RNText style={s.sub} numberOfLines={1}>
          {i.ticker}
          {i.sector === null ? "" : ` · ${i.sector}`}
        </RNText>
      </View>

      {/* A thin pool is the one thing about a row that changes what somebody
          can do with it, so it is said on the row rather than on the page the
          order is refused on. */}
      {i.featured ? (
        <Sparkline values={values} up={move > -0.005} />
      ) : (
        <View style={s.capChip}>
          <RNText style={s.capLabel}>to {usdCompact(i.maxOrderUsd)}</RNText>
        </View>
      )}

      <View style={s.end}>
        <RNText style={s.price}>{usd(i.pricePerShare)}</RNText>
        <MoveChip value={move} />
      </View>
    </PressableScale>
  );
};

const RowSkeleton = () => (
  <View style={s.row}>
    <Skeleton width={MARK} height={MARK} style={s.round} />
    <View style={s.mid}>
      <Skeleton width="68%" height={13} />
      <Skeleton width="44%" height={11} />
    </View>
    <View style={s.end}>
      <Skeleton width={64} height={13} />
      <Skeleton width={56} height={20} />
    </View>
  </View>
);

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.page },
  /* Clears the floating tab bar. */
  scroll: { paddingBottom: 108 },

  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.screen,
    paddingBottom: space.md,
  },
  session: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.faint },
  dotLive: { backgroundColor: color.up },
  sessionLabel: { fontFamily: font.medium, fontSize: 12.5, letterSpacing: -0.2, color: color.muted },

  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginHorizontal: space.screen,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  searchInput: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 15,
    letterSpacing: -0.3,
    color: color.ink,
    padding: 0,
  },

  chips: { flexDirection: "row", gap: 4, paddingHorizontal: space.screen - 13, paddingTop: space.md },

  /* One white panel holding every row, as the web's screener does, rather than
     a card per row: a list of cards is a list of edges, and the eye follows the
     logos down a single sheet far better. */
  list: {
    marginTop: space.md,
    marginHorizontal: space.screen,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    overflow: "hidden",
    paddingVertical: 4,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  round: { borderRadius: MARK / 2 },
  mid: { flex: 1, gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flexShrink: 1, fontFamily: font.medium, fontSize: 14, letterSpacing: -0.28, color: color.ink },
  sub: { fontFamily: font.regular, fontSize: 12, letterSpacing: -0.12, color: color.muted },
  ownedChip: {
    height: 17,
    paddingHorizontal: 6,
    justifyContent: "center",
    borderRadius: 5,
    backgroundColor: color.actBuyTint,
  },
  ownedLabel: { fontFamily: font.medium, fontSize: 10, letterSpacing: 0.1, color: color.actBuy },
  capChip: {
    height: 20,
    paddingHorizontal: 7,
    justifyContent: "center",
    borderRadius: radius.sm - 2,
    backgroundColor: color.warnTint,
  },
  capLabel: { fontFamily: font.medium, fontSize: 11, letterSpacing: -0.1, color: color.warn },

  end: { alignItems: "flex-end", gap: 4, minWidth: 78 },
  price: { fontFamily: font.medium, fontSize: 14, letterSpacing: -0.28, color: color.ink },

  empty: { paddingHorizontal: 14, paddingVertical: space.lg, gap: 4 },
  footnote: { paddingHorizontal: space.screen, paddingTop: space.md },
});
