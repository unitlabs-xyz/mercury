import { describe, expect, it } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey } from "jose";
import {
  AuthUnavailable,
  InvalidToken,
  createPrivyVerifier,
  type TokenVerifier,
  type VerifiedToken,
} from "./verifier.js";

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

describe("createPrivyVerifier", () => {
  const APP = "app-1";

  /** A key pair, and the app's published keys holding its public half as `kid`. */
  const keys = async (kid = "k1") => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const jwk = { ...(await exportJWK(publicKey)), kid, alg: "ES256" };
    return { privateKey, jwks: createLocalJWKSet({ keys: [jwk] }) };
  };

  const token = (key: Parameters<SignJWT["sign"]>[0], opts: { kid?: string; exp?: string | number } = {}) =>
    new SignJWT({ sid: "sess_1" })
      .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: opts.kid ?? "k1" })
      .setIssuer("privy.io")
      .setAudience(APP)
      .setSubject("did:privy:1")
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "1h")
      .sign(key);

  const verifier = (jwks: JWTVerifyGetKey) => createPrivyVerifier({ appId: APP, jwks });

  it("accepts a token signed with the app's key", async () => {
    const { privateKey, jwks } = await keys();
    await expect(verifier(jwks).verify(await token(privateKey))).resolves.toMatchObject({
      privyUserId: "did:privy:1",
      sessionId: "sess_1",
    });
  });

  it("calls an expired token the caller's", async () => {
    const { privateKey, jwks } = await keys();
    const old = await token(privateKey, { exp: Math.floor(Date.now() / 1000) - 60 });
    await expect(verifier(jwks).verify(old)).rejects.toBeInstanceOf(InvalidToken);
  });

  /*
   * Privy reports a bad signature, an unknown key and a fetch that failed with
   * the same sentence. Only the last is ours: the others have to be a 401, or
   * the app keeps a dead session and retries it forever.
   */
  it("calls a token signed with some other key the caller's", async () => {
    const [{ jwks }, other] = await Promise.all([keys(), keys()]);
    await expect(verifier(jwks).verify(await token(other.privateKey))).rejects.toBeInstanceOf(InvalidToken);
  });

  it("calls a token naming a key the app does not publish the caller's", async () => {
    const { privateKey, jwks } = await keys();
    await expect(verifier(jwks).verify(await token(privateKey, { kid: "k9" }))).rejects.toBeInstanceOf(
      InvalidToken,
    );
  });

  it("calls something that is not a token at all the caller's", async () => {
    const { jwks } = await keys();
    await expect(verifier(jwks).verify("not-a-token")).rejects.toBeInstanceOf(InvalidToken);
  });

  it("calls keys it could not fetch an outage, not a bad session", async () => {
    const { privateKey } = await keys();
    const unreachable: JWTVerifyGetKey = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(verifier(unreachable).verify(await token(privateKey))).rejects.toBeInstanceOf(
      AuthUnavailable,
    );
  });
});
