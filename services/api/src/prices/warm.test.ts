import { describe, expect, it } from "vitest";
import { D, ZERO } from "@mercury/core";
import type { TokenPrice } from "@mercury/market";
import { testDb } from "../db/testing.js";
import { instruments, lots, tokens, users } from "../db/schema.js";
import type { StockRow, StockWrapperRow } from "../routes/instruments.js";
import { warmPrices } from "./warm.js";

const MINT = (tag: string) => `${tag}${"x".repeat(44 - tag.length)}`;

const wrapper = (
  mint: string,
  liquidityUsd: string,
  over: Partial<StockWrapperRow> = {},
): StockWrapperRow => ({
  mint,
  symbol: "NVDAx",
  issuer: "backed",
  decimals: 8,
  multiplier: "1",
  isRoutable: true,
  holders: 10,
  icon: null,
  liquidityUsd,
  volume24hUsd: "0",
  netBuyers24h: 0,
  traders24h: 0,
  hasMarket: true,
  ...over,
});

const row = (ticker: string, wrappers: readonly StockWrapperRow[], isTradable = true): StockRow => ({
  ticker,
  name: `${ticker} Inc`,
  sector: null,
  description: null,
  logoUrl: null,
  isTradable,
  wrappers,
});

const price = (mint: string): TokenPrice => ({
  mint,
  usdPricePerToken: D(10),
  pricePerShare: D(10),
  changePct24h: null,
  liquidityUsd: ZERO,
  multiplier: D(1),
  observedAt: null,
});

/** Prices everything except `UNPRICED`, and records what it was asked for. */
const board = () => {
  const asked: string[][] = [];
  return {
    asked,
    prices: {
      pricesFor: async (mints: readonly string[]) => {
        asked.push([...mints]);
        return new Map(mints.filter((m) => !m.startsWith("UNPRICED")).map((m) => [m, price(m)]));
      },
    },
  };
};

/** A lot, which is what makes a mint "held" as far as warming is concerned. */
const held = async (mint: string) => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:warm" }).returning();
  const [instrument] = await db.insert(instruments).values({ ticker: "HELD", name: "Held Inc" }).returning();
  const [token] = await db
    .insert(tokens)
    .values({ instrumentId: instrument!.id, mint, issuer: "backed", symbol: "HELDx", decimals: 8 })
    .returning();
  await db.insert(lots).values({
    userId: user!.id,
    tokenId: token!.id,
    instrumentId: instrument!.id,
    tokenQty: 100_000_000n,
    shares: "1",
    unitCostUsd: "10",
    source: "buy",
  });
  return db;
};

const FEATURED = MINT("Feat");
const THIN = MINT("Thin");
const HELD = MINT("Held");

describe("warmPrices", () => {
  it("warms the featured shelf, which is what a first visit renders", async () => {
    const db = await testDb();
    const b = board();
    const summary = await warmPrices(db, {
      supportedStocks: async () => [
        row("FEAT", [wrapper(FEATURED, "90000")]),
        row("THIN", [wrapper(THIN, "5000")]),
      ],
      prices: b.prices,
    });

    // The thin one is found by search, and the board keeps it warm for as long
    // as somebody keeps looking at it. Warming it here would be an id spent on
    // a ticker nobody opened.
    expect(b.asked).toEqual([[FEATURED]]);
    expect(summary).toEqual({ mints: 1, priced: 1 });
  });

  it("warms a held mint even when nobody would find it on the shelf", async () => {
    const db = await held(HELD);
    const b = board();
    await warmPrices(db, {
      supportedStocks: async () => [
        row("FEAT", [wrapper(FEATURED, "90000")]),
        row("HELD", [wrapper(HELD, "100", { symbol: "HELDx" })]),
      ],
      prices: b.prices,
    });

    // `position-sync` reads this every two seconds whatever its pool looks like.
    expect(b.asked[0]!.sort()).toEqual([FEATURED, HELD].sort());
  });

  it("asks once, with the two sets as one list", async () => {
    const db = await held(FEATURED);
    const b = board();
    await warmPrices(db, {
      supportedStocks: async () => [row("FEAT", [wrapper(FEATURED, "90000")])],
      prices: b.prices,
    });
    // Held and featured overlap here, and a mint asked for twice would be a
    // wasted id in a request that answers fifty.
    expect(b.asked).toEqual([[FEATURED]]);
  });

  it("leaves out a held mint Jupiter has no market for", async () => {
    const unpriceable = MINT("UNPRICED");
    const db = await held(unpriceable);
    const b = board();
    await warmPrices(db, {
      supportedStocks: async () => [
        row("FEAT", [wrapper(FEATURED, "90000")]),
        row("DEAD", [wrapper(unpriceable, "0", { hasMarket: false })]),
      ],
      prices: b.prices,
    });
    expect(b.asked).toEqual([[FEATURED]]);
  });

  it("leaves out an instrument the shelf does not list", async () => {
    const db = await testDb();
    const b = board();
    const summary = await warmPrices(db, {
      supportedStocks: async () => [row("HALT", [wrapper(FEATURED, "90000")], false)],
      prices: b.prices,
    });
    expect(b.asked).toEqual([]);
    expect(summary).toEqual({ mints: 0, priced: 0 });
  });

  it("reports a mint it asked about and got no price for", async () => {
    const db = await testDb();
    const b = board();
    const unpriced = MINT("UNPRICED2");
    const summary = await warmPrices(db, {
      supportedStocks: async () => [
        row("FEAT", [wrapper(FEATURED, "90000")]),
        row("NOPE", [wrapper(unpriced, "90000")]),
      ],
      prices: b.prices,
    });
    // Worth seeing in a log: two mints warm, one of them not actually priced.
    expect(summary).toEqual({ mints: 2, priced: 1 });
  });
});
