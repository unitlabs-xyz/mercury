import { StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { color, font, radius } from "../theme";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

/** A filter pill. The web's `RailHead` segments, at thumb size. */
export const Chip = ({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) => (
  <PressableScale
    haptic={false}
    activeScale={0.94}
    onPress={() => {
      void Haptics.selectionAsync();
      onPress?.();
    }}
    style={[s.chip, selected === true ? s.on : undefined]}
  >
    <Text style={[s.label, selected === true ? s.labelOn : undefined]}>{label}</Text>
  </PressableScale>
);

const s = StyleSheet.create({
  chip: {
    paddingHorizontal: 13,
    height: 30,
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: "transparent",
  },
  on: { backgroundColor: color.tile },
  label: { fontFamily: font.medium, fontSize: 13, letterSpacing: -0.26, color: color.muted },
  labelOn: { color: color.ink },
});
