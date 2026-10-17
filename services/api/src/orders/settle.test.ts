import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { D, ZERO } from "@mercury/core";
import { testDb } from "../db/testing.js";
import { activities, instruments, lots, orders, positions, tokens, users } from "../db/schema.js";
import { settleOrder, tokenRefFor } from "./settle.js";
import type { Fill } from "./fill.js";

const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const SIG = "5f121XsT7YRkYk5SoDMSMAtCmKKwm58NhWumjUNCtR4o6qPBgwCT2upBB3uUizLsykU51RSvLt1Z8Cwt5RXFcbAW";
const AT = new Date("2026-09-29T14:00:00.000Z");

const seed = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:test" }).returning();
  const [instrument] = await db
    .insert(instruments)
    .values({ ticker: "NVDA", name: "Nvidia", sector: "Technology" })
    .returning();
  const [token] = await db
    .insert(tokens)
    .values({
      instrumentId: instrument!.id,
      mint: NVDAX,
      symbol: "NVDAx",
      issuer: "backed",
      decimals: 8,
    })
    .returning();
  const [order] = await db
    .insert(orders)
    .values({
      userId: user!.id,
      instrumentId: instrument!.id,
      side: "buy",
      usdAmount: "100",
      decision: { kind: "execute" },
      chosenTokenId: token!.id,
      status: "executing",
    })
    .returning();

  return { db, userId: user!.id, instrumentId: instrument!.id, tokenId: token!.id, orderId: order!.id };
};

const aFill: Fill = {
  kind: "filled",
  tokensRaw: 44_901_800n,
  tokens: D("0.449018"),
  shares: D("0.44978187"),
  usd: D(100),
  feeUsd: ZERO,
  pricePerShare: D("222.33"),
  occurredAt: AT,
};

const inputFor = (
  s: Awaited<ReturnType<typeof seed>>,
  over: Partial<Parameters<typeof settleOrder>[1]> = {},
) => ({
  userId: s.userId,
  orderId: s.orderId,
  signature: SIG,
  side: "buy" as const,
  ticker: "NVDA",
  mint: NVDAX,
  tokenId: s.tokenId,
  instrumentId: s.instrumentId,
  fill: aFill,
  referencePricePerShare: null,
  ...over,
});

describe("settleOrder", () => {
  it("writes the order, the lot and the feed entry in one go", async () => {
    const s = await seed();
    const result = await settleOrder(s.db, inputFor(s));
    expect(result.kind).toBe("settled");

    const [order] = await s.db.select().from(orders).where(eq(orders.id, s.orderId));
    expect(order!.status).toBe("filled");
    expect(order!.txSignature).toBe(SIG);
    expect(order!.filledAt).toEqual(AT);

    const [lot] = await s.db.select().from(lots).where(eq(lots.userId, s.userId));
    expect(lot!.tokenQty).toBe(44_901_800n);
    // The price actually paid, per real share, and not marked as a guess.
    expect(Number(lot!.unitCostUsd)).toBeCloseTo(222.33, 2);
    expect(lot!.source).toBe("buy");
    expect(lot!.isEstimated).toBe(false);
    expect(lot!.orderId).toBe(s.orderId);

    const [row] = await s.db.select().from(activities).where(eq(activities.userId, s.userId));
    expect(row!.kind).toBe("buy");
    expect(row!.title).toBe("Bought NVDA");
    expect(row!.subtitle).toBe("0.449782 shares at $222.33");
    expect(row!.txSignature).toBe(SIG);
    expect(row!.mint).toBe(NVDAX);
  });

  it("settles once however many times it is called", async () => {
    const s = await seed();
    const first = await settleOrder(s.db, inputFor(s));
    const second = await settleOrder(s.db, inputFor(s));
    const third = await settleOrder(s.db, inputFor(s));

    expect(first.kind).toBe("settled");
    expect(second.kind).toBe("already_settled");
    expect(third.kind).toBe("already_settled");

    expect((await s.db.select().from(lots)).length).toBe(1);
    expect((await s.db.select().from(activities)).length).toBe(1);
  });

  it("writes nothing at all when two confirms race", async () => {
    const s = await seed();
    const [a, b] = await Promise.all([settleOrder(s.db, inputFor(s)), settleOrder(s.db, inputFor(s))]);
    // Exactly one wins, whichever it is.
    expect([a.kind, b.kind].sort()).toEqual(["already_settled", "settled"]);
    expect((await s.db.select().from(lots)).length).toBe(1);
  });

  it("writes no lot for a sell, because selling acquires nothing", async () => {
    const s = await seed();
    await settleOrder(s.db, inputFor(s, { side: "sell" }));

    expect((await s.db.select().from(lots)).length).toBe(0);
    const [row] = await s.db.select().from(activities);
    expect(row!.kind).toBe("sell");
    expect(row!.title).toBe("Sold NVDA");
  });

  it("says what a sell made, when every share sold has a cost behind it", async () => {
    const s = await seed();
    await s.db.insert(positions).values({
      userId: s.userId,
      instrumentId: s.instrumentId,
      shares: "1",
      sharesWithBasis: "1",
      costBasisUsd: "200",
      avgUnitCostUsd: "200",
    });

    // 0.44978187 shares that cost $200 each, sold for $100 in total.
    const result = await settleOrder(s.db, inputFor(s, { side: "sell" }));
    expect(result.kind).toBe("settled");
    if (result.kind !== "settled") return;
    expect(result.realisedPnlUsd!.toFixed(2)).toBe("10.04");

    // The gain is the order's to keep and the receipt's to show; the feed's line is the trade.
    const [order] = await s.db.select().from(orders).where(eq(orders.id, s.orderId));
    expect(D(order!.realisedPnlUsd!).toFixed(2)).toBe("10.04");
    const [row] = await s.db.select().from(activities);
    expect(row!.subtitle).toBe("0.449782 shares at $222.33");
  });

  it("stays silent about profit on shares it cannot prove a cost for", async () => {
    const s = await seed();
    await s.db.insert(positions).values({
      userId: s.userId,
      instrumentId: s.instrumentId,
      shares: "1",
      // Less basis than is being sold: the rest arrived by a path we never saw.
      sharesWithBasis: "0.1",
      costBasisUsd: "20",
      avgUnitCostUsd: "200",
    });

    const result = await settleOrder(s.db, inputFor(s, { side: "sell" }));
    expect(result.kind === "settled" && result.realisedPnlUsd).toBeNull();
    const [order] = await s.db.select().from(orders).where(eq(orders.id, s.orderId));
    expect(order!.realisedPnlUsd).toBeNull();
  });

  it("keeps the fee off the share price and on its own line", async () => {
    const s = await seed();
    // $20 left the wallet, $0.23 of it to the relayer, so $19.77 bought the
    // shares. The lot has to record $19.77 worth, or the position opens down
    // 1.15% on a stock that has not moved.
    await settleOrder(
      s.db,
      inputFor(s, {
        fill: { ...aFill, usd: D("19.77"), feeUsd: D("0.23"), pricePerShare: D("43.95") },
      }),
    );

    const [lot] = await s.db.select().from(lots);
    expect(lot!.unitCostUsd).toBe("43.950000000000000000");
    expect(lot!.feeUsd).toBe("0.230000000000000000");

    const [order] = await s.db.select().from(orders).where(eq(orders.id, s.orderId));
    expect(order!.feeUsd).toBe("0.230000000000000000");

    // The fee is on the order and the lot, and the receipt splits it out; the feed's line is the trade.
    const [activity] = await s.db.select().from(activities);
    expect(activity!.subtitle).toBe("0.449782 shares at $43.95");
    // What crossed the wallet's edge is the swap plus the charge.
    expect(activity!.amountUsd).toBe("20.000000000000000000");
  });

  it("records what the stock was quoted at, so a return can be split later", async () => {
    const s = await seed();
    await settleOrder(s.db, inputFor(s, { referencePricePerShare: D("220.00") }));
    const [lot] = await s.db.select().from(lots);
    expect(lot!.referencePriceUsd).toBe("220.000000000000000000");
    // $222.33 paid against $220.00 quoted is $2.33 a share of premium and
    // spread, which is a cost of trading and not the stock falling.
    expect(lot!.unitCostUsd).toBe("222.330000000000000000");
  });

  it("leaves the reference null when nothing could price the mint", async () => {
    const s = await seed();
    await settleOrder(s.db, inputFor(s));
    const [lot] = await s.db.select().from(lots);
    expect(lot!.referencePriceUsd).toBeNull();
  });

  it("stores what a sell made on the order, so closing a position cannot erase it", async () => {
    const s = await seed();
    await s.db.insert(positions).values({
      userId: s.userId,
      instrumentId: s.instrumentId,
      shares: "1",
      sharesWithBasis: "1",
      costBasisUsd: "200",
      avgUnitCostUsd: "200",
    });

    await settleOrder(s.db, inputFor(s, { side: "sell", fill: { ...aFill, feeUsd: D("0.25") } }));
    const [order] = await s.db.select().from(orders).where(eq(orders.id, s.orderId));
    // Gross of its own fee: the fee is on the same row, counted once.
    expect(order!.realisedPnlUsd).toBe("10.043626000000000000");
    expect(order!.feeUsd).toBe("0.250000000000000000");
    // A sell leaves the wallet the proceeds less the charge.
    const [activity] = await s.db.select().from(activities);
    expect(activity!.amountUsd).toBe("99.750000000000000000");
  });

  it("leaves the realised figure null on a buy, which realises nothing", async () => {
    const s = await seed();
    await settleOrder(s.db, inputFor(s));
    const [order] = await s.db.select().from(orders).where(eq(orders.id, s.orderId));
    expect(order!.realisedPnlUsd).toBeNull();
  });

  it("will not settle an order that already reached an end", async () => {
    const s = await seed();
    await s.db.update(orders).set({ status: "refused" }).where(eq(orders.id, s.orderId));
    expect((await settleOrder(s.db, inputFor(s))).kind).toBe("already_settled");
    expect((await s.db.select().from(lots)).length).toBe(0);
  });

  it("finds the token and instrument behind a mint", async () => {
    const s = await seed();
    expect(await tokenRefFor(s.db, NVDAX)).toEqual({
      tokenId: s.tokenId,
      instrumentId: s.instrumentId,
    });
    expect(await tokenRefFor(s.db, "NotAMint")).toBeNull();
  });
});
