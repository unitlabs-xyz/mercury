import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { testDb } from "../db/testing.js";
import { users } from "../db/schema.js";
import type { PlannedLoanEvent } from "./events.js";
import { loanLedger, recordLoanEvents } from "./record.js";

const event = (kind: PlannedLoanEvent["kind"], usd: string | null): PlannedLoanEvent => ({
  kind,
  usdAmount: usd === null ? null : D(usd),
  ticker: kind === "pledge" ? "NVDA" : null,
  tokensRaw: kind === "pledge" ? "2239976" : null,
  title: kind,
  subtitle: null,
});

const setup = async () => {
  const db = await testDb();
  const [user] = await db
    .insert(users)
    .values({ privyUserId: "did:privy:l", email: "l@example.com" })
    .returning();
  const record = (planned: PlannedLoanEvent[], signature: string, at: string, debtAfter: string) =>
    recordLoanEvents(db, planned, {
      userId: user!.id,
      signature,
      occurredAt: new Date(at),
      borrowApy: D("0.077"),
      debtAfterUsd: D(debtAfter),
      collateralAfterUsd: D("4.81"),
      mintFor: () => "Mint",
    });
  return { db, userId: user!.id, record };
};

describe("loanLedger", () => {
  it("reads a borrower's loan events oldest first, with what each moved and the debt after", async () => {
    const { db, userId, record } = await setup();
    // Recorded out of order, as confirms can arrive: the later repay first.
    await record([event("repay", "1")], "SigRepay", "2026-10-17T14:00:00Z", "1.11");
    await record(
      [event("pledge", null), event("borrow", "2.11")],
      "SigBorrow",
      "2026-10-17T13:16:09Z",
      "2.11",
    );

    const rows = await loanLedger(db, userId);
    // The pledge and the borrow share a signature and a moment; only the money's order matters.
    const money = rows.filter((r) => r.kind !== "pledge");
    expect(money.map((r) => [r.kind, r.usdAmount?.toString() ?? null, r.debtAfterUsd.toString()])).toEqual([
      ["borrow", "2.11", "2.11"],
      ["repay", "1", "1.11"],
    ]);
    expect(rows.filter((r) => r.kind === "pledge").map((r) => r.usdAmount)).toEqual([null]);
  });

  it("is only this borrower's", async () => {
    const { db, record } = await setup();
    await record([event("borrow", "5")], "SigOther", "2026-10-17T13:00:00Z", "5");
    const [someoneElse] = await db
      .insert(users)
      .values({ privyUserId: "did:privy:m", email: "m@example.com" })
      .returning();
    expect(await loanLedger(db, someoneElse!.id)).toEqual([]);
  });
});
