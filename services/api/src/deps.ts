import { JupiterUltra, SymmetryVenue, type BasketVenue, type QuoteSource, type TokenRegistry, type TriggerSource } from "@mercury/chain";
import type { MultiplierSource, ReferenceSource, SessionSource } from "@mercury/market";
import type { AuthDeps } from "./auth/middleware.js";
import { createPrivyDirectory } from "./auth/identity.js";
import { createPrivyVerifier } from "./auth/verifier.js";
import { createDb } from "./db/client.js";

export interface Deps {
  readonly registry: TokenRegistry;
  readonly quotes: QuoteSource;
  readonly triggers: TriggerSource;
  readonly sessions: SessionSource;
  readonly reference: ReferenceSource;
  readonly multipliers: MultiplierSource;
  readonly baskets: BasketVenue;
}

export interface Config {
  /** Required. Nothing works without these. */
  readonly databaseUrl: string;
  readonly privyAppId: string;
  /**
   * Optional. Privy publishes the public key as a JWKS derived from the app id,
   * so this is only needed to pin a specific key instead of fetching it.
   */
  readonly privyVerificationKey?: string;
  readonly solanaRpcUrl: string;
  /** Execution only — subsystem 3. Absent until then. */
  readonly jupiterApiKey?: string;
}

const required = (env: NodeJS.ProcessEnv, key: string): string => {
  const value = env[key];
  if (value === undefined || value.length === 0) throw new Error(`${key} is required`);
  return value;
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const jupiterApiKey = env["JUPITER_API_KEY"];
  const privyVerificationKey = env["PRIVY_VERIFICATION_KEY"];
  return {
    databaseUrl: required(env, "DATABASE_URL"),
    privyAppId: required(env, "PRIVY_APP_ID"),
    solanaRpcUrl: required(env, "SOLANA_RPC_URL"),
    // Spread rather than assign: exactOptionalPropertyTypes rejects undefined.
    ...(privyVerificationKey ? { privyVerificationKey } : {}),
    ...(jupiterApiKey ? { jupiterApiKey } : {}),
  };
}

/**
 * Identity only. The market ports still throw from `buildDeps` until subsystem
 * 2 lifts them out of the browser — see the spec. This lets the auth path boot
 * and be deployed on its own.
 */
export function buildAuthDeps(config: Config): AuthDeps {
  return {
    db: createDb(config.databaseUrl),
    verifier: createPrivyVerifier({
      appId: config.privyAppId,
      verificationKey: config.privyVerificationKey,
    }),
    directory: createPrivyDirectory({
      appId: config.privyAppId,
      verificationKey: config.privyVerificationKey,
    }),
  };
}

/**
 * There is no fixture mode and no mock adapter. Every dependency is the real one or the
 * server does not start. Dummy data belongs in the client while the interface is being
 * built, never in the server.
 */
export function buildDeps(config: Config): Deps {
  if (!config.jupiterApiKey) {
    throw new Error("buildDeps: JUPITER_API_KEY is required once execution lands. Subsystem 3.");
  }
  const quotes = new JupiterUltra({ apiKey: config.jupiterApiKey });
  const baskets = new SymmetryVenue({ rpcUrl: config.solanaRpcUrl });

  throw new Error(
    "buildDeps: registry, triggers, sessions, reference and multipliers are not implemented yet. Week 1.",
  );
}
