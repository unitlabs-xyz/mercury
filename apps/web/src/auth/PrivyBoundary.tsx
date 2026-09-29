import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";
import { IdentityTokenSync } from "./identity";

const APP_ID = import.meta.env["VITE_PRIVY_APP_ID"] as string | undefined;

/**
 * Solana only, email only. Ethereum embedded wallets are explicitly off: we
 * have no use for one, and provisioning both doubles the wait a new user sits
 * through on the "creating your wallet" step.
 */
export const PrivyBoundary = ({ children }: { children: ReactNode }) => {
  if (!APP_ID) throw new Error("VITE_PRIVY_APP_ID is not set");
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        loginMethods: ["email"],
        embeddedWallets: {
          solana: { createOnLogin: "users-without-wallets" },
          ethereum: { createOnLogin: "off" },
        },
      }}
    >
      {/* Mirrors the identity token out to `apiFetch`, which cannot use a hook. */}
      <IdentityTokenSync />
      {children}
    </PrivyProvider>
  );
};
