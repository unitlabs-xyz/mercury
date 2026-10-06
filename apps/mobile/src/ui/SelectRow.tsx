import { StyleSheet, Text as RNText, View } from "react-native";
import { MenuView } from "@react-native-menu/menu";
import { Haptics } from "../haptics";
import { color, font, space } from "../theme";
import { Icon } from "./Icon";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

/**
 * One choice from a list, as iOS Settings asks for it: the name on the left,
 * the current answer on the right, and the system's own pull-down menu on a
 * tap, with a tick beside what is chosen. For a list too long to lay out as
 * chips — twelve months — where a wall of pills is harder to read than a menu.
 */
export const SelectRow = ({
  label,
  value,
  options,
  onChange,
  last = false,
}: {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (next: string) => void;
  /** No hairline under the last row of a group. */
  last?: boolean;
}) => {
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <MenuView
      title={label}
      isAnchoredToRight
      shouldOpenOnLongPress={false}
      actions={options.map((o) => ({
        id: o.value,
        title: o.label,
        state: o.value === value ? ("on" as const) : ("off" as const),
      }))}
      onPressAction={({ nativeEvent }) => {
        if (nativeEvent.event === value) return;
        void Haptics.selectionAsync();
        onChange(nativeEvent.event);
      }}
    >
      <View
        style={[s.row, !last && s.rule]}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${current}`}
      >
        <RNText style={s.label}>{label}</RNText>
        <View style={s.value}>
          <RNText style={s.current} numberOfLines={1}>
            {current}
          </RNText>
          <Icon name="chevronsUpDown" size={14} color={color.muted} />
        </View>
      </View>
    </MenuView>
  );
};

const s = StyleSheet.create({
  row: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    gap: space.md,
  },
  rule: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.divider },
  label: { fontFamily: font.medium, fontSize: 14, color: color.ink },
  value: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  current: { fontFamily: font.regular, fontSize: 14, color: color.muted },
});
