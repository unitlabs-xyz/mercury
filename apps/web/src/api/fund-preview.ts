import { useQuery } from "@tanstack/react-query";
import { SOLANA_CHAIN_ID } from "../wallet/chains";
import { USDC_MINT } from "@mercury/chain";

/** What a deposit of this amount would come to, before anybody signs. */
export interface FundPreview {
  /** USDC that arrives, as Relay formats it: "24.972499". */
  readonly outAmount: string;
  /** Relay's own fee, taken out of the amount, in dollars. */
  readonly relayFeeUsd: number;
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

/**
 * The deposit, quoted, while somebody is still deciding the amount.
 *
 * Asked of Relay directly, like the price: its quote endpoint is public and
 * open to browsers. This is a preview and nothing more — the quote the wallet
 * signs is minted by our server at the moment of the deposit, with our
 * recipient and refund address in it, and Relay prices that one afresh.
 */
export const useFundPreview = (input: {
  readonly chainId: number;
  readonly currency: string;
  readonly vmType: string;
  readonly amountRaw: bigint | null;
  readonly user: string | undefined;
  readonly recipient: string | undefined;
}) =>
  useQuery<FundPreview>({
    queryKey: [
      "fund-preview",
      input.chainId,
      input.currency,
      input.amountRaw?.toString(),
      input.user,
      input.recipient,
    ],
    enabled: input.amountRaw !== null && input.amountRaw > 0n && input.recipient !== undefined,
    staleTime: 20_000,
    refetchInterval: 30_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const user = input.user ?? (input.vmType === "evm" ? ANYONE_EVM : input.recipient!);
      const res = await fetch("https://api.relay.link/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal,
        body: JSON.stringify({
          user,
          originChainId: input.chainId,
          destinationChainId: SOLANA_CHAIN_ID,
          originCurrency: input.currency,
          destinationCurrency: USDC_MINT,
          amount: input.amountRaw!.toString(),
          tradeType: "EXACT_INPUT",
          recipient: input.recipient,
        }),
      });
      const body = (await res.json()) as {
        errorCode?: string;
        message?: string;
        fees?: Record<string, { amountUsd?: string } | undefined>;
        details?: { currencyOut?: { amountFormatted?: string } };
      };
      if (!res.ok || body.details?.currencyOut?.amountFormatted === undefined) {
        if (body.errorCode === "AMOUNT_TOO_LOW") throw new TooSmall(body.message ?? "Too small");
        throw new Error(body.message ?? `relay quote ${res.status}`);
      }
      return {
        outAmount: body.details.currencyOut.amountFormatted,
        relayFeeUsd: num(body.fees?.["relayer"]?.amountUsd) + num(body.fees?.["app"]?.amountUsd),
        networkFeeUsd: num(body.fees?.["gas"]?.amountUsd),
      };
    },
  });
