import { useState } from "react";
import { ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { usd } from "@mercury/view";
import { Stack } from "../../src/baskets/Stack";
import { feeLabel, useBaskets, useValued } from "../../src/baskets/model";
import { useMoney, type Span } from "../../src/api";
import { Button, Chip, DotChart, IconButton, MoveChip, Skeleton, StockLogo } from "../../src/ui";
import { color, font, radius, space } from "../../src/theme";

const RANGES: readonly Span[] = ["1D", "1W", "1M", "1Y"];
const AMOUNTS = [25, 100, 250, 500] as const;

/** The web's words for each range, so the line under the figure reads. */
const SINCE: Partial<Record<Span, string>> = {
  "1D": "today",
  "1W": "past week",
  "1M": "past month",
  "1Y": "past year",
};

/**
 * One basket, as the web's basket page: its value and chart, what is inside
 * at what weight and how far each has drifted, the plain facts of the vault,
 * and what an amount would buy.
 *
 * Ordering is not open yet on either client — the Symmetry venue is still a
 * stub on the server — so the button says so, as the web's does, rather than
 * taking an order it cannot place.
 */
export default function BasketPage() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [range, setRange] = useState<Span>("1M");
  const [amount, setAmount] = useState<number>(100);
  const baskets = useBaskets();
  const basket = baskets.data?.filter((b) => b.slug === slug);
  const { valued, loading } = useValued(basket, range);
  const v = valued[0];
  const cash = useMoney().data?.balanceUsd;

  return (
    <View style={s.root}>
      <SafeAreaView edges={["top"]} style={s.fill}>
        <View style={s.nav}>
          <IconButton icon="chevronRight" rotate="180deg" label="Back" onPress={() => router.back()} />
          {v !== undefined && (
            <RNText style={s.navTitle} numberOfLines={1}>
              {v.basket.name}
            </RNText>
          )}
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Value */}
          <View style={[s.card, s.pad]}>
            {v === undefined ? (
              <View style={s.gap}>
                <Skeleton width={120} height={40} style={s.round} />
                <Skeleton width="50%" height={18} />
                <Skeleton width={140} height={36} />
              </View>
            ) : (
              <>
                <View style={s.idRow}>
                  <Stack legs={v.legs} size={36} ring={color.surface} />
                  <View style={s.fill}>
                    <RNText style={s.name}>{v.basket.name}</RNText>
                    <RNText style={s.sub}>{`${v.legs.length} stocks · Symmetry vault`}</RNText>
                  </View>
                </View>
                {loading || v.nav === null ? (
                  <Skeleton width={150} height={36} style={s.figureSkeleton} />
                ) : (
                  <RNText style={s.figure}>{usd(v.nav)}</RNText>
                )}
                <View style={s.moveRow}>
                  <MoveChip value={v.change} />
                  <RNText style={s.since}>{SINCE[range]}</RNText>
                </View>
              </>
            )}
            <View style={s.chips}>
              {RANGES.map((r) => (
                <Chip key={r} label={r} selected={range === r} onPress={() => setRange(r)} />
              ))}
            </View>
            {v?.series ? <DotChart values={v.series} height={170} /> : <Skeleton width="100%" height={170} />}
          </View>

          {/* What is inside */}
          <View style={s.card}>
            <RNText style={[s.label, s.cardHead]}>What is inside</RNText>
            <View style={s.panel}>
              {(v?.legs ?? []).length === 0
                ? [0, 1].map((i) => (
                    <View key={i} style={s.leg}>
                      <Skeleton width={36} height={36} style={s.round} />
                      <View style={[s.fill, s.gap]}>
                        <Skeleton width="50%" height={13} />
                        <Skeleton width="80%" height={6} />
                      </View>
                    </View>
                  ))
                : [...v!.legs]
                    .sort((a, b) => b.target - a.target)
                    .map((l) => (
                      <View key={l.ticker} style={s.leg}>
                        <StockLogo ticker={l.ticker} uri={l.logoUrl ?? undefined} size={36} />
                        <View style={s.fill}>
                          <View style={s.legTop}>
                            <RNText style={s.legName} numberOfLines={1}>
                              {l.name ?? l.ticker}
                            </RNText>
                            <RNText
                              style={s.legPct}
                            >{`${Math.round((l.current ?? l.target) * 100)}%`}</RNText>
                          </View>
                          {/* The bar is where it sits now; the tick is the weight it was set to. */}
                          <View style={s.track}>
                            <View style={[s.bar, { width: `${(l.current ?? l.target) * 100}%` }]} />
                            <View style={[s.tick, { left: `${l.target * 100}%` }]} />
                          </View>
                          <RNText
                            style={s.legSub}
                          >{`${l.ticker} · set to ${Math.round(l.target * 100)}%`}</RNText>
                        </View>
                      </View>
                    ))}
            </View>
          </View>

          {/* Facts */}
          {v !== undefined && (
            <View style={s.card}>
              <RNText style={[s.label, s.cardHead]}>About this basket</RNText>
              <RNText style={[s.body, s.desc]}>{v.basket.description}</RNText>
              <View style={s.panel}>
                {[
                  ["Fee in", feeLabel(v.basket.depositFeeBps ?? v.basket.feeBps)],
                  ["Fee out", feeLabel(v.basket.withdrawFeeBps)],
                  ["Minimum", usd(v.basket.minimumUsd, 0)],
                  ["Most per order", v.basket.capUsd === null ? "No cap" : usd(v.basket.capUsd, 0)],
                  ["Held by", "Symmetry vault"],
                  ["Token", v.basket.vault?.symbol ?? "Not launched yet"],
                ].map(([k, val]) => (
                  <View key={k} style={s.fact}>
                    <RNText style={s.factKey}>{k}</RNText>
                    <RNText style={s.factVal}>{val}</RNText>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Invest */}
          {v !== undefined && (
            <View style={[s.card, s.pad]}>
              <View style={s.investHead}>
                <RNText style={s.label}>{`Invest in ${v.basket.name}`}</RNText>
                {cash !== undefined && <RNText style={s.since}>{`${usd(cash)} cash`}</RNText>}
              </View>
              <View style={s.chips}>
                {AMOUNTS.map((a) => (
                  <Chip key={a} label={`$${a}`} selected={amount === a} onPress={() => setAmount(a)} />
                ))}
              </View>
              <View style={s.panel}>
                {[...v.legs]
                  .sort((a, b) => b.target - a.target)
                  .map((l) => (
                    <View key={l.ticker} style={s.fact}>
                      <RNText style={s.factKey}>{l.ticker}</RNText>
                      <RNText style={s.factVal}>{usd(amount * l.target)}</RNText>
                    </View>
                  ))}
                <View style={s.fact}>
                  <RNText style={s.factKey}>You would hold</RNText>
                  <RNText style={s.factVal}>
                    {v.nav ? `≈ ${(amount / v.nav).toFixed(2)} ${v.basket.vault?.symbol ?? "tokens"}` : "—"}
                  </RNText>
                </View>
              </View>
              <View style={s.cta}>
                <Button label="Basket orders open soon" disabled />
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.page },
  fill: { flex: 1, minWidth: 0 },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.screen,
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  navTitle: { flex: 1, fontFamily: font.medium, fontSize: 16, color: color.ink },
  scroll: { paddingBottom: space.xxl, gap: space.md },
  card: {
    marginHorizontal: space.screen,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    padding: space.xs,
  },
  pad: { padding: space.screen, gap: space.md },
  cardHead: { paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.md },
  gap: { gap: 8 },
  round: { borderRadius: 18 },
  idRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  name: { fontFamily: font.medium, fontSize: 20, lineHeight: 24, color: color.ink },
  sub: { fontFamily: font.regular, fontSize: 12, color: color.muted, marginTop: 2 },
  figure: { fontFamily: font.medium, fontSize: 36, lineHeight: 42, letterSpacing: -1.1, color: color.ink },
  figureSkeleton: { marginTop: 3 },
  moveRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  since: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  chips: { flexDirection: "row", gap: 6 },
  label: { fontFamily: font.medium, fontSize: 14, color: color.ink },
  body: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.muted },
  desc: { paddingHorizontal: space.md, paddingBottom: space.md, marginTop: -4 },
  panel: { borderRadius: radius.md, backgroundColor: color.tile, padding: space.md, gap: space.md },
  leg: { flexDirection: "row", alignItems: "center", gap: space.md },
  legTop: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
  legName: { flexShrink: 1, fontFamily: font.medium, fontSize: 14, color: color.ink },
  legPct: { fontFamily: font.medium, fontSize: 14, color: color.ink },
  track: { height: 6, borderRadius: 3, backgroundColor: color.surface, marginTop: 7, overflow: "visible" },
  bar: { height: 6, borderRadius: 3, backgroundColor: color.brand },
  tick: { position: "absolute", top: -3, width: 2, height: 12, borderRadius: 1, backgroundColor: color.ink },
  legSub: { fontFamily: font.regular, fontSize: 12, color: color.muted, marginTop: 6 },
  fact: { flexDirection: "row", justifyContent: "space-between", gap: space.md },
  factKey: { fontFamily: font.regular, fontSize: 14, color: color.muted },
  factVal: { fontFamily: font.medium, fontSize: 14, color: color.ink, textAlign: "right", flexShrink: 1 },
  investHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  cta: { marginTop: space.xs },
});
