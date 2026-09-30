import { describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { D } from "@mercury/core";
import type { ChainReader, TokenBalance } from "@mercury/chain";
import type { TokenPrice } from "@mercury/market";
import { testDb } from "../db/testing.js";
import { portfolioSnapshots, users, wallets } from "../db/schema.js";
import type { Db } from "../db/client.js";
import { snapshotAllPortfolios, type SnapshotDeps } from "./snapshot.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MINT = "Xsc9NVDAx";
const ADDRESS = (i: number) => `Wa11et${String(i).padStart(38, "0")}`;

const seed = async (count: number): Promise<{ db: Db; ids: string[] }> => {
  const db = await testDb();
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const [user] = await db
      .insert(users)
      .values({ privyUserId: `did:privy:u${i}` })
      .returning();
    ids.push(user!.id);
    await db
      .insert(wallets)
      .values({ userId: user!.id, address: ADDRESS(i), kind: "privy_embedded", isPrimary: true });
  }
  return { db, ids };
};

const price: TokenPrice = {
  mint: MINT,
  usdPricePerToken: D("100"),
  pricePerShare: D("100"),
  changePct24h: D("0"),
  liquidityUsd: D("1000000"),
  multiplier: D(1),
  observedAt: null,
};

/** One share of a $100 stock and $14.25 of cash, for every wallet. */
const deps = (over: Partial<SnapshotDeps> = {}): SnapshotDeps => ({
  holdings: async () => [{ shares: D("1"), wrappers: [{ mint: MINT }] }],
  chain: {
    mintConfig: async () => null,
    tokenBalances: async (): Promise<TokenBalance[]> => [{ mint: USDC, rawAmount: 14_250_000n, decimals: 6 }],
  } as ChainReader,
  prices: { pricesFor: async () => new Map([[MINT, price]]) } as unknown as SnapshotDeps["prices"],
  usdcMint: USDC,
  ...over,
});

const rowsFor = (db: Db, userId: string) =>
  db
    .select()
    .from(portfolioSnapshots)
    .where(eq(portfolioSnapshots.userId, userId))
    .orderBy(asc(portfolioSnapshots.capturedAt));

describe("snapshotAllPortfolios", () => {
  it("writes one reading per account, stocks and cash apart and together", async () => {
    const { db, ids } = await seed(1);

    const summary = await snapshotAllPortfolios(db, deps(), new Date("2026-09-30T12:34:56.000Z"));

    expect(summary).toEqual({ wallets: 1, written: 1, failed: 0 });
    const rows = await rowsFor(db, ids[0]!);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.stocksUsd)).toBe(100);
    expect(Number(rows[0]!.cashUsd)).toBe(14.25);
    expect(Number(rows[0]!.totalUsd)).toBe(114.25);
  });

  it("keys the reading to the top of the hour, not to the moment it ran", async () => {
    const { db, ids } = await seed(1);
    await snapshotAllPortfolios(db, deps(), new Date("2026-09-30T12:34:56.000Z"));
    const rows = await rowsFor(db, ids[0]!);
    expect(rows[0]!.capturedAt.toISOString()).toBe("2026-09-30T12:00:00.000Z");
  });

  it("upserts within the hour, so a restart corrects the reading instead of doubling it", async () => {
    const { db, ids } = await seed(1);
    await snapshotAllPortfolios(db, deps(), new Date("2026-09-30T12:05:00.000Z"));
    await snapshotAllPortfolios(
      db,
      deps({ holdings: async () => [{ shares: D("3"), wrappers: [{ mint: MINT }] }] }),
      new Date("2026-09-30T12:55:00.000Z"),
    );

    const rows = await rowsFor(db, ids[0]!);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.stocksUsd)).toBe(300);
  });

  it("adds a row once the hour turns over", async () => {
    const { db, ids } = await seed(1);
    await snapshotAllPortfolios(db, deps(), new Date("2026-09-30T12:05:00.000Z"));
    await snapshotAllPortfolios(db, deps(), new Date("2026-09-30T13:05:00.000Z"));
    expect(await rowsFor(db, ids[0]!)).toHaveLength(2);
  });

  it("records an empty account as zero rather than skipping it, so its line starts at zero", async () => {
    const { db, ids } = await seed(1);
    const empty = deps({
      holdings: async () => [],
      chain: { mintConfig: async () => null, tokenBalances: async () => [] } as ChainReader,
    });

    await snapshotAllPortfolios(db, empty, new Date("2026-09-30T12:00:00.000Z"));

    const rows = await rowsFor(db, ids[0]!);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.totalUsd)).toBe(0);
  });

  it("lets one unreadable wallet fail without costing the others their reading", async () => {
    const { db, ids } = await seed(3);
    const flaky = deps({
      chain: {
        mintConfig: async () => null,
        tokenBalances: async (owner: string) => {
          if (owner === ADDRESS(1)) throw new Error("node said no");
          return [{ mint: USDC, rawAmount: 14_250_000n, decimals: 6 }];
        },
      } as ChainReader,
    });

    const summary = await snapshotAllPortfolios(db, flaky, new Date("2026-09-30T12:00:00.000Z"));

    expect(summary).toEqual({ wallets: 3, written: 2, failed: 1 });
    expect(await rowsFor(db, ids[0]!)).toHaveLength(1);
    expect(await rowsFor(db, ids[1]!)).toHaveLength(0);
    expect(await rowsFor(db, ids[2]!)).toHaveLength(1);
  });

  it("does nothing, without complaint, when there are no accounts", async () => {
    const db = await testDb();
    expect(await snapshotAllPortfolios(db, deps(), new Date())).toEqual({
      wallets: 0,
      written: 0,
      failed: 0,
    });
  });

  it("asks the price board only for the mints the account actually holds", async () => {
    const { db } = await seed(1);
    const asked: string[][] = [];
    await snapshotAllPortfolios(
      db,
      deps({
        prices: {
          pricesFor: async (mints: readonly string[]) => {
            asked.push([...mints]);
            return new Map([[MINT, price]]);
          },
        } as unknown as SnapshotDeps["prices"],
      }),
      new Date("2026-09-30T12:00:00.000Z"),
    );
    expect(asked).toEqual([[MINT]]);
  });
});
