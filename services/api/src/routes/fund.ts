import { Hono } from "hono";
import { z } from "zod";
import { address as toAddress } from "@solana/kit";
import type { RelayClient, RelaySource } from "../funding/relay.js";
import type { FundingStore } from "../funding/store.js";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";

export interface FundDeps {
  readonly relay: RelayClient;
  readonly store: FundingStore;
  /** What we will not quote below. Sent to the client so it is stated once. */
  readonly minimumUsd: number;
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

export function fundRoutes(deps: FundDeps): Hono {
  const app = new Hono();

  let cached: { readonly at: number; readonly sources: readonly RelaySource[] } | null = null;
  const sources = async (): Promise<readonly RelaySource[]> => {
    const now = Date.now();
    if (cached !== null && now - cached.at < CHAINS_TTL_MS) return cached.sources;
    /*
     * Bitcoin is left out. Relay will take a BTC deposit, but only to an
     * address — a connected wallet would answer with a PSBT and nothing here
     * signs one. Offering a row that cannot be taken is worse than not
     * offering it.
     */
    const fresh = (await deps.relay.chains()).filter((c) => c.vmType !== "bvm");
    cached = { at: now, sources: fresh };
    return fresh;
  };

  /*
   * Every chain Relay reports, less Bitcoin. The client filters again by what
   * it can actually connect a wallet on — see apps/web/src/wallet/chains.ts.
   * Two honest halves: the server says what Relay accepts, the client says
   * what it can sign.
   */
  app.get("/v1/money/fund/sources", async (c) => {
    if (c.get("identity").walletAddress === null) {
      return c.json(fail("unauthorized", "No wallet on this session."), 401);
    }
    try {
      return c.json({ chains: await sources(), minimumUsd: String(deps.minimumUsd) });
    } catch (err) {
      console.error("fund: could not read Relay's chains", err);
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

    let available: readonly RelaySource[];
    try {
      available = await sources();
    } catch (err) {
      console.error("fund: could not read Relay's chains", err);
      return c.json(fail("fund_unavailable", "Deposit options are unavailable right now."), 503);
    }

    const chain = available.find((s) => s.chainId === parsed.data.chainId);
    /*
     * The currency has to be one Relay will solve. Not input tidying: a token
     * Relay does not solve is, by their own documentation, unrecoverable once
     * sent, so the only safe list is the one they gave us.
     */
    const currency = chain?.currencies.find((cur) => cur.address === parsed.data.currency);
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
      console.error("fund: could not build a wallet swap", err);
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
