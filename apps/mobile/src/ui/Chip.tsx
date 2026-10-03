import { StyleSheet } from "react-native";
import { Haptics } from "../haptics";
import { color, font, radius } from "../theme";
import { Surface } from "./Button";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

/**
 * A filter pill, as the web's sector chips draw it (`Screener.tsx`): a hairline
 * edge when off, and the secondary button's face with a firmer edge when on.
 * A flat grey fill was the old selected state, and on the grey page it read as
 * a hole rather than a pressed key.
 */
export const Chip = ({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) => {
  const on = selected === true;
  return (
    <PressableScale
      haptic={false}
      activeScale={0.94}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress?.();
      }}
      style={[s.chip, on && s.on]}
    >
      {on && <Surface />}
      <Text style={[s.label, on && s.labelOn]}>{label}</Text>
    </PressableScale>
  );
};

const s = StyleSheet.create({
  chip: {
    paddingHorizontal: 15,
    height: 30,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    overflow: "hidden",
  },
  on: { borderColor: "rgba(0,0,0,0.1)" },
  label: { fontFamily: font.regular, fontSize: 14, lineHeight: 18, letterSpacing: -0.28, color: color.muted },
  labelOn: { fontFamily: font.medium, color: color.ink },
});
