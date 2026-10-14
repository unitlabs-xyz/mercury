import { defaultFetch } from "@mercury/chain";
import type { RelayWireInstruction } from "./compose.js";

/**
 * Relay, as the funding path uses it.
 *
 * Hand-rolled over `fetch` rather than `@relayprotocol/relay-sdk`, which
 * carries viem and five megabytes to perform one POST. The SDK earns its place
 * in the browser, where `execute()` drives a wallet through a quote's steps;
 * here there is no wallet and no execution, only three HTTP calls. The same
 * reasoning `packages/chain/src/jupiter/lite.ts` already follows.
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

export interface DepositAddressQuote {
  readonly requestId: string;
  readonly depositAddress: string;
  /** What Relay expects to deliver, in USDC base units. Indicative, not a promise. */
  readonly quotedOutRaw: string | null;
}

/** Relay's own vocabulary, carried through rather than mapped. */
export type RelayStatus =
  "waiting" | "depositing" | "pending" | "submitted" | "success" | "failure" | "refund";

export interface DepositAddressInput {
  readonly originChainId: number;
  readonly originCurrency: string;
  /** The user's Privy wallet, from a Privy-signed token. Never a request body. */
  readonly recipient: string;
  /**
   * Where Relay sends an automatic refund, and where we withdraw from their
   * depository. Both optional, and absent rather than wrong on purpose.
   *
   * Relay reports eight VM families across the 61 chains it will take deposits
   * from — `evm`, `svm`, `bvm`, `hypevm`, `lvm`, `tvm`, `tonvm`, `xrpvm` — and
   * an address is only meaningful inside its own family. We hold keys for
   * three. For the rest, omitting these turns automatic refunds off and leaves
   * a failed deposit to Relay's support, which is bad; sending an address in
   * the wrong format would have Relay refund into nothing, which is worse and
   * silent. See ADR 0015 — the whole point is that we never name an address we
   * cannot stand behind.
   */
  readonly refundTo?: string | undefined;
  readonly recoveryAddress?: string | undefined;
}

export interface SwapQuoteInput {
  /** The connected wallet. Signs and pays its own network fee. */
  readonly user: string;
  /** The Privy wallet the USDC lands in. Ours to set, never the page's. */
  readonly recipient: string;
  readonly originChainId: number;
  readonly originCurrency: string;
  /** In the origin token's own smallest unit. */
  readonly amountRaw: string;
}

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
 * A quote, in the shape its own VM can execute.
 *
 * Solana arrives as instructions this server composes into one transaction,
 * because it can: the funder signs a message we built, so `recipient` is ours
 * and not the page's.
 *
 * An EVM quote arrives as calldata against Relay's own contracts, which this
 * server cannot compose and has no reason to — the destination is already
 * encoded in those bytes by the party that will honour it. So the quote passes
 * through verbatim for the browser to run through Relay's `execute()`. A client
 * that substituted its own quote would be funding its own account with its own
 * money, and the intent we recorded would simply never complete.
 */
export type FundQuote =
  | {
      readonly kind: "svm";
      readonly details: QuoteDetails;
      readonly instructions: readonly RelayWireInstruction[];
      readonly lookupTables: readonly string[];
    }
  | {
      readonly kind: "evm";
      readonly details: QuoteDetails;
      /** Relay's own response, unread and unmodified, for `execute()`. */
      readonly quote: unknown;
    };

export interface RelayClient {
  chains(): Promise<readonly RelaySource[]>;
  depositAddressQuote(input: DepositAddressInput): Promise<DepositAddressQuote>;
  /**
   * An executable quote for a wallet somebody has connected.
   *
   * Solana and EVM. A Bitcoin origin would come back as a PSBT and is not
   * offered — `/v1/money/fund/sources` does not report it.
   */
  fundQuote(input: SwapQuoteInput): Promise<FundQuote>;
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
 * Only currencies Relay will actually solve. A token sent to a deposit address
 * that Relay does not solve is, by their own documentation, unrecoverable — so
 * the only safe list is the one they gave us, and the native currency joins it
 * only when it says it can be bridged.
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

    async depositAddressQuote(input) {
      const body = (await call("/quote/v2", {
        method: "POST",
        body: JSON.stringify({
          originChainId: input.originChainId,
          originCurrency: input.originCurrency,
          destinationChainId: SOLANA_CHAIN_ID,
          destinationCurrency: SOLANA_USDC,
          recipient: input.recipient,
          tradeType: "EXACT_INPUT",
          useDepositAddress: true,
          /* Spread rather than assigned: `exactOptionalPropertyTypes` tells an
             absent field from one set to undefined, and so does Relay. */
          ...(input.refundTo === undefined ? {} : { refundTo: input.refundTo }),
          ...(input.recoveryAddress === undefined ? {} : { recoveryAddress: input.recoveryAddress }),
        }),
      })) as {
        readonly requestId?: string;
        readonly steps?: readonly { readonly depositAddress?: string }[];
        readonly details?: { readonly currencyOut?: { readonly amount?: string } };
      };

      const depositAddress = body.steps?.find((s) => s.depositAddress !== undefined)?.depositAddress;
      /*
       * A quote with no address is not a degraded quote, it is a different
       * answer to a different question — almost always `useDepositAddress`
       * being silently refused for the route. Showing the user nothing is
       * better than showing them an address that is not theirs to send to.
       */
      if (body.requestId === undefined || depositAddress === undefined) {
        throw new Error("relay returned no deposit address for this route");
      }
      return {
        requestId: body.requestId,
        depositAddress,
        quotedOutRaw: body.details?.currencyOut?.amount ?? null,
      };
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
           * The sender's own wallet, which is the whole reason the treasury
           * went away. A refund only has to reach an address somebody holds
           * the key for, and when every deposit comes from a connected wallet
           * that address is the one that just signed — correct by
           * construction, and in the right format for its own chain because
           * that is the chain they connected on.
           */
          refundTo: input.user,
        }),
      })) as {
        readonly requestId?: string;
        readonly steps?: readonly {
          readonly items?: readonly {
            readonly data?: {
              readonly instructions?: readonly RelayWireInstruction[];
              readonly addressLookupTableAddresses?: readonly string[];
            };
          }[];
        }[];
        readonly details?: {
          readonly currencyIn?: { readonly amountFormatted?: string };
          readonly currencyOut?: { readonly amount?: string; readonly amountFormatted?: string };
          readonly totalImpact?: { readonly percent?: string };
        };
      };

      if (body.requestId === undefined) throw new Error("relay returned no quote for this route");

      const details: QuoteDetails = {
        requestId: body.requestId,
        inFormatted: body.details?.currencyIn?.amountFormatted ?? input.amountRaw,
        outRaw: body.details?.currencyOut?.amount ?? "0",
        outFormatted: body.details?.currencyOut?.amountFormatted ?? "0",
        impactPct: body.details?.totalImpact?.percent ?? null,
      };

      /* Instructions mean a Solana origin, whatever the caller believed. Read
         off the answer rather than the request, because Relay decides. */
      const svm = body.steps?.flatMap((step) => step.items ?? []).find((it) => it.data?.instructions);
      const instructions = svm?.data?.instructions;
      if (instructions !== undefined && instructions.length > 0) {
        return {
          kind: "svm",
          details,
          instructions,
          lookupTables: svm?.data?.addressLookupTableAddresses ?? [],
        };
      }

      return { kind: "evm", details, quote: body };
    },

    async status(requestId) {
      const body = (await call(`/intents/status/v3?requestId=${encodeURIComponent(requestId)}`)) as {
        readonly status?: RelayStatus;
      };
      return body.status ?? null;
    },
  };
};
