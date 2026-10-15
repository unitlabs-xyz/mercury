import { describe, expect, it } from "vitest";
import { testDb } from "../db/testing.js";
import { portfolioSnapshots, users } from "../db/schema.js";
import { freshness } from "./freshness.js";

describe("freshness", () => {
  it("reports nulls on an empty database rather than failing", async () => {
    /* A fresh deployment has no snapshot and no price bar. This is the first
       thing anybody opens, and it must not be the first thing that 500s. */
    const db = await testDb();

    const f = await freshness(db);

    expect(f).toMatchObject({ snapshotAt: null, priceBarAt: null, activityAt: null });
    expect(f.now).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("reports the newest snapshot as an ISO instant", async () => {
    /* The test that earns its keep. `db.execute` of a subquery would have
       answered an array on postgres.js and `{ rows }` on PGlite, and a raw
       timestamp reads back from PGlite as "2026-10-15 16:51:03.627+05" — not
       ISO, and not what the web app parses. Both measured; hence the typed
       select. */
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:a" }).returning();
    await db.insert(portfolioSnapshots).values([
      {
        userId: user!.id,
        capturedAt: new Date("2026-10-01T10:00:00Z"),
        totalUsd: "100",
        stocksUsd: "60",
        cashUsd: "40",
      },
      {
        userId: user!.id,
        capturedAt: new Date("2026-10-02T11:00:00Z"),
        totalUsd: "120",
        stocksUsd: "70",
        cashUsd: "50",
      },
    ]);

    const f = await freshness(db);

    expect(f.snapshotAt).toBe("2026-10-02T11:00:00.000Z");
  });
});
