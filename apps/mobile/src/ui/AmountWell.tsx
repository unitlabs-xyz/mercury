import { StyleSheet, Text as RNText, TextInput, View } from "react-native";
import { button, color, font, radius, space } from "../theme";
import { Surface } from "./Button";
import { PressableScale } from "./PressableScale";

/**
 * The web's amount well (`Send.tsx`, the order ticket): a grey panel with its
 * label above, the figure in a white well at 28 with "$" before it, a Max pill
 * and the unit after, and one line under it saying what is available.
 */
export const AmountWell = ({
  label,
  value,
  onChange,
  unit = "USDC",
  max,
  note,
  invalid = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  unit?: string;
  /** Fills the well with this figure. Left out, there is no Max pill. */
  max?: number | undefined;
  note?: string | undefined;
  invalid?: boolean;
}) => (
  <View style={s.panel}>
    <RNText style={s.label}>{label}</RNText>
    <View style={[s.well, invalid && s.invalid]}>
      <RNText style={s.currency}>$</RNText>
      <TextInput
        value={value}
        onChangeText={(raw) => onChange(raw.replace(/[^0-9.]/g, "").slice(0, 12))}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor="rgba(101,101,101,0.5)"
        selectionColor={color.brand}
        style={s.input}
        accessibilityLabel={`${label} in dollars`}
      />
      {max !== undefined && (
        <PressableScale
          onPress={() => onChange(max.toFixed(2))}
          activeScale={0.94}
          style={s.max}
          haptic={false}
        >
          <Surface />
          <RNText style={s.maxText}>Max</RNText>
        </PressableScale>
      )}
      <RNText style={s.unit}>{unit}</RNText>
    </View>
    {note !== undefined && <RNText style={s.note}>{note}</RNText>}
  </View>
);

const s = StyleSheet.create({
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
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: "transparent",
  },
  invalid: { borderColor: color.down },
  currency: { fontFamily: font.medium, fontSize: 28, color: color.muted },
  input: { flex: 1, minWidth: 0, fontFamily: font.medium, fontSize: 28, color: color.ink, padding: 0 },
  max: {
    height: 26,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: button.secondary.edge,
    overflow: "hidden",
    justifyContent: "center",
  },
  maxText: { fontFamily: font.regular, fontSize: 12, color: color.ink },
  unit: { fontFamily: font.regular, fontSize: 12, color: color.muted },
  note: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 17,
    color: color.muted,
    paddingHorizontal: space.md,
    paddingTop: 10,
    paddingBottom: space.sm,
  },
});
