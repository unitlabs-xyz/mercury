// Before every other import: see the file for why.
import "../src/polyfills";
import { useEffect } from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { useFonts } from "expo-font";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/expo";
import { PrivyBoundary } from "../src/auth/PrivyBoundary";
import DiatypeBold from "../assets/fonts/ABCDiatype-Bold.ttf";
import DiatypeMedium from "../assets/fonts/ABCDiatype-Medium.ttf";
import DiatypeRegular from "../assets/fonts/ABCDiatype-Regular.ttf";
import { color } from "../src/theme";

/* Same defaults as the web's App.tsx: one retry, and no refetch on focus. */
const queries = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
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
    const inApp = segments[0] === "(tabs)";
    if (user === null && inApp) router.replace("/welcome" as never);
    if (user !== null && !inApp) router.replace("/");
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
        <Gate />
      </QueryClientProvider>
    </PrivyBoundary>
  );
}

const s = StyleSheet.create({
  waiting: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.page },
});
