import { useEffect } from "react";
import { ActivityIndicator, AppState, View, StyleSheet, type AppStateStatus } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { useFonts } from "expo-font";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/expo";
import { PrivyBoundary } from "../src/auth/PrivyBoundary";
import { TokenSync } from "../src/api";
import DiatypeBold from "../assets/fonts/ABCDiatype-Bold.ttf";
import DiatypeMedium from "../assets/fonts/ABCDiatype-Medium.ttf";
import DiatypeRegular from "../assets/fonts/ABCDiatype-Regular.ttf";
import { color } from "../src/theme";

/* Same defaults as the web's App.tsx: one retry, and no refetch on focus. The
   account reads opt back in, in `src/api/hooks.ts`. */
const queries = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/**
 * What "focused" means on a phone.
 *
 * React Query's `refetchOnWindowFocus` listens for a browser event that does
 * not exist here, so without this the account reads would only ever refresh on
 * their timer. The moment that matters is the app coming back to the
 * foreground: the thing somebody does between looking at their balance and
 * looking at it again is approve something somewhere else.
 *
 * Registered once at module scope rather than in an effect — Fast Refresh
 * remounts components, and a listener added per mount accumulates.
 */
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
    handleFocus(state === "active");
  });
  return () => sub.remove();
});

const Waiting = () => (
  <View style={s.waiting}>
    <ActivityIndicator color={color.muted} />
  </View>
);

/**
 * Sends a signed-out person to the door, and a signed-in one past it.
 *
 * `isReady` is the part worth keeping: Privy restores a session from secure
 * storage asynchronously, so for the first frames nobody is signed in. Routing
 * on that would bounce a returning user through the welcome screen every launch.
 */
const Gate = () => {
  const { user, isReady } = usePrivy();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isReady) return;
    /*
     * Named, not inferred. `segments[0] !== "(tabs)"` was the test, which read
     * as "anywhere outside the tabs is the door" — so every pushed screen, a
     * stock page included, bounced a signed-in person straight back to the
     * portfolio.
     */
    const DOOR = ["welcome", "sign-in"];
    const atDoor = DOOR.includes(segments[0] ?? "");
    if (user === null && !atDoor) router.replace("/welcome" as never);
    if (user !== null && atDoor) router.replace("/");
  }, [isReady, user, segments, router]);

  if (!isReady) return <Waiting />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.page },
        /* The sign-in steps come in from the right over the welcome art, so
           going back reveals it rather than redrawing it. */
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="welcome" options={{ animation: "fade" }} />
      {/* iOS's own sheet, sized to what it holds: the grabber, the spring and
          the swipe down are the system's, not an imitation of them. */}
      {/* Buying, in the same sheet. Sized to its content so the amount, the
          preview and the button sit together, and resized as the preview fills. */}
      <Stack.Screen
        name="buy"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
          contentStyle: { backgroundColor: color.surface },
        }}
      />
      {/* Filter and sort for Invest, sized to its options. */}
      <Stack.Screen
        name="invest-filters"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
          contentStyle: { backgroundColor: color.surface },
        }}
      />
      <Stack.Screen
        name="add-cash"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
          contentStyle: { backgroundColor: color.surface },
        }}
      />
    </Stack>
  );
};

export default function RootLayout() {
  /*
   * ABC Diatype, the brand face — the same outlines the web serves, converted
   * from woff2 to the ttf a phone can load. Held rather than faded in: the type
   * scale is tuned to Diatype's metrics, so a first frame in the system face
   * lays out at the wrong widths and then reflows.
   */
  const [fontsReady] = useFonts({
    Diatype: DiatypeRegular,
    DiatypeMedium,
    DiatypeBold,
  });

  if (!fontsReady) return <Waiting />;

  return (
    <PrivyBoundary>
      <QueryClientProvider client={queries}>
        {/* Inside the Privy provider, so it can read the token getters; above
            the routes, so every screen's queries carry them. */}
        <TokenSync />
        <Gate />
      </QueryClientProvider>
    </PrivyBoundary>
  );
}

const s = StyleSheet.create({
  waiting: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.page },
});
