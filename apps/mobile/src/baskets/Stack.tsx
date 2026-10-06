import { StyleSheet, Text as RNText, View } from "react-native";
import { StockLogo } from "../ui";
import { color, font } from "../theme";
import type { Leg } from "./model";

/**
 * A basket's face, as the web draws it: the logos of its heaviest stocks
 * overlapping by a third, each ringed in the colour behind it so the edges
 * read, and "+3" for the rest.
 */
export const Stack = ({
  legs,
  size = 32,
  shown = 3,
  ring = color.tile,
}: {
  legs: readonly Leg[];
  size?: number;
  shown?: number;
  /** The colour behind the stack: the grey list panel, or white on a card. */
  ring?: string;
}) => {
  const top = [...legs].sort((a, b) => b.target - a.target).slice(0, shown);
  const rest = legs.length - top.length;
  const face = { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, borderColor: ring };
  return (
    <View style={s.row}>
      {top.map((l, k) => (
        <View
          key={l.ticker}
          style={[s.ring, face, { marginLeft: k === 0 ? 0 : -size / 3, zIndex: shown - k }]}
        >
          <StockLogo ticker={l.ticker} uri={l.logoUrl ?? undefined} size={size} />
        </View>
      ))}
      {rest > 0 && (
        <View style={[s.ring, s.rest, face, { marginLeft: -size / 3 }]}>
          <RNText style={s.restText}>+{rest}</RNText>
        </View>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  ring: { borderWidth: 2, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  rest: { backgroundColor: color.surface },
  restText: { fontFamily: font.medium, fontSize: 11, color: color.muted },
});
