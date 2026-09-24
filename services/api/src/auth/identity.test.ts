import { describe, expect, it, vi } from "vitest";
import type { UserDirectory } from "./identity.js";
import { resolveIdentity } from "./identity.js";
import type { VerifiedToken } from "./verifier.js";

const token: VerifiedToken = {
  privyUserId: "did:privy:abc123",
  sessionId: "sess_1",
  expiresAt: new Date("2030-01-01T00:00:00Z"),
};

const directory = (address: string | null, privyUserId = token.privyUserId): UserDirectory => ({
  read: async () => ({ privyUserId, solanaAddress: address }),
});

/**
 * A stand-in for Drizzle that records what it was asked to do. We are testing
 * the decision — insert or reuse — not Postgres.
 */
const fakeDb = (existing: { id: string; privyUserId: string } | null) => {
  const inserted: string[] = [];
  return {
    inserted,
    db: {
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
