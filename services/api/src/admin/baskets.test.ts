import { describe, expect, it } from "vitest";
import { testDb } from "../db/testing.js";
import { FIXTURE_RANGE, seedAdminFixtures } from "./fixtures.js";
import { basketActions } from "../db/schema.js";
import { basketStats } from "./baskets.js";
import { parseRange } from "./range.js";

const range = parseRange(FIXTURE_RANGE);

describe("basketStats", () => {
  it("groups actions by kind", async () => {
    const db = await testDb();
    await seedAdminFixtures(db);

    expect((await basketStats(db, range)).byKind).toEqual([
      { kind: "enroll", count: 1 },
      { kind: "exit", count: 1 },
    ]);
  });

  it("groups actions by reconciliation state", async () => {
    const db = await testDb();
    await seedAdminFixtures(db);

    expect((await basketStats(db, range)).byState).toEqual([
      { state: "pending", count: 1 },
      { state: "settled", count: 1 },
    ]);
  });

  it("counts as stuck a pending action whose retry time has passed", async () => {
    /* The one row on this page anybody has to act on: the reconciler was due
       to look at it and has not resolved it. */
    const db = await testDb();
    await seedAdminFixtures(db);

    expect((await basketStats(db, range)).stuck).toBe(1);
  });

  it("does not count a pending action that is not due yet", async () => {
    /* In flight is not stuck. Counting it would make the alert fire on every
       basket action in the seconds after it is created. */
    const db = await testDb();
    const ids = await seedAdminFixtures(db);
    await db.insert(basketActions).values({
      userId: ids.userA,
      slug: "growth",
      kind: "exit",
      ownerAccountId: "acct-a",
      strategyId: "strat-1",
      payload: {},
      operationId: "op-3",
      reconciliationState: "pending",
      reconcileAfter: new Date(Date.now() + 3_600_000),
      createdAt: new Date("2026-09-12T09:00:00Z"),
    });

    expect((await basketStats(db, range)).stuck).toBe(1);
  });

  it("does not count a resolved action as stuck however old it is", async () => {
    /* `settled`, `failed`, `cancelled` and `exhausted` are all terminal — the
       reconciler nulls `reconcile_after` when it resolves one, but a row that
       kept an old value must not reappear as an alert. */
    const db = await testDb();
    const ids = await seedAdminFixtures(db);
    await db.insert(basketActions).values({
      userId: ids.userA,
      slug: "growth",
      kind: "exit",
      ownerAccountId: "acct-a",
      strategyId: "strat-1",
      payload: {},
      operationId: "op-4",
      reconciliationState: "exhausted",
      reconcileAfter: new Date("2026-09-01T10:00:00Z"),
      createdAt: new Date("2026-09-01T09:00:00Z"),
    });

    expect((await basketStats(db, range)).stuck).toBe(1);
  });

  it("counts stuck actions regardless of the range", async () => {
    /* Stuck is an alert, not a statistic. An action that jammed two months ago
       is still jammed, and a range that hid it would hide the one thing on
       this panel somebody has to do. */
    const db = await testDb();
    await seedAdminFixtures(db);

    const s = await basketStats(db, parseRange({ from: "2020-01-01", to: "2020-02-01" }));

    expect(s.byKind).toEqual([]);
    expect(s.byState).toEqual([]);
    expect(s.stuck).toBe(1);
  });

  it("answers zeroes on an empty database rather than failing", async () => {
    const db = await testDb();

    expect(await basketStats(db, range)).toEqual({ byKind: [], byState: [], stuck: 0 });
  });
});
