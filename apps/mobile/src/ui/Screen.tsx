import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { color, space } from "../theme";
import { Text } from "./Text";

export interface ScreenProps {
  title?: string;
  /** One line under the title. The web's rail heads carry the same. */
  subtitle?: string;
  /** Set false when the body scrolls itself — a list, a pager. */
  scroll?: boolean;
  /** Pinned above the safe area, where a thumb reaches. */
  footer?: ReactNode;
  children?: ReactNode;
}

/**
 * The frame every screen sits in.
 *
 * Taken from the reference app's `ScreenScaffold`, for the reason its own
 * comment gives: every screen drawing its own heading at its own offsets is how
 * the title lands at a different height on each one.
 */
export const Screen = ({ title, subtitle, scroll = true, footer, children }: ScreenProps) => {
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
        {title !== undefined && (
          <View style={s.heading}>
            <Text variant="title">{title}</Text>
            {subtitle !== undefined && (
              <Text variant="small" tone="muted" style={s.subtitle}>
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
  heading: { paddingHorizontal: space.screen, paddingTop: space.sm, paddingBottom: space.md },
  subtitle: { marginTop: 4 },
  body: { paddingHorizontal: space.screen, paddingBottom: space.xl, gap: space.md },
  footer: { paddingHorizontal: space.screen, paddingTop: space.md, paddingBottom: space.sm },
});
