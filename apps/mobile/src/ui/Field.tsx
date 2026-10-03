import { useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { color, font, radius, space } from "../theme";
import { Text } from "./Text";

export interface FieldProps extends TextInputProps {
  label: string;
  /** Said under the field, in the down tone. */
  problem?: string | null;
}

/**
 * One text input, in the shape the web's forms use: a label that stays put, a
 * white ground, and a border that answers focus.
 *
 * The label sits above the value rather than inside it as a placeholder. A
 * placeholder-only field loses its own label the moment somebody types, which
 * on a form you return to after a code email is the moment you need it.
 */
export const Field = ({ label, problem, style, ...rest }: FieldProps) => {
  const [focused, setFocused] = useState(false);
  const bad = problem !== undefined && problem !== null && problem !== "";

  return (
    <View style={s.wrap}>
      <View style={[s.box, focused && s.focused, bad && s.bad]}>
        <Text variant="tiny" tone="muted">
          {label}
        </Text>
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
          placeholderTextColor={color.faint}
          selectionColor={color.brand}
          style={[s.input, style]}
        />
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
  box: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.divider,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 6,
    gap: 1,
  },
  focused: { borderColor: color.brand },
  bad: { borderColor: color.down },
  input: {
    fontFamily: font.medium,
    fontSize: 17,
    letterSpacing: -0.34,
    color: color.ink,
    paddingVertical: 6,
    /* Android draws its own underline and its own vertical padding. */
    paddingHorizontal: 0,
  },
  problem: { paddingHorizontal: space.xs },
});
