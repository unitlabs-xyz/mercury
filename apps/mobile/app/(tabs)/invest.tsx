import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text as RNText, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { usd, usdCompact } from "@mercury/view";
import {
  Icon,
  MoveChip,
  PressableScale,
  Segmented,
  Surface,
  Skeleton,
  Sparkline,
  StockLogo,
  Text,
} from "../../src/ui";
import { useHistories, useInstruments, usePortfolio, type Instrument, type Shelf } from "../../src/api";
import {
  DEFAULT_FILTERS,
  SORTS,
  activeCount,
  resetFilters,
  setFilters,
  setListMeta,
  useFilters,
  type Sort,
} from "../../src/invest/filters";
import { color, font, radius, space } from "../../src/theme";
import { useWatchlist } from "../../src/watchlist";

/* The server's three shelves, and the one this phone keeps: what was saved. */
type View_ = Shelf | "saved";

const SHELVES: readonly { key: View_; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "movers", label: "Movers" },
  { key: "popular", label: "Popular" },
  { key: "saved", label: "Saved" },
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
  const [shelf, setShelf] = useState<View_>("featured");
  const saved = useWatchlist();
  const [query, setQuery] = useState("");
  /* Range, sector, order and "owned only" live in the filter sheet, a separate
     route, so they are kept in a store both can reach. */
  const filters = useFilters();
  const { range, sector, sort } = filters;

  // Search the server once typing settles, not on every keystroke — the web
  // waits the same 250ms for the same reason.
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  /* Saved reads the whole shelf of what we support and keeps the saved ones. */
  const list = useInstruments(shelf === "saved" ? "featured" : shelf, term);
  const portfolio = usePortfolio();
  const instruments = useMemo(() => {
    const all = list.data?.instruments ?? [];
    return shelf === "saved" && term.length === 0 ? all.filter((i) => saved.includes(i.ticker)) : all;
  }, [list.data, shelf, saved, term]);

  const owned = useMemo(
    () => new Set((portfolio.data?.holdings ?? []).map((h) => h.ticker)),
    [portfolio.data],
  );

  /* One round trip for every line on screen. Capped: the server takes sixty
     tickers and a phone shows far fewer before anyone scrolls. */
  const tickers = useMemo(() => instruments.slice(0, 40).map((i) => i.ticker), [instruments]);
  const histories = useHistories(tickers, range);

  /* The sectors this shelf actually holds, so no chip promises an empty list. */
  const sectors = useMemo(
    () => [...new Set(instruments.map((i) => i.sector).filter((x): x is string => x !== null))].sort(),
    [instruments],
  );
  /** A row's move over the chosen range: the live 24h move for 1D, the series' own for the rest. */
  const changeOf = useMemo(
    () => (i: Instrument) => {
      if (range === "1D") return Number(i.changePct24h);
      const series = histories.data?.series[i.ticker];
      return series ? Number(series.changePct) : null;
    },
    [range, histories.data],
  );

  const shown = useMemo(() => {
    const kept = instruments.filter(
      (i) => (sector === "all" || i.sector === sector) && (!filters.owned || owned.has(i.ticker)),
    );
    return sortBy(kept, sort, changeOf);
  }, [instruments, sector, filters.owned, owned, sort, changeOf]);

  /* Tell the sheet what it needs to draw: this shelf's sectors, and how many rows its filters leave. */
  useEffect(() => {
    setListMeta({ sectors, count: shown.length });
  }, [sectors, shown.length]);

  /* A sector chosen on one shelf may not exist on the next. */
  const pickShelf = (next: View_) => {
    setShelf(next);
    if (sector !== "all") setFilters({ sector: "all" });
  };

  const active = activeCount(filters);
  const anything = active > 0 || range !== DEFAULT_FILTERS.range;

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
        {/* The title and its companion share one line; the description takes
            the full width under them, rather than wrapping beside the label. */}
        <View style={s.head}>
          <View style={s.titleRow}>
            <Text variant="title">Invest</Text>
            {session !== undefined && (
              <View style={s.session}>
                <View style={[s.dot, session === "open" && s.dotLive]} />
                <RNText style={s.sessionLabel}>{SESSION[session] ?? session}</RNText>
              </View>
            )}
          </View>
          <RNText style={s.lede}>Real US stocks and ETFs, from $5, any hour of the week.</RNText>
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
          <View style={s.shelves}>
            <Segmented options={SHELVES} value={shelf} onChange={pickShelf} fill onPage />
          </View>
        )}

        {/* What the list is showing, and the one way to change it: the count
            and the settings in force on the left, Filter and sort on the right,
            and Clear beside it once anything is set. */}
        <View style={s.bar}>
          <View style={s.barText}>
            <RNText style={s.count}>
              {waiting ? " " : `${shown.length} ${shown.length === 1 ? "stock" : "stocks"}`}
            </RNText>
            <RNText style={s.summary} numberOfLines={1}>
              {summary(range, sector, sort, filters.owned)}
            </RNText>
          </View>
          {anything && (
            <PressableScale onPress={resetFilters} haptic={false} style={s.clear} accessibilityRole="button">
              <RNText style={s.clearText}>Clear</RNText>
            </PressableScale>
          )}
          <PressableScale
            onPress={() => router.push("/invest-filters")}
            activeScale={0.96}
            style={s.filterButton}
            accessibilityRole="button"
            accessibilityLabel={active > 0 ? `Filter and sort, ${active} on` : "Filter and sort"}
          >
            <Surface />
            <Icon name="sliders" size={16} color={color.ink} strokeWidth={1.7} />
            <RNText style={s.filterText}>Filter</RNText>
            {active > 0 && (
              <View style={s.badge}>
                <RNText style={s.badgeText}>{active}</RNText>
              </View>
            )}
          </PressableScale>
        </View>

        <View style={s.list}>
          {waiting ? (
            [0, 1, 2, 3, 4, 5].map((i) => <RowSkeleton key={i} />)
          ) : shown.length === 0 ? (
            <View style={s.empty}>
              <Text variant="label">
                {searching
                  ? `Nothing matching "${term}"`
                  : shelf === "saved" && saved.length === 0
                    ? "Nothing saved yet"
                    : instruments.length > 0
                      ? "Nothing matches these filters"
                      : "No stocks to show"}
              </Text>
              <Text variant="small" tone="muted">
                {searching
                  ? "Try a ticker, or part of a company's name."
                  : shelf === "saved" && saved.length === 0
                    ? "Tap the bookmark on any stock to keep it here."
                    : instruments.length > 0
                      ? "Clear them, or choose a different sector."
                      : "This usually means we could not reach the market."}
              </Text>
            </View>
          ) : (
            shown.map((i) => (
              <Line
                key={i.ticker}
                instrument={i}
                owned={owned.has(i.ticker)}
                points={histories.data?.series[i.ticker]?.points}
                change={changeOf(i)}
                onPress={() => router.push({ pathname: "/stock/[ticker]", params: { ticker: i.ticker } })}
              />
            ))
          )}
        </View>

        {/* The web says this under its screener, and it is the one thing a
            short list here needs explaining. */}
        {!searching && !waiting && shelf !== "saved" && instruments.length > 0 && (
          <Text variant="small" tone="muted" style={s.footnote}>
            Showing the stocks with pools deep enough for a normal order. Search finds any other tokenised
            stock we support.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

/** The list in the chosen order. Unpriced moves sink to the bottom rather than reading as zero. */
const sortBy = (list: readonly Instrument[], sort: Sort, changeOf: (i: Instrument) => number | null) => {
  if (sort === "default") return list;
  const move = (i: Instrument) => changeOf(i);
  const by: Record<Exclude<Sort, "default">, (a: Instrument, b: Instrument) => number> = {
    gainers: (a, b) => (move(b) ?? -Infinity) - (move(a) ?? -Infinity),
    losers: (a, b) => (move(a) ?? Infinity) - (move(b) ?? Infinity),
    priceHigh: (a, b) => Number(b.pricePerShare) - Number(a.pricePerShare),
    priceLow: (a, b) => Number(a.pricePerShare) - Number(b.pricePerShare),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  return [...list].sort(by[sort]);
};

/** "1M · Technology · Biggest gainers": the settings in force, in a line. */
const summary = (range: string, sector: string, sort: Sort, owned: boolean) =>
  [
    `${range} change`,
    sector === "all" ? null : sector,
    sort === "default" ? null : SORTS.find((x) => x.key === sort)?.label,
    owned ? "Owned" : null,
  ]
    .filter(Boolean)
    .join(" · ");

const Line = ({
  instrument: i,
  owned,
  points,
  change,
  onPress,
}: {
  onPress: () => void;
  instrument: Instrument;
  owned: boolean;
  points: readonly (readonly [number, string])[] | undefined;
  /** Over the chosen range: the live 24h move for 1D, the series' own for the rest. */
  change: number | null;
}) => {
  const move = change ?? 0;
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
        <MoveChip value={change} />
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

  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  /* One line under the title saying what the page is for, on every tab. */
  lede: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.muted, marginTop: 4 },
  shelves: { paddingHorizontal: space.screen, paddingTop: space.md },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.screen,
    paddingTop: space.md,
  },
  barText: { flex: 1, minWidth: 0 },
  count: { fontFamily: font.medium, fontSize: 14, lineHeight: 18, color: color.ink },
  summary: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: color.muted, marginTop: 1 },
  clear: { height: 36, paddingHorizontal: 10, justifyContent: "center" },
  clearText: { fontFamily: font.medium, fontSize: 13, color: color.link },
  filterButton: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#E9E9E5",
    overflow: "hidden",
  },
  filterText: { fontFamily: font.medium, fontSize: 13, color: color.ink },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: font.medium, fontSize: 11, color: color.onBand },

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
