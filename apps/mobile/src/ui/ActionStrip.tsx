import { StyleSheet, View } from "react-native";
import { button, color, font, radius, space } from "../theme";
import { Surface } from "./Button";
import { Icon, type IconName } from "./Icon";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

/**
 * The glyph colour of each circular button. The face is the web's secondary
 * button for all of them, so the strip reads as one row of the same control;
 * the tone is carried by the glyph alone, as the web's dashboard buttons do.
 */
const TONES = {
  brand: color.brand,
  warm: color.cardInk,
} as const;

export interface Action {
  key: string;
  /** Always set. When `tone` hides it, it still names the button to a reader. */
  label: string;
  icon: IconName;
  onPress: () => void;
  /** Draws a circular, icon-only button in this tone instead of a labelled pill. */
  tone?: keyof typeof TONES;
  /** Turns the glyph: Send is the web's up arrow at 45 degrees. */
  rotate?: string;
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
          <PressableScale key={a.key} onPress={a.onPress} style={s.pill} accessibilityRole="button">
            <Surface />
            <Icon name={a.icon} size={18} color={color.ink} strokeWidth={1.6} />
            <Text style={s.label}>{a.label}</Text>
          </PressableScale>
        ) : (
          <PressableScale
            key={a.key}
            onPress={a.onPress}
            accessibilityLabel={a.label}
            accessibilityRole="button"
            style={s.circle}
          >
            <Surface />
            <Icon
              name={a.icon}
              size={19}
              color={TONES[a.tone]}
              strokeWidth={1.8}
              style={a.rotate === undefined ? undefined : { transform: [{ rotate: a.rotate }] }}
            />
          </PressableScale>
        ),
      )}
    </View>
  </View>
);

/* 48, the web's large button. */
const SIZE = 48;
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
    borderWidth: 1,
    borderColor: button.secondary.edge,
    overflow: "hidden",
  },
  label: { fontFamily: font.medium, fontSize: 14, letterSpacing: -0.28, color: color.ink },
  circle: {
    flexGrow: 0,
    flexShrink: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1,
    borderColor: button.secondary.edge,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});
