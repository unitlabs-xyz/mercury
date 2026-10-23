import type { MiddlewareHandler } from "hono";
import type { Db } from "../db/client.js";
import { resolveIdentity, type Identity, type UserDirectory } from "./identity.js";
import { AuthUnavailable, InvalidToken, type TokenVerifier, type VerifiedToken } from "./verifier.js";

export interface AuthDeps {
  readonly db: Db;
  readonly verifier: TokenVerifier;
  readonly directory: UserDirectory;
  /** Told the wallet behind every signed-in request: who is using the app now. See `jobs/presence.ts`. */
  readonly onSeen?: (wallet: string) => void;
}

declare module "hono" {
  interface ContextVariableMap {
    identity: Identity;
  }
}

type Resolve = (
  db: Db,
  dir: UserDirectory,
  token: VerifiedToken,
  identityToken: string | null,
) => Promise<Identity>;

/**
 * Mount on "/v1/*", never on "*": /health has to answer without a token or the
 * platform health check reports the service down.
 *
 * Two tokens arrive. The access token says who is calling and is required. The
 * identity token carries Privy's signed claim about their wallet and is not —
 * a session can be valid before a wallet finishes provisioning.
 *
 * `resolve` is injected so the middleware can be tested without a database.
 */
export const requireAuth = (deps: AuthDeps, resolve: Resolve = resolveIdentity): MiddlewareHandler => {
  return async (c, next) => {
    const header = c.req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return c.json({ error: { code: "unauthenticated", message: "Expected a Bearer access token." } }, 401);
    }

    try {
      const verified = await deps.verifier.verify(token);
      const identityToken = c.req.header("X-Privy-Identity-Token") ?? null;
      const identity = await resolve(deps.db, deps.directory, verified, identityToken);
      c.set("identity", identity);
      if (identity.walletAddress !== null) deps.onSeen?.(identity.walletAddress);
    } catch (cause) {
      if (cause instanceof InvalidToken) {
        return c.json({ error: { code: "unauthenticated", message: "That session is not valid." } }, 401);
      }
      // Not the session's fault: say so, and keep the person signed in.
      if (cause instanceof AuthUnavailable) {
        return c.json(
          {
            error: {
              code: "auth_unavailable",
              message: "Couldn't check your sign-in. Try again in a moment.",
            },
          },
          503,
        );
      }
      throw cause;
    }

    await next();
    return undefined;
  };
};
