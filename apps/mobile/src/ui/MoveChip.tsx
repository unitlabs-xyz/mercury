import { StyleSheet, Text as RNText, View } from "react-native";
import Svg, { G, Path } from "react-native-svg";
import { color, font, radius } from "../theme";

/**
 * The day's move, as `MoveChip` in `apps/web/src/ui/ds.tsx`.
 *
 * Ported figure for figure: 20 high, 56 minimum wide, 6 radius, a 12px medium
 * label, and the design's own arrow — an 8×10 curved stem, not a chevron and
 * not the icon set's `arrowUp`. Two decimals always, as the web prints them.
 */
export const MoveChip = ({ value, soft = false }: { value: number | null; soft?: boolean }) => {
  if (value === null || Number.isNaN(value)) {
    return <RNText style={s.none}>—</RNText>;
  }
  // A move that rounds to 0.00% reads as flat, not as a red fall.
  const up = value > -0.005;
  const ink = up ? color.up : color.fall;
  return (
    <View style={[s.chip, up ? s.upChip : s.fallChip]}>
      <Svg viewBox="0 0 8 10" width={8} height={10} fill="none">
        <G stroke={ink} strokeLinecap="round" strokeLinejoin="round">
          {up ? (
            <>
              <Path d="M4.429 1.286V9" />
              <Path d="M7.857 4.429C7.857 4.429 5.332 1 4.429 1C3.525 1 1 4.429 1 4.429" />
            </>
          ) : (
            <>
              <Path d="M4.429 8.714L4.429 1" />
              <Path d="M1 5.571C1 5.571 3.525 9 4.428 9C5.332 9 7.857 5.571 7.857 5.571" />
            </>
          )}
        </G>
      </Svg>
      <RNText style={[s.label, { color: ink }, soft && s.soft]}>{Math.abs(value).toFixed(2)}%</RNText>
    </View>
  );
};

const s = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: 20,
    minWidth: 56,
    paddingHorizontal: 6,
    borderRadius: radius.sm - 2,
  },
  upChip: { backgroundColor: color.upChip },
  fallChip: { backgroundColor: color.fallChip },
  label: { fontFamily: font.medium, fontSize: 12, letterSpacing: -0.1 },
  soft: { opacity: 0.8 },
  none: { fontFamily: font.regular, fontSize: 14, color: color.muted },
});
