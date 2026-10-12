import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import type { ReactNode } from "react";
import { IdentityTokenSync } from "./identity";

const APP_ID = import.meta.env["VITE_PRIVY_APP_ID"] as string | undefined;

/*
 * Privy's own signing UI reads the chain through this, so without it the
 * signature screen throws "No RPC configuration found for chain
 * solana:mainnet" and takes the whole app down with it.
 *
 * It has to be an endpoint that serves BROWSERS. Solana's public RPC
 * (api.mainnet-beta.solana.com) is not one: it answers the CORS preflight
 * with an allow, then returns 403 to any request carrying an Origin header.
 * Privy swallows that as "Failed to prepare transaction" and shows an empty
 * amount and fee, which reads like a broken wallet rather than a blocked
 * request. Measured: 403 with an Origin header, 200 without.
 *
 * So there is no keyless default worth shipping, and a default that 403s is
 * worse than none. This is required, like the app id above it.
 *
 * Whatever goes here ships to every visitor, so use a key that is restricted
 * by domain at the provider rather than a server key.
 */
const RPC_URL = import.meta.env["VITE_SOLANA_RPC_URL"] as string | undefined;

/* Built once. Rebuilding these per render would reconnect the socket each time. */
const SOLANA = RPC_URL
  ? ({
      rpcs: {
        "solana:mainnet": {
          rpc: createSolanaRpc(RPC_URL),
          rpcSubscriptions: createSolanaRpcSubscriptions(RPC_URL.replace(/^http/, "ws")),
        },
      },
    } as const)
  : null;

/**
 * Solana only, email only. Ethereum embedded wallets are explicitly off: we
 * have no use for one, and provisioning both doubles the wait a new user sits
 * through on the "creating your wallet" step.
 */
export const PrivyBoundary = ({ children }: { children: ReactNode }) => {
  if (!APP_ID) throw new Error("VITE_PRIVY_APP_ID is not set");
  if (!SOLANA)
    throw new Error(
      "VITE_SOLANA_RPC_URL is not set. Privy signs through it, and Solana's public RPC returns 403 to browsers, so there is no default that works.",
    );
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        loginMethods: ["email"],
        embeddedWallets: {
          solana: { createOnLogin: "users-without-wallets" },
          ethereum: { createOnLogin: "off" },
          /*
           * No confirmation sheet before a signature. See ADR 0012.
           *
           * This is a real trade-off and not a tidy-up. That sheet is the last
           * point at which a user can refuse, and without it anything running
           * in this page can sign with their key unseen. It is off because a
           * brokerage that asks permission twice for one press does not feel
           * like a brokerage, and it stays off only until delegated signing
           * with a policy replaces it — the path ADR 0003 already describes.
           */
          showWalletUIs: false,
        },
        solana: SOLANA,
        /*
         * Sign-in is still email only. These connectors exist so somebody can
         * attach a wallet they already hold and push USDC into their account
         * with it — a funding source, never the account. `useEmbeddedWallet`
         * is what keeps the two apart everywhere a key signs.
         *
         * `shouldAutoConnect` defaults to true, which would reach for a
         * previously-attached wallet on page load. Off: an account is reached
         * by email, and the only moment we have any business touching
         * somebody's Phantom is the moment they press Connect in Add cash.
         *
         * WalletConnect and the EVM connectors stay off and stay stubbed out
         * of the bundle in vite.config.ts — Solana wallets are reached through
         * the Wallet Standard and need neither.
         */
        externalWallets: {
          walletConnect: { enabled: false },
          solana: { connectors: toSolanaWalletConnectors({ shouldAutoConnect: false }) },
        },
      }}
    >
      {/* Mirrors the identity token out to `apiFetch`, which cannot use a hook. */}
      <IdentityTokenSync />
      {children}
    </PrivyProvider>
  );
};
