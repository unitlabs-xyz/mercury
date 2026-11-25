import { Hono } from "hono";
import { z } from "zod";
import { D, Decimal, toWire } from "@mercury/core";
import type { ChainHistory, ChainReader } from "@mercury/chain";
import type { PriceBoard } from "@mercury/market";
import type { Blockhash } from "@solana/kit";
// Loads the ContextVariableMap declarations so `c.get("identity")` and `c.get("acting")` are typed.
import type {} from "../auth/middleware.js";
import { STOCK_ACCOUNT_BYTES, TOKEN_ACCOUNT_BYTES, rentFor } from "../rent.js";
import { writerOf } from "../wallets/acting.js";
import { buildMove } from "../moves/build.js";
import { planMove } from "../moves/plan.js";
import type { MoveSends } from "../moves/sends.js";
import type { Movable } from "../moves/queries.js";
import type { OutsideBasket } from "../baskets/outside.js";

/** Native SOL is priced under the wrapped-SOL mint. */
const SOL_MINT = "So11111111111111111111111111111111111111112";

export interface MoveDeps {
  readonly chain: Pick<ChainReader, "tokenBalances" | "rentExemption">;
  readonly history: Pick<ChainHistory, "ownedTokenAccounts">;
  readonly prices: PriceBoard;
  readonly usdcMint: string;
  /** The tokens Mercury lists, stocks and USDC, by mint: what can be moved. */
  readonly listed: () => Promise<ReadonlyMap<string, Movable>>;
  /** The person's Mercury wallet's id, which the moved shares are recorded into. */
  readonly mercuryWalletId: (userId: string) => Promise<string | null>;
  readonly latestBlockhash: () => Promise<{ blockhash: Blockhash; lastValidBlockHeight: bigint }>;
  readonly sends: Pick<MoveSends, "remember">;
  /**
   * A linked wallet's baskets made outside Mercury, found on the chain.
   * Absent, none are looked for.
   */
  readonly outside?: (wallet: {
    readonly userId: string;
    readonly walletId: string;
    readonly address: string;
  }) => Promise<readonly OutsideBasket[]>;
  readonly now?: () => Date;
}

const fail = (code: string, message: string) => ({ error: { code, message } });

const Request = z.object({
  /** How much of each to move, in the smallest unit. Absent, everything Mercury lists that the wallet holds. */
  tokens: z
    .array(z.object({ mint: z.string().min(1), amountRaw: z.string().regex(/^\d+$/, "expected an integer") }))
    .optional(),
});

const REFUSED: Record<string, string> = {
  nothing_to_move: "This wallet holds nothing Mercury lists.",
  not_held: "This wallet doesn't hold that token.",
  too_much: "That's more than this wallet holds.",
};

/**
 * Moving a linked wallet's tokens into the person's Mercury wallet, where
 * everything can be done from the phone too.
 *
 * Prepare returns the transactions for the linked wallet to sign, a few tokens
 * each, and what the move costs: the rent of the accounts the Mercury wallet
 * lacks, which the linked wallet pays in SOL with the network fee. They go out
 * through `/v1/transactions/send` on the linked wallet's own signature, and
 * the moved shares are recorded into the Mercury wallet with their cost once
 * they land.
 */
export function moveRoutes(deps: MoveDeps): Hono {
  const app = new Hono();
  const now = deps.now ?? (() => new Date());

  /** What the linked wallet holds that can be moved, a line each, largest account first within a token. */
  app.get("/v1/move/tokens", async (c) => {
    const writer = writerOf(c);
    if (writer === null || writer.isPrimary) {
      return c.json(fail("wallet_mercury", "Choose a linked wallet to move from."), 400);
    }
    if (deps.history.ownedTokenAccounts === undefined) {
      return c.json({ available: false, tokens: [] });
    }
    const [owned, listed] = await Promise.all([
      deps.history.ownedTokenAccounts(writer.address),
      deps.listed(),
    ]);
    const byMint = new Map<string, { decimals: number; amountRaw: bigint }>();
    for (const a of owned) {
      if (a.rawAmount <= 0n || !listed.has(a.mint)) continue;
      const seen = byMint.get(a.mint);
      byMint.set(a.mint, { decimals: a.decimals, amountRaw: (seen?.amountRaw ?? 0n) + a.rawAmount });
    }
    return c.json({
      available: true,
      tokens: [...byMint].map(([mint, t]) => {
        const about = listed.get(mint)!;
        return {
          mint,
          symbol: about.symbol,
          ticker: about.ticker,
          name: about.name,
          decimals: t.decimals,
          amountRaw: t.amountRaw.toString(),
          amount: toWire(D(t.amountRaw.toString()).div(D(10).pow(t.decimals))),
        };
      }),
    });
  });

  /**
   * The linked wallet's baskets made outside Mercury: their value and what
   * they hold, so the page can show them and walk the person through
   * bringing them in. Read only: Mercury can't move them itself.
   */
  app.get("/v1/move/outside-baskets", async (c) => {
    const writer = writerOf(c);
    if (writer === null || writer.isPrimary) {
      return c.json(fail("wallet_mercury", "Choose a linked wallet to look for its baskets."), 400);
    }
    if (deps.outside === undefined) return c.json({ baskets: [] });
    const baskets = await deps.outside({
      userId: c.get("identity").userId,
      walletId: writer.id,
      address: writer.address,
    });
    const holdingJson = (h: OutsideBasket["holdings"][number]) => ({
      mint: h.mint,
      symbol: h.symbol,
      ticker: h.ticker,
      amount: toWire(h.amount),
      valueUsd: toWire(h.valueUsd.toDecimalPlaces(2)),
    });
    return c.json({
      baskets: baskets.map((b) => ({
        address: b.address,
        valueUsd: toWire(b.valueUsd.toDecimalPlaces(2)),
        holdings: b.holdings.map(holdingJson),
        arrived:
          b.arrived === null
            ? null
            : { at: b.arrived.at.toISOString(), holdings: b.arrived.holdings.map(holdingJson) },
        similar:
          b.similar === null
            ? null
            : {
                slug: b.similar.slug,
                name: b.similar.name,
                overlap: toWire(b.similar.overlap.toDecimalPlaces(2)),
              },
      })),
    });
  });

  app.post("/v1/move/prepare", async (c) => {
    const writer = writerOf(c);
    if (writer === null) return c.json(fail("wallet_pending", "Your wallet is still being set up."), 409);
    if (writer.isPrimary) {
      return c.json(fail("wallet_mercury", "Choose a linked wallet to move from."), 400);
    }
    if (deps.history.ownedTokenAccounts === undefined) {
      return c.json(fail("move_unavailable", "Moving isn't available right now."), 503);
    }
    const mercuryAddress = c.get("identity").walletAddress;
    const { userId } = c.get("identity");
    const mercuryId = await deps.mercuryWalletId(userId);
    if (mercuryAddress === null || mercuryId === null) {
      return c.json(fail("wallet_pending", "Your Mercury wallet is still being set up."), 409);
    }

    const parsed = Request.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json(fail("bad_request", "That move couldn't be read."), 400);
    const asked =
      parsed.data.tokens === undefined
        ? undefined
        : new Map(parsed.data.tokens.map((t) => [t.mint, BigInt(t.amountRaw)] as const));

    const [owned, listed, mercury, prices, classic, token2022, block] = await Promise.all([
      deps.history.ownedTokenAccounts(writer.address),
      deps.listed(),
      // Every account, empty ones too: an empty account still exists, and owes no rent again.
      deps.history.ownedTokenAccounts(mercuryAddress),
      deps.prices.pricesFor([SOL_MINT]),
      rentFor(deps.chain, TOKEN_ACCOUNT_BYTES),
      rentFor(deps.chain, STOCK_ACCOUNT_BYTES),
      deps.latestBlockhash(),
    ]);
    const plan = planMove({
      owned,
      listed: new Set(listed.keys()),
      asked,
      mercuryHolds: new Set(mercury.map((b) => b.mint)),
      rent: { classic, token2022 },
      solPriceUsd: prices.get(SOL_MINT)?.usdPricePerToken,
    });
    if (!plan.ok) {
      return c.json(
        { ...fail(plan.code, REFUSED[plan.code]!), ...(plan.mint ? { mint: plan.mint } : {}) },
        400,
      );
    }

    // The linked wallet pays its own way: the network fee and any rent, in SOL.
    const batches = await buildMove({
      owner: writer.address,
      destination: mercuryAddress,
      tokens: plan.tokens,
      ...block,
    });
    const startedAt = now();
    for (const b of batches) {
      deps.sends.remember(b.messageBytes, {
        userId,
        fromWalletId: writer.id,
        toWalletId: mercuryId,
        startedAt,
        moved: b.moved,
      });
    }
    return c.json({
      transactions: batches.map((b) => ({
        transaction: b.wire,
        moved: b.moved.map((m) => ({ mint: m.mint, amountRaw: m.amountRaw.toString() })),
      })),
      // Nothing is taken in USDC: the wallet pays in SOL, and Mercury covers nothing for it.
      feeUsd: "0",
      rentUsd: toWire(plan.rentUsd.toDecimalPlaces(2, Decimal.ROUND_UP)),
      rentSol: toWire(D(plan.rentLamports.toString()).div(1e9)),
      coveredByMercury: false,
    });
  });

  return app;
}
