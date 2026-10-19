import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "./testing.js";
import { disposals, instruments, lots, orders, tokens, users } from "./schema.js";

/**
 * 0026 writes the shares every past sell removed, so the first replay after
 * deploy costs positions the way they will be costed from then on. Without it
 * every sell before deploy would look like a transfer out, dated the day of
 * the deploy, and a sell followed by a buy would stay wrong.
 *
 * `testDb` has already applied it, to empty tables. Running it again over seeded
 * rows is what it meets in production, and running it twice is a retried deploy.
 */
const migration = readFileSync(new URL("../../drizzle/0026_disposal_backfill.sql", import.meta.url), "utf8")
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const FILLED = new Date("2026-10-01T15:00:00Z");
const BOUGHT = new Date("2026-09-20T10:00:00Z");

/** A stored decision whose candidate for NVDAx sold `filledShares` at `multiplier`. */
const decision = (filledShares: string | null, multiplier = "1.001") => ({
  kind: "execute",
  candidates: [
    { mint: "SomeOtherMint", multiplier: "1", filledShares: "9" },
    { mint: NVDAX, multiplier, filledShares },
  ],
});

const seeded = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:backfill" }).returning();
  const [instrument] = await db
    .insert(instruments)
    .values({ ticker: "NVDA", name: "Nvidia", sector: "Technology" })
    .returning();
  const [token] = await db
    .insert(tokens)
    .values({ instrumentId: instrument!.id, mint: NVDAX, symbol: "NVDAx", issuer: "backed", decimals: 8 })
    .returning();
  const order = (over: Partial<typeof orders.$inferInsert> = {}) =>
    db
      .insert(orders)
      .values({
        userId: user!.id,
        instrumentId: instrument!.id,
        side: "sell",
        usdAmount: "100",
        decision: decision("0.5005"),
        chosenTokenId: token!.id,
        status: "filled",
        filledAt: FILLED,
        ...over,
      })
      .returning();

  const [sold] = await order();
  await order({ side: "buy" });
  await order({ status: "executing", filledAt: null });
  await order({ decision: decision(null) });
  await db.insert(lots).values({
    userId: user!.id,
    tokenId: token!.id,
    instrumentId: instrument!.id,
    tokenQty: 100_000_000n,
    shares: "1",
    unitCostUsd: "200",
    acquiredAt: BOUGHT,
    source: "buy",
  });
  return { db, order, soldId: sold!.id, tokenId: token!.id };
};

/** What the migration wrote for one order. */
const disposalsOf = async (db: Awaited<ReturnType<typeof testDb>>, orderId: string) =>
  db.select().from(disposals).where(eq(disposals.orderId, orderId));

const run = async (db: Awaited<ReturnType<typeof testDb>>) => {
  for (const statement of migration) await db.execute(sql.raw(statement));
};

describe("0026_disposal_backfill", () => {
  it("records every filled sell as the tokens it removed, and nothing else", async () => {
    const { db, soldId, tokenId } = await seeded();
    await run(db);
    const rows = await db.select().from(disposals);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      orderId: soldId,
      tokenId,
      kind: "sell",
      // 0.5005 shares at a multiplier of 1.001 is 0.5 tokens, at eight decimals.
      tokenQty: 50_000_000n,
      occurredAt: FILLED,
      recordedAt: FILLED,
    });
    expect(rows[0]!.shares).toBe("0.500500000000000000");
  });

  /* The division rarely comes out clean, and a token is not divisible past its decimals. */
  it("rounds the tokens to the nearest, not down", async () => {
    const { db, order } = await seeded();
    const [odd] = await order({ decision: decision("0.5019", "1.0123456789") });
    await run(db);
    const [row] = await disposalsOf(db, odd!.id);
    // 0.5019 shares over 1.0123456789 is 0.4957792683... tokens, which at eight
    // decimals is 49,577,926.83 of the smallest unit: 49,577,927 rounded,
    // 49,577,926 truncated.
    expect(row!.tokenQty).toBe(49_577_927n);
  });

  /*
   * Migrations run when the API boots, so a decision that cannot say what left
   * must be left out rather than stop the deploy. The good sell beside it is
   * how this knows the migration carried on.
   */
  it.each([
    ["a multiplier of zero", decision("0.5", "0")],
    ["a multiplier that is not a number", decision("0.5", "soon")],
    ["shares filled that are not a number", decision("lots")],
    ["no candidates at all", { kind: "execute", candidates: null }],
    ["candidates that are an object rather than a list", { kind: "execute", candidates: { mint: NVDAX } }],
  ])("leaves out a filled sell whose decision has %s", async (_, bad) => {
    const { db, order, soldId } = await seeded();
    const [odd] = await order({ decision: bad });
    await run(db);
    expect(await disposalsOf(db, odd!.id)).toEqual([]);
    expect(await disposalsOf(db, soldId)).toHaveLength(1);
  });

  it("dates every lot written before it as recorded when it was acquired", async () => {
    const { db } = await seeded();
    await run(db);
    const [lot] = await db.select().from(lots);
    expect(lot!.recordedAt).toEqual(BOUGHT);
  });

  /* A retried deploy runs it again over rows it already wrote. */
  it("writes each sell once when it runs twice", async () => {
    const { db } = await seeded();
    await run(db);
    await run(db);
    expect(await db.select().from(disposals)).toHaveLength(1);
  });
});
