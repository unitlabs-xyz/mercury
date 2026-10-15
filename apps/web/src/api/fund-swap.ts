import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { useAppKitProvider } from "@reown/appkit/react";
import { useBalance, useConfig, useReadContract } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import { erc20Abi } from "viem";
import { createClient, execute, MAINNET_RELAY_API, type AdaptedWallet } from "@relayprotocol/relay-sdk";
import { configureDynamicChains } from "@relayprotocol/relay-sdk/chain-utils";
import { adaptSolanaWallet } from "@relayprotocol/relay-svm-wallet-adapter";
import { Connection, type SendOptions, type VersionedTransaction } from "@solana/web3.js";
import { apiFetch } from "./client";
import { SOLANA_RPC_URL, solBalanceRaw, tokenBalanceRaw } from "../solana/rpc";
import { SOLANA_CHAIN_ID } from "../wallet/chains";
import { vmOfChain } from "../wallet/funder";
import { useFunderForChain, useSwitchFunderChain } from "../wallet/useFunder";
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

/** A refetch for a VM with nothing to read. Module scope, so its identity is fixed. */
const noop = () => {};

/** Relay's address for a chain's own coin, on every EVM chain it lists. */
export const NATIVE_EVM = "0x0000000000000000000000000000000000000000";

/**
 * What the connected wallet holds of the token somebody picked.
 *
 * Both VMs now. It used to be Solana only, on the reasoning that an EVM
 * balance was the wallet's own business and reading a dozen chains meant a
 * dozen RPC endpoints to keep working. That reasoning had a hole in it: with
 * no balance here, typing more than the wallet holds produced a signed
 * transaction that reverted on chain — gas spent, nothing moved, and an error
 * that could not say why. wagmi already holds a client for each chain we
 * declare, so the read costs no infrastructure we did not have.
 *
 * `undefined` is a balance nobody could read and it is not zero. Treating the
 * two alike is what showed "Balance: 0" against a wallet holding 5.69, which
 * `FundFromWallet` records; a disabled button would now be the same mistake
 * with the stakes the other way up.
 */
export const useFunderBalance = (
  owner: string | undefined,
  mint: string | undefined,
  vmType: string,
  chainId: number,
): {
  readonly data: bigint | undefined;
  readonly isPending: boolean;
  readonly refetch: () => void;
} => {
  const svm = vmType === "svm";
  const evm = vmType === "evm";

  const solana = useQuery({
    queryKey: ["funder-token", owner, mint],
    enabled: svm && owner !== undefined && mint !== undefined,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    queryFn: () => (mint === NATIVE_SOL ? solBalanceRaw(owner!) : tokenBalanceRaw(owner!, mint!)),
  });

  /*
   * Two reads, one of which is always idle.
   *
   * Hooks cannot be conditional, so the native and the ERC-20 read are both
   * declared and `enabled` decides which runs. A token's own contract knows
   * nothing about the chain's coin and there is no one call that answers both.
   */
  const native = useBalance({
    address: owner as `0x${string}` | undefined,
    /*
     * The token's chain, not the wallet's.
     *
     * Without it wagmi reads whichever chain the wallet happens to be on, so a
     * wallet sitting on Ethereum while somebody looks at USDT on Base had
     * `balanceOf` called against the Base address on Ethereum — a number that
     * means nothing, shown as if it meant something. wagmi holds a client for
     * every chain we declare, so naming one costs nothing and the balance is
     * right wherever the wallet is pointed.
     */
    chainId,
    query: { enabled: evm && owner !== undefined && mint === NATIVE_EVM, staleTime: 10_000 },
  });

  const erc20 = useReadContract({
    abi: erc20Abi,
    address: mint as `0x${string}` | undefined,
    chainId,
    functionName: "balanceOf",
    args: owner === undefined ? undefined : [owner as `0x${string}`],
    query: {
      enabled: evm && owner !== undefined && mint !== undefined && mint !== NATIVE_EVM,
      staleTime: 10_000,
    },
  });

  /*
   * Stable identities, because a caller refetches from an effect.
   *
   * A fresh arrow per render makes that effect's dependency change on every
   * render, and an effect that refetches on every render refetches forever.
   * Hooks cannot be conditional, so all three are declared and the branch
   * below picks one.
   */
  const { refetch: solanaRefetch } = solana;
  const { refetch: nativeRefetch } = native;
  const { refetch: erc20Refetch } = erc20;
  const refetchSolana = useCallback(() => void solanaRefetch(), [solanaRefetch]);
  const refetchNative = useCallback(() => void nativeRefetch(), [nativeRefetch]);
  const refetchErc20 = useCallback(() => void erc20Refetch(), [erc20Refetch]);

  if (svm) return { data: solana.data, isPending: solana.isPending, refetch: refetchSolana };
  if (evm) {
    const read = mint === NATIVE_EVM ? native : erc20;
    return {
      data: mint === NATIVE_EVM ? native.data?.value : erc20.data,
      /* `isPending` is true on a query that is merely disabled, which would
         leave "Reading your wallet…" on screen forever. Only pending while
         actually in flight. */
      isPending: read.isLoading,
      /*
       * Its own refetch, rather than a query key for somebody else to
       * invalidate.
       *
       * The mutation used to clear `["funder-token"]` and call it done — our
       * Solana key, which wagmi's reads know nothing about. So after an EVM
       * deposit the balance on screen was the balance from before it, and the
       * only way to the truth was a reload. Handing back the refetch means
       * nothing has to know what wagmi calls its keys.
       */
      refetch: mint === NATIVE_EVM ? refetchNative : refetchErc20,
    };
  }
  return { data: undefined, isPending: false, refetch: noop };
};

/**
 * What the wallet holds of the coin the chain charges fees in.
 *
 * Separate from the balance above, and needed separately: a wallet with the
 * token and no gas signs a transaction that cannot be mined, which is the
 * other half of the revert. Only meaningful on EVM — a Solana fee comes out
 * of the SOL balance the panel already keeps back.
 */
export const useFunderGas = (
  owner: string | undefined,
  vmType: string,
  chainId: number,
): { readonly data: bigint | undefined; readonly refetch: () => void } => {
  const { data, refetch } = useBalance({
    address: owner as `0x${string}` | undefined,
    /* The chain that will charge the fee, which is the token's, not whichever
       one the wallet is on right now. */
    chainId,
    query: { enabled: vmType === "evm" && owner !== undefined, staleTime: 30_000 },
  });
  /* Stable, for the same reason as the balance above. */
  const stable = useCallback(() => void refetch(), [refetch]);
  return { data: vmType === "evm" ? data?.value : undefined, refetch: stable };
};

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
export const useFundSwapAction = (chainId: number) => {
  const qc = useQueryClient();
  /* The wallet that can sign on this token's own chain, not whichever one
     AppKit happens to have in front. */
  const funder = useFunderForChain(chainId);
  const config = useConfig();
  const switchChain = useSwitchFunderChain();
  const { walletProvider } = useAppKitProvider<SolanaProvider>("solana");

  /* Survives the throw that loses the receipt — see where it is set. */
  const lastHash = useRef<string | null>(null);

  const action = useMutation<SwapReceipt, Error, { chainId: number; currency: string; amountRaw: string }>({
    mutationFn: async (input) => {
      if (funder === null) {
        throw new Error(
          vmOfChain(chainId) === "svm"
            ? "Connect a Solana wallet to pay from first."
            : "Connect an Ethereum wallet to pay from first.",
        );
      }

      /*
       * The wallet and the token in the same namespace, checked rather than
       * assumed. The panel will not offer a mismatch, but this is the throw
       * that beats the alternative: a quote minted and an intent written for
       * a wallet that was never going to be able to sign it.
       *
       * `input.chainId` as well as the one this was built for, because a
       * render between the two would leave the funder belonging to the old.
       */
      if (input.chainId !== chainId || funder.vmType !== vmOfChain(input.chainId)) {
        throw new Error("That wallet cannot sign on the chain this token is on.");
      }

      /*
       * The chain comes from the token, not from where the wallet happens to
       * be, and the wallet is brought to it here rather than on a screen in
       * front of this one.
       *
       * The SDK will not do it. `adaptViemWallet` exposes a `switchChain`,
       * but nothing in `executeSteps` calls it — it polls `getChainId()` ten
       * times over 2.5 seconds and then throws `Current chain id: 1 does not
       * match expected chain id: 8453`. So the choice was never whether to
       * switch, only whether to make somebody do it before they could see
       * their balance or type an amount.
       */
      if (funder.vmType === "evm" && funder.chainId !== input.chainId) {
        await switchChain(input.chainId);
      }

      const built = await apiFetch<SwapBuild>("/v1/money/fund/swap", {
        method: "POST",
        body: JSON.stringify({ ...input, from: funder.address }),
      });

      /*
       * Fetched after the switch, not captured at render.
       *
       * A viem WalletClient carries the chain it was made for, and `execute()`
       * builds its transactions against that. The one this component rendered
       * with belongs to the chain the wallet was on a moment ago, so sending
       * through it after a switch produces a chain mismatch inside viem — the
       * switch would have worked and the deposit would still fail.
       */
      const wallet: AdaptedWallet | Awaited<ReturnType<typeof getWalletClient>> =
        funder.vmType === "evm"
          ? await getWalletClient(config, { chainId: input.chainId })
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

      /*
       * Kept outside the promise as well as in it.
       *
       * A revert throws the bare string `Transaction Reverted` and drops the
       * receipt, so the hash of the transaction that failed is lost with it —
       * and the hash is the whole answer. On chain it says which call reverted
       * and why; without it the interface can only repeat that something did.
       */
      lastHash.current = null;
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
          lastHash.current = hashes.in ?? lastHash.current;
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
        /*
         * A 404 here is the good outcome, not a failure.
         *
         * It means Relay settled the deposit over its webhook before the
         * browser finished reporting it — the money arrived faster than the
         * report — and `markSubmitted` will not touch a settled row. Logging
         * that at error level sends somebody looking for a bug in the one
         * case where everything worked.
         */
        const settled = err instanceof Error && /settled/i.test(err.message);
        if (settled) console.log("fund: already settled before we reported it");
        else console.error("fund: could not report the deposit", err);
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

  return { ...action, walletReady: funder !== null, failedTxHash: lastHash.current };
};
