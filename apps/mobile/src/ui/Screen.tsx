import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { color, radius, space } from "../theme";
import { Icon } from "./Icon";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export interface ScreenProps {
  title?: string;
  /** One line under the title. The web's rail heads carry the same. */
  subtitle?: string;
  /** Draws a round back control above the title. */
  onBack?: () => void;
  /** Set false when the body scrolls itself — a list, a pager. */
  scroll?: boolean;
  /** Pinned above the safe area, where a thumb reaches. */
  footer?: ReactNode;
  children?: ReactNode;
}

/**
 * The frame a form screen sits in.
 *
 * Taken from the reference app's `ScreenScaffold`, for the reason its own
 * comment gives: every screen drawing its own heading at its own offsets is how
 * the title lands at a different height on each one. The home screen does NOT
 * use this — it runs its own card under the status bar.
 */
export const Screen = ({ title, subtitle, onBack, scroll = true, footer, children }: ScreenProps) => {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={s.body}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[s.fill, s.body]}>{children}</View>
  );

  return (
    <SafeAreaView edges={["top"]} style={s.root}>
      {/* The footer is where the primary action lives, so the keyboard must
          push it rather than cover it. On iOS that means padding; height
          behaviour leaves a gap under the bar. */}
      <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {onBack !== undefined && (
          <View style={s.backRow}>
            <PressableScale onPress={onBack} accessibilityLabel="Back" style={s.back} activeScale={0.9}>
              <Icon name="chevronRight" size={18} color={color.ink} style={s.flip} />
            </PressableScale>
          </View>
        )}
        {title !== undefined && (
          <View style={s.heading}>
            <Text variant="title">{title}</Text>
            {subtitle !== undefined && (
              <Text variant="body" tone="muted" style={s.subtitle}>
                {subtitle}
              </Text>
            )}
          </View>
        )}
        {body}
        {footer !== undefined && <View style={s.footer}>{footer}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.page },
  fill: { flex: 1 },
  backRow: { paddingHorizontal: space.screen, paddingTop: space.sm, paddingBottom: space.md },
  back: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  flip: { transform: [{ rotate: "180deg" }] },
  heading: { paddingHorizontal: space.screen, paddingTop: space.xs, paddingBottom: space.lg },
  subtitle: { marginTop: 6 },
  body: { paddingHorizontal: space.screen, paddingBottom: space.xl, gap: space.lg },
  footer: { paddingHorizontal: space.screen, paddingTop: space.md, paddingBottom: space.md },
});
