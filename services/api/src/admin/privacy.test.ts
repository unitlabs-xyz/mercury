import { describe, expect, it } from "vitest";
import { testDb } from "../db/testing.js";
import { FIXTURE_RANGE, seedAdminFixtures } from "./fixtures.js";
import { basketStats } from "./baskets.js";
import { freshness } from "./freshness.js";
import { fundingStats } from "./funding.js";
import { orderStats } from "./orders.js";
import { overview } from "./overview.js";
import { parseRange } from "./range.js";

/**
 * No admin response carries a user's identity.
 *
 * The surface exists to answer "how many" and "how much", and it is read by
 * people who are not the user being counted. An email, a wallet address or a
 * Privy DID in one of these payloads would be an account's identity in a
 * dashboard — and, once the web app caches it, in a browser's memory and in
 * whatever a screenshot of that page ends up attached to.
 *
 * Asserted over the whole serialised payload rather than field by field,
 * because the failure this is guarding against is a column somebody adds to a
 * `select` later. A per-field assertion would still pass.
 */
const IDENTIFIERS = [
  "a@example.com",
  "b@example.com",
  "c@example.com",
  "did:privy:a",
  "did:privy:b",
  "did:privy:c",
  "wallet-a",
  "wallet-b",
  "wallet-c",
  "relay-1",
  "relay-2",
  "relay-3",
  "acct-a",
  "op-1",
  "op-2",
];

describe("the admin payloads", () => {
  it("carry no email, wallet address, DID or user id", async () => {
    const db = await testDb();
    const ids = await seedAdminFixtures(db);
    const range = parseRange(FIXTURE_RANGE);

    const payload = JSON.stringify([
      await freshness(db),
      await overview(db, range),
      await orderStats(db, range),
      await fundingStats(db, range),
      await basketStats(db, range),
    ]);

    for (const identifier of IDENTIFIERS) {
      expect(payload).not.toContain(identifier);
    }
    /* The user ids too, which are uuids and so would not be caught above. */
    for (const id of [ids.userA, ids.userB, ids.userC]) {
      expect(payload).not.toContain(id);
    }
  });

  it("would notice if a query started selecting one", async () => {
    /* The guard's own guard: if the identifiers were absent from the database
       rather than absent from the payload, the test above would pass on an
       empty seed and prove nothing. */
    const db = await testDb();
    await seedAdminFixtures(db);

    const everything = JSON.stringify(await db.query.users.findMany());

    expect(everything).toContain("a@example.com");
    expect(everything).toContain("did:privy:a");
  });
});
