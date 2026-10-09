import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { color, radius, space } from "../theme";

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
 * The smart band: one dark card among the white ones, the part of home that
 * changes with the account. Whatever it holds fades in, so the band changing
 * what it says reads as it updating, not jumping.
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
    marginHorizontal: space.screen,
    borderRadius: radius.xl,
    backgroundColor: color.band,
    paddingVertical: 16,
    overflow: "hidden",
  },
  inner: { gap: space.md },
});
