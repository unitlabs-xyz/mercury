import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { D, ZERO } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import { testDb } from "../db/testing.js";
import { activities, disposals, instruments, lots, orders, positions, tokens, users } from "../db/schema.js";
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

  return { db, userId, instrumentId, tokenId, state, order, buy, sell, pass, position, disposalKinds };
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
    await b.pass(new Date(now.getTime() + 3 * MINUTE));

    expect(await b.disposalKinds()).toEqual(["sell"]);
    expect(usdOf((await b.position()).costBasisUsd)).toBe("100.00");
  });

  it("read a sell that has settled but not yet landed as shares not yet gone", async () => {
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();

    const now = new Date();
    const sale = await b.order("sell", ONE, 150, { at: now });
    // Settled, but the finalized balance still shows both tokens for a few
    // seconds. The cost has left with the sell; the token has not left the
    // wallet yet, so the chain reads above the records. That is an arrival we
    // did not see, not a transfer out, and the position moves with the cash.
    await sale.settle();
    await b.pass(now);
    expect(await b.disposalKinds()).toEqual(["sell"]);
    const lagging = await b.position();
    expect(sharesOf(lagging.shares)).toBe("2");
    expect(sharesOf(lagging.sharesWithBasis)).toBe("1");
    expect(usdOf(lagging.costBasisUsd)).toBe("100.00");

    b.state.wallet -= ONE; // caught up
    await b.pass(new Date(now.getTime() + 3 * MINUTE));
    const p = await b.position();
    expect(sharesOf(p.shares)).toBe("1");
    expect(sharesOf(p.sharesWithBasis)).toBe("1");
    expect(usdOf(p.costBasisUsd)).toBe("100.00");
    expect(await b.disposalKinds()).toEqual(["sell"]);
  });

  it("show a buy of a stock whose sell sits executing, because nothing has dropped", async () => {
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();

    await b.order("sell", ONE, 150); // opened, and the dialog closed
    await b.buy(ONE, 100);
    await b.pass();

    const p = await b.position();
    expect(sharesOf(p.shares)).toBe("3");
    expect(sharesOf(p.sharesWithBasis)).toBe("3");
    expect(usdOf(p.costBasisUsd)).toBe("300.00");
  });

  it("do not hold a stock still for a buy in flight", async () => {
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();

    await b.order("buy", ONE, 100); // executing, and nothing says it will land
    b.state.wallet -= ONE; // sent from another app
    await b.pass();
    expect(await b.disposalKinds()).toEqual(["transfer_out"]);
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

  it("keep the cost through a Kamino withdrawal whose wallet read lags", async () => {
    /*
     * The obligation is read at confirmed and the wallet at finalized, so on a
     * withdrawal the pledge drops before the wallet regains the tokens. For a
     * pass the chain reads zero. That is not a transfer out, and the cost must
     * not go with it.
     */
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();
    b.state.wallet = 0n;
    b.state.pledged = 2n * ONE;
    await b.pass();

    b.state.pledged = 0n; // withdrawn: the obligation is empty, the wallet not yet
    await b.pass();
    expect(await b.disposalKinds()).toEqual(["transfer_out"]);

    b.state.wallet = 2n * ONE; // finalized catches up
    await b.pass();
    await b.pass();

    expect(await b.disposalKinds()).toEqual([]);
    const p = await b.position();
    expect(sharesOf(p.shares)).toBe("2");
    expect(sharesOf(p.sharesWithBasis)).toBe("2");
    expect(usdOf(p.costBasisUsd)).toBe("200.00");
  });

  it("write no transfer out for a Kamino withdrawal while a sell is open", async () => {
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();
    b.state.wallet = 0n;
    b.state.pledged = 2n * ONE;
    await b.pass();

    const now = new Date();
    await b.order("sell", ONE, 150); // opened, and the dialog closed
    b.state.pledged = 0n; // withdrawn, the wallet not yet
    await b.pass(now);
    expect(await b.disposalKinds()).toEqual([]); // the open sell holds the stock through the lag
    b.state.wallet = 2n * ONE;
    await b.pass(now);
    await b.pass(new Date(now.getTime() + 11 * MINUTE));

    expect(await b.disposalKinds()).toEqual([]);
    const p = await b.position();
    expect(sharesOf(p.sharesWithBasis)).toBe("2");
    expect(usdOf(p.costBasisUsd)).toBe("200.00");
  });

  it("take back a transfer out whose tokens return while a sell opened after it sits executing", async () => {
    /*
     * A withdrawal's lag writes a transfer out, then the user starts a sell
     * inside it and closes the dialog. The sell sits executing for ten minutes,
     * longer than the two a transfer out is provisional. Taking the transfer
     * out back must not wait for it, or it would mature behind the sell and the
     * tokens that came back would be left with no cost.
     */
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();
    b.state.wallet = 0n;
    b.state.pledged = 2n * ONE;
    await b.pass();

    b.state.pledged = 0n; // withdrawn, the wallet not yet
    await b.pass();
    expect(await b.disposalKinds()).toEqual(["transfer_out"]);
    const held = await b.position();

    const now = new Date();
    await b.order("sell", ONE, 150); // opened inside the lag, then abandoned
    b.state.wallet = 2n * ONE; // finalized catches up
    await b.pass(now);
    expect(await b.disposalKinds()).toEqual([]);
    expect(await b.position()).toEqual(held); // the stock waits a pass for its records to settle

    await b.pass(new Date(now.getTime() + 3 * MINUTE)); // past the two minutes
    await b.pass(new Date(now.getTime() + 11 * MINUTE)); // the sell is no longer awaited

    expect(await b.disposalKinds()).toEqual([]);
    const p = await b.position();
    expect(sharesOf(p.shares)).toBe("2");
    expect(sharesOf(p.sharesWithBasis)).toBe("2");
    expect(usdOf(p.costBasisUsd)).toBe("200.00");
  });

  it("keep the cost of a buy read on a node that has not seen the tokens yet", async () => {
    const b = await books();
    await (await b.order("buy", 2n * ONE, 200)).settle(); // the lot is written, the wallet reads zero
    await b.pass();
    expect(await b.disposalKinds()).toEqual(["transfer_out"]);

    b.state.wallet = 2n * ONE; // the node catches up
    await b.pass();
    await b.pass();

    expect(await b.disposalKinds()).toEqual([]);
    const p = await b.position();
    expect(sharesOf(p.sharesWithBasis)).toBe("2");
    expect(usdOf(p.costBasisUsd)).toBe("200.00");
  });

  it("let a transfer out stand once two minutes have passed", async () => {
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();

    const now = new Date();
    b.state.wallet -= ONE; // sent from another app
    await b.pass(now);
    expect(await b.disposalKinds()).toEqual(["transfer_out"]);
    await b.pass(new Date(now.getTime() + 3 * MINUTE));
    expect(await b.disposalKinds()).toEqual(["transfer_out"]);

    // Tokens arrive from somewhere we did not see. The send is not undone by
    // them: they are held with no cost, as any arrival is.
    b.state.wallet += ONE;
    await b.pass(new Date(now.getTime() + 4 * MINUTE));
    expect(await b.disposalKinds()).toEqual(["transfer_out"]);
    const p = await b.position();
    expect(sharesOf(p.shares)).toBe("2");
    expect(sharesOf(p.sharesWithBasis)).toBe("1");
    expect(usdOf(p.costBasisUsd)).toBe("100.00");
  });

  it("never take back a sell, whatever the chain reads after it", async () => {
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();

    // Filled an hour ago and confirmed just now, so no window holds the stock
    // still, and the balance read still shows both tokens. A sell is a fact the
    // user made; only a transfer out is ever a guess to be taken back.
    await (await b.order("sell", ONE, 150)).settle();
    await b.pass();
    expect(await b.disposalKinds()).toEqual(["sell"]);
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

  it("keep the cost when an old instance credits a dividend the replay already holds", async () => {
    /*
     * A rolling deploy: 0026 has cut the dividends back, and a pass of the code
     * from before it, still running, credits the half share again. The replay
     * then holds 2 shares against the chain's 1.5. The tokens are the same, so
     * the cost must not move.
     */
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();
    await b.sell(ONE, 150);
    await b.pass();
    b.state.multiplier = D("1.5");
    await b.pass();
    await b.db.insert(lots).values({
      userId: b.userId,
      tokenId: b.tokenId,
      instrumentId: b.instrumentId,
      tokenQty: 0n,
      shares: "0.5",
      unitCostUsd: "0",
      acquiredAt: new Date(),
      source: "dividend",
    });
    await b.pass();

    const p = await b.position();
    expect(sharesOf(p.shares)).toBe("1.5");
    expect(sharesOf(p.sharesWithBasis)).toBe("1.5");
    expect(usdOf(p.costBasisUsd)).toBe("100.00");
  });

  it("credit a dividend once when tokens leave in the same pass the multiplier rises", async () => {
    /*
     * One token, one share, $200. Then half the token is sent away and the
     * multiplier rises to 1.5, and a single pass sees both. The dividend is on
     * the half token still here: 0.5 x (1.5 - 1) = 0.25 shares, so the holding
     * is 0.5 x 1.5 = 0.75 shares, still costing the $100 that stayed.
     *
     * The pass writes the transfer out and the dividend in one transaction, so
     * the two share a timestamp. The next pass replays them, and if it put the
     * dividend first it would scale it down with the transfer, read 0.625
     * shares, and credit another 0.125 as a second dividend.
     */
    const b = await books();
    await b.buy(ONE, 200);
    await b.pass();
    b.state.wallet -= ONE / 2n; // sent from another app
    b.state.multiplier = D("1.5");
    await b.pass();

    const settled = await b.position();
    expect(sharesOf(settled.shares)).toBe("0.75");
    expect(sharesOf(settled.sharesWithBasis)).toBe("0.75");
    expect(usdOf(settled.costBasisUsd)).toBe("100.00");

    await b.pass();

    const dividends = await b.db.select().from(lots).where(eq(lots.source, "dividend"));
    expect(dividends.map((l) => sharesOf(l.shares))).toEqual(["0.25"]);
    const feed = await b.db.select().from(activities).where(eq(activities.kind, "dividend"));
    expect(feed).toHaveLength(1);
    expect(await b.disposalKinds()).toEqual(["transfer_out"]);
    const after = await b.position();
    expect(sharesOf(after.sharesWithBasis)).toBe("0.75");
    expect(usdOf(after.costBasisUsd)).toBe("100.00");
  });
});
