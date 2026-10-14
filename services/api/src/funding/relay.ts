import { defaultFetch } from "@mercury/chain";

/**
 * Relay, as the funding path uses it.
 *
 * Hand-rolled over `fetch` rather than `@relayprotocol/relay-sdk`, which
 * carries viem and five megabytes to perform two HTTP calls. The SDK earns its
 * place in the browser, where `execute()` drives a wallet through a quote's
 * steps; here there is no wallet and no execution. The same reasoning
 * `packages/chain/src/jupiter/lite.ts` already follows.
 */

const BASE = "https://api.relay.link";

/** Where every deposit lands. Fixed here so no caller can redirect it. */
export const SOLANA_CHAIN_ID = 792703809;
export const SOLANA_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export interface RelayCurrency {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly address: string;
  readonly decimals: number;
}

export interface RelaySource {
  readonly chainId: number;
  readonly name: string;
  readonly vmType: string;
  readonly currencies: readonly RelayCurrency[];
}

/** Relay's own vocabulary, carried through rather than mapped. */
export type RelayStatus =
  "waiting" | "depositing" | "pending" | "submitted" | "success" | "failure" | "refund";

/** What a quote is worth, whichever VM executes it. */
export interface QuoteDetails {
  readonly requestId: string;
  readonly inFormatted: string;
  readonly outRaw: string;
  readonly outFormatted: string;
  /** Signed percentage, as Relay reports it. Negative is a loss to the user. */
  readonly impactPct: string | null;
}

/**
 * A quote, passed through for the browser to run through Relay's `execute()`.
 *
 * One shape for every VM, which is the point. This server briefly composed the
 * Solana case itself — it can, because a Solana quote arrives as instructions —
 * and that bought a second code path, a second set of tests and a per-VM branch
 * in the route, for a safety property the passthrough already has: the
 * destination is encoded in bytes Relay produced, and a client that re-quoted
 * to its own wallet would be funding its own account with its own money while
 * the intent we recorded never completed.
 */
export interface FundQuote {
  readonly details: QuoteDetails;
  /** Relay's own response, unread and unmodified. */
  readonly quote: unknown;
}

export interface FundQuoteInput {
  /** The connected wallet. Signs, and pays its own network fee. */
  readonly user: string;
  /** The Privy wallet the USDC lands in. Ours to set, never the page's. */
  readonly recipient: string;
  readonly originChainId: number;
  readonly originCurrency: string;
  /** In the origin token's own smallest unit. */
  readonly amountRaw: string;
}

export interface RelayClient {
  chains(): Promise<readonly RelaySource[]>;
  /**
   * An executable quote for a wallet somebody has connected.
   *
   * Solana and EVM alike. A Bitcoin origin would come back as a PSBT and is
   * not offered — `/v1/money/fund/sources` does not report it.
   */
  fundQuote(input: FundQuoteInput): Promise<FundQuote>;
  status(requestId: string): Promise<RelayStatus | null>;
}

interface WireChain {
  readonly id?: number;
  readonly name?: string;
  readonly vmType?: string;
  readonly depositEnabled?: boolean;
  readonly currency?: (RelayCurrency & { readonly supportsBridging?: boolean }) | undefined;
  readonly solverCurrencies?: readonly RelayCurrency[];
}

/**
 * Everything on this chain somebody can deposit.
 *
 * The union of the native currency and the solver currencies, because the two
 * lists do not agree with each other: Solana reports SOL under `currency` and
 * omits it from `solverCurrencies`, while Eclipse lists its native ETH in both.
 * De-duplicated by address so the chain that lists it twice does not offer it
 * twice.
 *
 * Only currencies Relay will actually solve, and the native one only when it
 * says it can be bridged.
 */
const currenciesOf = (chain: WireChain): readonly RelayCurrency[] => {
  const native = chain.currency;
  const all = [
    ...(native !== undefined && native.supportsBridging === true ? [native] : []),
    ...(chain.solverCurrencies ?? []),
  ];
  const seen = new Set<string>();
  return all.filter((c) => (seen.has(c.address) ? false : (seen.add(c.address), true)));
};

export const createRelayClient = (config: {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}): RelayClient => {
  const base = config.baseUrl ?? BASE;
  const doFetch = config.fetch ?? defaultFetch();

  /*
   * The key goes in a header and never in a URL. A URL reaches logs, proxy
   * access records and error reports; a header does not.
   */
  const call = async (path: string, init?: RequestInit): Promise<unknown> => {
    const res = await doFetch(`${base}${path}`, {
      ...init,
      headers: { "content-type": "application/json", "x-api-key": config.apiKey },
    });
    if (!res.ok) {
      /* The body, not the key, and clipped: Relay's errors are readable and its 500s are not. */
      const detail = await res.text().catch(() => "");
      throw new Error(`relay ${path} failed: ${res.status} ${detail.slice(0, 200)}`);
    }
    return res.json();
  };

  return {
    async chains() {
      const body = (await call("/chains")) as { readonly chains?: readonly WireChain[] };
      return (body.chains ?? [])
        .filter((c): c is WireChain & { id: number } => c.depositEnabled === true && typeof c.id === "number")
        .map((c) => ({
          chainId: c.id,
          name: c.name ?? String(c.id),
          vmType: c.vmType ?? "evm",
          currencies: currenciesOf(c),
        }))
        .filter((c) => c.currencies.length > 0);
    },

    async fundQuote(input) {
      const body = (await call("/quote/v2", {
        method: "POST",
        body: JSON.stringify({
          user: input.user,
          recipient: input.recipient,
          originChainId: input.originChainId,
          originCurrency: input.originCurrency,
          destinationChainId: SOLANA_CHAIN_ID,
          destinationCurrency: SOLANA_USDC,
          amount: input.amountRaw,
          tradeType: "EXACT_INPUT",
          /*
           * The sender's own wallet, which is why there is no treasury. A
           * refund only has to reach an address somebody holds the key for,
           * and every deposit now comes from a wallet that has just signed —
           * in the right format for its own chain, because that is the chain
           * they connected on.
           */
          refundTo: input.user,
        }),
      })) as {
        readonly requestId?: string;
        readonly details?: {
          readonly currencyIn?: { readonly amountFormatted?: string };
          readonly currencyOut?: { readonly amount?: string; readonly amountFormatted?: string };
          readonly totalImpact?: { readonly percent?: string };
        };
      };

      if (body.requestId === undefined) throw new Error("relay returned no quote for this route");

      return {
        details: {
          requestId: body.requestId,
          inFormatted: body.details?.currencyIn?.amountFormatted ?? input.amountRaw,
          outRaw: body.details?.currencyOut?.amount ?? "0",
          outFormatted: body.details?.currencyOut?.amountFormatted ?? "0",
          impactPct: body.details?.totalImpact?.percent ?? null,
        },
        quote: body,
      };
    },

    async status(requestId) {
      const body = (await call(`/intents/status/v3?requestId=${encodeURIComponent(requestId)}`)) as {
        readonly status?: RelayStatus;
      };
      return body.status ?? null;
    },
  };
};
