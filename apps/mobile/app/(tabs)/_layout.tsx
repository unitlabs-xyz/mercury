import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { color, type } from "../../src/theme";

/**
 * Four tabs, as the design brief asked for.
 *
 * The web carries five sections; Baskets is absent here because Symmetry
 * blocks it on both clients, and four is what fits a phone's bottom bar
 * without the labels truncating.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.ink,
        tabBarInactiveTintColor: color.muted,
        tabBarStyle: { backgroundColor: color.surface, borderTopColor: color.divider },
        tabBarLabelStyle: { fontSize: type.tiny.fontSize, fontWeight: "500" },
        sceneStyle: { backgroundColor: color.page },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Portfolio", tabBarIcon: mark("◴") }} />
      <Tabs.Screen name="invest" options={{ title: "Invest", tabBarIcon: mark("↗") }} />
      <Tabs.Screen name="money" options={{ title: "Money", tabBarIcon: mark("≡") }} />
      <Tabs.Screen name="activity" options={{ title: "Activity", tabBarIcon: mark("⟲") }} />
    </Tabs>
  );
}

/** Placeholder marks. The real glyphs come across from the web's icon set. */
const mark =
  (glyph: string) =>
  ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
