import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { D, ZERO } from "@mercury/core";
import { PortfolioHistory } from "@mercury/types";
import type { ChainReader } from "@mercury/chain";
import type { MultiplierSource, PriceBoard, TokenPrice } from "@mercury/market";
import { testDb } from "../db/testing.js";
import { users, wallets } from "../db/schema.js";
import { portfolioRoutes } from "../routes/portfolio.js";
import { readSnapshots } from "./queries.js";
import { snapshotAllPortfolios, type SnapshotDeps } from "./snapshot.js";

/**
 * The job writes and the route reads, over a real database.
 *
 * Everything either side of this seam is covered on its own. What is not, and
 * what no unit test can reach, is whether the two agree: that an hour written
 * lands in the window the route asks for, that numeric(38,18) gives back the
 * cents it was handed, and that the series comes out in the order it went in.
 */
const MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const ADDRESS = "Wa11et00000000000000000000000000000000";

const priceAt = (perShare: string): TokenPrice => ({
  mint: MINT,
  usdPricePerToken: D(perShare),
  pricePerShare: D(perShare),
  changePct24h: D("0"),
  liquidityUsd: D("1000000"),
  multiplier: D(1),
  observedAt: null,
});

describe("snapshot to chart, over a real database", () => {
  it("draws back the hours it recorded, in order and to the cent", async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:rt" }).returning();
    await db
      .insert(wallets)
      .values({ userId: user!.id, address: ADDRESS, kind: "privy_embedded", isPrimary: true });

    // Six hourly readings of one share, at a price that moves every hour.
    const prices = ["100.01", "101.02", "102.03", "103.04", "104.05", "105.06"];
    const now = new Date("2026-09-30T12:00:00.000Z");
    for (const [i, perShare] of prices.entries()) {
      const deps: SnapshotDeps = {
        holdings: async () => [{ shares: D("1"), wrappers: [{ mint: MINT }] }],
        chain: {
          mintConfig: async () => null,
          tokenBalances: async () => [{ mint: USDC, rawAmount: 14_250_000n, decimals: 6 }],
        } as ChainReader,
        prices: { pricesFor: async () => new Map([[MINT, priceAt(perShare)]]) } as unknown as PriceBoard,
        usdcMint: USDC,
      };
      const at = new Date(now.getTime() - (prices.length - 1 - i) * 3_600_000);
      await snapshotAllPortfolios(db, deps, at);
    }

    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("identity", { userId: user!.id, privyUserId: "did:privy:rt", walletAddress: ADDRESS });
      await next();
    });
    app.route(
      "/",
      portfolioRoutes({
        holdings: async () => [],
        prices: { pricesFor: async () => new Map() } as unknown as PriceBoard,
        chain: { mintConfig: async () => null, tokenBalances: async () => [] } as ChainReader,
        multipliers: { multiplierFor: async () => D(1), isPaused: async () => false } as MultiplierSource,
        usdcMint: USDC,
        pledged: async () => [],
        debt: async () => ZERO,
        lastKnownDebt: async () => null,
        snapshots: (userId, from) => readSnapshots(db, userId, from),
      }),
    );

    const body = PortfolioHistory.parse(await (await app.request("/v1/portfolio/history?range=1D")).json());

    expect(body.points).toHaveLength(6);
    // Cents survive the round trip through numeric(38,18): 100.01 + 14.25 cash.
    expect(Number(body.points[0]!.valueUsd)).toBeCloseTo(114.26, 2);
    expect(Number(body.points[5]!.valueUsd)).toBeCloseTo(119.31, 2);
    // Oldest first, and strictly rising, as the prices were.
    const values = body.points.map((p) => Number(p.valueUsd));
    expect([...values].sort((a, b) => a - b)).toEqual(values);
    // The instants are real and an hour apart.
    const gap = new Date(body.points[1]!.at).getTime() - new Date(body.points[0]!.at).getTime();
    expect(gap).toBe(3_600_000);
  });
});
