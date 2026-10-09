import { ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useRouter } from "expo-router";
import { usd } from "@mercury/view";
import { useInstrumentsByTicker } from "../api";
import { useWatchlist } from "../watchlist";
import { Icon, MoveChip, PressableScale, StockLogo } from "../ui";
import { color, font, radius, space } from "../theme";

/**
 * The stocks somebody saved, as a strip of small cards: the mark, the price and
 * today's move, sliding sideways. Ends with a way to save another, and stays
 * away entirely until there is something saved — an empty strip is furniture.
 */
export const Watching = () => {
  const router = useRouter();
  const saved = useWatchlist();
  const read = useInstrumentsByTicker(saved);
  const list = (read.data?.instruments ?? []).sort(
    (a, b) => saved.indexOf(a.ticker) - saved.indexOf(b.ticker),
  );
  if (saved.length === 0) return null;

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <RNText style={s.title}>Watching</RNText>
        <PressableScale
          activeScale={0.96}
          style={s.link}
          onPress={() => router.navigate({ pathname: "/invest", params: { shelf: "yours" } })}
        >
          <RNText style={s.linkLabel}>See all</RNText>
          <Icon name="chevronRight" size={12} color={color.link} />
        </PressableScale>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
        {list.map((i) => (
          <PressableScale
            key={i.ticker}
            style={s.tile}
            activeScale={0.97}
            onPress={() => router.push({ pathname: "/stock/[ticker]", params: { ticker: i.ticker } })}
            accessibilityRole="button"
            accessibilityLabel={`${i.name}, ${usd(i.pricePerShare)}`}
          >
            <View style={s.tileHead}>
              <StockLogo ticker={i.ticker} uri={i.logoUrl ?? undefined} size={28} />
              <RNText style={s.ticker}>{i.ticker}</RNText>
            </View>
            <RNText style={s.price}>{usd(i.pricePerShare)}</RNText>
            <MoveChip value={Number(i.changePct24h)} soft />
          </PressableScale>
        ))}
        <PressableScale
          style={[s.tile, s.add]}
          activeScale={0.97}
          onPress={() => router.navigate("/invest")}
          accessibilityRole="button"
          accessibilityLabel="Find a stock to watch"
        >
          <View style={s.addMark}>
            <Icon name="plus" size={16} color={color.ink} />
          </View>
          <RNText style={s.addText}>Add</RNText>
        </PressableScale>
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  wrap: { gap: space.sm },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.screen + 4,
  },
  title: { fontFamily: font.medium, fontSize: 16, letterSpacing: -0.32, color: color.ink },
  link: { flexDirection: "row", alignItems: "center", gap: 2 },
  linkLabel: { fontFamily: font.medium, fontSize: 13, color: color.link },
  strip: { gap: space.sm, paddingHorizontal: space.screen },
  tile: {
    width: 118,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    padding: 12,
    gap: 8,
    alignItems: "flex-start",
  },
  tileHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  ticker: { fontFamily: font.medium, fontSize: 13.5, color: color.ink },
  price: { fontFamily: font.medium, fontSize: 16, letterSpacing: -0.32, color: color.ink },
  add: { width: 80, alignItems: "center", justifyContent: "center" },
  addMark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: color.tile,
    alignItems: "center",
    justifyContent: "center",
  },
  addText: { fontFamily: font.medium, fontSize: 12.5, color: color.ink },
});
