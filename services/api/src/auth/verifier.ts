import { InvalidAuthTokenError, verifyAccessToken } from "@privy-io/node";
import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";

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
}): TokenVerifier => ({
  async verify(token) {
    try {
      const claims = await verifyAccessToken({
        access_token: token,
        app_id: opts.appId,
        verification_key: opts.verificationKey ?? privyJwks(opts.appId),
      });
      return {
        privyUserId: claims.user_id,
        sessionId: claims.session_id,
        expiresAt: new Date(claims.expiration * 1000),
      };
    } catch (cause) {
      /*
       * Privy reports every failure as InvalidAuthTokenError, including not
       * being able to fetch its own keys. Only an expired or malformed token is
       * the caller's: anything else is ours, and is not a reason to tell
       * somebody their session is gone.
       */
      if (cause instanceof InvalidAuthTokenError && /expired|invalid/i.test(cause.message)) {
        throw new InvalidToken(cause.message);
      }
      throw new AuthUnavailable(cause instanceof Error ? cause.message : String(cause));
    }
  },
});
