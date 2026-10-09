import { describe, expect, it } from "vitest";
import { USDC_MINT } from "@mercury/chain";
import { testDb } from "../db/testing.js";
import { activities, users } from "../db/schema.js";
import { readFlows } from "./queries.js";

/**
 * What the performance line treats as money crossing the account's edge.
 *
 * The chart draws `valueUsd - netFlowUsd`, so anything counted here and not
 * actually leaving the account shows up as pure performance. Funding a basket
 * is exactly that: the money becomes basket value and net worth does not move.
 */
const AT = new Date("2026-10-08T12:00:00.000Z");
const FROM = new Date("2026-10-01T00:00:00.000Z");

const seed = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:flows" }).returning();
  return { db, userId: user!.id };
};

const row = (userId: string, over: Partial<typeof activities.$inferInsert> = {}) => ({
  userId,
  kind: "transfer_out",
  occurredAt: AT,
  title: "Sent cash",
  amountUsd: "500",
  mint: USDC_MINT,
  txSignature: `sig-${Math.random()}`,
  ...over,
});

describe("readFlows", () => {
  it("counts a deposit in and a withdrawal out", async () => {
    const s = await seed();
    await s.db
      .insert(activities)
      .values([row(s.userId, { kind: "transfer_in", title: "Added cash", amountUsd: "300" }), row(s.userId)]);
    const flows = await readFlows(s.db, s.userId, FROM);
    expect(flows.map((f) => f.usd.toFixed()).sort()).toEqual(["-500", "300"]);
  });

  it("leaves out money that only moved into a basket", async () => {
    const s = await seed();
    await s.db.insert(activities).values(row(s.userId, { basketPortfolioId: "portfolio-7" }));
    // The $500 is still in the account, as basket value. Counted as a
    // withdrawal it would print +$500 of performance against an unchanged total.
    expect(await readFlows(s.db, s.userId, FROM)).toEqual([]);
  });

  it("leaves out money coming back out of a basket", async () => {
    const s = await seed();
    await s.db
      .insert(activities)
      .values(row(s.userId, { kind: "transfer_in", basketPortfolioId: "portfolio-7" }));
    expect(await readFlows(s.db, s.userId, FROM)).toEqual([]);
  });

  it("excludes a basket row whatever its kind says, which is the point", async () => {
    // The wallet-events job writes basket funding as a plain transfer until
    // the funding confirmation re-kinds it. The kind is therefore not a
    // reliable signal; the portfolio on the row is.
    const s = await seed();
    await s.db
      .insert(activities)
      .values([
        row(s.userId, { basketPortfolioId: "portfolio-7" }),
        row(s.userId, { kind: "basket_funding", basketPortfolioId: "portfolio-7" }),
        row(s.userId, { amountUsd: "25" }),
      ]);
    const flows = await readFlows(s.db, s.userId, FROM);
    expect(flows.map((f) => f.usd.toFixed())).toEqual(["-25"]);
  });
});
