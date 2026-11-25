import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { ChainReader } from "@mercury/chain";
import { mercuryWallet, testDb } from "../db/testing.js";
import { instruments, lots, positions, tokens, users, wallets } from "../db/schema.js";
import type { ReconcileDeps } from "./apply.js";
import { syncAllPositions } from "./sync.js";

/**
 * position-sync with linked wallets: every followed wallet is read, and each
 * keeps its own positions and its own cost. A person's wallets are not one
 * pile of shares; a cost paid in one says nothing about shares in another.
 */
const TSLAX = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
const ONE = 100_000_000n;

const world = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:many" }).returning();
  const userId = user!.id;
  const mercury = await mercuryWallet(db, userId, "MercuryWa11et");
  const link = async (address: string, unlinkedAt: Date | null = null) => {
    const [row] = await db
      .insert(wallets)
      .values({ userId, address, kind: "external", isPrimary: false, linkedAt: new Date(), unlinkedAt })
      .returning();
    return row!.id;
  };
  const [instrument] = await db.insert(instruments).values({ ticker: "TSLA", name: "Tesla" }).returning();
  const [token] = await db
    .insert(tokens)
    .values({ instrumentId: instrument!.id, mint: TSLAX, issuer: "backed", symbol: "TSLAx", decimals: 8 })
    .returning();

  const held = new Map<string, bigint>();
  const asked: string[] = [];
  const chain: ChainReader = {
    mintConfig: async () => null,
    tokenBalances: async (owner) => {
      asked.push(owner);
      const raw = held.get(owner) ?? 0n;
      return raw === 0n ? [] : [{ mint: TSLAX, rawAmount: raw, decimals: 8 }];
    },
  };
  const deps: ReconcileDeps = {
    chain,
    prices: { pricesFor: async () => new Map() } as unknown as ReconcileDeps["prices"],
    multipliers: { multipliersFor: async () => new Map() } as unknown as ReconcileDeps["multipliers"],
  };
  const positionOf = async (walletId: string) =>
    (
      await db
        .select()
        .from(positions)
        .where(and(eq(positions.walletId, walletId), eq(positions.instrumentId, instrument!.id)))
    )[0];
  return {
    db,
    userId,
    mercury,
    link,
    held,
    asked,
    deps,
    positionOf,
    instrumentId: instrument!.id,
    tokenId: token!.id,
  };
};

describe("syncAllPositions, one person with several wallets", () => {
  it("reads every followed wallet, and no unlinked one", async () => {
    const w = await world();
    await w.link("Phantom1");
    await w.link("Gone", new Date());

    const summary = await syncAllPositions(w.db, w.deps);

    expect(summary.wallets).toBe(2);
    expect([...w.asked].sort()).toEqual(["MercuryWa11et", "Phantom1"]);
  });

  it("keeps each wallet's holding of the same stock as its own position", async () => {
    const w = await world();
    const phantom = await w.link("Phantom1");
    w.held.set("MercuryWa11et", 2n * ONE);
    w.held.set("Phantom1", 3n * ONE);

    await syncAllPositions(w.db, w.deps);

    expect((await w.positionOf(w.mercury))!.shares).toBe("2.000000000000000000");
    expect((await w.positionOf(phantom))!.shares).toBe("3.000000000000000000");
  });

  it("costs each wallet from its own lots, so a cost in one is never lent to another", async () => {
    const w = await world();
    const phantom = await w.link("Phantom1");
    w.held.set("MercuryWa11et", 2n * ONE);
    w.held.set("Phantom1", 2n * ONE);
    await w.db.insert(lots).values({
      userId: w.userId,
      walletId: w.mercury,
      tokenId: w.tokenId,
      instrumentId: w.instrumentId,
      tokenQty: 2n * ONE,
      shares: "2",
      unitCostUsd: "100",
      source: "buy",
    });

    await syncAllPositions(w.db, w.deps);

    const mine = await w.positionOf(w.mercury);
    const linked = await w.positionOf(phantom);
    expect([mine!.sharesWithBasis, mine!.costBasisUsd]).toEqual([
      "2.000000000000000000",
      "200.000000000000000000",
    ]);
    // Shares that arrived where Mercury did not see them have no cost, until the history reader prices them.
    expect([linked!.shares, linked!.sharesWithBasis, linked!.costBasisUsd]).toEqual([
      "2.000000000000000000",
      "0.000000000000000000",
      "0.000000000000000000",
    ]);
  });

  it("records shares that left a linked wallet against that wallet alone", async () => {
    const w = await world();
    const phantom = await w.link("Phantom1");
    w.held.set("MercuryWa11et", 2n * ONE);
    await w.db.insert(lots).values([
      {
        userId: w.userId,
        walletId: w.mercury,
        tokenId: w.tokenId,
        instrumentId: w.instrumentId,
        tokenQty: 2n * ONE,
        shares: "2",
        unitCostUsd: "100",
        source: "buy",
      },
      {
        userId: w.userId,
        walletId: phantom,
        tokenId: w.tokenId,
        instrumentId: w.instrumentId,
        tokenQty: 2n * ONE,
        shares: "2",
        unitCostUsd: "50",
        source: "chain",
      },
    ]);
    // The linked wallet sent its shares away; the Mercury wallet kept its own.
    w.held.set("Phantom1", 0n);

    await syncAllPositions(w.db, w.deps);

    expect((await w.positionOf(w.mercury))!.costBasisUsd).toBe("200.000000000000000000");
    expect((await w.positionOf(phantom))!.shares).toBe("0.000000000000000000");
  });
});
