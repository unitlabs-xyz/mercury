import { ActivityIndicator, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { button, font, radius, space } from "../theme";
import { Icon, type IconName } from "./Icon";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary";
  /** `lg` is a screen's one action, `md` a button among others. */
  size?: "lg" | "md";
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
}

/**
 * The web's `Button`, layered the way `tokens.css` layers it: a 1px edge, a
 * gradient for the fall, and an inset ring for the inner line. Flat black was
 * the nearest thing that was easy, and it read as a different product beside
 * the browser's.
 *
 * Busy is not disabled. A button that greys out mid-request looks like it
 * refused, so it keeps its colour and swaps the label for a spinner.
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
  const look = button[variant];
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: working }}
      disabled={off || working}
      onPress={onPress}
      activeScale={0.975}
      style={[s.base, size === "md" ? s.md : s.lg, { borderColor: look.edge }, off && s.off]}
    >
      <Surface variant={variant} />
      {working ? (
        <ActivityIndicator color={look.ink} />
      ) : (
        <View style={s.row}>
          {icon !== undefined && <Icon name={icon} size={18} color={look.ink} strokeWidth={1.5} />}
          <Text style={[s.label, { color: look.ink }]}>{label}</Text>
        </View>
      )}
    </PressableScale>
  );
};

/**
 * The fall and the inner line, laid under a control's content. Anything shaped
 * like a button draws this rather than a flat fill, so every press target in
 * the app has the same face as the web's.
 */
export const Surface = ({ variant = "secondary" }: { variant?: keyof typeof button }) => {
  const look = button[variant];
  return (
    <>
      <LinearGradient colors={[look.from, look.to]} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[s.ring, { borderColor: look.ring }]} />
    </>
  );
};

export interface IconButtonProps {
  icon: IconName;
  /** Read aloud in place of a label, which an icon button does not have. */
  label: string;
  onPress?: () => void;
  variant?: keyof typeof button;
  size?: number;
  /** Turns the glyph, for an arrow that points somewhere the set has no icon for. */
  rotate?: string;
}

/** A round, icon-only button with the same face as `Button`: back, close, hide. */
export const IconButton = ({
  icon,
  label,
  onPress,
  variant = "secondary",
  size = 40,
  rotate,
}: IconButtonProps) => {
  const look = button[variant];
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      activeScale={0.92}
      style={[s.round, { width: size, height: size, borderColor: look.edge }]}
    >
      <Surface variant={variant} />
      <Icon
        name={icon}
        size={Math.round(size * 0.45)}
        color={look.ink}
        strokeWidth={1.6}
        style={rotate === undefined ? undefined : { transform: [{ rotate }] }}
      />
    </PressableScale>
  );
};

const s = StyleSheet.create({
  round: {
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  base: {
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  /* 40 is the web's on a phone-width screen (`max-sm:h-10`); 48 is its `lg`. */
  lg: { height: 48 },
  md: { height: 40 },
  ring: { ...StyleSheet.absoluteFill, borderRadius: radius.pill, borderWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  off: { opacity: 0.5 },
  label: { fontFamily: font.medium, fontSize: 14, lineHeight: 18, letterSpacing: -0.28 },
});
