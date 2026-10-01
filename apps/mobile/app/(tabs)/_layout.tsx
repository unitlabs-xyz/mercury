import { Platform, type ColorValue } from "react-native";
import { Tabs } from "expo-router";
import { Icon, type IconName } from "../../src/ui";
import { color, font, radius } from "../../src/theme";

/**
 * Four tabs, floating over the content.
 *
 * The web carries five sections; Baskets is absent here because Symmetry
 * blocks it on both clients, and four is what fits a phone's bottom bar
 * without the labels truncating.
 *
 * The bar floats rather than sitting in a docked strip, which is why the home
 * screen's lower card pads itself past it: the two cards there run to the
 * screen's edges, and a docked bar would cut the bottom one off square.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.ink,
        tabBarInactiveTintColor: color.muted,
        tabBarStyle: {
          position: "absolute",
          left: 16,
          right: 16,
          bottom: Platform.OS === "ios" ? 26 : 16,
          height: 62,
          paddingTop: 8,
          paddingBottom: 8,
          borderRadius: radius.pill,
          borderTopWidth: 0,
          backgroundColor: color.surface,
          /* A soft lift, not a drop shadow: the bar sits ON the page, and a
             hard edge under it reads as a second card. */
          shadowColor: "#000",
          shadowOpacity: 0.1,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
        },
        tabBarItemStyle: { paddingTop: 2 },
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11, letterSpacing: -0.1 },
        sceneStyle: { backgroundColor: color.page },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Portfolio", tabBarIcon: mark("pieChart") }} />
      <Tabs.Screen name="invest" options={{ title: "Invest", tabBarIcon: mark("trend") }} />
      <Tabs.Screen name="money" options={{ title: "Money", tabBarIcon: mark("wallet") }} />
      <Tabs.Screen name="activity" options={{ title: "Activity", tabBarIcon: mark("clock") }} />
    </Tabs>
  );
}

/* A touch lighter than the icon's own weight: at 21px on a bar, the set's
   stroke reads as heavier than it does at panel size. */
const mark =
  (name: IconName) =>
  ({ color: tint }: { color: ColorValue }) => <Icon name={name} size={21} color={tint} strokeWidth={1.7} />;
