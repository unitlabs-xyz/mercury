import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { D, ZERO } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import { testDb } from "../db/testing.js";
import { disposals, instruments, lots, orders, positions, tokens, users } from "../db/schema.js";
import { withPledged } from "../lending/pledged.js";
import type { LendingSource } from "../lending/ports.js";
import type { Fill } from "../orders/fill.js";
import { settleOrder } from "../orders/settle.js";
import { applyReconciliation, loadHeldTokens, type ReconcileDeps } from "./apply.js";
import { planReconciliation } from "./reconcile.js";

const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const WALLET = "Wa11et00000000000000000000000000000000000000";
/** One token at eight decimals. */
const ONE = 100_000_000n;
const MINUTE = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms);

/**
 * One account and one stock, on a chain whose balances the test sets. Trades
 * go through `settleOrder`, and a pass makes the same three calls position-sync
 * makes, so these are the books as production keeps them.
 */
const books = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:books" }).returning();
  const [instrument] = await db
    .insert(instruments)
    .values({ ticker: "NVDA", name: "Nvidia", sector: "Technology" })
    .returning();
  const [token] = await db
    .insert(tokens)
    .values({ instrumentId: instrument!.id, mint: NVDAX, symbol: "NVDAx", issuer: "backed", decimals: 8 })
    .returning();
  const userId = user!.id;
  const instrumentId = instrument!.id;
  const tokenId = token!.id;

  const state = { wallet: 0n, pledged: 0n, multiplier: D(1) };

  const chain: ChainReader = {
    mintConfig: async () => null,
    tokenBalances: async () =>
      state.wallet === 0n ? [] : [{ mint: NVDAX, rawAmount: state.wallet, decimals: 8 }],
  };
  const lending = {
    position: async () =>
      state.pledged === 0n
        ? null
        : {
            obligation: "Obligation",
            deposits: [
              {
                ticker: "NVDA",
                isStock: true,
                mint: NVDAX,
                raw: state.pledged,
                decimals: 8,
                tokens: ZERO,
                valueUsd: ZERO,
              },
            ],
            debtUsd: ZERO,
            owedUsdc: ZERO,
            debtBfAdjustedUsd: ZERO,
            allowedBorrowUsd: ZERO,
            liquidationBorrowUsd: ZERO,
          },
  } as unknown as LendingSource;
  const deps: ReconcileDeps = {
    chain: withPledged(chain, lending),
    prices: { pricesFor: async () => new Map() } as unknown as ReconcileDeps["prices"],
    multipliers: {
      multipliersFor: async () => new Map([[NVDAX, state.multiplier]]),
    } as unknown as ReconcileDeps["multipliers"],
  };

  const fillOf = (raw: bigint, usd: number, at: Date): Fill => {
    const tokensHeld = D(raw.toString()).div(D(ONE.toString()));
    const shares = tokensHeld.mul(state.multiplier);
    return {
      kind: "filled",
      tokensRaw: raw,
      tokens: tokensHeld,
      shares,
      usd: D(usd),
      feeUsd: ZERO,
      pricePerShare: D(usd).div(shares),
      occurredAt: at,
    };
  };

  /** An order, executing, and the settle that would land it. */
  const order = async (
    side: "buy" | "sell",
    raw: bigint,
    usd: number,
    opts: { createdAt?: Date; at?: Date } = {},
  ) => {
    const [row] = await db
      .insert(orders)
      .values({
        userId,
        instrumentId,
        side,
        usdAmount: String(usd),
        decision: { kind: "execute" },
        chosenTokenId: tokenId,
        status: "executing",
        ...(opts.createdAt === undefined ? {} : { createdAt: opts.createdAt }),
      })
      .returning();
    const fill = fillOf(raw, usd, opts.at ?? ago(60 * MINUTE));
    return {
      settle: () =>
        settleOrder(db, {
          userId,
          orderId: row!.id,
          signature: `sig-${row!.id}`,
          side,
          ticker: "NVDA",
          mint: NVDAX,
          tokenId,
          instrumentId,
          fill,
          referencePricePerShare: null,
        }),
    };
  };

  const buy = async (raw: bigint, usd: number) => {
    await (await order("buy", raw, usd)).settle();
    state.wallet += raw;
  };
  const sell = async (raw: bigint, usd: number) => {
    await (await order("sell", raw, usd)).settle();
    state.wallet -= raw;
  };
  const pass = async (now = new Date()) => {
    const held = await loadHeldTokens(db, deps, userId, WALLET, now);
    await applyReconciliation(db, userId, planReconciliation(held, now));
  };
  const position = async () => {
    const [row] = await db.select().from(positions).where(eq(positions.userId, userId));
    return row!;
  };
  const disposalKinds = async () =>
    (await db.select({ kind: disposals.kind }).from(disposals).orderBy(disposals.recordedAt)).map(
      (d) => d.kind,
    );

  return { db, state, order, buy, sell, pass, position, disposalKinds };
};

const usdOf = (v: string): string => D(v).toFixed(2);
const sharesOf = (v: string): string => D(v).toFixed();

describe("the books, end to end", () => {
  it("cost two shares at the $300 they cost, after a sell and another buy", async () => {
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();
    await b.sell(ONE, 150);
    await b.pass();
    await b.buy(ONE, 200);
    await b.pass();

    const p = await b.position();
    expect(sharesOf(p.sharesWithBasis)).toBe("2");
    expect(usdOf(p.costBasisUsd)).toBe("300.00");
    expect(usdOf(p.avgUnitCostUsd)).toBe("150.00");
  });

  it("start fresh after selling everything and buying again", async () => {
    const b = await books();
    await b.buy(ONE, 100);
    await b.pass();
    await b.sell(ONE, 120);
    await b.pass();
    await b.buy(ONE, 200);
    await b.pass();
    expect(usdOf((await b.position()).costBasisUsd)).toBe("200.00");
  });

  it("record a transfer out, and cost the next buy apart from it", async () => {
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();
    b.state.wallet -= ONE; // sent from another app
    await b.pass();
    expect(await b.disposalKinds()).toEqual(["transfer_out"]);

    await b.buy(ONE, 200);
    await b.pass();
    expect(usdOf((await b.position()).costBasisUsd)).toBe("300.00");
  });

  it("do not count a sell twice while it is in flight", async () => {
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();

    const now = new Date();
    const inFlight = await b.order("sell", ONE, 150, { at: now });
    b.state.wallet -= ONE; // landed, not yet confirmed
    await b.pass(now);
    expect(await b.disposalKinds()).toEqual([]);

    await inFlight.settle();
    await b.pass(now); // settled moments ago: still left alone
    await b.pass(new Date(now.getTime() + 3 * MINUTE));

    expect(await b.disposalKinds()).toEqual(["sell"]);
    expect(usdOf((await b.position()).costBasisUsd)).toBe("100.00");
  });

  it("take back the transfer out a late confirm turns out to have been", async () => {
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();

    const abandoned = await b.order("sell", ONE, 150, { createdAt: ago(20 * MINUTE) });
    b.state.wallet -= ONE;
    await b.pass();
    expect(await b.disposalKinds()).toEqual(["transfer_out"]);

    await abandoned.settle();
    await b.pass();
    expect(await b.disposalKinds()).toEqual(["sell"]);
    expect(usdOf((await b.position()).costBasisUsd)).toBe("100.00");
  });

  it("do not read pledging to Kamino as a transfer out", async () => {
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();
    b.state.wallet = 0n;
    b.state.pledged = 2n * ONE;
    await b.pass();

    expect(await b.disposalKinds()).toEqual([]);
    const p = await b.position();
    expect(sharesOf(p.sharesWithBasis)).toBe("2");
    expect(usdOf(p.costBasisUsd)).toBe("200.00");
  });

  it("credit a dividend after a partial sell on the shares still held", async () => {
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();
    await b.sell(ONE, 150);
    await b.pass();
    b.state.multiplier = D("1.5");
    await b.pass();

    const dividends = await b.db.select().from(lots).where(eq(lots.source, "dividend"));
    expect(dividends.map((l) => sharesOf(l.shares))).toEqual(["0.5"]);
    const p = await b.position();
    expect(sharesOf(p.sharesWithBasis)).toBe("1.5");
    expect(usdOf(p.costBasisUsd)).toBe("100.00");
  });
});
