import type { ReactNode } from "react";
import Constants from "expo-constants";
import { PrivyProvider } from "@privy-io/expo";

const APP_ID = process.env["EXPO_PUBLIC_PRIVY_APP_ID"] ?? "";
const CLIENT_ID = process.env["EXPO_PUBLIC_PRIVY_CLIENT_ID"] ?? "";

/**
 * Privy, around everything.
 *
 * `clientId` has no counterpart on the web. Privy issues one per platform,
 * bound to a bundle id, and `@privy-io/expo` will not initialise without it —
 * so a missing one is a blank app rather than a failed login, which is worth
 * saying out loud at boot rather than discovering in a simulator.
 */
export const PrivyBoundary = ({ children }: { children: ReactNode }) => {
  if (APP_ID === "" || CLIENT_ID === "") {
    const missing = [
      APP_ID === "" ? "EXPO_PUBLIC_PRIVY_APP_ID" : null,
      CLIENT_ID === "" ? "EXPO_PUBLIC_PRIVY_CLIENT_ID" : null,
    ]
      .filter((x): x is string => x !== null)
      .join(" and ");
    console.warn(
      `privy: ${missing} unset in ${Constants.expoConfig?.name ?? "the app"}'s env; sign-in will not work`,
    );
  }
  return (
    <PrivyProvider appId={APP_ID} clientId={CLIENT_ID}>
      {children}
    </PrivyProvider>
  );
};
