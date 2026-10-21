import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./testing.js";
import { activities, users } from "./schema.js";

/**
 * 0024 rewrites the feed's old wording in rows already written, so a feed reads
 * the same from its first row to its last. Titles are stored, not rendered, so
 * changing the writers alone would leave every past row in the old voice.
 *
 * `testDb` has already applied it, to an empty table. Running it again over rows
 * in the old wording is what it will meet in production, and running it twice is
 * what a retried deploy does, so both are tested here.
 */
const migration = readFileSync(new URL("../../drizzle/0024_activity_copy.sql", import.meta.url), "utf8")
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const OLD: readonly [kind: string, title: string, subtitle: string | null, refTable?: string][] = [
  ["buy", "Bought NVDA", "0.044619 shares at $218.29 · $0.26 fee"],
  ["sell", "Sold TSLA", "0.25 shares at $431.20 · +$12.40 · $0.54 fee"],
  ["buy", "Bought META", "0.673725 shares at $738.12"],
  ["pledge", "Pledged 0.0099 NVDA", "Held by Kamino as collateral"],
  ["borrow", "Borrowed $2.11 against NVDA", null],
  ["borrow", "Borrowed $1,975.00", "Against your pledged stock"],
  ["repay", "Repaid your loan in full", null],
  ["repay", "Repaid $1.00", null],
  ["unpledge", "Withdrew all your NVDA", "Back in your wallet"],
  ["unpledge", "Withdrew 0.0099 NVDA", "Back in your wallet"],
  ["transfer_in", "Added cash", "cbBTC from Base", "funding_intent"],
  ["transfer_out", "Sent cash", "Plus $0.25 to open their USDC account"],
  ["transfer_out", "Cash to a basket", null],
  ["transfer_in", "Cash from a basket", null],
  ["dividend", "SPY paid a dividend", "0.0118 shares added, at no cost"],
  ["loan_alert", "Kamino is selling your collateral", "Your loan of $2.11 has reached the point…"],
  ["loan_alert", "Your loan needs attention today", "Your stocks have fallen far enough…"],
  ["loan_alert", "Your loan is past its limit", "Your stocks have fallen and…"],
  ["basket_funding", "Funded Magnificent Seven", "Transfer to your Glider smart account"],
  ["liquidate_to_usdc", "Exited Magnificent Seven to USDC", "21.5 USDC from Magnificent Seven"],
  ["transfer_in", "Received SOL", "0.0154 SOL"],
];

const NEW: readonly [title: string, subtitle: string | null][] = [
  ["Bought NVDA", "0.044619 shares at $218.29"],
  ["Sold TSLA", "0.25 shares at $431.20"],
  ["Bought META", "0.673725 shares at $738.12"],
  ["Added collateral", "0.0099 NVDA"],
  ["Borrowed USDC", "Against NVDA"],
  ["Borrowed USDC", "Against collateral"],
  ["Repaid loan", "Paid in full"],
  ["Repaid loan", "Partial repayment"],
  ["Withdrew collateral", "All NVDA"],
  ["Withdrew collateral", "0.0099 NVDA"],
  ["Added cash", "From Base · cbBTC"],
  ["Sent cash", "Plus $0.25 recipient account setup"],
  ["Moved to basket", null],
  ["Moved from basket", null],
  ["SPY dividend", "Paid as 0.0118 shares"],
  // The warning's body is a message to somebody, and keeps its "your".
  ["Liquidation in progress", "Your loan of $2.11 has reached the point…"],
  ["Liquidation risk", "Your stocks have fallen far enough…"],
  ["Loan over limit", "Your stocks have fallen and…"],
  ["Invested in Magnificent Seven", "To basket account"],
  ["Sold Magnificent Seven to cash", "21.5 USDC from Magnificent Seven"],
  ["Received SOL", "0.0154 SOL"],
];

const seeded = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:copy" }).returning();
  await db.insert(activities).values(
    OLD.map(([kind, title, subtitle, refTable], i) => ({
      userId: user!.id,
      kind,
      title,
      subtitle,
      // One second apart, so the rows read back in the order they went in.
      occurredAt: new Date(Date.UTC(2026, 9, 1, 0, 0, i)),
      ...(refTable === undefined ? {} : { refTable }),
    })),
  );
  return db;
};

const run = async (db: Awaited<ReturnType<typeof testDb>>) => {
  for (const statement of migration) await db.execute(sql.raw(statement));
};

const read = async (db: Awaited<ReturnType<typeof testDb>>) =>
  (await db.select().from(activities).orderBy(activities.occurredAt)).map((r) => [r.title, r.subtitle]);

describe("0024_activity_copy", () => {
  it("rewrites every row in the old wording into the new", async () => {
    const db = await seeded();
    await run(db);
    expect(await read(db)).toEqual(NEW);
  });

  /* A retried deploy runs it again over rows it already rewrote. */
  it("leaves rows in the new wording alone", async () => {
    const db = await seeded();
    await run(db);
    await run(db);
    expect(await read(db)).toEqual(NEW);
  });
});
