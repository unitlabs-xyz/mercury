import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { color, radius, space } from "../theme";

/** The home cards' corner: the band bleeds under it by this much. */
const CARD_RADIUS = radius.card;

/* On the ink: the web's gain and fall, lifted so they hold their colour on black. */
export const ON_BAND = {
  up: "#5AB35C",
  down: "#E3776F",
  warn: "#E2B866",
  muted: "rgba(255,255,255,0.55)",
  faint: "rgba(255,255,255,0.08)",
  edge: "rgba(255,255,255,0.06)",
} as const;

/**
 * The dark band between the two home cards. It bleeds up and down under their
 * corners, so their rounded edges show ink behind them; whatever it holds fades
 * in, so the band changing what it says reads as the band updating, not jumping.
 */
export const Band = ({ id, children }: { id: string; children: ReactNode }) => (
  <View style={s.band}>
    <Animated.View key={id} entering={FadeIn.duration(260)} style={s.inner}>
      {children}
    </Animated.View>
  </View>
);

const s = StyleSheet.create({
  band: {
    backgroundColor: color.band,
    marginTop: -CARD_RADIUS,
    paddingTop: 16 + CARD_RADIUS,
    marginBottom: -CARD_RADIUS,
    paddingBottom: 16 + CARD_RADIUS,
  },
  inner: { gap: space.md },
});
