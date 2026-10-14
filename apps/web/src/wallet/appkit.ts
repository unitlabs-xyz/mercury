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

/*
 * The wallets the modal leads with, by their WalletConnect directory ids
 * (looked up 14 October against api.web3modal.org). Without these AppKit
 * features whatever the directory ranks first, which was "My Wallet" — a
 * wallet nobody we serve holds — in the slot where Phantom should be.
 */
const FEATURED_WALLETS = [
  "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393", // Phantom
  "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96", // MetaMask
  "fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa", // Base (Coinbase Wallet)
  "18388be9ac2d02726dbac9777c96efaac06d744b2f6d580fccdd4127a6d01fd1", // Rabby
  "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0", // Trust Wallet
  "2bd8c14e035c2d48f184aaa168559e86b0e3433228d3c4075900a221785019b0", // Backpack
];

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
        /*
         * WalletConnect on, and the full directory behind "All Wallets": a
         * phone wallet is reached by its QR code, and a desktop browser with
         * no extension has nothing else to offer.
         */
        enableWalletConnect: true,
        allWallets: "SHOW",
        featuredWalletIds: FEATURED_WALLETS,
        features: {
          /* Stated, not left to the default: passing `features` at all
             replaces AppKit's defaults, and without this key "All Wallets" —
             and the WalletConnect QR it leads to — went missing. */
          allWallets: true,
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
