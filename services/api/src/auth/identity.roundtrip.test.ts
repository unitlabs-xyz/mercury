import { describe, expect, it } from "vitest";
import { testDb } from "../db/testing.js";
import { users } from "../db/schema.js";
import { resolveIdentity, type UserDirectory } from "./identity.js";
import type { VerifiedToken } from "./verifier.js";

const token: VerifiedToken = {
  privyUserId: "did:privy:cmv7u3p3900zm0gkwksnpjgc4",
  sessionId: "sess_1",
  expiresAt: new Date("2030-01-01T00:00:00Z"),
};

const directory: UserDirectory = {
  read: async () => ({ privyUserId: token.privyUserId, solanaAddress: null, email: null }),
};

describe("resolveIdentity, over a real database", () => {
  it("gives every request of a first visit the same new user", async () => {
    // A first visit sends several authenticated requests at once. Each finds
    // no user and tries to create one; one insert wins and the others meet the
    // unique index. Those are the same person and must be answered as them,
    // not failed: production logged "could not create or find user" for
    // exactly this, twice per new account, on 14 October 2026.
    const db = await testDb();

    const identities = await Promise.all(
      Array.from({ length: 4 }, () => resolveIdentity(db, directory, token, null)),
    );

    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(new Set(identities.map((i) => i.userId))).toEqual(new Set([rows[0]!.id]));
  });
});
