import { useQueries, useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { erc20Abi } from "viem";
import { useReadContracts } from "wagmi";
import { tokenAmount } from "@mercury/view";
import type { FundChain } from "../app/money/fund-chain";
import { CONNECTABLE_CHAIN_IDS, SOLANA_CHAIN_ID } from "../wallet/chains";
import type { Funder } from "../wallet/funder";
import { SOL_NATIVE, walletHoldings } from "../solana/rpc";
import { fetchRelayPrice } from "./fund-price";
import type { FundToken } from "./fund-tokens";
import { NATIVE_EVM } from "./fund-swap";

/**
 * What the connected wallet already holds, as rows the picker can raise to
 * the top — each with its amount and, where it can be priced, its dollar
 * value, so the list opens on what somebody can actually send.
 *
 * Wallet-side code: it imports wagmi, so it lives behind the same lazy
 * boundary as the rest of the funding panel and nothing eager may import it.
 */

export interface Held {
  readonly token: FundToken;
  readonly amount: bigint;
  /** "1.25", in the token's own units. */
  readonly amountText: string;
  /** Dollars, or null when the token has no price. */
  readonly usd: number | null;
}

/** Multicall3, deployed at the same address on every chain we connect to. */
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
const getEthBalanceAbi = [
  {
    type: "function",
    name: "getEthBalance",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
] as const;

const keyOf = (t: { chainId: number; address: string }) => `${t.chainId}:${t.address.toLowerCase()}`;

/** A Relay token, by address, kept only if Relay calls it verified — the same rule the server applies. */
const relayToken = async (chainId: number, address: string, signal: AbortSignal) => {
  const res = await fetch("https://api.relay.link/currencies/v2", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chainIds: [chainId], address, limit: 1, verifiedOnly: true }),
    signal,
  });
  if (!res.ok) throw new Error(`relay currencies ${res.status}`);
  const [hit] = (await res.json()) as {
    address?: string;
    symbol?: string;
    name?: string;
    decimals?: number;
    metadata?: { logoURI?: string; verified?: boolean };
  }[];
  return hit?.metadata?.verified === true &&
    typeof hit.symbol === "string" &&
    typeof hit.decimals === "number"
    ? {
        symbol: hit.symbol,
        name: hit.name ?? hit.symbol,
        decimals: hit.decimals,
        logoUrl: hit.metadata.logoURI ?? null,
      }
    : null;
};

/** At most this many off-list tokens are looked up: a wallet's long tail is mostly airdropped noise. */
const LOOKUP_CAP = 30;

export const useHeldTokens = (
  funder: Funder | null,
  rows: readonly FundToken[],
  chains: readonly FundChain[],
): readonly Held[] => {
  const svm = funder?.vmType === "svm" ? funder.address : undefined;
  const evm = funder?.vmType === "evm" ? (funder.address as `0x${string}`) : undefined;
  const solana = chains.find((c) => c.chainId === SOLANA_CHAIN_ID);

  /* The listed Solana mints, for the endpoint that cannot list a wallet. Read
     at fetch time, so the query is keyed by the wallet alone. */
  const known = useRef<string[]>([]);
  known.current = rows.filter((r) => r.chainId === SOLANA_CHAIN_ID).map((r) => r.address);

  const holdings = useQuery({
    queryKey: ["svm-holdings", svm],
    enabled: svm !== undefined,
    staleTime: 30_000,
    queryFn: () => walletHoldings(svm!, known.current),
  });

  /* Solana holdings that are not rows yet, named through Relay's index. */
  const listed = new Map(rows.map((r) => [keyOf(r), r]));
  const unnamed = (holdings.data ?? [])
    .filter((h) => !listed.has(keyOf({ chainId: SOLANA_CHAIN_ID, address: h.mint })))
    .slice(0, LOOKUP_CAP);
  const named = useQueries({
    queries: unnamed.map((h) => ({
      queryKey: ["relay-token", SOLANA_CHAIN_ID, h.mint],
      staleTime: 60 * 60_000,
      retry: false,
      queryFn: ({ signal }: { signal: AbortSignal }) => relayToken(SOLANA_CHAIN_ID, h.mint, signal),
    })),
  });

  /* EVM: the listed tokens on the chains we connect to, read in one multicall per chain. */
  const evmRows =
    evm === undefined ? [] : rows.filter((r) => r.vmType === "evm" && CONNECTABLE_CHAIN_IDS.has(r.chainId));
  const balances = useReadContracts({
    allowFailure: true,
    contracts: evmRows.map((r) =>
      r.address === NATIVE_EVM
        ? ({
            address: MULTICALL3,
            abi: getEthBalanceAbi,
            functionName: "getEthBalance",
            args: [evm!],
            chainId: r.chainId,
          } as const)
        : ({
            address: r.address as `0x${string}`,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [evm!],
            chainId: r.chainId,
          } as const),
    ),
    query: { enabled: evm !== undefined && evmRows.length > 0, staleTime: 30_000 },
  });

  const found: { token: FundToken; amount: bigint }[] = [];
  if (svm !== undefined && solana !== undefined) {
    const extra = new Map(unnamed.map((h, i) => [h.mint, named[i]?.data ?? null]));
    for (const h of holdings.data ?? []) {
      const row = listed.get(keyOf({ chainId: SOLANA_CHAIN_ID, address: h.mint }));
      const meta = extra.get(h.mint);
      const token: FundToken | null =
        row ??
        (meta === undefined || meta === null
          ? null
          : {
              chainId: SOLANA_CHAIN_ID,
              chainName: solana.name,
              chainIconUrl: solana.iconUrl,
              vmType: "svm",
              address: h.mint,
              ...meta,
            });
      if (token !== null) found.push({ token, amount: h.amount });
    }
  }
  evmRows.forEach((r, i) => {
    const result = balances.data?.[i];
    if (result?.status === "success" && typeof result.result === "bigint" && result.result > 0n) {
      found.push({ token: r, amount: result.result });
    }
  });

  const prices = useQueries({
    queries: found.map(({ token }) => ({
      queryKey: ["fund-price", token.chainId, token.address],
      staleTime: 30_000,
      retry: 1,
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchRelayPrice(token.chainId, token.address, signal),
    })),
  });

  return found
    .map(({ token, amount }, i) => {
      const decimals = token.address === SOL_NATIVE ? 9 : token.decimals;
      const price = prices[i]?.data ?? null;
      const units = Number(tokenAmount(amount.toString(), decimals));
      return {
        token,
        amount,
        amountText: tokenAmount(amount.toString(), decimals),
        usd: price === null || !Number.isFinite(units) ? null : units * price,
      };
    })
    .sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1));
};
