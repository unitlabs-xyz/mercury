import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from "react-native";
import { color, type } from "../theme";

type Variant = keyof typeof type;

export interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: keyof typeof TONE;
}

const TONE = {
  ink: color.ink,
  muted: color.muted,
  faint: color.faint,
  up: color.up,
  down: color.down,
  brand: color.brand,
  warn: color.warn,
  onBand: color.onBand,
} as const;

/**
 * Every piece of text goes through here.
 *
 * The web gets this for free: a Tailwind class names a token, and a token that
 * does not exist is a build error. React Native has no such floor, so a screen
 * that writes `fontSize: 15` directly drifts from the scale one number at a
 * time. Naming the variant is what keeps the two apps looking like one product.
 */
export const Text = ({ variant = "body", tone = "ink", style, ...rest }: TextProps) => (
  <RNText style={[s[variant], { color: TONE[tone] }, style]} {...rest} />
);

const s = StyleSheet.create(
  Object.fromEntries(Object.entries(type).map(([k, v]) => [k, v])) as Record<Variant, object>,
);
