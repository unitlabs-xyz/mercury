import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { solana } from "@reown/appkit/networks";
import { EVM_NETWORKS } from "./chains";

/**
 * The connector for wallets somebody funds from.
 *
 * Not Privy's. Privy is the account — email in, one embedded Solana wallet,
 * and that wallet is what signs a buy. This is the other thing entirely: a
 * wallet the user already holds, which signs one deposit and leaves.
 *
 * Keeping them in separate systems is the point. Privy's `useWallets()`
 * returns one list holding both, which is why `auth/embedded.ts` had to tell
 * them apart by sniffing `isPrivyWallet` off a prototype — a check its own
 * docstring called "proportionate, not airtight", and one that fails closed by
 * taking account signing offline when two wallets claim it. Two connectors
 * make the sets disjoint by construction and that file goes away.
 *
 * It also reaches wallets Privy cannot: an EVM wallet at all, and a phone
 * browser through WalletConnect, where there are no extensions to detect.
 */

const PROJECT_ID = import.meta.env["VITE_REOWN_PROJECT_ID"] as string | undefined;

/**
 * Whether a funding wallet can be connected at all.
 *
 * False without a project ID, and then nothing here is constructed: the
 * deposit methods that need a wallet are hidden, exactly as `AddCash.tsx`
 * already hides a method whose precondition is unmet. A connect button that
 * opens a broken modal is worse than one that is not there.
 */
export const walletConnectConfigured = PROJECT_ID !== undefined && PROJECT_ID.trim().length > 0;

const metadata = {
  name: "Mercury",
  description: "A self-custodial brokerage for tokenised US equities",
  url: "https://trymercury.xyz",
  icons: ["https://trymercury.xyz/icon.png"],
};

/*
 * Built once at module scope, and only when configured. `createAppKit`
 * registers custom elements and a WalletConnect client; calling it per render
 * would re-register both.
 */
const built = walletConnectConfigured
  ? (() => {
      const wagmi = new WagmiAdapter({
        networks: [...EVM_NETWORKS],
        projectId: PROJECT_ID!,
      });
      /*
       * Cast once, deliberately, at the boundary.
       *
       * AppKit's types are not written for `exactOptionalPropertyTypes`, which
       * this repo has on: `CaipNetwork` declares `assets?: {…}` and
       * `ChainAdapter` declares `namespace: ChainNamespace`, while their own
       * values carry `| undefined` on both. Every field we pass is checked
       * against their type first — the cast is on the assembled options, to
       * their own parameter type rather than `any` — so a typo in a key we
       * control still fails here. Casting field by field instead would mean
       * one of these per release of theirs.
       */
      const options = {
        adapters: [wagmi, new SolanaAdapter()],
        networks: [...EVM_NETWORKS, solana],
        projectId: PROJECT_ID!,
        metadata,
        features: {
          /* Email and socials are Privy's job, and offering them here would
             invite somebody to create a second account inside Add cash. */
          email: false,
          socials: false,
          analytics: false,
          /* Relay is our router. AppKit's own swap and onramp would move money
             by a path nothing in our books knows about. */
          swaps: false,
          onramp: false,
        },
      };
      createAppKit(options as unknown as Parameters<typeof createAppKit>[0]);
      return { wagmiConfig: wagmi.wagmiConfig };
    })()
  : null;

export const wagmiConfig = built?.wagmiConfig ?? null;
