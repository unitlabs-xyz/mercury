import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { color, radius, space } from "../theme";

/* The band's palette. It used to be a dark card; it is a white one now, so these
   are the page's own gain, fall and muted, kept under the old names. */
export const ON_BAND = {
  ink: color.ink,
  up: color.up,
  down: color.fall,
  warn: color.warn,
  muted: color.muted,
  faint: color.tile,
  edge: "transparent",
} as const;

/**
 * The smart band: the card on home that changes with the account — a loan to
 * look at, the first step, or how today went. Whatever it holds fades in, so the band changing
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
    backgroundColor: color.surface,
    paddingVertical: 16,
    overflow: "hidden",
  },
  inner: { gap: space.md },
});
