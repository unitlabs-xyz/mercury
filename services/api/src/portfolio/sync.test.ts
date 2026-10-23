import { describe, expect, it } from "vitest";
import type { ChainReader } from "@mercury/chain";
import { testDb } from "../db/testing.js";
import { users, wallets } from "../db/schema.js";
import type { ReconcileDeps } from "./apply.js";
import { syncAllPositions } from "./sync.js";

const ADDRESS = (i: number) => `Wa11et${String(i).padStart(38, "0")}`;

const seed = async (count: number) => {
  const db = await testDb();
  for (let i = 0; i < count; i++) {
    const [user] = await db
      .insert(users)
      .values({ privyUserId: `did:privy:u${i}` })
      .returning();
    await db
      .insert(wallets)
      .values({ userId: user!.id, address: ADDRESS(i), kind: "privy_embedded", isPrimary: true });
  }
  return db;
};

/**
 * A node that records how many reads overlap, and can be told to fail for one
 * wallet. Each read is held open briefly, so the peak is a real overlap rather
 * than a race that happened to resolve in order.
 */
const watchfulChain = (failFor: string | null = null) => {
  let inFlight = 0;
  let peak = 0;
  const chain: ChainReader = {
    mintConfig: async () => null,
    tokenBalances: async (owner) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      if (owner === failFor) throw new Error("node said no");
      return [];
    },
  };
  const deps: ReconcileDeps = {
    chain,
    prices: { priceFor: async () => null } as unknown as ReconcileDeps["prices"],
    multipliers: {
      multiplierFor: async () => null,
      isPaused: async () => false,
    } as unknown as ReconcileDeps["multipliers"],
  };
  return { deps, peak: () => peak };
};

describe("syncAllPositions", () => {
  it("reads only the wallets that are due, and says which it read", async () => {
    const db = await seed(4);
    const asked: string[] = [];
    const node = watchfulChain();
    const deps: ReconcileDeps = {
      ...node.deps,
      chain: { ...node.deps.chain, tokenBalances: async (owner) => (asked.push(owner), []) },
    };
    const read: string[] = [];
    const summary = await syncAllPositions(db, deps, {
      due: (address) => address === ADDRESS(1) || address === ADDRESS(2),
      read: (address) => read.push(address),
    });
    expect(asked.sort()).toEqual([ADDRESS(1), ADDRESS(2)]);
    expect(read.sort()).toEqual([ADDRESS(1), ADDRESS(2)]);
    expect(summary.wallets).toBe(2);
  });

  it("reconciles wallets alongside each other rather than one after another", async () => {
    const db = await seed(20);
    const node = watchfulChain();

    const summary = await syncAllPositions(db, node.deps);

    expect(summary.wallets).toBe(20);
    // Sequential would peak at 1, which is what made one pass take as long as
    // the number of users, and left the batcher nothing to collect.
    expect(node.peak()).toBeGreaterThan(1);
  });

  it("keeps the number in flight under a bound, so connections are not dropped", async () => {
    const db = await seed(40);
    const node = watchfulChain();

    await syncAllPositions(db, node.deps);

    expect(node.peak()).toBeLessThanOrEqual(8);
  });

  it("counts a wallet the node refused without abandoning the others", async () => {
    const db = await seed(6);
    const node = watchfulChain(ADDRESS(3));

    const summary = await syncAllPositions(db, node.deps);

    expect(summary.failed).toBe(1);
    expect(summary.wallets).toBe(6);
  });

  it("does nothing, and nothing awkward, with no wallets at all", async () => {
    const db = await seed(0);
    const node = watchfulChain();
    await expect(syncAllPositions(db, node.deps)).resolves.toEqual({
      wallets: 0,
      reconciled: 0,
      failed: 0,
      written: 0,
    });
  });
});
