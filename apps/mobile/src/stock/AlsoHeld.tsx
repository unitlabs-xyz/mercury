import { StyleSheet, Text as RNText, View } from "react-native";
import { useRouter } from "expo-router";
import { alsoHoldLine, heldElsewhere, sharesBrief, usd, walletName } from "@mercury/view";
import { useAccountWallets, useLinkedPortfolios } from "../api";
import { usePrefs } from "../prefs";
import { Icon, PressableScale } from "../ui";
import { color, font, radius, space } from "../theme";

/**
 * "You also hold 2.1 in Phantom main", under the Mercury wallet's position:
 * what the linked wallets hold of this stock, each a row that opens that
 * wallet. Read only; buying and selling here act for the Mercury wallet.
 *
 * With nothing linked it asks for nothing and shows nothing. With nothing of
 * this stock in any linked wallet, it shows nothing either.
 */
export const AlsoHeld = ({ ticker, mercuryHolds }: { ticker: string; mercuryHolds: boolean }) => {
  const router = useRouter();
  const { hideBalances } = usePrefs();
  const linked = (useAccountWallets().data?.wallets ?? []).filter((w) => !w.isPrimary);
  const portfolios = useLinkedPortfolios(linked.map((w) => w.id));
  const held = heldElsewhere(
    ticker,
    linked.map((w, i) => ({ id: w.id, name: walletName(w), holdings: portfolios[i]?.data?.holdings })),
  );
  const line = alsoHoldLine(held, mercuryHolds);
  if (line === null) return null;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <RNText style={s.title}>{line}</RNText>
      </View>
      <View style={s.panel}>
        {held.map((h) => (
          <PressableScale
            key={h.walletId}
            style={s.row}
            activeScale={0.985}
            onPress={() => router.push({ pathname: "/wallet/[id]", params: { id: h.walletId } })}
            accessibilityRole="button"
            accessibilityLabel={`${h.name}: ${sharesBrief(h.shares)} shares${hideBalances ? "" : `, ${usd(h.valueUsd)}`}`}
          >
            <View style={s.fill}>
              <RNText style={s.rowTitle} numberOfLines={1}>
                {h.name}
              </RNText>
              <RNText style={s.rowSub}>{`${sharesBrief(h.shares)} shares · linked wallet`}</RNText>
            </View>
            <RNText style={s.value}>{hideBalances ? "••••" : usd(h.valueUsd)}</RNText>
            <Icon name="chevronRight" size={12} color={color.chevron} />
          </PressableScale>
        ))}
      </View>
      <RNText style={s.foot}>
        Shown here, managed on web. Buying and selling here use your Mercury wallet.
      </RNText>
    </View>
  );
};

const s = StyleSheet.create({
  card: { borderRadius: radius.lg, backgroundColor: color.surface, padding: space.xs },
  head: { paddingHorizontal: space.md, paddingVertical: space.md },
  title: { fontFamily: font.medium, fontSize: 15, color: color.ink },
  panel: { borderRadius: radius.md, backgroundColor: color.tile, padding: space.xs, gap: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  fill: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: font.medium, fontSize: 14, color: color.ink },
  rowSub: { fontFamily: font.regular, fontSize: 12, color: color.muted, marginTop: 2 },
  value: { fontFamily: font.medium, fontSize: 15, color: color.ink },
  foot: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 17,
    color: color.muted,
    padding: space.md,
    paddingBottom: space.sm,
  },
});
