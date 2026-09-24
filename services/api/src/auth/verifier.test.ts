import { describe, expect, it } from "vitest";
import { InvalidToken, type TokenVerifier, type VerifiedToken } from "./verifier.js";

/** A verifier that accepts exactly one token. Used by every later auth test. */
const fakeVerifier = (token: string, result: VerifiedToken): TokenVerifier => ({
  verify: async (t) => {
    if (t !== token) throw new InvalidToken("unknown token");
    return result;
  },
});

describe("TokenVerifier", () => {
  const ok: VerifiedToken = {
    privyUserId: "did:privy:abc123",
    sessionId: "sess_1",
    expiresAt: new Date("2030-01-01T00:00:00Z"),
  };

  it("returns the claims for a token it accepts", async () => {
    const v = fakeVerifier("good", ok);
    await expect(v.verify("good")).resolves.toEqual(ok);
  });

  it("throws InvalidToken for anything else", async () => {
    const v = fakeVerifier("good", ok);
    await expect(v.verify("bad")).rejects.toBeInstanceOf(InvalidToken);
  });
});
