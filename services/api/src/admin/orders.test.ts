import { describe, expect, it } from "vitest";
import { testDb } from "../db/testing.js";
import { FIXTURE_RANGE, seedAdminFixtures } from "./fixtures.js";
import { orderStats } from "./orders.js";
import { parseRange } from "./range.js";

const range = parseRange(FIXTURE_RANGE);

describe("orderStats", () => {
  it("separates buys from sells, by day", async () => {
    const db = await testDb();
    await seedAdminFixtures(db);

    const s = await orderStats(db, range);

    expect(s.byDay.map((r) => ({ day: r.day, buys: r.buys, sells: r.sells }))).toEqual([
      { day: "2026-09-05", buys: 2, sells: 0 },
      { day: "2026-09-06", buys: 0, sells: 1 },
    ]);
  });

  it("sums money as exact decimal strings, never floats", async () => {
    /* `usd()` is numeric(38,18) because a float cannot hold a cent. Summing
       through a JavaScript number on the way to a dashboard would undo that
       for the one figure somebody quotes. */
    const db = await testDb();
    await seedAdminFixtures(db);

    const s = await orderStats(db, range);

    expect(s.byDay[0]).toEqual({
      day: "2026-09-05",
      buys: 2,
      sells: 0,
      volumeUsd: "300",
      feesUsd: "3",
      revenueUsd: "1.5",
      realisedPnlUsd: "0",
    });
    expect(s.byDay[1]).toEqual({
      day: "2026-09-06",
      buys: 0,
      sells: 1,
      volumeUsd: "50",
      feesUsd: "0.5",
      revenueUsd: "0.25",
      realisedPnlUsd: "5",
    });
  });

  it("separates what was charged from what was revenue", async () => {
    /* One transfer carries the network cost and Mercury's fee together, so the
       chain cannot tell them apart — `mercury_fee_usd` is where the build says
       which part was ours. Reporting `fee_usd` as revenue would overstate it
       by the gas we repaid: 3.00 against 1.50 on the fifth. */
    const db = await testDb();
    await seedAdminFixtures(db);

    const s = await orderStats(db, range);

    expect(s.byDay[0]?.feesUsd).toBe("3");
    expect(s.byDay[0]?.revenueUsd).toBe("1.5");
  });

  it("counts a refused order under its status and leaves it out of volume", async () => {
    /* A refused order is a quote nobody filled. Its $999 never moved, so
       adding it to volume reports money that does not exist — and on the
       seventh it would be the largest day in the series. */
    const db = await testDb();
    await seedAdminFixtures(db);

    const s = await orderStats(db, range);

    expect(s.byStatus).toEqual([
      { status: "filled", count: 3 },
      { status: "refused", count: 1 },
    ]);
    expect(s.byDay.map((r) => r.day)).not.toContain("2026-09-07");
    expect(s.byDay.some((r) => r.volumeUsd.includes("999"))).toBe(false);
  });

  it("orders the busiest tickers by volume, not by count", async () => {
    /* AAPL has two orders and TSLA one, but TSLA moved $200 against AAPL's
       $150. "Busiest" on a trading dashboard means money. */
    const db = await testDb();
    await seedAdminFixtures(db);

    const s = await orderStats(db, range);

    expect(s.topTickers).toEqual([
      { ticker: "TSLA", count: 1, volumeUsd: "200" },
      { ticker: "AAPL", count: 2, volumeUsd: "150" },
    ]);
  });

  it("excludes rows outside the range", async () => {
    const db = await testDb();
    await seedAdminFixtures(db);

    const s = await orderStats(db, parseRange({ from: "2020-01-01", to: "2020-02-01" }));

    expect(s).toEqual({ byDay: [], byStatus: [], topTickers: [] });
  });

  it("returns empty arrays rather than failing on an empty database", async () => {
    const db = await testDb();

    expect(await orderStats(db, range)).toEqual({ byDay: [], byStatus: [], topTickers: [] });
  });
});
