import { describe, expect, it } from "vitest";
import { testDb } from "../db/testing.js";
import { FIXTURE_RANGE, seedAdminFixtures } from "./fixtures.js";
import { fundingIntents } from "../db/schema.js";
import { overview } from "./overview.js";
import { parseRange } from "./range.js";

const range = parseRange(FIXTURE_RANGE);

describe("overview", () => {
  it("counts everybody who has signed up", async () => {
    const db = await testDb();
    await seedAdminFixtures(db);

    expect((await overview(db, range)).users).toBe(3);
  });

  it("counts new users by the day they arrived", async () => {
    const db = await testDb();
    await seedAdminFixtures(db);

    expect((await overview(db, range)).newUsers).toEqual([
      { day: "2026-09-02", count: 2 },
      { day: "2026-09-20", count: 1 },
    ]);
  });

  it("counts wallets by kind", async () => {
    const db = await testDb();
    await seedAdminFixtures(db);

    expect((await overview(db, range)).walletsByKind).toEqual([
      { kind: "privy_embedded", count: 2 },
      { kind: "external", count: 1 },
    ]);
  });

  it("counts as funded only a user whose deposit actually settled", async () => {
    /* A user whose only deposit failed has not been funded, and counting them
       would overstate the one number this feeds — the share of signups that
       got money in. Seeded: A settled, C only ever failed. */
    const db = await testDb();
    const ids = await seedAdminFixtures(db);
    await db.insert(fundingIntents).values({
      userId: ids.userC,
      relayRequestId: "relay-c",
      originChainId: 1,
      originCurrency: "0xusdc",
      originChainName: "Ethereum",
      originCurrencySymbol: "USDC",
      recipientAddress: "wallet-c",
      status: "failed",
      failReason: "expired",
      createdAt: new Date("2026-09-21T10:00:00Z"),
      updatedAt: new Date("2026-09-21T10:30:00Z"),
    });

    expect((await overview(db, range)).funded).toBe(1);
  });

  it("counts as traded only a user with an order that filled", async () => {
    /* B's refused order is a quote nobody filled. A and B both have fills. */
    const db = await testDb();
    await seedAdminFixtures(db);

    expect((await overview(db, range)).traded).toBe(2);
  });

  it("sums the latest snapshot per user, not every snapshot", async () => {
    /* The assertion most likely to be silently wrong, and the one whose
       wrongness would be quoted in a meeting. Two readings per holder: 100
       then 150 for A, 200 then 250 for B. Assets under management is 400.
       Summing every reading gives 700 — a figure 75% too high that looks
       entirely plausible. */
    const db = await testDb();
    await seedAdminFixtures(db);

    expect((await overview(db, range)).aumUsd).toBe("400");
  });

  it("counts a user with no snapshot as holding nothing, not as missing", async () => {
    /* C has never been snapshotted. An inner join somewhere would drop them
       from `users` as well as from the sum. */
    const db = await testDb();
    await seedAdminFixtures(db);

    const o = await overview(db, range);

    expect(o.users).toBe(3);
    expect(o.aumUsd).toBe("400");
  });

  it("answers zeroes on an empty database rather than failing", async () => {
    const db = await testDb();

    expect(await overview(db, range)).toEqual({
      users: 0,
      newUsers: [],
      walletsByKind: [],
      funded: 0,
      traded: 0,
      aumUsd: "0",
    });
  });
});
