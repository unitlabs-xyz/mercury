import { InvalidAuthTokenError, verifyAccessToken } from "@privy-io/node";
import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";

/**
 * Privy publishes the public half of its signing key as a JWKS derived from the
 * app id, so there is nothing to copy out of the dashboard and key rotation
 * handles itself. Privy's own client treats a pasted PEM as an override of
 * this, which is the same shape we offer below.
 */
export const privyJwks = (appId: string): JWTVerifyGetKey =>
  createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`));

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
      if (cause instanceof InvalidAuthTokenError) throw new InvalidToken("rejected by Privy");
      throw cause;
    }
  },
});
