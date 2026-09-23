import { InvalidAuthTokenError, verifyAccessToken } from "@privy-io/node";

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
  verificationKey: string;
}): TokenVerifier => ({
  async verify(token) {
    try {
      const claims = await verifyAccessToken({
        access_token: token,
        app_id: opts.appId,
        verification_key: opts.verificationKey,
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
