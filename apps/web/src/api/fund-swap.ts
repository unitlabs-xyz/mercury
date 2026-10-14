import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppKitProvider } from "@reown/appkit/react";
import { useWalletClient } from "wagmi";
import { createClient, execute, MAINNET_RELAY_API, type AdaptedWallet } from "@relayprotocol/relay-sdk";
import { configureDynamicChains } from "@relayprotocol/relay-sdk/chain-utils";
import { adaptSolanaWallet } from "@relayprotocol/relay-svm-wallet-adapter";
import { Connection, type SendOptions, type VersionedTransaction } from "@solana/web3.js";
import { apiFetch } from "./client";
import { SOLANA_RPC_URL, solBalanceRaw, tokenBalanceRaw } from "../solana/rpc";
import { SOLANA_CHAIN_ID } from "../wallet/chains";
import { useFunder } from "../wallet/useFunder";
import { refreshAfterChain } from "./settle";

/** Relay's identifier for native SOL, which is a lamport balance and not a token account. */
export const NATIVE_SOL = "11111111111111111111111111111111";

/*
 * The SDK's client, built once.
 *
 * Deliberately no `apiKey` — their own documentation warns against putting one
 * in a browser, and ours never leaves the server. Everything here needs is a
 * quote the server already minted; `execute()` only talks to Relay to follow
 * the steps in it.
 */
createClient({ baseApiUrl: MAINNET_RELAY_API, source: "trymercury.xyz" });

/**
 * Relay's real chain list, which the client does not have until it is asked.
 *
 * `createClient` without a `chains` option sets exactly one — Ethereum
 * mainnet — and `executeSteps` opens with
 * `client.chains.find((c) => c.id === chainId)`, throwing the bare string
 * `Unable to find chain: Chain id 8453` when it misses. So every deposit from
 * anywhere but mainnet failed, after the quote had been minted and the intent
 * written: Relay showed an order, the browser showed an error, and nothing was
 * ever sent. Solana failed the same way.
 *
 * Fetched once and awaited before the first execute rather than fired off at
 * module scope, because a deposit that starts before the fetch lands is the
 * same bug with a race in front of it. A failure clears the memo so the next
 * attempt tries again instead of inheriting a rejected promise forever.
 */
let chains: Promise<unknown> | null = null;
const relayChainsReady = (): Promise<unknown> => {
  chains ??= configureDynamicChains().catch((err: unknown) => {
    chains = null;
    throw err;
  });
  return chains;
};

/**
 * What the connected wallet holds of the token somebody picked.
 *
 * Solana only, read straight from the chain, because our API has no opinion on
 * a wallet that is not an account we keep. `undefined` is a balance nobody
 * could read and it is not zero — the panel has to tell those apart, which is
 * the lesson `FundFromWallet` records about showing "Balance: 0" against a
 * wallet holding 5.69.
 *
 * An EVM balance is the wallet's own business: AppKit shows it in its account
 * view and reading twelve chains ourselves would be a dozen RPC endpoints to
 * keep working for a number the user already has.
 */
export const useFunderBalance = (owner: string | undefined, mint: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ["funder-token", owner, mint],
    enabled: enabled && owner !== undefined && mint !== undefined,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    queryFn: () => (mint === NATIVE_SOL ? solBalanceRaw(owner!) : tokenBalanceRaw(owner!, mint!)),
  });

interface SwapBuild {
  readonly intentId: string;
  readonly quote: unknown;
  readonly in: { readonly amountFormatted: string; readonly symbol: string };
  readonly out: { readonly amountFormatted: string; readonly symbol: string };
  readonly impactPct: string | null;
}

export interface SwapReceipt {
  readonly outFormatted: string;
  readonly inTxHash: string | null;
  readonly outTxHash: string | null;
}

/** What AppKit's Solana provider gives us, which is all `adaptSolanaWallet` needs. */
interface SolanaProvider {
  signAndSendTransaction(
    transaction: VersionedTransaction,
    options?: SendOptions,
  ): Promise<{ signature: string }>;
}

/**
 * Deposit from the connected wallet, whichever chain it is on.
 *
 * One path for every VM, which is the point of all of this. The server mints
 * the quote — `recipient`, `refundTo` and the origin pair are ours, and a page
 * that fetched its own would control all three — and Relay's `execute()` runs
 * whatever steps that quote contains: an approval and a deposit on an EVM
 * chain, one swap on Solana, in the right order, without this file knowing
 * which.
 *
 * What comes back is reported to `/v1/money/fund/submitted`, which records the
 * hashes and nothing else. It cannot mark the deposit successful and should
 * not be able to: on a cross-chain route the user's transaction is the first
 * of two legs, and the leg that delivers the money is one they never signed.
 * Relay settles it, over a signed webhook.
 */
export const useFundSwapAction = () => {
  const qc = useQueryClient();
  const funder = useFunder();
  const { data: evmWallet } = useWalletClient();
  const { walletProvider } = useAppKitProvider<SolanaProvider>("solana");

  const action = useMutation<SwapReceipt, Error, { currency: string; amountRaw: string }>({
    mutationFn: async (input) => {
      if (funder === null) throw new Error("Connect a wallet to pay from first.");

      const built = await apiFetch<SwapBuild>("/v1/money/fund/swap", {
        method: "POST",
        body: JSON.stringify({ ...input, chainId: funder.chainId, from: funder.address }),
      });

      const wallet: AdaptedWallet | NonNullable<typeof evmWallet> =
        funder.vmType === "evm"
          ? (() => {
              if (evmWallet === undefined) throw new Error("Your wallet is not ready to sign yet.");
              return evmWallet;
            })()
          : adaptSolanaWallet(
              funder.address,
              SOLANA_CHAIN_ID,
              new Connection(SOLANA_RPC_URL),
              async (transaction, options) => {
                if (walletProvider === undefined) {
                  throw new Error("Your wallet is not ready to sign yet.");
                }
                return walletProvider.signAndSendTransaction(transaction, options);
              },
            );

      /* Before execute, never after: the chain lookup is the first thing it
         does, and it throws rather than waits. */
      await relayChainsReady();

      const hashes: { in: string | null; out: string | null } = { in: null, out: null };
      await execute({
        quote: built.quote as Parameters<typeof execute>[0]["quote"],
        wallet,
        onProgress: (progress) => {
          /* Relay reports the origin leg first and the fill second. Kept as
             they arrive so a failure still leaves something to look up. */
          const txs = progress.txHashes ?? [];
          hashes.in = txs[0]?.txHash ?? hashes.in;
          hashes.out = txs[1]?.txHash ?? hashes.out;
        },
      });

      /*
       * Reported, not asserted. A failure here leaves the deposit at
       * `waiting`, which the poller and the webhook both still settle — the
       * money is on chain either way and our record catches up.
       */
      await apiFetch("/v1/money/fund/submitted", {
        method: "POST",
        body: JSON.stringify({
          intentId: built.intentId,
          ...(hashes.in === null ? {} : { inTxHash: hashes.in }),
          ...(hashes.out === null ? {} : { outTxHash: hashes.out }),
        }),
      }).catch((err: unknown) => {
        console.error("fund: could not report the deposit", err);
      });

      return { outFormatted: built.out.amountFormatted, inTxHash: hashes.in, outTxHash: hashes.out };
    },
    /*
     * The raw error, kept where a developer can see it.
     *
     * What the interface shows is one sentence from fund-error.ts; this is the
     * object it was read out of — the request arguments, the cause chain, the
     * revert data. A deposit that fails for an unanticipated reason is exactly
     * the case where "please try again" is not enough to act on.
     */
    onError: (err) => {
      console.error("fund: the deposit did not go through", err);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["funder-token"] });
      void qc.invalidateQueries({ queryKey: ["fund-intents"] });
      refreshAfterChain(qc);
    },
  });

  return { ...action, walletReady: funder !== null };
};
