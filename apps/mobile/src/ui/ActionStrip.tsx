import { StyleSheet, View } from "react-native";
import { color, font, radius, space } from "../theme";
import { Icon, type IconName } from "./Icon";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

/**
 * Tones for the circular buttons. Each is a pale ground with a deep glyph from
 * the same hue, so they read as a set rather than three unrelated colours. The
 * brand tint is the web's `--color-ds-act-buy-bg`; the warm one is its
 * `--color-ds-up-card-bg`.
 */
const TONES = {
  brand: { bg: color.brandTint, fg: color.brand },
  warm: { bg: "#F4F3EB", fg: "#393830" },
} as const;

export interface Action {
  key: string;
  /** Always set. When `tone` hides it, it still names the button to a reader. */
  label: string;
  icon: IconName;
  onPress: () => void;
  /** Draws a circular, icon-only button in this tone instead of a labelled pill. */
  tone?: keyof typeof TONES;
}

/**
 * The dark band between the two home cards.
 *
 * The band owns its own fill and bleeds up and down by the cards' corner
 * radius, so their rounded corners reveal dark behind them. Making the PAGE
 * dark instead looks identical at rest, and then bouncing at either end of the
 * scroll flashes black where a white card should be.
 */
export const ActionStrip = ({ actions }: { actions: readonly Action[] }) => (
  <View style={s.band}>
    {/* A plain row, not a horizontal scroll view: the pills have to end up the
        same width whether or not their labels do, and `flex: 1` only shares out
        space inside a container that has a width. */}
    <View style={s.row}>
      {actions.map((a) =>
        a.tone === undefined ? (
          <PressableScale key={a.key} onPress={a.onPress} style={s.pill}>
            <Icon name={a.icon} size={17} color={color.ink} />
            <Text style={s.label}>{a.label}</Text>
          </PressableScale>
        ) : (
          <PressableScale
            key={a.key}
            onPress={a.onPress}
            accessibilityLabel={a.label}
            style={[s.circle, { backgroundColor: TONES[a.tone].bg }]}
          >
            <Icon name={a.icon} size={20} color={TONES[a.tone].fg} />
          </PressableScale>
        ),
      )}
    </View>
  </View>
);

const SIZE = 50;
/** Must match the home cards' radius, so the bleed covers exactly their notches. */
export const CARD_RADIUS = 28;

const s = StyleSheet.create({
  band: {
    backgroundColor: color.band,
    marginTop: -CARD_RADIUS,
    paddingTop: 18 + CARD_RADIUS,
    marginBottom: -CARD_RADIUS,
    paddingBottom: 18 + CARD_RADIUS,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: space.screen },
  pill: {
    flex: 1,
    flexBasis: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: SIZE,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
  },
  label: { fontFamily: font.medium, fontSize: 15, letterSpacing: -0.3, color: color.ink },
  circle: {
    flexGrow: 0,
    flexShrink: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
