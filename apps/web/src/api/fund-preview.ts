import { useQuery } from "@tanstack/react-query";
import { SOLANA_CHAIN_ID } from "../wallet/chains";
import { USDC_MINT } from "@mercury/chain";
import type { FundToken } from "./fund-tokens";

/** What a deposit of this amount would come to, before anybody signs. */
export interface FundPreview {
  /** USDC that arrives, as Relay formats it: "24.972499". */
  readonly outAmount: string;
  /** Relay's own fee, taken out of the amount, in dollars. */
  readonly relayFeeUsd: number;
  /** Mercury's fee, taken out of the amount the same way, in dollars. Zero when none is owed. */
  readonly mercuryFeeUsd: number;
  /** The origin chain's network fee, paid by the wallet on top, in dollars. */
  readonly networkFeeUsd: number;
}

/** Too small for Relay to route at all: worth saying, not worth calling an error. */
export class TooSmall extends Error {}

const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

/*
 * Somebody to quote for when no wallet is attached yet: Relay needs a `user`
 * to build a quote, and the figure does not depend on who it is. A burn
 * address on EVM; on Solana, the account receiving it.
 */
const ANYONE_EVM = "0x000000000000000000000000000000000000dEaD";

export interface FundPreviewInput {
  readonly chainId: number;
  readonly currency: string;
  readonly vmType: string;
  readonly amountRaw: bigint | null;
  readonly user: string | undefined;
  readonly recipient: string | undefined;
  /**
   * Mercury's fee on this token, exactly as `/v1/money/fund/tokens` gave it.
   * Null, or absent from a server older than the fee: none is charged.
   */
  readonly appFee?: FundToken["appFee"];
}

/**
 * The question put to Relay. The same one the server asks when it mints the
 * quote that is signed, fee included — otherwise the preview would promise
 * more than lands.
 */
export const previewBody = (input: FundPreviewInput): Record<string, unknown> => ({
  user: input.user ?? (input.vmType === "evm" ? ANYONE_EVM : input.recipient!),
  originChainId: input.chainId,
  destinationChainId: SOLANA_CHAIN_ID,
  originCurrency: input.currency,
  destinationCurrency: USDC_MINT,
  amount: input.amountRaw!.toString(),
  tradeType: "EXACT_INPUT",
  recipient: input.recipient,
  ...(input.appFee == null
    ? {}
    : { appFees: [{ recipient: input.appFee.recipient, fee: String(input.appFee.bps) }] }),
});

interface RelayPreview {
  errorCode?: string;
  message?: string;
  fees?: Record<string, { amountUsd?: string } | undefined>;
  details?: { currencyOut?: { amountFormatted?: string } };
}

/* Relay's answer, as the summary reads it: each party's fee by name, never summed into one. */
export const previewFrom = (body: RelayPreview): FundPreview => ({
  outAmount: body.details?.currencyOut?.amountFormatted ?? "0",
  relayFeeUsd: num(body.fees?.["relayer"]?.amountUsd),
  mercuryFeeUsd: num(body.fees?.["app"]?.amountUsd),
  networkFeeUsd: num(body.fees?.["gas"]?.amountUsd),
});

/**
 * The deposit, quoted, while somebody is still deciding the amount.
 *
 * Asked of Relay directly, like the price: its quote endpoint is public and
 * open to browsers. This is a preview and nothing more — the quote the wallet
 * signs is minted by our server at the moment of the deposit, with our
 * recipient and refund address in it, and Relay prices that one afresh.
 */
export const useFundPreview = (input: FundPreviewInput) =>
  useQuery<FundPreview>({
    queryKey: [
      "fund-preview",
      input.chainId,
      input.currency,
      input.amountRaw?.toString(),
      input.user,
      input.recipient,
      input.appFee?.bps ?? 0,
    ],
    enabled: input.amountRaw !== null && input.amountRaw > 0n && input.recipient !== undefined,
    staleTime: 20_000,
    refetchInterval: 30_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const res = await fetch("https://api.relay.link/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal,
        body: JSON.stringify(previewBody(input)),
      });
      const body = (await res.json()) as RelayPreview;
      if (!res.ok || body.details?.currencyOut?.amountFormatted === undefined) {
        if (body.errorCode === "AMOUNT_TOO_LOW") throw new TooSmall(body.message ?? "Too small");
        throw new Error(body.message ?? `relay quote ${res.status}`);
      }
      return previewFrom(body);
    },
  });
