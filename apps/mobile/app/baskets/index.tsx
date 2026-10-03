import { useState } from "react";
import { ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { usd } from "@mercury/view";
import { Stack } from "../../src/baskets/Stack";
import { useBaskets, useValued, type Valued } from "../../src/baskets/model";
import {
  Chip,
  IconButton,
  MoveChip,
  PressableScale,
  Skeleton,
  Sparkline,
  StatusChip,
  Text,
} from "../../src/ui";
import type { Span } from "../../src/api";
import { color, font, radius, space } from "../../src/theme";

/* The ranges a basket's list offers. Five years is the stock page's; a basket
   has no vault old enough for it to mean anything. */
const RANGES: readonly Span[] = ["1D", "1W", "1M", "1Y"];

/** The three things to know before the first one, as the web numbers them. */
const HOW: readonly [string, string][] = [
  ["One amount buys every stock", "Split by the basket's weights, in one order."],
  ["You hold one token", "It tracks everything inside. Send it, or sell it back whenever."],
  ["Held in a Symmetry vault", "Not by us. You can withdraw on Symmetry without Mercury."],
];

/**
 * Every basket, as the web's Baskets page: one white card holding the list on
 * a grey panel, each basket a 60-high row with the stack of its heaviest
 * stocks, its value and its move over the chosen range; then how baskets work.
 */
export default function Baskets() {
  const router = useRouter();
  const [range, setRange] = useState<Span>("1M");
  const baskets = useBaskets();
  const list = useValued(baskets.data, range);
  const loading = baskets.isPending || list.loading;

  return (
    <View style={s.root}>
      <SafeAreaView edges={["top"]} style={s.fill}>
        <View style={s.nav}>
          <IconButton icon="chevronRight" rotate="180deg" label="Back" onPress={() => router.back()} />
        </View>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.head}>
            <Text variant="title">Baskets</Text>
            <RNText style={s.meta}>{loading ? "" : `${baskets.data?.length ?? 0} on Symmetry`}</RNText>
          </View>

          <View style={s.chips}>
            {RANGES.map((r) => (
              <Chip key={r} label={r} selected={range === r} onPress={() => setRange(r)} />
            ))}
          </View>

          <View style={s.card}>
            <View style={s.panel}>
              {loading ? (
                <RowsSkeleton />
              ) : list.valued.length === 0 ? (
                <View style={s.blank}>
                  <RNText style={s.blankTitle}>No baskets yet</RNText>
                  <RNText style={s.blankBody}>
                    Baskets appear here once their vault is live on Symmetry.
                  </RNText>
                </View>
              ) : (
                list.valued.map((v) => (
                  <Line key={v.basket.slug} v={v} onPress={() => router.push(`/baskets/${v.basket.slug}`)} />
                ))
              )}
            </View>
          </View>

          <View style={[s.card, s.how]}>
            <RNText style={s.howTitle}>How baskets work</RNText>
            {HOW.map(([title, body], k) => (
              <View key={title} style={s.step}>
                <View style={s.stepNo}>
                  <RNText style={s.stepNoText}>{k + 1}</RNText>
                </View>
                <View style={s.fill}>
                  <RNText style={s.stepTitle}>{title}</RNText>
                  <RNText style={s.stepBody}>{body}</RNText>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const Line = ({ v, onPress }: { v: Valued; onPress: () => void }) => {
  const top = [...v.legs].sort((a, b) => b.target - a.target);
  return (
    <PressableScale onPress={onPress} activeScale={0.985} style={s.row} accessibilityRole="button">
      <Stack legs={v.legs} />
      <View style={s.mid}>
        <View style={s.titleLine}>
          <RNText style={s.name} numberOfLines={1}>
            {v.basket.name}
          </RNText>
          {v.basket.position && <StatusChip>Owned</StatusChip>}
        </View>
        <RNText style={s.sub} numberOfLines={1}>
          {`${v.legs.length} stocks · ${top
            .slice(0, 3)
            .map((l) => l.ticker)
            .join(", ")}${v.legs.length > 3 ? "…" : ""}`}
        </RNText>
      </View>
      <Sparkline values={v.series} width={48} height={22} />
      <View style={s.end}>
        <RNText style={s.nav$}>{v.nav === null ? "—" : usd(v.nav)}</RNText>
        <MoveChip value={v.change} />
      </View>
    </PressableScale>
  );
};

/** Rows still loading, at the rows' own geometry, so nothing moves when they land. */
const RowsSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <View>
    {Array.from({ length: rows }, (_, i) => (
      <View key={i} style={s.row}>
        <Skeleton width={72} height={36} style={s.pill} />
        <View style={[s.mid, s.gap]}>
          <Skeleton width="70%" height={13} />
          <Skeleton width="45%" height={11} />
        </View>
        <View style={[s.end, s.gap]}>
          <Skeleton width={56} height={13} />
          <Skeleton width={44} height={18} />
        </View>
      </View>
    ))}
  </View>
);

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.page },
  fill: { flex: 1 },
  nav: { paddingHorizontal: space.screen, paddingTop: space.sm, paddingBottom: space.sm },
  scroll: { paddingBottom: space.xxl, gap: space.md },
  head: { flexDirection: "row", alignItems: "baseline", gap: 10, paddingHorizontal: space.screen },
  meta: { fontFamily: font.regular, fontSize: 14, color: color.muted },
  chips: { flexDirection: "row", gap: 6, paddingHorizontal: space.screen },
  card: {
    marginHorizontal: space.screen,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    padding: space.xs,
  },
  panel: { borderRadius: radius.md, backgroundColor: color.tile, padding: space.xs, gap: space.xs },
  row: { height: 64, flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md },
  mid: { flex: 1, minWidth: 0 },
  gap: { gap: 6 },
  titleLine: { flexDirection: "row", alignItems: "center", gap: 5 },
  name: { flexShrink: 1, fontFamily: font.medium, fontSize: 14, lineHeight: 18, color: color.ink },
  sub: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: color.muted, marginTop: 2 },
  end: { alignItems: "flex-end", gap: 4 },
  nav$: { fontFamily: font.medium, fontSize: 14, color: color.ink },
  pill: { borderRadius: 18 },
  blank: { alignItems: "center", paddingVertical: 40, paddingHorizontal: space.lg },
  blankTitle: { fontFamily: font.medium, fontSize: 14, color: color.ink },
  blankBody: {
    fontFamily: font.regular,
    fontSize: 12,
    color: color.muted,
    marginTop: space.sm,
    textAlign: "center",
  },
  how: { padding: space.screen, gap: space.lg - 8 },
  howTitle: { fontFamily: font.medium, fontSize: 14, color: color.ink, marginBottom: 2 },
  step: { flexDirection: "row", gap: 13 },
  stepNo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: color.tile,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNoText: { fontFamily: font.medium, fontSize: 12, color: color.ink },
  stepTitle: { fontFamily: font.medium, fontSize: 14, lineHeight: 18, color: color.ink, marginTop: 3 },
  stepBody: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.muted, marginTop: 4 },
});
