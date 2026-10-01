import { ActivityIndicator, StyleSheet, View } from "react-native";
import { color, font, radius, space } from "../theme";
import { Icon, type IconName } from "./Icon";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "quiet" | "onBand";
  size?: "lg" | "md";
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
}

const INK = {
  primary: color.surface,
  quiet: color.ink,
  onBand: color.ink,
} as const;

/**
 * Busy is not disabled.
 *
 * A button that greys out mid-request looks like it refused. It keeps its
 * colour and swaps the label for a spinner, which is what the web's order
 * button does — one loader, where it used to have ten labels.
 */
export const Button = ({
  label,
  onPress,
  variant = "primary",
  size = "lg",
  icon,
  disabled,
  busy,
}: ButtonProps) => {
  const off = disabled === true;
  const working = busy === true;
  const ink = INK[variant];
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: working }}
      disabled={off || working}
      onPress={onPress}
      activeScale={0.975}
      style={[s.base, size === "md" ? s.md : s.lg, s[variant], off ? s.off : undefined]}
    >
      {working ? (
        <ActivityIndicator color={ink} />
      ) : (
        <View style={s.row}>
          {icon !== undefined && <Icon name={icon} size={17} color={ink} />}
          <Text style={[s.label, { color: ink }]}>{label}</Text>
        </View>
      )}
    </PressableScale>
  );
};

const s = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  lg: { height: 54 },
  md: { height: 44 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  primary: { backgroundColor: color.ink },
  quiet: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.divider },
  onBand: { backgroundColor: color.surface },
  off: { opacity: 0.3 },
  /* 15/Medium with the tracking eased: a pill's label is a word, not a sentence. */
  label: { fontFamily: font.medium, fontSize: 15, letterSpacing: -0.3 },
});
