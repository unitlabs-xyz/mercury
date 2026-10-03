import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { color, font, radius, space } from "../theme";
import { Icon } from "./Icon";
import { Text } from "./Text";

/**
 * A soft note: amber for a caution, red for something to fix. The web's `Note`
 * (Send, the order ticket) and the deposit rule all draw this.
 */
export const Note = ({ tone, children }: { tone: "warn" | "down"; children: ReactNode }) => {
  const ink = tone === "warn" ? color.chipWarn : color.chipDown;
  return (
    <View style={[s.box, { backgroundColor: tone === "warn" ? color.warnChip : color.downChip }]}>
      <Icon name="alert" size={14} color={ink} strokeWidth={1.8} style={s.icon} />
      <Text variant="tiny" style={[s.text, { color: ink }]}>
        {children}
      </Text>
    </View>
  );
};

/**
 * The web's `StatusChip`: a tint behind, the word at 80% over it. `md` is the
 * one that sits beside a row's figure; `sm` labels a tile.
 */
export const StatusChip = ({
  tone = "neutral",
  size = "sm",
  children,
}: {
  tone?: "neutral" | "up" | "warn" | "down";
  size?: "sm" | "md";
  children: ReactNode;
}) => {
  const look = CHIP[tone];
  return (
    <View style={[size === "md" ? s.md : s.sm, { backgroundColor: look.bg }]}>
      <Text style={[size === "md" ? s.mdText : s.smText, { color: look.ink }]}>{children}</Text>
    </View>
  );
};

const CHIP = {
  /* `ds-tag`, the page grey: it still shows on a #F7F7F7 panel. */
  neutral: { bg: color.page, ink: color.muted },
  up: { bg: color.upChip, ink: color.chipUp },
  warn: { bg: color.warnChip, ink: color.chipWarn },
  down: { bg: color.downChip, ink: color.chipDown },
} as const;

const s = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  icon: { marginTop: 1 },
  text: { flex: 1, fontFamily: font.regular, fontSize: 12, lineHeight: 17, letterSpacing: -0.2 },
  sm: {
    height: 17,
    borderRadius: 4,
    paddingHorizontal: 6,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  md: {
    height: 22,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  smText: { fontFamily: font.regular, fontSize: 10, lineHeight: 12, opacity: 0.8 },
  mdText: { fontFamily: font.regular, fontSize: 12, lineHeight: 14, opacity: 0.8 },
});
