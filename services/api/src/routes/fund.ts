import { Hono } from "hono";
import { logger } from "../log/index.js";
import { z } from "zod";
import { address as toAddress } from "@solana/kit";
import type { RelayClient, RelaySource } from "../funding/relay.js";
import { chainRank, isSupportedChain, SUPPORTED_CHAIN_IDS } from "../funding/chains.js";
import type { FundingStore } from "../funding/store.js";
import { depositFeeFor } from "../funding/fees.js";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";

export interface FundDeps {
  readonly relay: RelayClient;
  readonly store: FundingStore;
  /** What we will not quote below. Sent to the client so it is stated once. */
  readonly minimumUsd: number;
  /**
   * Mercury's fee on a deposit Relay has to swap. No recipient, no fee: see
   * `depositFeeFor`, which is the one place that decides who owes it.
   */
  readonly fee: { readonly bps: number; readonly recipient?: string | undefined };
}

const fail = (code: string, message: string) => ({ error: { code, message } });

const SwapBody = z.object({
  chainId: z.number().int(),
  currency: z.string().min(1),
  /** The origin token's own smallest unit, as digits. */
  amountRaw: z.string().regex(/^[1-9]\d{0,25}$/, "Enter an amount."),
  /** The connected wallet. See the comment where this is used. */
  from: z.string().min(32).max(64),
});

const SubmittedBody = z.object({
  intentId: z.string().uuid(),
  /** What the browser executed. Origin first, destination if it already has one. */
  inTxHash: z.string().min(8).max(128).optional(),
  outTxHash: z.string().min(8).max(128).optional(),
});

/** Chains change rarely and the list is large. Ten minutes is a deploy, not a session. */
const CHAINS_TTL_MS = 10 * 60_000;

const log = logger("fund");

export function fundRoutes(deps: FundDeps): Hono {
  const app = new Hono();

  let cached: { readonly at: number; readonly sources: readonly RelaySource[] } | null = null;
  const sources = async (): Promise<readonly RelaySource[]> => {
    const now = Date.now();
    if (cached !== null && now - cached.at < CHAINS_TTL_MS) return cached.sources;
    /*
     * Relay reports 61 chains; funding/chains.ts decides which we offer, and
     * the filter is here rather than in the browser so the set can be changed
     * by deploying the server. Bitcoin falls out of it by being absent from
     * that list — Relay will take a BTC deposit, but only to an address, and a
     * connected wallet would answer with a PSBT that nothing here signs.
     */
    const fresh = (await deps.relay.chains())
      .filter((c) => isSupportedChain(c.chainId))
      .sort((a, b) => chainRank(a.chainId) - chainRank(b.chainId));
    cached = { at: now, sources: fresh };
    return fresh;
  };

  /** The chain a token sits on, for naming it in a record and in the interface. */
  const chainOf = async (chainId: number): Promise<RelaySource | undefined> =>
    (await sources()).find((s) => s.chainId === chainId);

  /*
   * The chains we offer, for the filter row. One list, decided here — the
   * browser renders what it is given rather than holding a second opinion.
   *
   * Tokens are no longer part of this: they come from `/tokens` below, which
   * searches Relay's whole index instead of the short solver list `/chains`
   * carries, and is the only source that has artwork.
   */
  app.get("/v1/money/fund/sources", async (c) => {
    if (c.get("identity").walletAddress === null) {
      return c.json(fail("unauthorized", "No wallet on this session."), 401);
    }
    try {
      const chains = (await sources()).map((s) => ({
        chainId: s.chainId,
        name: s.name,
        vmType: s.vmType,
        iconUrl: s.iconUrl,
      }));
      return c.json({ chains, minimumUsd: String(deps.minimumUsd) });
    } catch (err) {
      log.error({ err }, "could not read Relay's chains");
      return c.json(fail("fund_unavailable", "Deposit options are unavailable right now."), 503);
    }
  });

  /**
   * Tokens to deposit, searched.
   *
   * Server-side because the answer is not small — Relay indexes thousands,
   * against the 56 the `/chains` solver lists happened to name — and because
   * the API key stays here. `q` empty is a real query and not an error: Relay
   * answers it with what is most held on each chain, which is the list to open
   * on.
   */
  app.get("/v1/money/fund/tokens", async (c) => {
    if (c.get("identity").walletAddress === null) {
      return c.json(fail("unauthorized", "No wallet on this session."), 401);
    }

    const raw = c.req.query("chainId");
    const only = raw === undefined ? null : Number(raw);
    if (only !== null && (!Number.isInteger(only) || !isSupportedChain(only))) {
      return c.json(fail("validation_failed", "We do not take deposits from that chain."), 400);
    }

    /* Trimmed, and capped well above any symbol so a long string cannot become
       a long upstream query. */
    const term = (c.req.query("q") ?? "").trim().slice(0, 64);

    try {
      const [chains, tokens] = await Promise.all([
        sources(),
        deps.relay.currencies({
          chainIds: only === null ? SUPPORTED_CHAIN_IDS : [only],
          ...(term.length === 0 ? {} : { term }),
          limit: 50,
        }),
      ]);

      const named = new Map(chains.map((s) => [s.chainId, s]));
      const rows = tokens
        /* Relay may answer with a chain we do not offer even when asked about
           ours. What we show has to be what we accept, or the row fails at the
           quote after somebody has chosen it. */
        .flatMap((t) => {
          const chain = named.get(t.chainId);
          return chain === undefined
            ? []
            : [
                {
                  chainId: t.chainId,
                  chainName: chain.name,
                  chainIconUrl: chain.iconUrl,
                  vmType: chain.vmType,
                  address: t.address,
                  symbol: t.symbol,
                  name: t.name,
                  decimals: t.decimals,
                  logoUrl: t.logoUrl,
                  /*
                   * What depositing this costs in Mercury's fee, or null. Sent
                   * so the browser's own preview asks Relay for the same fee
                   * the server will, without keeping a second list of which
                   * tokens are free.
                   */
                  appFee: depositFeeFor(deps.fee, t),
                },
              ];
        })
        .sort((a, b) => chainRank(a.chainId) - chainRank(b.chainId));

      return c.json({ tokens: rows });
    } catch (err) {
      log.error({ err }, "could not search Relay's currencies");
      return c.json(fail("fund_unavailable", "Deposit options are unavailable right now."), 503);
    }
  });

  /**
   * A quote the connected wallet can execute, and the row that records it.
   *
   * The quote is minted here and never in the browser, because three of its
   * fields are ours: `recipient` decides whose account the money lands in,
   * `refundTo` decides where a failure returns to, and the origin pair decides
   * what is being spent. A page that fetched its own would control all three.
   */
  app.post("/v1/money/fund/swap", async (c) => {
    const identity = c.get("identity");
    const wallet = identity.walletAddress;
    if (wallet === null) return c.json(fail("unauthorized", "No wallet on this session."), 401);

    const parsed = SwapBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", "Pick a token and an amount."), 400);

    if (!isSupportedChain(parsed.data.chainId)) {
      return c.json(fail("validation_failed", "We do not take deposits from that chain."), 400);
    }

    /*
     * The token is resolved against Relay rather than trusted from the body,
     * and resolved here rather than taken from whatever the picker displayed.
     *
     * Two things turn on it. The first is that `symbol` and `decimals` end up
     * in a record somebody will later read to understand where their money
     * came from, and a client that could name them could write "USDC" over a
     * deposit of something else. The second is the filter: `currencies()` asks
     * for verified tokens only, so an address Relay knows but has not verified
     * resolves to nothing here and is refused — which is the whole defence
     * against a token whose symbol says USDC and whose issuer is not Circle.
     *
     * What this deliberately no longer does is require the token to appear in
     * `/chains`'s solver list. That list names 56 tokens and Relay routes far
     * past it — SQDGN and DGENAI, neither listed, both quote. The old comment
     * here called the list "the only safe list" because an unsolvable deposit
     * was unrecoverable once sent, and that was true of the deposit-address
     * flow this replaced. With a connected wallet the quote is the gate: an
     * unroutable token comes back 400 INVALID_INPUT_CURRENCY and nothing has
     * been signed.
     */
    let chain: RelaySource | undefined;
    let currency: { readonly address: string; readonly symbol: string } | undefined;
    try {
      chain = await chainOf(parsed.data.chainId);
      const found = await deps.relay.currencies({
        chainIds: [parsed.data.chainId],
        address: parsed.data.currency,
        limit: 1,
      });
      currency = found.find((t) => t.address.toLowerCase() === parsed.data.currency.toLowerCase());
    } catch (err) {
      log.error({ err }, "could not resolve the token");
      return c.json(fail("fund_unavailable", "Deposit options are unavailable right now."), 503);
    }

    if (chain === undefined || currency === undefined) {
      return c.json(fail("validation_failed", "We cannot accept that token."), 400);
    }

    /*
     * `from` comes from the request body, and that is safe for one reason
     * worth stating: it only decides whose tokens the transaction would spend,
     * and spending them needs that wallet's own signature. Naming somebody
     * else's address produces a transaction they will never sign. What a
     * caller cannot touch is `recipient`, which is always the wallet Privy
     * signed for — so there is no version of this that delivers the money
     * anywhere but the caller's own account.
     */
    const from = parsed.data.from.trim();
    const wellFormed =
      chain.vmType === "svm"
        ? (() => {
            try {
              toAddress(from);
              return true;
            } catch {
              return false;
            }
          })()
        : /^0x[0-9a-fA-F]{40}$/.test(from);
    if (!wellFormed) {
      return c.json(fail("validation_failed", "That is not a wallet address for this chain."), 400);
    }

    try {
      const quote = await deps.relay.fundQuote({
        user: from,
        recipient: wallet,
        originChainId: chain.chainId,
        originCurrency: currency.address,
        amountRaw: parsed.data.amountRaw,
        /* Decided on the token Relay resolved, not on the address the body named. */
        appFee: depositFeeFor(deps.fee, { chainId: chain.chainId, address: currency.address }),
      });

      const intent = await deps.store.create({
        userId: identity.userId,
        relayRequestId: quote.details.requestId,
        originChainId: chain.chainId,
        originCurrency: currency.address,
        originChainName: chain.name,
        originCurrencySymbol: currency.symbol,
        recipientAddress: wallet,
        quotedOutRaw: quote.details.outRaw,
        mercuryFeeUsd: quote.details.appFeeUsd,
      });

      return c.json({
        intentId: intent.id,
        quote: quote.quote,
        in: { amountFormatted: quote.details.inFormatted, symbol: currency.symbol },
        out: { amountFormatted: quote.details.outFormatted, symbol: "USDC" },
        impactPct: quote.details.impactPct,
      });
    } catch (err) {
      /* Logged for us, summarised for them: Relay's errors are not user copy. */
      log.error({ err }, "could not build a wallet swap");
      return c.json(fail("fund_unavailable", "Could not prepare that deposit. Please try again."), 503);
    }
  });

  /**
   * What the browser executed. A report, not a verdict.
   *
   * It moves a deposit from `waiting` to `submitted` and records the hashes,
   * and that is the most it can do. It cannot mark anything successful, for a
   * reason that holds on both VMs: the hash a client holds proves a
   * transaction landed somewhere, not that it was this deposit — and on an EVM
   * origin it proves only the first of two legs, the second being one the user
   * never signed. A deposit record a client can write `success` into is not a
   * record.
   *
   * Relay settles it instead, through `POST /webhooks/relay`, which is signed.
   */
  app.post("/v1/money/fund/submitted", async (c) => {
    const identity = c.get("identity");
    if (identity.walletAddress === null) {
      return c.json(fail("unauthorized", "No wallet on this session."), 401);
    }

    const parsed = SubmittedBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", parsed.error.message), 400);

    const marked = await deps.store.markSubmitted(identity.userId, parsed.data.intentId, {
      ...(parsed.data.inTxHash === undefined ? {} : { inTxHash: parsed.data.inTxHash }),
      ...(parsed.data.outTxHash === undefined ? {} : { outTxHash: parsed.data.outTxHash }),
    });
    /*
     * Null means either an intent that is not this caller's, or one Relay has
     * already settled. Both are 404 on purpose: a settled row is not this
     * endpoint's to touch, and telling the two apart would say whether an id
     * exists.
     */
    if (marked === null) return c.json(fail("not_found", "Unknown or settled deposit."), 404);

    return c.json({ status: marked.status });
  });

  /*
   * What is in flight. A cross-chain deposit has a second leg the user never
   * signed, so without this they would send real money and the app would show
   * them nothing — indistinguishable from having lost it.
   *
   * The user id comes from the session, so there is no parameter to tamper with.
   */
  app.get("/v1/money/fund/intents", async (c) => {
    const identity = c.get("identity");
    if (identity.walletAddress === null) {
      return c.json(fail("unauthorized", "No wallet on this session."), 401);
    }
    const intents = await deps.store.forUser(identity.userId);
    return c.json({
      intents: intents.map((i) => ({
        id: i.id,
        status: i.status,
        originChainId: i.originChainId,
        originChainName: i.originChainName,
        originCurrencySymbol: i.originCurrencySymbol,
        quotedOutRaw: i.quotedOutRaw,
        inTxHash: i.inTxHash,
        outTxHash: i.outTxHash,
        failReason: i.failReason,
        createdAt: i.createdAt.toISOString(),
      })),
    });
  });

  return app;
}
