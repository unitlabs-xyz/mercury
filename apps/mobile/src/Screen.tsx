import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { c, t } from "./tokens";

/** The frame every tab sits in: safe area, page ground, a title, then content. */
export const Screen = ({ title, children }: { title: string; children?: ReactNode }) => (
  <SafeAreaView edges={["top"]} style={s.safe}>
    <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <Text style={s.title}>{title}</Text>
      {children ?? <Text style={s.waiting}>Not built yet.</Text>}
    </ScrollView>
  </SafeAreaView>
);

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.page },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },
  title: { fontSize: t.title, fontWeight: "600", color: c.ink, letterSpacing: -0.3 },
  waiting: { marginTop: 12, fontSize: t.body, color: c.muted },
});

/** A white card, as every rail on the web is a white card on the grey ground. */
export const Card = ({ children }: { children: ReactNode }) => <View style={card.box}>{children}</View>;

const card = StyleSheet.create({
  box: { marginTop: 16, borderRadius: 12, backgroundColor: c.white, padding: 20 },
});
