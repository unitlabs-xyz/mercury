import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { color, radius, space } from "../theme";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";
import { useBottomGap } from "./useBottomGap";

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The web's `SidePanel`, turned to rise from the bottom edge where a thumb is.
 *
 * Same surface and same scrim as the browser's overlays — white, a 20 corner,
 * the page dimmed by ink at 45% — so a task opened on either client looks like
 * the same task. A tap on the scrim puts it away, as a click outside does there.
 */
export const Sheet = ({ visible, onClose, children }: SheetProps) => {
  const bottom = useBottomGap();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={s.lift}
        pointerEvents="box-none"
      >
        <View style={[s.sheet, { paddingBottom: bottom }]}>
          <View style={s.grabber} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

/**
 * A sheet's title row, the web `PanelHeader` value for value: the title at 20,
 * a line of context at 14 under it, and a quiet close mark at the right.
 */
export const PanelHeader = ({
  title,
  sub,
  onClose,
}: {
  title: string;
  sub?: string | undefined;
  onClose: () => void;
}) => (
  <View style={s.head}>
    <View style={s.headText}>
      <Text variant="panel">{title}</Text>
      {sub !== undefined && (
        <Text variant="body" tone="muted" style={s.sub}>
          {sub}
        </Text>
      )}
    </View>
    <PressableScale onPress={onClose} accessibilityLabel="Close" style={s.close} activeScale={0.9}>
      <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
        <Path d="M2 2l8 8M10 2l-8 8" stroke={color.muted} strokeWidth={1.4} strokeLinecap="round" />
      </Svg>
    </PressableScale>
  </View>
);

const s = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: color.scrim },
  lift: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: "92%",
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: color.divider,
    marginTop: space.sm,
  },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  headText: { flex: 1, minWidth: 0 },
  sub: { marginTop: space.sm },
  close: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -4,
    marginRight: -8,
  },
});
