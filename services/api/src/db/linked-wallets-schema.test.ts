import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { mercuryWallet, testDb } from "./testing.js";
import type { Db } from "./client.js";
import {
  activities,
  disposals,
  earnEvents,
  historyEvents,
  historyJobs,
  historyTxs,
  instruments,
  loanAlerts,
  loanEvents,
  lots,
  notifications,
  orders,
  portfolioSnapshots,
  positions,
  tokens,
  users,
  walletLinkChallenges,
  wallets,
} from "./schema.js";

/**
 * What 0030 promises at the database, checked against a real Postgres: the
 * keys a linked wallet depends on, and what deleting one takes with it.
 */

const world = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:links" }).returning();
  const userId = user!.id;
  const mercury = await mercuryWallet(db, userId, "MercuryWallet");
  const [instrument] = await db.insert(instruments).values({ ticker: "TSLA", name: "Tesla" }).returning();
  const [token] = await db
    .insert(tokens)
    .values({
      instrumentId: instrument!.id,
      mint: "TSLAxMint",
      issuer: "backed",
      symbol: "TSLAx",
      decimals: 8,
    })
    .returning();
  const link = async (address: string) => {
    const [row] = await db
      .insert(wallets)
      .values({ userId, address, kind: "external", isPrimary: false, linkedAt: new Date() })
      .returning({ id: wallets.id });
    return row!.id;
  };
  return { db, userId, mercury, link, instrumentId: instrument!.id, tokenId: token!.id };
};

/** Everything a wallet can own, one row of each, for `walletId`. */
const fill = async (db: Db, userId: string, walletId: string, instrumentId: string, tokenId: string) => {
  const sig = `sig-${walletId}`;
  await db.insert(positions).values({
    userId,
    walletId,
    instrumentId,
    shares: "1",
    costBasisUsd: "100",
    avgUnitCostUsd: "100",
  });
  await db.insert(lots).values({
    userId,
    walletId,
    tokenId,
    instrumentId,
    tokenQty: 100_000_000n,
    shares: "1",
    unitCostUsd: "100",
    source: "link",
    isEstimated: true,
  });
  await db.insert(disposals).values({
    userId,
    walletId,
    tokenId,
    instrumentId,
    tokenQty: 1n,
    shares: "0.00000001",
    kind: "transfer_out",
    occurredAt: new Date(),
  });
  const [order] = await db
    .insert(orders)
    .values({
      userId,
      walletId,
      instrumentId,
      side: "buy",
      usdAmount: "100",
      decision: {},
      status: "filled",
      mercuryFeeUsd: "0.5",
    })
    .returning({ id: orders.id });
  const [activity] = await db
    .insert(activities)
    .values({ userId, walletId, kind: "transfer_in", title: "Added cash", txSignature: sig, mint: "USDC" })
    .returning({ id: activities.id });
  await db.insert(notifications).values({ userId, kind: "money_in", activityId: activity!.id });
  await db.insert(portfolioSnapshots).values({
    userId,
    walletId,
    capturedAt: new Date("2026-11-01T10:00:00Z"),
    totalUsd: "100",
    stocksUsd: "100",
    cashUsd: "0",
  });
  await db.insert(loanEvents).values({
    userId,
    walletId,
    kind: "borrow",
    debtAfterUsd: "10",
    collateralAfterUsd: "100",
    txSignature: sig,
    occurredAt: new Date(),
  });
  await db.insert(loanAlerts).values({ walletId, userId, health: "healthy" });
  await db.insert(earnEvents).values({
    userId,
    walletId,
    kind: "deposit",
    usdcAmount: "20",
    vault: "Vault",
    txSignature: `earn-${sig}`,
    occurredAt: new Date(),
  });
  await db.insert(historyTxs).values({ signature: sig, slot: 1n, raw: {} }).onConflictDoNothing();
  await db.insert(historyEvents).values({ walletId, account: "TokenAccount", signature: sig, kind: "in" });
  await db.insert(historyJobs).values({ walletId, userId });
  return { orderId: order!.id };
};

/** How many rows of each per-wallet table belong to `walletId`. */
const owned = async (db: Db, walletId: string) => ({
  position: (await db.select().from(positions).where(eq(positions.walletId, walletId))).length,
  lot: (await db.select().from(lots).where(eq(lots.walletId, walletId))).length,
  disposal: (await db.select().from(disposals).where(eq(disposals.walletId, walletId))).length,
  activity: (await db.select().from(activities).where(eq(activities.walletId, walletId))).length,
  snapshot: (await db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.walletId, walletId)))
    .length,
  loanEvent: (await db.select().from(loanEvents).where(eq(loanEvents.walletId, walletId))).length,
  loanAlert: (await db.select().from(loanAlerts).where(eq(loanAlerts.walletId, walletId))).length,
  earnEvent: (await db.select().from(earnEvents).where(eq(earnEvents.walletId, walletId))).length,
  historyEvent: (await db.select().from(historyEvents).where(eq(historyEvents.walletId, walletId))).length,
  historyJob: (await db.select().from(historyJobs).where(eq(historyJobs.walletId, walletId))).length,
});

const ONE_OF_EACH = {
  position: 1,
  lot: 1,
  disposal: 1,
  activity: 1,
  snapshot: 1,
  loanEvent: 1,
  loanAlert: 1,
  earnEvent: 1,
  historyEvent: 1,
  historyJob: 1,
};
const NONE = Object.fromEntries(Object.keys(ONE_OF_EACH).map((k) => [k, 0]));

describe("one Mercury wallet per person", () => {
  it("refuses a second primary wallet for the same person", async () => {
    const { db, userId } = await world();
    await expect(
      db.insert(wallets).values({ userId, address: "Another", kind: "privy_embedded", isPrimary: true }),
    ).rejects.toThrow();
  });

  it("lets the same person link as many other wallets as the route allows", async () => {
    const { db, userId, link } = await world();
    for (const address of ["Phantom1", "Phantom2", "Phantom3", "Phantom4", "Phantom5"]) await link(address);
    const rows = await db.select().from(wallets).where(eq(wallets.userId, userId));
    expect(rows.filter((w) => w.isPrimary)).toHaveLength(1);
    expect(rows.filter((w) => !w.isPrimary)).toHaveLength(5);
  });

  it("still refuses one address in two places, linked or not", async () => {
    const { db, link } = await world();
    const [stranger] = await db.insert(users).values({ privyUserId: "did:privy:stranger" }).returning();
    await expect(link("MercuryWallet")).rejects.toThrow();
    await expect(
      db
        .insert(wallets)
        .values({ userId: stranger!.id, address: "MercuryWallet", kind: "external", isPrimary: false }),
    ).rejects.toThrow();
  });
});

describe("rows keyed by wallet", () => {
  it("lets two wallets of one person each hold the same stock, movement, loan and alert", async () => {
    const { db, userId, mercury, link, instrumentId, tokenId } = await world();
    const phantom = await link("Phantom");
    await fill(db, userId, mercury, instrumentId, tokenId);
    // A different signature per wallet in `fill`, so line up the ones that matter.
    await db.insert(activities).values({
      userId,
      walletId: phantom,
      kind: "transfer_out",
      title: "Sent",
      txSignature: `sig-${mercury}`,
      mint: "USDC",
    });
    await db.insert(loanEvents).values({
      userId,
      walletId: phantom,
      kind: "borrow",
      debtAfterUsd: "1",
      collateralAfterUsd: "1",
      txSignature: `sig-${mercury}`,
      occurredAt: new Date(),
    });
    await db.insert(positions).values({
      userId,
      walletId: phantom,
      instrumentId,
      shares: "3",
      costBasisUsd: "0",
      avgUnitCostUsd: "0",
    });
    await db.insert(loanAlerts).values({ walletId: phantom, userId, health: "margin_call" });

    expect((await db.select().from(positions).where(eq(positions.userId, userId))).length).toBe(2);
    expect((await db.select().from(loanAlerts).where(eq(loanAlerts.userId, userId))).length).toBe(2);
  });

  it("still holds one wallet to one row per movement, per loan event, per stock and per hour", async () => {
    const { db, userId, mercury, instrumentId, tokenId } = await world();
    await fill(db, userId, mercury, instrumentId, tokenId);
    const sig = `sig-${mercury}`;
    await expect(
      db
        .insert(activities)
        .values({ userId, walletId: mercury, kind: "x", title: "x", txSignature: sig, mint: "USDC" }),
    ).rejects.toThrow();
    await expect(
      db.insert(loanEvents).values({
        userId,
        walletId: mercury,
        kind: "borrow",
        debtAfterUsd: "1",
        collateralAfterUsd: "1",
        txSignature: sig,
        occurredAt: new Date(),
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(positions).values({
        userId,
        walletId: mercury,
        instrumentId,
        shares: "1",
        costBasisUsd: "0",
        avgUnitCostUsd: "0",
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(portfolioSnapshots).values({
        userId,
        walletId: mercury,
        capturedAt: new Date("2026-11-01T10:00:00Z"),
        totalUsd: "1",
        stocksUsd: "1",
        cashUsd: "0",
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(loanAlerts).values({ walletId: mercury, userId, health: "healthy" }),
    ).rejects.toThrow();
  });

  it("refuses a per-wallet row with no wallet", async () => {
    const { db, userId } = await world();
    await expect(
      db.insert(activities).values({ userId, walletId: null as unknown as string, kind: "x", title: "x" }),
    ).rejects.toThrow();
  });

  it("records who wrote a ledger row, Mercury unless said otherwise", async () => {
    const { db, userId, mercury, instrumentId, tokenId } = await world();
    await fill(db, userId, mercury, instrumentId, tokenId);
    await db.insert(loanEvents).values({
      userId,
      walletId: mercury,
      kind: "pledge",
      debtAfterUsd: "10",
      collateralAfterUsd: "340",
      priceUsd: "240.1",
      originSource: "chain",
      txSignature: "found-in-history",
      occurredAt: new Date("2026-03-03T00:00:00Z"),
    });
    const rows = await db.select().from(loanEvents).orderBy(loanEvents.occurredAt);
    expect(rows.map((r) => [r.originSource, r.priceUsd])).toEqual([
      ["chain", "240.100000000000000000"],
      ["mercury", null],
    ]);
    const [earn] = await db.select().from(earnEvents);
    expect(earn!.originSource).toBe("mercury");
  });

  it("takes every new kind of lot source", async () => {
    const { db, userId, mercury, instrumentId, tokenId } = await world();
    for (const source of ["link", "chain", "declared", "basket_exit"] as const) {
      await db.insert(lots).values({
        userId,
        walletId: mercury,
        tokenId,
        instrumentId,
        tokenQty: 1n,
        shares: "1",
        unitCostUsd: "1",
        source,
      });
    }
    const rows = await db.select({ source: lots.source }).from(lots);
    expect(rows.map((r) => r.source).sort()).toEqual(["basket_exit", "chain", "declared", "link"]);
  });
});

describe("deleting a wallet", () => {
  it("takes every row it owns with it, and nothing of the person's other wallets", async () => {
    const { db, userId, mercury, link, instrumentId, tokenId } = await world();
    const phantom = await link("Phantom");
    await fill(db, userId, mercury, instrumentId, tokenId);
    await fill(db, userId, phantom, instrumentId, tokenId);

    await db.delete(wallets).where(eq(wallets.id, phantom));

    expect(await owned(db, phantom)).toEqual(NONE);
    expect(await owned(db, mercury)).toEqual(ONE_OF_EACH);
  });

  it("takes the inbox notices about its movements with it", async () => {
    const { db, userId, mercury, link, instrumentId, tokenId } = await world();
    const phantom = await link("Phantom");
    await fill(db, userId, mercury, instrumentId, tokenId);
    await fill(db, userId, phantom, instrumentId, tokenId);

    await db.delete(wallets).where(eq(wallets.id, phantom));

    expect(await db.select().from(notifications)).toHaveLength(1);
  });

  it("keeps its orders, without the wallet, because they record the fee charged", async () => {
    const { db, userId, link, instrumentId, tokenId } = await world();
    const phantom = await link("Phantom");
    const { orderId } = await fill(db, userId, phantom, instrumentId, tokenId);

    await db.delete(wallets).where(eq(wallets.id, phantom));

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.walletId).toBeNull();
    expect(order!.mercuryFeeUsd).toBe("0.500000000000000000");
  });

  it("keeps the raw transactions the history reader fetched, which belong to no one wallet", async () => {
    const { db, userId, link, instrumentId, tokenId } = await world();
    const phantom = await link("Phantom");
    await fill(db, userId, phantom, instrumentId, tokenId);

    await db.delete(wallets).where(eq(wallets.id, phantom));

    expect(await db.select().from(historyTxs)).toHaveLength(1);
  });
});

describe("the history reader's tables", () => {
  it("queues a wallet with nothing read yet", async () => {
    const { db, userId, link } = await world();
    const phantom = await link("Phantom");
    await db.insert(historyJobs).values({ walletId: phantom, userId });
    const [job] = await db.select().from(historyJobs);
    expect(job).toMatchObject({
      status: "queued",
      cursors: {},
      attempts: 0,
      lastError: null,
      finishedAt: null,
    });
  });

  it("keeps one job per wallet", async () => {
    const { db, userId, link } = await world();
    const phantom = await link("Phantom");
    await db.insert(historyJobs).values({ walletId: phantom, userId });
    await expect(db.insert(historyJobs).values({ walletId: phantom, userId })).rejects.toThrow();
  });

  it("writes an event once, however often its transaction is read", async () => {
    const { db, link } = await world();
    const phantom = await link("Phantom");
    await db.insert(historyTxs).values({ signature: "S", slot: 5n, raw: { meta: {} } });
    const event = { walletId: phantom, account: "TokenAccount", signature: "S", kind: "in" as const };
    await db.insert(historyEvents).values(event);
    await db.insert(historyEvents).values(event).onConflictDoNothing();
    expect(await db.select().from(historyEvents)).toHaveLength(1);
  });

  it("refuses an event for a transaction it has not kept", async () => {
    const { db, link } = await world();
    const phantom = await link("Phantom");
    await expect(
      db
        .insert(historyEvents)
        .values({ walletId: phantom, account: "A", signature: "NeverFetched", kind: "in" }),
    ).rejects.toThrow();
  });
});

describe("link challenges", () => {
  it("go when their person goes", async () => {
    const { db, userId } = await world();
    await db.insert(walletLinkChallenges).values({
      userId,
      address: "Phantom",
      message: "beta.trymercury.xyz wants you to link this wallet",
      expiresAt: new Date(Date.now() + 600_000),
    });
    await db.delete(users).where(eq(users.id, userId));
    expect(await db.select().from(walletLinkChallenges)).toEqual([]);
  });
});
