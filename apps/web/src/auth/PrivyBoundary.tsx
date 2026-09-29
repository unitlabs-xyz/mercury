import { PrivyProvider } from "@privy-io/react-auth";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import type { ReactNode } from "react";
import { IdentityTokenSync } from "./identity";

const APP_ID = import.meta.env["VITE_PRIVY_APP_ID"] as string | undefined;

/*
 * Privy's own signing UI reads the chain through this, so without it the
 * embedded wallet never registers as a Solana Standard wallet — `useWallets()`
 * comes back empty ("No wallet is connected to sign with") and opening the
 * signature screen throws "No RPC configuration found for chain solana:mainnet",
 * which took the whole app down with it.
 *
 * The public endpoint by default rather than the API's key: this runs in the
 * browser, where anything we put here ships to every visitor. Privy uses it to
 * describe the transaction being signed, not to poll, so the public rate limit
 * is enough. VITE_SOLANA_RPC_URL overrides it with a browser-safe endpoint.
 */
const RPC_URL =
  (import.meta.env["VITE_SOLANA_RPC_URL"] as string | undefined) ?? "https://api.mainnet-beta.solana.com";

/* Built once. Rebuilding these per render would reconnect the socket each time. */
const SOLANA = {
  rpcs: {
    "solana:mainnet": {
      rpc: createSolanaRpc(RPC_URL),
      rpcSubscriptions: createSolanaRpcSubscriptions(RPC_URL.replace(/^http/, "ws")),
    },
  },
} as const;

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
        solana: SOLANA,
      }}
    >
      {/* Mirrors the identity token out to `apiFetch`, which cannot use a hook. */}
      <IdentityTokenSync />
      {children}
    </PrivyProvider>
  );
};
