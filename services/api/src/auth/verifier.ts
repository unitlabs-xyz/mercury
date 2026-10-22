import { InvalidAuthTokenError, verifyAccessToken } from "@privy-io/node";
import { createRemoteJWKSet, decodeProtectedHeader, type JWTVerifyGetKey } from "jose";

/**
 * Privy publishes the public half of its signing key as a JWKS derived from the
 * app id, so there is nothing to copy out of the dashboard and key rotation
 * handles itself. Privy's own client treats a pasted PEM as an override of
 * this, which is the same shape we offer below.
 */
const jwksByApp = new Map<string, JWTVerifyGetKey>();

/**
 * Privy's published keys for an app, fetched once and then kept.
 *
 * One set per app for the life of the process, not one per call. `jose`
 * caches the keys inside each set it makes, so a new set per request meant a
 * fresh download from auth.privy.io for every request — and when a page fired
 * five at once and one download was slow, Privy's verifier reported that as
 * an invalid token and a signed-in person got "That session is not valid."
 * (18 October 2026, on the Earn page).
 */
export const privyJwks = (appId: string): JWTVerifyGetKey => {
  let jwks = jwksByApp.get(appId);
  if (jwks === undefined) {
    jwks = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`));
    jwksByApp.set(appId, jwks);
  }
  return jwks;
};

/** What the rest of the server is allowed to believe about a caller. */
export interface VerifiedToken {
  /** Privy's DID for the user, e.g. "did:privy:clxxxx". */
  readonly privyUserId: string;
  readonly sessionId: string;
  readonly expiresAt: Date;
}

export interface TokenVerifier {
  verify(token: string): Promise<VerifiedToken>;
}

/** The token could not be checked at all — Privy's keys unreachable — which says nothing about the token. */
export class AuthUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthUnavailable";
  }
}

export class InvalidToken extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidToken";
  }
}

/**
 * Privy access tokens are standard ES256 JWTs. `verification_key` is the PEM
 * public key from the Privy dashboard; it is public, so it is configuration
 * rather than a secret. Verification needs no app secret at all.
 */
export const createPrivyVerifier = (opts: {
  appId: string;
  /** A pasted PEM. Omit it and the app's published JWKS is used instead. */
  verificationKey?: string | undefined;
  /** The app's keys, already in hand. Tests pass a local set; otherwise Privy's published one. */
  jwks?: JWTVerifyGetKey;
}): TokenVerifier => ({
  async verify(token) {
    const keys = opts.verificationKey ?? opts.jwks ?? privyJwks(opts.appId);
    try {
      const claims = await verifyAccessToken({
        access_token: token,
        app_id: opts.appId,
        verification_key: keys,
      });
      return {
        privyUserId: claims.user_id,
        sessionId: claims.session_id,
        expiresAt: new Date(claims.expiration * 1000),
      };
    } catch (cause) {
      /*
       * Privy reports every failure as InvalidAuthTokenError, including not
       * being able to fetch its own keys. That one is ours, and is not a
       * reason to tell somebody their session is gone. Everything else is the
       * token's, and has to say so, or the app keeps a dead session forever.
       */
      if (cause instanceof InvalidAuthTokenError && /expired|invalid/i.test(cause.message)) {
        throw new InvalidToken(cause.message);
      }
      if (cause instanceof InvalidAuthTokenError) throw await whoseFault(token, keys);
      throw new AuthUnavailable(cause instanceof Error ? cause.message : String(cause));
    }
  },
});

/** jose's codes for a token naming a key, or an algorithm, the app does not publish. */
const NOT_THE_APPS_KEY = new Set([
  "ERR_JWKS_NO_MATCHING_KEY",
  "ERR_JWKS_MULTIPLE_MATCHING_KEYS",
  "ERR_JOSE_NOT_SUPPORTED",
]);

/**
 * Privy's "Failed to verify authentication token" covers a bad signature, a key
 * the app never published, something that is not a token at all, and keys it
 * could not fetch. Only the last is ours. Asking the key set for the token's
 * key tells them apart: if it hands the key back, the keys were there and the
 * token did not verify against them.
 */
const whoseFault = async (token: string, keys: string | JWTVerifyGetKey): Promise<Error> => {
  // A pasted key is never fetched, so nothing of ours could have failed.
  if (typeof keys === "string") return new InvalidToken("rejected by Privy");
  let header;
  try {
    header = decodeProtectedHeader(token);
  } catch {
    return new InvalidToken("not a token");
  }
  const alg = header.alg;
  if (typeof alg !== "string") return new InvalidToken("not a signed token");
  const [, payload = "", signature = ""] = token.split(".");
  try {
    await keys({ ...header, alg }, { payload, signature });
    return new InvalidToken("rejected by Privy");
  } catch (cause) {
    if (NOT_THE_APPS_KEY.has(String((cause as { code?: unknown }).code))) {
      return new InvalidToken("signed with a key the app does not publish");
    }
    return new AuthUnavailable(cause instanceof Error ? cause.message : String(cause));
  }
};
