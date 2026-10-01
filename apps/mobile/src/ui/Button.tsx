import { ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { color, radius, space } from "../theme";
import { Text } from "./Text";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "quiet";
  disabled?: boolean;
  busy?: boolean;
}

/**
 * Busy is not disabled.
 *
 * A button that greys out mid-request looks like it refused. It keeps its
 * colour and swaps the label for a spinner, which is what the web's order
 * button does — one loader, where it used to have ten labels.
 */
export const Button = ({ label, onPress, variant = "primary", disabled, busy }: ButtonProps) => {
  const primary = variant === "primary";
  const off = disabled === true;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: busy === true }}
      onPress={busy === true || off ? undefined : onPress}
      style={({ pressed }) => [
        s.base,
        primary ? s.primary : s.quiet,
        off && s.off,
        pressed && !off && s.pressed,
      ]}
    >
      {busy === true ? (
        <ActivityIndicator color={primary ? color.surface : color.ink} />
      ) : (
        <Text variant="headline" style={[s.label, primary ? s.onDark : s.onLight]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
};

const s = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  primary: { backgroundColor: color.ink },
  quiet: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.divider },
  off: { opacity: 0.35 },
  pressed: { opacity: 0.85 },
  label: { textAlign: "center" },
  onDark: { color: color.surface },
  onLight: { color: color.ink },
});
