import { describe, expect, it, vi } from "vitest";
import type { UserDirectory } from "./identity.js";
import { resolveIdentity } from "./identity.js";
import type { VerifiedToken } from "./verifier.js";

const token: VerifiedToken = {
  privyUserId: "did:privy:abc123",
  sessionId: "sess_1",
  expiresAt: new Date("2030-01-01T00:00:00Z"),
};

const directory = (
  address: string | null,
  privyUserId = token.privyUserId,
  email: string | null = null,
): UserDirectory => ({
  read: async () => ({ privyUserId, solanaAddress: address, email }),
});

/**
 * A stand-in for Drizzle that records what it was asked to do. We are testing
 * the decision — insert or reuse — not Postgres.
 */
const fakeDb = (existing: { id: string; privyUserId: string; email?: string | null } | null) => {
  const inserted: string[] = [];
  const updated: Record<string, unknown>[] = [];
  return {
    inserted,
    updated,
    db: {
      update: () => ({
        set: (v: Record<string, unknown>) => ({
          where: async () => {
            updated.push(v);
          },
        }),
      }),
      query: {
        users: { findFirst: async () => existing ?? undefined },
        wallets: { findFirst: async () => undefined },
      },
      insert: () => ({
        values: (v: Record<string, unknown>) => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              inserted.push(String(v["privyUserId"] ?? v["address"]));
              return [{ id: "user-1", privyUserId: token.privyUserId }];
            },
          }),
        }),
      }),
    },
  };
};

describe("resolveIdentity", () => {
  it("creates a user the first time a Privy id is seen", async () => {
    const { db, inserted } = fakeDb(null);
    const id = await resolveIdentity(db as never, directory("So1anaAddr"), token, "id_tok");
    expect(id.privyUserId).toBe("did:privy:abc123");
    expect(inserted).toContain("did:privy:abc123");
  });

  it("reuses the existing user on a later call", async () => {
    const { db, inserted } = fakeDb({ id: "user-1", privyUserId: token.privyUserId });
    const id = await resolveIdentity(db as never, directory("So1anaAddr"), token, "id_tok");
    expect(id.userId).toBe("user-1");
    expect(inserted).not.toContain("did:privy:abc123");
  });

  it("takes the wallet address from Privy's signed token, never from the caller", async () => {
    const dir = {
      read: vi.fn(async () => ({
        privyUserId: token.privyUserId,
        solanaAddress: "FromPrivy" as string | null,
        email: null as string | null,
      })),
    };
    const { db } = fakeDb({ id: "user-1", privyUserId: token.privyUserId });
    const id = await resolveIdentity(db as never, dir, token, "id_tok");
    expect(dir.read).toHaveBeenCalledWith("id_tok");
    expect(id.walletAddress).toBe("FromPrivy");
  });

  it("refuses an identity token naming a different user", async () => {
    const { db } = fakeDb({ id: "user-1", privyUserId: token.privyUserId });
    await expect(
      resolveIdentity(db as never, directory("Theirs", "did:privy:someone-else"), token, "id_tok"),
    ).rejects.toThrow("does not match");
  });

  it("authenticates without an identity token, but knows no wallet", async () => {
    const { db } = fakeDb({ id: "user-1", privyUserId: token.privyUserId });
    const id = await resolveIdentity(db as never, directory("So1anaAddr"), token, null);
    expect(id.userId).toBe("user-1");
    expect(id.walletAddress).toBeNull();
  });

  it("tolerates a user whose wallet has not provisioned yet", async () => {
    const { db } = fakeDb({ id: "user-1", privyUserId: token.privyUserId });
    const id = await resolveIdentity(db as never, directory(null), token, "id_tok");
    expect(id.walletAddress).toBeNull();
  });
});

/**
 * The address a margin call would be sent to.
 *
 * Privy signs it into the identity token on every request, so this is a copy
 * kept in step rather than a fact we own. Stale is the dangerous state: mail to
 * an address somebody abandoned looks delivered and warns nobody.
 */
describe("resolveIdentity, the email", () => {
  it("records the address Privy signed for a new user", async () => {
    const { db, updated } = fakeDb(null);
    await resolveIdentity(db as never, directory("So1anaAddr", undefined, "a@example.com"), token, "id_tok");
    expect(updated).toEqual([{ email: "a@example.com" }]);
  });

  it("updates it when somebody changes their address at Privy", async () => {
    const { db, updated } = fakeDb({
      id: "user-1",
      privyUserId: token.privyUserId,
      email: "old@example.com",
    });
    await resolveIdentity(
      db as never,
      directory("So1anaAddr", undefined, "new@example.com"),
      token,
      "id_tok",
    );
    expect(updated).toEqual([{ email: "new@example.com" }]);
  });

  /*
   * Not an optimisation. Every authenticated request runs this, and the
   * portfolio page alone makes several a minute; writing each time would be a
   * write per request forever, for a value that almost never changes.
   */
  it("writes nothing when the address has not moved", async () => {
    const { db, updated } = fakeDb({ id: "user-1", privyUserId: token.privyUserId, email: "a@example.com" });
    await resolveIdentity(db as never, directory("So1anaAddr", undefined, "a@example.com"), token, "id_tok");
    expect(updated).toEqual([]);
  });

  it("leaves what it has alone when Privy names no address", async () => {
    const { db, updated } = fakeDb({ id: "user-1", privyUserId: token.privyUserId, email: "a@example.com" });
    await resolveIdentity(db as never, directory("So1anaAddr", undefined, null), token, "id_tok");
    expect(updated).toEqual([]);
  });

  /*
   * A directory that omits the field entirely hands back undefined, and
   * `set({ email: undefined })` is an empty update that Drizzle refuses — which
   * took out eleven unrelated tests before the guard treated absent and null
   * as the same answer.
   */
  it("treats a missing field the same as no address, not as a value to write", async () => {
    const { db, updated } = fakeDb({ id: "user-1", privyUserId: token.privyUserId, email: "a@example.com" });
    const bare = { read: async () => ({ privyUserId: token.privyUserId, solanaAddress: "So1" }) };
    await resolveIdentity(db as never, bare as never, token, "id_tok");
    expect(updated).toEqual([]);
  });

  it("asks Privy for nothing when there is no identity token to read", async () => {
    const { db, updated } = fakeDb({ id: "user-1", privyUserId: token.privyUserId, email: null });
    await resolveIdentity(db as never, directory("So1anaAddr", undefined, "a@example.com"), token, null);
    expect(updated).toEqual([]);
  });
});
