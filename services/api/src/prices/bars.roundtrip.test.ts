import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import type { TokenPrice } from "@mercury/market";
import type { Db } from "../db/client.js";
import { testDb } from "../db/testing.js";
import { instruments, tokens } from "../db/schema.js";
import { barsFor } from "./queries.js";
import { prunePriceBars, recordPriceBars } from "./record.js";

/**
 * The recorder writes and the query reads, over a real database.
 *
 * The folding happens in the upsert, so a fake would only assert our belief
 * about `on conflict` back to us. These are the cases where that belief could
 * be wrong: a bar touched twice, a sample arriving out of order, a quote that
 * comes and goes.
 */
const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

const seeded = async (): Promise<{ db: Db; tokenId: string }> => {
  const db = await testDb();
  const [instrument] = await db.insert(instruments).values({ ticker: "NVDA", name: "NVIDIA" }).returning();
  const [token] = await db
    .insert(tokens)
    .values({ instrumentId: instrument!.id, mint: NVDAX, issuer: "backed", symbol: "NVDAx", decimals: 8 })
    .returning();
  return { db, tokenId: token!.id };
};

/** NVDAx at a pool price per share, with or without the issuer's quote. */
const board = (market: string, reference: string | null = "190"): ReadonlyMap<string, TokenPrice> =>
  new Map([
    [
      NVDAX,
      {
        mint: NVDAX,
        usdPricePerToken: D(market),
        pricePerShare: reference === null ? null : D(reference),
        changePct24h: null,
        liquidityUsd: D("3806032"),
        multiplier: D(1),
        observedAt: null,
      },
    ],
  ]);

const at = (iso: string) => new Date(iso);
const DAY = at("2026-10-14T00:00:00Z");
const NEXT_DAY = at("2026-10-15T00:00:00Z");

const ohlc = (bar: { open: unknown; high: unknown; low: unknown; close: unknown } | null) =>
  bar === null ? null : [bar.open, bar.high, bar.low, bar.close].map(String);

describe("price bars, over a real database", () => {
  it("opens a bar at every width from one sample", async () => {
    const { db, tokenId } = await seeded();
    const summary = await recordPriceBars(db, board("190.40"), at("2026-10-14T13:47:31Z"));
    expect(summary).toEqual({ samples: 1 });

    for (const width of ["1m", "1h", "1d"] as const) {
      const bars = await barsFor(db, tokenId, width, DAY, NEXT_DAY);
      expect(bars).toHaveLength(1);
      expect(ohlc(bars[0]!.market)).toEqual(["190.4", "190.4", "190.4", "190.4"]);
      expect(bars[0]!.samples).toBe(1);
    }
    const [minute] = await barsFor(db, tokenId, "1m", DAY, NEXT_DAY);
    expect(minute!.bucketStart.toISOString()).toBe("2026-10-14T13:47:00.000Z");
  });

  it("folds samples in the same minute into one bar", async () => {
    const { db, tokenId } = await seeded();
    await recordPriceBars(db, board("190.40"), at("2026-10-14T13:47:10Z"));
    await recordPriceBars(db, board("191.00"), at("2026-10-14T13:47:30Z"));
    await recordPriceBars(db, board("189.90"), at("2026-10-14T13:47:50Z"));

    const bars = await barsFor(db, tokenId, "1m", DAY, NEXT_DAY);
    expect(bars).toHaveLength(1);
    expect(ohlc(bars[0]!.market)).toEqual(["190.4", "191", "189.9", "189.9"]);
    expect(bars[0]!.samples).toBe(3);
  });

  it("starts a new minute and carries on the same hour", async () => {
    const { db, tokenId } = await seeded();
    await recordPriceBars(db, board("190.40"), at("2026-10-14T13:47:50Z"));
    await recordPriceBars(db, board("191.00"), at("2026-10-14T13:48:10Z"));

    expect(await barsFor(db, tokenId, "1m", DAY, NEXT_DAY)).toHaveLength(2);
    const [hour] = await barsFor(db, tokenId, "1h", DAY, NEXT_DAY);
    expect(ohlc(hour!.market)).toEqual(["190.4", "191", "190.4", "191"]);
    expect(hour!.samples).toBe(2);
  });

  it("lets a late sample widen a bar but not take its close", async () => {
    // Two containers overlap through a rolling deploy, and each runs the job.
    // The one that read earlier can write later; its price is still a price
    // that bar saw, but it is not the last one.
    const { db, tokenId } = await seeded();
    await recordPriceBars(db, board("190.00"), at("2026-10-14T13:47:50Z"));
    await recordPriceBars(db, board("195.00"), at("2026-10-14T13:47:10Z"));

    const [bar] = await barsFor(db, tokenId, "1m", DAY, NEXT_DAY);
    expect(ohlc(bar!.market)).toEqual(["195", "195", "190", "190"]);
  });

  it("folds the issuer's quote over the samples that carried one", async () => {
    // The quote is missing for a moment and then back. A gap in it is not a
    // price of nothing, so it neither opens nor closes the bar.
    const { db, tokenId } = await seeded();
    await recordPriceBars(db, board("190.40", null), at("2026-10-14T13:47:10Z"));
    await recordPriceBars(db, board("190.40", "190.10"), at("2026-10-14T13:47:30Z"));
    await recordPriceBars(db, board("190.40", null), at("2026-10-14T13:47:50Z"));

    const [bar] = await barsFor(db, tokenId, "1m", DAY, NEXT_DAY);
    expect(ohlc(bar!.reference)).toEqual(["190.1", "190.1", "190.1", "190.1"]);
  });

  it("records no quote for a bar that never had one", async () => {
    const { db, tokenId } = await seeded();
    await recordPriceBars(db, board("190.40", null), at("2026-10-14T13:47:10Z"));
    const [bar] = await barsFor(db, tokenId, "1m", DAY, NEXT_DAY);
    expect(bar!.reference).toBeNull();
  });

  it("writes nothing for a mint it has no token for", async () => {
    const db = await testDb();
    expect(await recordPriceBars(db, board("190.40"), at("2026-10-14T13:47:10Z"))).toEqual({ samples: 0 });
  });

  it("reads one width inside the window, oldest first", async () => {
    const { db, tokenId } = await seeded();
    await recordPriceBars(db, board("192"), at("2026-10-14T15:00:05Z"));
    await recordPriceBars(db, board("190"), at("2026-10-14T13:00:05Z"));
    await recordPriceBars(db, board("191"), at("2026-10-14T14:00:05Z"));

    const bars = await barsFor(db, tokenId, "1h", at("2026-10-14T13:30:00Z"), NEXT_DAY);
    // The 13:00 bar starts before the window and is left out; the window is
    // over bar starts, so a bar is in or out whole.
    expect(bars.map((b) => [b.bucketStart.toISOString(), String(b.market.close)])).toEqual([
      ["2026-10-14T14:00:00.000Z", "191"],
      ["2026-10-14T15:00:00.000Z", "192"],
    ]);
  });

  it("drops minute bars after thirty days and keeps the hours and days", async () => {
    const { db, tokenId } = await seeded();
    const now = at("2026-11-20T12:00:00Z");
    await recordPriceBars(db, board("190"), at("2026-10-14T13:47:10Z"));
    await recordPriceBars(db, board("191"), at("2026-11-19T13:47:10Z"));

    const dropped = await prunePriceBars(db, now);
    expect(dropped).toBe(1);

    const from = at("2026-10-01T00:00:00Z");
    const minutes = await barsFor(db, tokenId, "1m", from, now);
    expect(minutes.map((b) => b.bucketStart.toISOString())).toEqual(["2026-11-19T13:47:00.000Z"]);
    expect(await barsFor(db, tokenId, "1h", from, now)).toHaveLength(2);
    expect(await barsFor(db, tokenId, "1d", from, now)).toHaveLength(2);
  });
});
