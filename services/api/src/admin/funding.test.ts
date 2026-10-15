import { describe, expect, it } from "vitest";
import { testDb } from "../db/testing.js";
import { FIXTURE_RANGE, seedAdminFixtures } from "./fixtures.js";
import { fundingStats } from "./funding.js";
import { parseRange } from "./range.js";

const range = parseRange(FIXTURE_RANGE);

describe("fundingStats", () => {
  it("groups deposits by the chain they came from", async () => {
    /* This is the question the dashboard was asked for: which chains is money
       arriving from, and is that changing. `funding_intent` has stored
       `origin_chain_name` since the row was designed, precisely so the answer
       does not depend on what Relay calls a chain today. */
    const db = await testDb();
    await seedAdminFixtures(db);

    const stats = await fundingStats(db, range);

    expect(stats.byChain).toEqual([
      { chain: "Base", day: "2026-09-02", status: "settled", count: 1 },
      { chain: "Arbitrum", day: "2026-09-03", status: "settled", count: 1 },
      { chain: "Base", day: "2026-09-04", status: "failed", count: 1 },
    ]);
  });

  it("counts each status separately, so a failure rate is readable", async () => {
    const db = await testDb();
    await seedAdminFixtures(db);

    const stats = await fundingStats(db, range);

    expect(stats.byChain.filter((r) => r.status === "failed")).toHaveLength(1);
    expect(stats.byChain.filter((r) => r.status === "settled")).toHaveLength(2);
  });

  it("names why deposits failed", async () => {
    const db = await testDb();
    await seedAdminFixtures(db);

    const stats = await fundingStats(db, range);

    expect(stats.failures).toEqual([{ reason: "underpaid", count: 1 }]);
  });

  it("reports how long a deposit took to settle, per chain", async () => {
    /* updated_at - created_at, which is the only latency this system records
       for the cross-chain path. Base settled in 30 seconds and Arbitrum in
       60, as seeded. */
    const db = await testDb();
    await seedAdminFixtures(db);

    const stats = await fundingStats(db, range);

    expect(stats.settleSeconds).toEqual([
      { chain: "Arbitrum", p50: 60 },
      { chain: "Base", p50: 30 },
    ]);
  });

  it("times only deposits that settled", async () => {
    /* The failed Base deposit took five minutes to give up. Counting it would
       report Base's settle time as two and a half minutes — a number that
       describes a failure, under a heading that says settled. */
    const db = await testDb();
    await seedAdminFixtures(db);

    const stats = await fundingStats(db, range);

    expect(stats.settleSeconds.find((r) => r.chain === "Base")?.p50).toBe(30);
  });

  it("excludes rows outside the range", async () => {
    const db = await testDb();
    await seedAdminFixtures(db);

    const stats = await fundingStats(db, parseRange({ from: "2020-01-01", to: "2020-02-01" }));

    expect(stats).toEqual({ byChain: [], settleSeconds: [], failures: [] });
  });

  it("returns empty arrays rather than failing on an empty database", async () => {
    const db = await testDb();

    const stats = await fundingStats(db, range);

    expect(stats).toEqual({ byChain: [], settleSeconds: [], failures: [] });
  });
});
