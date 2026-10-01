// Before every other import: see the file for why.
import "../src/polyfills";
import { useEffect } from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/expo";
import { PrivyBoundary } from "../src/auth/PrivyBoundary";
import { color } from "../src/theme";

/* Same defaults as the web's App.tsx: one retry, and no refetch on focus. */
const queries = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/**
 * Sends a signed-out person to the door, and a signed-in one past it.
 *
 * `isReady` is the part worth keeping: Privy restores a session from secure
 * storage asynchronously, so for the first frames nobody is signed in. Routing
 * on that would bounce a returning user through the sign-in screen every launch.
 */
const Gate = () => {
  const { user, isReady } = usePrivy();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isReady) return;
    const inApp = segments[0] === "(tabs)";
    if (user === null && inApp) router.replace("/sign-in" as never);
    if (user !== null && !inApp) router.replace("/");
  }, [isReady, user, segments, router]);

  if (!isReady) {
    return (
      <View style={s.waiting}>
        <ActivityIndicator color={color.muted} />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.page } }} />;
};

export default function RootLayout() {
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
