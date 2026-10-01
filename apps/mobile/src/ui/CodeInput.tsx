import { useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { color, font, radius } from "../theme";
import { Text } from "./Text";

export interface CodeInputProps {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  editable?: boolean;
  /** Fired once the last cell fills, so the sheet does not need a Continue tap. */
  onFilled?: (code: string) => void;
}

/**
 * The six-digit code, as six cells.
 *
 * One hidden `TextInput` holds the value and the cells are drawn from it. Six
 * real inputs is the obvious build and the wrong one: iOS autofills a one-time
 * code into a single field, and `textContentType="oneTimeCode"` on six of them
 * puts the whole code in the first cell.
 */
export const CodeInput = ({ value, onChange, length = 6, editable = true, onFilled }: CodeInputProps) => {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const cells = Array.from({ length }, (_, i) => value[i] ?? "");
  /* The caret sits on the first empty cell, or on the last one when full. */
  const caret = Math.min(value.length, length - 1);

  return (
    <Pressable style={s.row} onPress={() => input.current?.focus()}>
      {cells.map((digit, i) => (
        <View
          key={i}
          style={[
            s.cell,
            digit !== "" && s.filled,
            focused && i === caret && value.length < length && s.active,
          ]}
        >
          <Text style={s.digit}>{digit}</Text>
        </View>
      ))}

      <TextInput
        ref={input}
        style={s.hidden}
        value={value}
        onChangeText={(raw) => {
          const next = raw.replace(/\D/g, "").slice(0, length);
          onChange(next);
          if (next.length === length) onFilled?.(next);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        editable={editable}
        autoFocus
        caretHidden
      />
    </Pressable>
  );
};

const s = StyleSheet.create({
  row: { flexDirection: "row", gap: 9 },
  cell: {
    flex: 1,
    height: 62,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: color.divider,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  filled: { borderColor: color.ink },
  active: { borderColor: color.brand },
  digit: { fontFamily: font.medium, fontSize: 26, letterSpacing: -0.6, color: color.ink },
  /* Present and focusable, but never seen: the cells above are the field. */
  hidden: { position: "absolute", opacity: 0, width: 1, height: 1 },
});
