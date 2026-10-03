import { Easing } from "react-native";
import { Tabs } from "expo-router";
import { ActionsProvider, useActions } from "../../src/actions/Actions";
import { TabBar, type IconName } from "../../src/ui";
import { color } from "../../src/theme";

/**
 * Four tabs, under a bar that floats over the content.
 *
 * The web carries five sections; Baskets is absent here because Symmetry
 * blocks it on both clients. The bar floats rather than docking, which is why
 * the home screen's lower card pads itself past it.
 */
const ICONS: Record<string, IconName> = {
  index: "pieChart",
  invest: "trend",
  money: "wallet",
  activity: "clock",
};

/* How far a page travels on its way in or out. Enough to say which way, not a slide. */
const SHIFT = 28;

export default function TabsLayout() {
  return (
    <ActionsProvider>
      <Bar />
    </ActionsProvider>
  );
}

/* Inside the provider, so the bar's + can open the actions sheet. */
const Bar = () => {
  const actions = useActions();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} icons={ICONS} onPlus={() => actions()} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.page },
        /* Every tab mounted up front. A tab mounted on its first visit starts its
           transition at the far end and never runs it, so it stayed at zero
           opacity: a blank page under a bar that said Invest. */
        lazy: false,
        /* In and out, toward the tab you chose: the old page drifts away and
           fades as the new one settles in from the side it lives on. Short and
           eased out, so a tap feels answered rather than animated at. */
        transitionSpec: { animation: "timing", config: { duration: 260, easing: Easing.out(Easing.cubic) } },
        sceneStyleInterpolator: ({ current }) => ({
          sceneStyle: {
            opacity: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
            transform: [
              {
                translateX: current.progress.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [-SHIFT, 0, SHIFT],
                }),
              },
            ],
          },
        }),
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Portfolio" }} />
      <Tabs.Screen name="invest" options={{ title: "Invest" }} />
      <Tabs.Screen name="money" options={{ title: "Money" }} />
      <Tabs.Screen name="activity" options={{ title: "Activity" }} />
    </Tabs>
  );
};
