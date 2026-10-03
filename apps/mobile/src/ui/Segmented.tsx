import { StyleSheet, Text as RNText, View } from "react-native";
import { Haptics } from "../haptics";
import { button, color, font, radius } from "../theme";
import { Surface } from "./Button";
import { PressableScale } from "./PressableScale";

/**
 * The web's `RangeSwitch`: a grey tray with the chosen option raised on the
 * secondary button's face. For a handful of options that are one control —
 * a shelf, a range — where chips would read as separate filters.
 *
 * `fill` stretches the options across the width; without it they sit at their
 * own widths, as a range switch does beside a heading.
 */
export const Segmented = <T extends string>({
  options,
  value,
  onChange,
  fill = false,
  onPage = false,
}: {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  fill?: boolean;
  /** On the grey page rather than a white card: a deeper tray, so it still reads. */
  onPage?: boolean;
}) => (
  <View style={[s.tray, onPage && s.trayPage, fill && s.trayFill]} accessibilityRole="tablist">
    {options.map((o) => {
      const on = o.key === value;
      return (
        <PressableScale
          key={o.key}
          haptic={false}
          activeScale={0.96}
          accessibilityRole="tab"
          accessibilityState={{ selected: on }}
          onPress={() => {
            if (on) return;
            void Haptics.selectionAsync();
            onChange(o.key);
          }}
          style={[s.key, fill && s.keyFill, on && s.on]}
        >
          {on && <Surface />}
          <RNText style={[s.label, on && s.labelOn]}>{o.label}</RNText>
        </PressableScale>
      );
    })}
  </View>
);

const s = StyleSheet.create({
  tray: {
    flexDirection: "row",
    alignSelf: "flex-start",
    padding: 3,
    gap: 2,
    borderRadius: radius.md + 2,
    backgroundColor: color.tile,
  },
  trayPage: { backgroundColor: "#E8E8E6" },
  trayFill: { alignSelf: "stretch" },
  key: {
    height: 32,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "transparent",
  },
  keyFill: { flex: 1 },
  on: { borderColor: button.secondary.edge },
  label: { fontFamily: font.regular, fontSize: 13, letterSpacing: -0.2, color: color.muted },
  labelOn: { fontFamily: font.medium, color: color.ink },
});
