import {
  FixtureQuoteSource, FixtureRegistry, FixtureTriggerSource, JupiterUltra, SymmetryVenue,
  type BasketVenue, type QuoteSource, type TokenRegistry, type TriggerSource,
} from "@harbor/chain";
import {
  FixtureMultiplierSource, FixtureReferenceSource, FixtureSessionSource,
  type MultiplierSource, type ReferenceSource, type SessionSource,
} from "@harbor/market";

export interface Deps {
  readonly registry: TokenRegistry;
  readonly quotes: QuoteSource;
  readonly triggers: TriggerSource;
  readonly sessions: SessionSource;
  readonly reference: ReferenceSource;
  readonly multipliers: MultiplierSource;
  readonly baskets: BasketVenue | null;
  readonly mode: "fixture" | "live";
}

/**
 * Fixture mode is the default and needs no keys and no network. That is deliberate:
 * the web app can be built on day one against a server that behaves correctly, using
 * the real measurements from 19 September. See docs/01.
 */
export function buildDeps(env: NodeJS.ProcessEnv = process.env): Deps {
  const live = env.HARBOR_MODE === "live";
  if (!live) {
    return {
      registry: new FixtureRegistry(),
      quotes: new FixtureQuoteSource(),
      triggers: new FixtureTriggerSource(),
      sessions: new FixtureSessionSource(),
      reference: new FixtureReferenceSource(),
      multipliers: new FixtureMultiplierSource(),
      baskets: null,
      mode: "fixture",
    };
  }

  const apiKey = env.JUPITER_API_KEY;
  if (apiKey === undefined) throw new Error("JUPITER_API_KEY is required in live mode");
  const rpcUrl = env.SOLANA_RPC_URL;
  if (rpcUrl === undefined) throw new Error("SOLANA_RPC_URL is required in live mode");

  return {
    registry: new FixtureRegistry(), // TODO: on-chain registry, week 1
    quotes: new JupiterUltra({ apiKey }),
    triggers: new FixtureTriggerSource(), // TODO: Jupiter Trigger, week 2
    sessions: new FixtureSessionSource(), // TODO: Pyth market_session_schedule, week 1
    reference: new FixtureReferenceSource(), // TODO: Chainlink, week 1
    multipliers: new FixtureMultiplierSource(), // TODO: Token-2022 ScaledUiAmount, week 1
    baskets: new SymmetryVenue({ rpcUrl }),
    mode: "live",
  };
}
