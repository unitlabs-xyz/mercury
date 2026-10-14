import { Hono } from "hono";
import { z } from "zod";
import { address as toAddress, type Address, type Blockhash } from "@solana/kit";
import type { LookupTableReader } from "../relay/lookups.js";
import { composeFundSwap } from "../funding/compose.js";
import type { RelayClient, RelaySource } from "../funding/relay.js";
import type { FundingStore } from "../funding/store.js";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";

/**
 * An address we control, per VM family. Never a user's.
 *
 * Derived by `services/treasury` from a key it holds and fetched at boot — not
 * configured. A configured address can be one we have no key for, and nothing
 * would catch it until a refund landed somewhere unspendable. See ADR 0015.
 */
export interface VmAddresses {
  readonly evm: string;
  readonly svm: string;
  readonly bvm: string;
}

/**
 * What the connected-wallet path needs of the chain.
 *
 * Optional on the whole: without it the deposit-address path still works for
 * every chain, which is the floor this feature stands on.
 */
export interface FundSolana {
  readonly lookups: LookupTableReader;
  readonly blockhash: () => Promise<{ blockhash: Blockhash; lastValidBlockHeight: bigint }>;
  /** True landed, false failed, null not seen yet — which is worth retrying. */
  readonly landed: (signature: string) => Promise<boolean | null>;
}

export interface FundDeps {
  readonly relay: RelayClient;
  readonly store: FundingStore;
  readonly refund: VmAddresses;
  readonly recovery: VmAddresses;
  /** What we will not quote below. Sent to the client so it is stated once. */
  readonly minimumUsd: number;
  readonly solana?: FundSolana | undefined;
}

/**
 * Which key family an origin chain's addresses belong to, or none.
 *
 * Relay reports eight VM families across the 61 chains it will take deposits
 * from and we hold three keys. `hypevm` is Hyperliquid's EVM and uses `0x`
 * addresses, so it maps to the EVM key — that covers 55 of the 61.
 *
 * The rest — `tvm` (Tron, base58 `T…`), `xrpvm` (`r…`), `tonvm`, and `lvm`,
 * whose address format nobody here has confirmed — map to nothing, and get no
 * refund address at all. That turns automatic refunds off and leaves a failed
 * deposit to Relay's support, which is bad. Handing them an address from
 * another family would have Relay refund into nothing, which is worse and
 * silent.
 */
const FAMILIES: Readonly<Record<string, keyof VmAddresses>> = {
  evm: "evm",
  hypevm: "evm",
  svm: "svm",
  bvm: "bvm",
};

const fail = (code: string, message: string) => ({ error: { code, message } });

const Body = z.object({ chainId: z.number().int(), currency: z.string().min(1) });

const SwapBody = z.object({
  chainId: z.number().int(),
  currency: z.string().min(1),
  /** The origin token's own smallest unit, as digits. */
  amountRaw: z.string().regex(/^[1-9]\d{0,25}$/, "Enter an amount."),
  /** The connected wallet. See the comment where this is used. */
  from: z.string().min(32).max(64),
});

const ConfirmBody = z.object({ intentId: z.string().uuid(), signature: z.string().min(32) });

/** Chains change rarely and the list is large. Ten minutes is a deploy, not a session. */
const CHAINS_TTL_MS = 10 * 60_000;

export function fundRoutes(deps: FundDeps): Hono {
  const app = new Hono();

  let cached: { readonly at: number; readonly sources: readonly RelaySource[] } | null = null;
  const sources = async (): Promise<readonly RelaySource[]> => {
    const now = Date.now();
    if (cached !== null && now - cached.at < CHAINS_TTL_MS) return cached.sources;
    const fresh = await deps.relay.chains();
    cached = { at: now, sources: fresh };
    return fresh;
  };

  /*
   * Every chain Relay reports, not a curated few. Sixty-one rows is a worse
   * list than eight, and that is the interface's problem to solve with search —
   * a short hardcoded list is us telling somebody we cannot take their money
   * when we can.
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

  app.post("/v1/money/fund/address", async (c) => {
    const identity = c.get("identity");
    const wallet = identity.walletAddress;
    if (wallet === null) return c.json(fail("unauthorized", "No wallet on this session."), 401);

    const parsed = Body.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", "Pick a chain and a token."), 400);

    let available: readonly RelaySource[];
    try {
      available = await sources();
    } catch (err) {
      console.error("fund: could not read Relay's chains", err);
      return c.json(fail("fund_unavailable", "Deposit options are unavailable right now."), 503);
    }

    const chain = available.find((s) => s.chainId === parsed.data.chainId);
    if (chain === undefined) return c.json(fail("validation_failed", "We cannot accept that chain."), 400);

    /*
     * The currency has to be one Relay will solve. This is not input tidying: a
     * token sent to a deposit address that Relay does not solve is, by their
     * own documentation, unrecoverable. The only safe list is the one they
     * gave us.
     */
    const currency = chain.currencies.find((cur) => cur.address === parsed.data.currency);
    if (currency === undefined) return c.json(fail("validation_failed", "We cannot accept that token."), 400);

    const family = FAMILIES[chain.vmType] ?? null;

    try {
      const quote = await deps.relay.depositAddressQuote({
        originChainId: chain.chainId,
        originCurrency: currency.address,
        /* From the token Privy signed, never from the body. A caller that could
           name a recipient could name somebody else's wallet. */
        recipient: wallet,
        ...(family === null ? {} : { refundTo: deps.refund[family], recoveryAddress: deps.recovery[family] }),
      });

      await deps.store.create({
        userId: identity.userId,
        relayRequestId: quote.requestId,
        depositAddress: quote.depositAddress,
        originChainId: chain.chainId,
        originCurrency: currency.address,
        originChainName: chain.name,
        originCurrencySymbol: currency.symbol,
        recipientAddress: wallet,
        quotedOutRaw: quote.quotedOutRaw,
      });

      return c.json({
        depositAddress: quote.depositAddress,
        requestId: quote.requestId,
        chain: { id: chain.chainId, name: chain.name, vmType: chain.vmType },
        currency,
        minimumUsd: String(deps.minimumUsd),
        /* The interface has to be able to say so. A deposit that cannot be
           auto-refunded is still worth offering; letting somebody make one
           without knowing is not. */
        autoRefund: family !== null,
      });
    } catch (err) {
      /* Logged for us, summarised for them: Relay's errors are not user-facing copy. */
      console.error("fund: could not mint a deposit address", err);
      return c.json(fail("fund_unavailable", "Could not set up that deposit. Please try again."), 503);
    }
  });

  /*
   * What is in flight. A Bitcoin deposit sits in `pending` for ten to sixty
   * minutes, and without this the user sends real money and the app shows them
   * nothing — which is indistinguishable from having lost it.
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
        depositAddress: i.depositAddress,
        originChainId: i.originChainId,
        originCurrency: i.originCurrency,
        quotedOutRaw: i.quotedOutRaw,
        inTxHash: i.inTxHash,
        outTxHash: i.outTxHash,
        failReason: i.failReason,
        createdAt: i.createdAt.toISOString(),
      })),
    });
  });

  /**
   * An executable swap for a wallet somebody has connected.
   *
   * Solana origin only. Relay answers an EVM origin with calldata and a
   * Bitcoin one with a PSBT, and this server can compose neither — those go
   * through a deposit address, which needs no wallet at all.
   *
   * The transaction is composed here rather than in the browser for the same
   * reason the quote is minted here: `recipient` decides whose account the
   * money lands in, and a page that built its own could name any wallet it
   * liked.
   */
  app.post("/v1/money/fund/swap", async (c) => {
    const identity = c.get("identity");
    const wallet = identity.walletAddress;
    if (wallet === null) return c.json(fail("unauthorized", "No wallet on this session."), 401);

    const solana = deps.solana;
    if (solana === undefined) {
      return c.json(fail("fund_unavailable", "Paying from a connected wallet is unavailable."), 503);
    }

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
    const currency = chain?.currencies.find((cur) => cur.address === parsed.data.currency);
    if (chain === undefined || currency === undefined) {
      return c.json(fail("validation_failed", "We cannot accept that token."), 400);
    }
    if (chain.vmType !== "svm") {
      return c.json(fail("validation_failed", "Use a deposit address for this chain."), 400);
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
    let from: Address;
    try {
      from = toAddress(parsed.data.from);
    } catch {
      return c.json(fail("validation_failed", "That is not a Solana wallet address."), 400);
    }

    try {
      const quote = await deps.relay.swapQuote({
        user: from,
        recipient: wallet,
        originChainId: chain.chainId,
        originCurrency: currency.address,
        amountRaw: parsed.data.amountRaw,
      });

      const [lifetime, tables] = await Promise.all([
        solana.blockhash(),
        solana.lookups.read(quote.lookupTables as readonly Address[]),
      ]);
      /* A table we could not read is a route we cannot compose: composing
         without it produces a transaction over the size limit, which the
         network rejects with nothing useful to say. */
      for (const named of quote.lookupTables) {
        if (!tables.has(named as Address)) {
          throw new Error(`lookup table ${named} could not be read`);
        }
      }

      const { wire } = composeFundSwap({
        payer: from,
        instructions: quote.instructions,
        lookupTables: tables,
        ...lifetime,
      });

      const intent = await deps.store.create({
        userId: identity.userId,
        relayRequestId: quote.requestId,
        originChainId: chain.chainId,
        originCurrency: currency.address,
        originChainName: chain.name,
        originCurrencySymbol: currency.symbol,
        recipientAddress: wallet,
        quotedOutRaw: quote.outRaw,
      });

      return c.json({
        intentId: intent.id,
        transaction: wire,
        in: { amountFormatted: quote.inFormatted, symbol: currency.symbol },
        out: { amountFormatted: quote.outFormatted, symbol: "USDC" },
        impactPct: quote.impactPct,
      });
    } catch (err) {
      console.error("fund: could not build a wallet swap", err);
      return c.json(fail("fund_unavailable", "Could not prepare that deposit. Please try again."), 503);
    }
  });

  /**
   * Record a connected-wallet deposit that landed.
   *
   * No webhook behind this one: a Solana-origin swap is a single transaction
   * the funder signs and broadcasts, so its signature is the receipt. Nothing
   * about the amount is read from the client — `wallet-events` reads the USDC
   * delta off the chain, which is the only figure that is a fact.
   */
  app.post("/v1/money/fund/confirm", async (c) => {
    const identity = c.get("identity");
    if (identity.walletAddress === null) {
      return c.json(fail("unauthorized", "No wallet on this session."), 401);
    }
    const solana = deps.solana;
    if (solana === undefined) return c.json(fail("fund_unavailable", "Unavailable."), 503);

    const parsed = ConfirmBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", parsed.error.message), 400);

    const intent = await deps.store.byId(identity.userId, parsed.data.intentId);
    if (intent === null) return c.json(fail("not_found", "Unknown deposit."), 404);

    const landed = await solana.landed(parsed.data.signature);
    /* Not seen yet is a different answer from failed, and it is worth asking
       again: a client can confirm before the node it reaches has caught up. */
    if (landed === null) {
      return c.json(fail("transaction_pending", "Not settled yet. Try again shortly."), 409);
    }

    const settled = await deps.store.settleById(identity.userId, intent.id, {
      status: landed ? "success" : "failure",
      inTxHash: parsed.data.signature,
      ...(landed ? { outTxHash: parsed.data.signature } : { failReason: "TRANSACTION_FAILED" }),
    });

    return c.json({ status: settled?.status ?? "failure" });
  });

  return app;
}
