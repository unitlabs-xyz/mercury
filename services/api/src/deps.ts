import { JupiterUltra, SymmetryVenue, type BasketVenue, type QuoteSource, type TokenRegistry, type TriggerSource } from "@harbor/chain";
import type { MultiplierSource, ReferenceSource, SessionSource } from "@harbor/market";

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
  readonly jupiterApiKey: string;
  readonly solanaRpcUrl: string;
  readonly chainlinkFeedUrl: string;
  readonly pythApiKey: string;
  readonly databaseUrl: string;
}

const required = (env: NodeJS.ProcessEnv, key: string): string => {
  const value = env[key];
  if (value === undefined || value.length === 0) throw new Error(`${key} is required`);
  return value;
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    jupiterApiKey: required(env, "JUPITER_API_KEY"),
    solanaRpcUrl: required(env, "SOLANA_RPC_URL"),
    chainlinkFeedUrl: required(env, "CHAINLINK_FEED_URL"),
    pythApiKey: required(env, "PYTH_API_KEY"),
    databaseUrl: required(env, "DATABASE_URL"),
  };
}

/**
 * There is no fixture mode and no mock adapter. Every dependency is the real one or the
 * server does not start. Dummy data belongs in the client while the interface is being
 * built, never in the server.
 */
export function buildDeps(config: Config): Deps {
  const quotes = new JupiterUltra({ apiKey: config.jupiterApiKey });
  const baskets = new SymmetryVenue({ rpcUrl: config.solanaRpcUrl });

  throw new Error(
    "buildDeps: registry, triggers, sessions, reference and multipliers are not implemented yet. Week 1.",
  );
}
