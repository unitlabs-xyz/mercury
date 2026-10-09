import { useState } from "react";
import { StyleSheet, Text as RNText, TextInput, View, type TextInputProps } from "react-native";
import { color, font, radius, space } from "../theme";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export interface FieldProps extends TextInputProps {
  label: string;
  /** A mark at the start of the well, as the web's sign-in puts a mail icon there. */
  icon?: IconName;
  /** Said under the field, in the down tone. */
  problem?: string | null;
}

/**
 * One text input, as the web's forms and this app's amount wells draw it: a
 * grey panel holding its label, and a white well inside it with the value.
 * Focus gives the well a faint edge; a problem turns it red, and so does the
 * icon, so the field says what is wrong before the line under it does.
 *
 * The label stays put above the value rather than living in it as a
 * placeholder, which would be gone the moment somebody types — on a form you
 * return to after a code email, the moment you need it.
 */
export const Field = ({ label, icon, problem, style, ...rest }: FieldProps) => {
  const [focused, setFocused] = useState(false);
  const bad = problem !== undefined && problem !== null && problem !== "";
  return (
    <View style={s.wrap}>
      <View style={s.panel}>
        <RNText style={s.label}>{label}</RNText>
        <View style={[s.well, focused && s.focused, bad && s.bad]}>
          {icon !== undefined && <Icon name={icon} size={16} color={bad ? color.down : color.muted} />}
          <TextInput
            {...rest}
            onFocus={(e) => {
              setFocused(true);
              rest.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              rest.onBlur?.(e);
            }}
            placeholderTextColor="rgba(101,101,101,0.7)"
            selectionColor={color.brand}
            accessibilityLabel={rest.accessibilityLabel ?? label}
            style={[s.input, style]}
          />
        </View>
      </View>
      {bad && (
        <Text variant="small" tone="down" style={s.problem}>
          {problem}
        </Text>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  wrap: { gap: 7 },
  panel: { borderRadius: radius.md, backgroundColor: color.tile, padding: space.xs },
  label: {
    fontFamily: font.regular,
    fontSize: 14,
    color: color.muted,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: 10,
  },
  well: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: "transparent",
  },
  focused: { borderColor: "rgba(0,0,0,0.10)" },
  bad: { borderColor: color.down },
  input: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 16,
    color: color.ink,
    /* Android draws its own underline and its own vertical padding. */
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  problem: { paddingHorizontal: space.xs },
});
