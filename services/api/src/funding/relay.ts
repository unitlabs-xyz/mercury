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

export interface SwapQuote {
  readonly requestId: string;
  /** Solana only. Composed into one transaction the funder signs. */
  readonly instructions: readonly RelayWireInstruction[];
  readonly lookupTables: readonly string[];
  readonly inFormatted: string;
  readonly outRaw: string;
  readonly outFormatted: string;
  /** Signed percentage, as Relay reports it. Negative is a loss to the user. */
  readonly impactPct: string | null;
  readonly vmType: "svm";
}

export interface RelayClient {
  chains(): Promise<readonly RelaySource[]>;
  depositAddressQuote(input: DepositAddressInput): Promise<DepositAddressQuote>;
  /**
   * An executable quote for a wallet somebody has connected.
   *
   * Solana origin only, and the refusal is explicit rather than a surprise
   * further down: Relay answers an EVM origin with calldata and a Bitcoin one
   * with a PSBT, neither of which this server can compose or submit. Those
   * need a wallet stack in the browser, which is a later phase; until then
   * they go through a deposit address, which needs no wallet at all.
   */
  swapQuote(input: SwapQuoteInput): Promise<SwapQuote>;
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

    async swapQuote(input) {
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
        }),
      })) as {
        readonly requestId?: string;
        readonly steps?: readonly {
          readonly id?: string;
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

      const data = body.steps?.flatMap((step) => step.items ?? []).find((it) => it.data?.instructions);
      const instructions = data?.data?.instructions;
      /*
       * No instructions means Relay answered in another VM's idiom — calldata
       * for an EVM origin, a PSBT for Bitcoin. Refusing here keeps the failure
       * legible; composing it would produce a transaction with nothing in it.
       */
      if (body.requestId === undefined || instructions === undefined || instructions.length === 0) {
        throw new Error("relay returned no Solana instructions for this route");
      }

      return {
        requestId: body.requestId,
        instructions,
        lookupTables: data?.data?.addressLookupTableAddresses ?? [],
        inFormatted: body.details?.currencyIn?.amountFormatted ?? input.amountRaw,
        outRaw: body.details?.currencyOut?.amount ?? "0",
        outFormatted: body.details?.currencyOut?.amountFormatted ?? "0",
        impactPct: body.details?.totalImpact?.percent ?? null,
        vmType: "svm",
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
