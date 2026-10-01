import type { ReactNode } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { color, radius, space } from "../theme";

/**
 * A white panel on the grey ground — the one shape the whole web app is built
 * from. Every rail, every section, every sheet body is this.
 */
export const Card = ({ children, style, ...rest }: ViewProps & { children: ReactNode }) => (
  <View style={[s.box, style]} {...rest}>
    {children}
  </View>
);

const s = StyleSheet.create({
  box: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: space.screen,
  },
});
