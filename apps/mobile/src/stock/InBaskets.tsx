import { StyleSheet, Text as RNText, View } from "react-native";
import { useRouter } from "expo-router";
import { byWeight, displayBasketName, usd, weightLabel } from "@mercury/view";
import { useBaskets } from "../baskets/api";
import { AssetStack, useHoldingInstruments } from "../baskets/ui";
import { Icon, PressableScale } from "../ui";
import { color, font, radius, space } from "../theme";

/**
 * The baskets that hold this stock, heaviest weighting first: the web stock
 * page's "In baskets" rail. When some of what you own of it sits inside your
 * baskets, that value leads the card, so the stock's page answers for all of
 * your exposure and not just the wallet's. Hidden when no basket holds it.
 */
export const InBaskets = ({ ticker, basketValue }: { ticker: string; basketValue: number }) => {
  const router = useRouter();
  const templates = useBaskets();
  const holding = (templates.data ?? [])
    .flatMap((t) => {
      const mine = t.allocations.find((a) => a.ticker.toUpperCase() === ticker.toUpperCase());
      return mine ? [{ template: t, weightBps: mine.weightBps }] : [];
    })
    .sort((a, b) => b.weightBps - a.weightBps)
    .slice(0, 4);
  const instruments = useHoldingInstruments(
    holding.map((h) => h.template),
    2,
  );
  if (holding.length === 0 && basketValue <= 0) return null;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <RNText style={s.title}>In baskets</RNText>
        <PressableScale activeScale={0.96} onPress={() => router.push("/baskets")}>
          <RNText style={s.link}>All baskets</RNText>
        </PressableScale>
      </View>
      {basketValue > 0 && (
        <View style={s.owned}>
          <RNText style={s.ownedLabel}>Yours through baskets</RNText>
          <RNText style={s.ownedValue}>{usd(basketValue)}</RNText>
        </View>
      )}
      {holding.length > 0 && (
        <View style={s.panel}>
          {holding.map(({ template, weightBps }) => (
            <PressableScale
              key={template.slug}
              style={s.row}
              activeScale={0.985}
              onPress={() => router.push({ pathname: "/baskets/[slug]", params: { slug: template.slug } })}
            >
              <AssetStack template={template} instruments={instruments} limit={2} size={24} />
              <View style={s.mid}>
                <RNText style={s.name} numberOfLines={1}>
                  {displayBasketName(template.name)}
                </RNText>
                <RNText style={s.sub}>
                  {template.allocations.length} assets · top {byWeight(template.allocations)[0]?.ticker}
                </RNText>
              </View>
              <RNText style={s.weight}>{weightLabel(weightBps)}</RNText>
              <Icon name="chevronRight" size={13} color={color.muted} />
            </PressableScale>
          ))}
        </View>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.screen, gap: space.md },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: font.medium, fontSize: 15, letterSpacing: -0.3, color: color.ink },
  link: { fontFamily: font.medium, fontSize: 13, color: color.link },
  owned: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: radius.md,
    backgroundColor: color.tile,
    padding: space.md,
  },
  ownedLabel: { fontFamily: font.regular, fontSize: 13.5, color: color.muted },
  ownedValue: { fontFamily: font.medium, fontSize: 16, color: color.ink },
  panel: { borderRadius: radius.md, backgroundColor: color.tile, padding: space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.sm, minHeight: 52 },
  mid: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: font.medium, fontSize: 14, color: color.ink },
  sub: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  weight: { fontFamily: font.medium, fontSize: 14, color: color.ink },
});
