import { useEffect, useMemo, useState } from "react";
import { Image, Linking, ScrollView, StyleSheet, Text as RNText, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import type { BasketTag } from "@mercury/types";
import {
  BASKET_INVESTORS,
  BASKET_THEMES,
  displayBasketName,
  rebalanceOutcome,
  searchStrategies,
  themeTitle,
  usd,
  visibleStrategies,
  shelfOf,
  type ShelfBasket,
} from "@mercury/view";
import { useSignedIn } from "../../src/api";
import {
  useBasketOperations,
  useBaskets,
  useOwnedBasketPortfolios,
  useTrackedOperations,
} from "../../src/baskets/api";
import {
  AssetStack,
  INVESTOR_ART,
  SectionHead,
  THEME_ART,
  useHoldingInstruments,
} from "../../src/baskets/ui";
import { Button, Icon, IconButton, PressableScale, Skeleton, Text } from "../../src/ui";
import { color, font, radius, space } from "../../src/theme";

/** How a Glider basket works, as the web's rail numbers it. */
const HOW: readonly [string, string][] = [
  ["Choose a strategy", "Each one sets target weights across tokenized stocks on Solana."],
  ["You own the assets", "They live in your own smart account, not in one pooled basket token."],
  ["Glider rebalances daily", "It works back toward the target weights as prices move."],
];

const EMPTY: readonly ShelfBasket[] = [];

/**
 * Baskets, as the web's page lays them out on a phone: what you already hold,
 * then the ways in — by theme, by investor, or the list — each strategy a
 * Glider template that becomes your own portfolio when you enroll.
 */
export default function Baskets() {
  const router = useRouter();
  const signedIn = useSignedIn();
  const catalog = useBaskets();
  const owned = useOwnedBasketPortfolios();
  const [theme, setTheme] = useState<BasketTag | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [list, setList] = useState(0);
  const [query, setQuery] = useState("");
  /* Search once typing settles, as the web waits 250ms. */
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  const searching = term !== "";
  const scroller = useMemo(() => ({ current: null as ScrollView | null }), []);

  // The shelf is the curated catalogue; a basket somebody wrote is not on it.
  const templates = useMemo(() => (catalog.data ? shelfOf(catalog.data) : EMPTY), [catalog.data]);
  /* A search reads every holding's company name, so it needs the whole catalog's instruments. */
  const instruments = useHoldingInstruments(templates, searching ? 100 : 5);
  const companyNames = useMemo(
    () => new Map([...instruments].map(([ticker, i]) => [ticker, i.name])),
    [instruments],
  );
  const visible = useMemo(
    () =>
      searching
        ? searchStrategies(templates, term, companyNames)
        : visibleStrategies(templates, theme, showAll),
    [templates, theme, showAll, searching, term, companyNames],
  );
  const pros = useMemo(
    () =>
      BASKET_INVESTORS.map((slug) => templates.find((t) => t.slug === slug)).filter(
        (t): t is ShelfBasket => t !== undefined,
      ),
    [templates],
  );
  const bySlug = useMemo(() => new Map(templates.map((t) => [t.slug, t])), [templates]);
  const open = (slug: string) => router.push({ pathname: "/baskets/[slug]", params: { slug } });

  /* Picking a theme or "see all" brings the list into view, as the web scrolls to it. */
  const showList = (next: { theme?: BasketTag | null; all?: boolean }) => {
    if (next.theme !== undefined) setTheme(next.theme);
    if (next.all !== undefined) setShowAll(next.all);
    requestAnimationFrame(() => scroller.current?.scrollTo({ y: list - 12, animated: true }));
  };

  const title = searching
    ? "Search results"
    : theme
      ? `${themeTitle(theme)} strategies`
      : showAll
        ? "All strategies"
        : "Featured strategies";
  const portfolios = owned.data ?? [];

  return (
    <View style={s.root}>
      <SafeAreaView edges={["top"]} style={s.fill}>
        <View style={s.nav}>
          <IconButton icon="chevronRight" rotate="180deg" label="Back" onPress={() => router.back()} />
        </View>
        <ScrollView
          ref={(r) => {
            scroller.current = r;
          }}
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={s.head}>
            <Text variant="title">Baskets</Text>
            <RNText style={s.lede}>
              Ready-made strategies on Glider. The stocks stay in your own smart account, rebalanced daily.
            </RNText>
          </View>

          <View style={s.search}>
            <Icon name="search" size={16} color={color.muted} />
            <TextInput
              style={s.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search by strategy, company or ticker"
              placeholderTextColor={color.faint}
              selectionColor={color.brand}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>

          <Operations />

          {/* ── What you hold ─────────────────────────────────────────── */}
          {signedIn && (owned.isPending || portfolios.length > 0 || owned.isError) && (
            <View style={s.card}>
              <View style={s.cardHead}>
                <RNText style={s.cardTitle}>Your baskets</RNText>
                {portfolios.length > 0 && (
                  <RNText style={s.meta}>
                    {portfolios.length} {portfolios.length === 1 ? "portfolio" : "portfolios"}
                  </RNText>
                )}
              </View>
              <View style={s.panel}>
                {owned.isPending ? (
                  [0, 1].map((k) => <Skeleton key={k} width="100%" height={44} style={s.rowSkeleton} />)
                ) : owned.isError && portfolios.length === 0 ? (
                  <View style={s.blank}>
                    <RNText style={s.blankTitle}>Your baskets are unavailable</RNText>
                    <RNText style={s.blankBody}>
                      We couldn&apos;t load your Glider portfolios. Your assets remain in your smart account.
                    </RNText>
                    <Button
                      size="md"
                      variant="secondary"
                      label="Try again"
                      onPress={() => void owned.refetch()}
                    />
                  </View>
                ) : (
                  portfolios.map((p) => {
                    const template = bySlug.get(p.slug);
                    return (
                      <PressableScale
                        key={p.portfolioId}
                        style={s.row}
                        activeScale={0.985}
                        onPress={() => open(p.slug)}
                        accessibilityRole="button"
                      >
                        {template !== undefined && (
                          <AssetStack template={template} instruments={instruments} limit={2} size={26} />
                        )}
                        <View style={s.mid}>
                          <RNText style={s.name} numberOfLines={1}>
                            {displayBasketName(p.name)}
                          </RNText>
                          <RNText style={s.sub} numberOfLines={1}>
                            {p.targetAssetCount} target assets · On Glider
                          </RNText>
                        </View>
                        <View style={s.end}>
                          <RNText style={s.value}>{usd(p.totalValueUsd)}</RNText>
                          <RNText style={s.sub}>
                            {p.usdcBalance === null ? "USDC —" : `${usd(p.usdcBalance)} USDC`}
                          </RNText>
                        </View>
                      </PressableScale>
                    );
                  })
                )}
              </View>
            </View>
          )}

          {catalog.isPending && catalog.data === undefined ? (
            <DiscoveryLoading />
          ) : catalog.isError && catalog.data === undefined ? (
            <View style={[s.card, s.blank]}>
              <RNText style={s.blankTitle}>Strategies are temporarily unavailable</RNText>
              <Button
                size="md"
                variant="secondary"
                label="Try again"
                onPress={() => void catalog.refetch()}
              />
            </View>
          ) : (
            <>
              {/* ── By theme ─────────────────────────────────────────── */}
              {!searching && (
                <View style={s.section}>
                  <SectionHead
                    title="Explore by theme"
                    sub="Strategies that match your interests and outlook."
                  />
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.shelf}
                    decelerationRate="fast"
                    snapToInterval={THEME_W + 10}
                  >
                    {BASKET_THEMES.map((t) => {
                      const count = templates.filter((x) => x.tags.includes(t.tag)).length;
                      return (
                        <PressableScale
                          key={t.tag}
                          style={[s.theme, theme === t.tag && s.themeOn]}
                          activeScale={0.97}
                          onPress={() => showList({ theme: t.tag })}
                          accessibilityRole="button"
                          accessibilityLabel={`${t.title}, ${count} strategies`}
                        >
                          <Image
                            source={THEME_ART[t.tag]}
                            style={s.themeArt}
                            blurRadius={2}
                            resizeMode="cover"
                          />
                          {/* The web masks the art in from the right; a white wash does the same here. */}
                          <LinearGradient
                            colors={["#FFFFFF", "rgba(255,255,255,0.75)", "rgba(255,255,255,0)"]}
                            locations={[0, 0.45, 0.85]}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={StyleSheet.absoluteFill}
                          />
                          <RNText style={s.themeTitle}>{t.title}</RNText>
                          <RNText style={s.themeBody}>{t.description}</RNText>
                          <View style={s.themeFoot}>
                            <RNText style={s.themeCount}>
                              {count} {count === 1 ? "strategy" : "strategies"}
                            </RNText>
                            <Icon name="arrowRight" size={13} color={color.ink} />
                          </View>
                        </PressableScale>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* ── Like the pros ────────────────────────────────────── */}
              {!searching && pros.length > 0 && (
                <View style={s.section}>
                  <SectionHead
                    title="Invest like the pros"
                    sub="Investor-inspired Solana adaptations, not copies of their holdings."
                  />
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.shelf}
                    decelerationRate="fast"
                    snapToInterval={PRO_W + 10}
                  >
                    {pros.map((t) => (
                      <PressableScale
                        key={t.slug}
                        style={s.pro}
                        activeScale={0.97}
                        onPress={() => open(t.slug)}
                        accessibilityRole="button"
                        accessibilityLabel={`View ${displayBasketName(t.name)} strategy`}
                      >
                        <Image source={INVESTOR_ART[t.slug]} style={s.proArt} resizeMode="cover" />
                        <View style={s.proFoot}>
                          <RNText style={s.proLabel}>Top holdings · Daily</RNText>
                          <AssetStack template={t} instruments={instruments} limit={4} size={24} />
                        </View>
                      </PressableScale>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* ── The list ─────────────────────────────────────────── */}
              <View style={s.card} onLayout={(e) => setList(e.nativeEvent.layout.y)}>
                <View style={s.cardHead}>
                  <View style={s.fill}>
                    <RNText style={s.cardTitle}>{title}</RNText>
                    <RNText style={s.sub}>
                      {searching ? `${visible.length} matching “${term}”` : `${visible.length} on Glider`}
                    </RNText>
                  </View>
                  {!searching && (
                    <PressableScale
                      activeScale={0.96}
                      onPress={() => {
                        if (theme) {
                          setTheme(null);
                          setShowAll(true);
                        } else setShowAll(!showAll);
                      }}
                    >
                      <RNText style={s.link}>{theme || !showAll ? "See all" : "Show featured"}</RNText>
                    </PressableScale>
                  )}
                </View>
                <View style={s.panel}>
                  {visible.length === 0 ? (
                    <View style={s.blank}>
                      <RNText style={s.blankBody}>
                        {searching ? `No strategy matches “${term}”.` : "No strategies in this theme yet."}
                      </RNText>
                    </View>
                  ) : (
                    visible.map((t) => (
                      <PressableScale
                        key={t.slug}
                        style={s.strategy}
                        activeScale={0.985}
                        onPress={() => open(t.slug)}
                        accessibilityRole="button"
                      >
                        <View style={s.strategyTop}>
                          <View style={s.mid}>
                            <RNText style={s.name} numberOfLines={1}>
                              {displayBasketName(t.name)}
                            </RNText>
                            <RNText style={s.sub} numberOfLines={2}>
                              {t.description}
                            </RNText>
                          </View>
                          <Icon name="chevronRight" size={14} color={color.muted} />
                        </View>
                        <View style={s.strategyFoot}>
                          <AssetStack template={t} instruments={instruments} limit={5} size={24} />
                          <RNText style={s.sub}>{t.allocations.length} assets · Daily</RNText>
                        </View>
                      </PressableScale>
                    ))
                  )}
                </View>
              </View>
            </>
          )}

          {/* ── How it works ─────────────────────────────────────────── */}
          <View style={[s.card, s.how]}>
            <RNText style={s.cardTitle}>How Glider baskets work</RNText>
            {HOW.map(([head, body], k) => (
              <View key={head} style={s.step}>
                <View style={s.stepNo}>
                  <RNText style={s.stepNoText}>{k + 1}</RNText>
                </View>
                <View style={s.fill}>
                  <RNText style={s.stepTitle}>{head}</RNText>
                  <RNText style={s.stepBody}>{body}</RNText>
                </View>
              </View>
            ))}
          </View>

          <View style={s.footer}>
            <RNText style={s.footnote}>
              Strategies are provided by Glider. Assets stay in your own smart account. Past or modeled
              performance does not guarantee future results.
            </RNText>
            <PressableScale activeScale={0.97} onPress={() => void Linking.openURL("https://glider.fi")}>
              <RNText style={s.link}>Learn about Glider ›</RNText>
            </PressableScale>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/**
 * The rebalances and withdrawals started this session, in flight first: the
 * web's "Basket operations" rail. Glider accepts the work before it settles,
 * so this is where somebody sees it land without opening each basket.
 */
const Operations = () => {
  const router = useRouter();
  const tracked = useTrackedOperations();
  const entries = Object.values(tracked);
  const results = useBasketOperations(entries.map(({ slug, operationId }) => ({ slug, operationId })));
  if (entries.length === 0) return null;
  const rows = entries
    .map((op, k) => ({ op, data: results[k]?.data, failed: results[k]?.isError === true }))
    .sort((a, b) => Number(isActive(b.data?.state)) - Number(isActive(a.data?.state)));
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <RNText style={s.cardTitle}>Basket operations</RNText>
        <RNText style={s.meta}>On Glider</RNText>
      </View>
      <View style={s.panel}>
        {rows.map(({ op, data, failed }) => {
          const outcome = data ? rebalanceOutcome(data.state, data.error) : null;
          const active = isActive(data?.state);
          return (
            <PressableScale
              key={op.operationId}
              style={s.row}
              activeScale={0.985}
              onPress={() => router.push({ pathname: "/baskets/[slug]", params: { slug: op.slug } })}
            >
              <View
                style={[
                  s.dot,
                  {
                    backgroundColor: active
                      ? color.warn
                      : data?.state === "completed"
                        ? color.up
                        : color.down,
                  },
                ]}
              />
              <View style={s.mid}>
                <RNText style={s.name} numberOfLines={1}>
                  {displayBasketName(op.name)}
                </RNText>
                <RNText style={s.sub}>
                  {op.kind === "rebalance"
                    ? "Manual rebalance"
                    : op.mode === "in_kind"
                      ? "Withdrawal in kind"
                      : "Withdrawal to USDC"}
                </RNText>
              </View>
              <RNText style={s.state}>
                {failed ? "Status unavailable" : (outcome?.label ?? "Checking…")}
              </RNText>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
};

/** A state Glider has not reported yet is still work in flight. */
const isActive = (state: string | undefined) =>
  state === undefined || ["accepted", "running", "retrying", "awaiting_user"].includes(state);

/** The shelves' shape while the catalog loads, so nothing jumps when it lands. */
const DiscoveryLoading = () => (
  <View style={s.section}>
    <View style={s.shelf}>
      {[0, 1].map((k) => (
        <Skeleton key={k} width={THEME_W} height={150} style={s.round} />
      ))}
    </View>
    <View style={[s.card, s.gap]}>
      {[0, 1, 2].map((k) => (
        <Skeleton key={k} width="100%" height={56} />
      ))}
    </View>
  </View>
);

const THEME_W = 200;
const PRO_W = 168;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.page },
  fill: { flex: 1, minWidth: 0 },
  nav: { paddingHorizontal: space.screen, paddingTop: space.sm, paddingBottom: space.sm },
  scroll: { paddingBottom: space.xxl, gap: space.lg },
  head: { paddingHorizontal: space.screen, gap: 4 },
  lede: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.muted },
  section: { gap: space.md },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.screen,
    paddingHorizontal: space.md,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  searchInput: { flex: 1, fontFamily: font.regular, fontSize: 14, color: color.ink, padding: 0 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  state: { fontFamily: font.medium, fontSize: 12.5, color: color.ink },
  meta: { fontFamily: font.regular, fontSize: 12.5, color: color.muted },

  card: {
    marginHorizontal: space.screen,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    padding: space.xs,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  cardTitle: { fontFamily: font.medium, fontSize: 15, letterSpacing: -0.3, color: color.ink },
  panel: { borderRadius: radius.md, backgroundColor: color.tile, padding: space.xs, gap: 2 },
  rowSkeleton: { marginVertical: 6 },
  gap: { gap: space.sm, padding: space.md },
  round: { borderRadius: radius.lg },

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
  end: { alignItems: "flex-end", gap: 3 },
  name: { fontFamily: font.medium, fontSize: 14.5, letterSpacing: -0.29, color: color.ink },
  sub: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: color.muted },
  value: { fontFamily: font.medium, fontSize: 14.5, color: color.ink },
  link: { fontFamily: font.medium, fontSize: 13, color: color.link },

  shelf: { flexDirection: "row", gap: 10, paddingHorizontal: space.screen },
  theme: {
    width: THEME_W,
    height: 150,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    padding: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: color.surface,
  },
  themeOn: { borderColor: color.ink },
  themeArt: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    opacity: 0.82,
  },
  themeTitle: { fontFamily: font.medium, fontSize: 15, color: color.ink },
  themeBody: {
    marginTop: 5,
    maxWidth: 130,
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 16,
    color: color.muted,
  },
  themeFoot: {
    position: "absolute",
    left: 14,
    bottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  themeCount: { fontFamily: font.medium, fontSize: 12, color: color.ink },

  pro: { width: PRO_W, borderRadius: radius.lg, backgroundColor: color.surface, overflow: "hidden" },
  proArt: { width: PRO_W, height: PRO_W / 1.25 },
  proFoot: { paddingHorizontal: 12, paddingTop: 9, paddingBottom: 12, gap: 8 },
  proLabel: { fontFamily: font.regular, fontSize: 11, color: color.muted },

  strategy: { padding: space.md, borderRadius: radius.md, gap: 10 },
  strategyTop: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  strategyFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },

  blank: { alignItems: "center", gap: space.sm, paddingVertical: space.lg, paddingHorizontal: space.lg },
  blankTitle: { fontFamily: font.medium, fontSize: 14, color: color.ink, textAlign: "center" },
  blankBody: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18,
    color: color.muted,
    textAlign: "center",
  },

  how: { padding: space.lg, gap: space.md },
  step: { flexDirection: "row", gap: space.md },
  stepNo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: color.tile,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNoText: { fontFamily: font.medium, fontSize: 12, color: color.ink },
  stepTitle: { fontFamily: font.medium, fontSize: 14, color: color.ink },
  stepBody: { marginTop: 2, fontFamily: font.regular, fontSize: 12.5, lineHeight: 17, color: color.muted },

  footer: { paddingHorizontal: space.screen, gap: space.sm },
  footnote: { fontFamily: font.regular, fontSize: 11.5, lineHeight: 16, color: color.faint },
});
