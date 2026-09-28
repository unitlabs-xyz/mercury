import {
  JupiterLite,
  JupiterRegistry,
  SolanaRpc,
  SymmetryVenue,
  USDC_MINT,
  type BasketVenue,
  type CatalogueSource,
  type ChainReader,
  type QuoteSource,
  type TokenRegistry,
  type TriggerSource,
} from "@mercury/chain";
import {
  JupiterMarket,
  KaminoCredit,
  MintMultipliers,
  PythSessions,
  type CreditSource,
  type MultiplierSource,
  type PriceBoard,
  type ReferenceSource,
  type SessionSource,
} from "@mercury/market";
import type { AuthDeps } from "./auth/middleware.js";
import { createPrivyDirectory } from "./auth/identity.js";
import { createPrivyVerifier } from "./auth/verifier.js";
import { createDb, type Db } from "./db/client.js";
import type { ActivityDeps } from "./routes/activity.js";
import type { BorrowDeps } from "./routes/borrow.js";
import type { SendDeps } from "./routes/send.js";
import { KaminoLending } from "./lending/kamino.js";
import { pledgedByMint, withPledged } from "./lending/pledged.js";
import type { LendingSource } from "./lending/ports.js";
import type { InstrumentDeps } from "./routes/instruments.js";
import type { MoneyDeps } from "./routes/money.js";
import type { PortfolioDeps } from "./routes/portfolio.js";
import { pgOrderStore, type OrderStore } from "./orders/store.js";
import { countBuyers30d, readCatalogue } from "./instruments/queries.js";
import { readHoldings } from "./portfolio/queries.js";
import { readActivity } from "./portfolio/activity-queries.js";
import type { ReconcileDeps } from "./portfolio/apply.js";

export interface Deps {
  readonly registry: TokenRegistry;
  readonly catalogue: CatalogueSource;
  readonly quotes: QuoteSource;
  readonly triggers: TriggerSource;
  readonly sessions: SessionSource;
  readonly reference: ReferenceSource;
  readonly multipliers: MultiplierSource;
  readonly prices: PriceBoard;
  readonly credit: CreditSource;
  readonly chain: ChainReader;
  readonly baskets: BasketVenue;
  /** Kamino's xStocks market through the klend SDK: reads, and unsigned transactions. */
  readonly lending: LendingSource;
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
  /** Optional. Program scans (Kamino's reserve lookup), if the main RPC plan refuses them. */
  readonly solanaScanRpcUrl?: string;
  /** Execution only — subsystem 3. Absent until then. */
  readonly jupiterApiKey?: string;
  /**
   * "broadcast" sends signed transactions to the network. "simulate" is a dry
   * run: each is simulated against mainnet and nothing is sent. Anything else
   * refuses to start, so a typo can never quietly mean "send".
   */
  readonly sendMode: SendMode;
}

export type SendMode = "broadcast" | "simulate";

const required = (env: NodeJS.ProcessEnv, key: string): string => {
  const value = env[key];
  if (value === undefined || value.length === 0) throw new Error(`${key} is required`);
  return value;
};

const sendModeOf = (value: string | undefined): SendMode => {
  if (value === undefined || value === "" || value === "broadcast") return "broadcast";
  if (value === "simulate") return "simulate";
  throw new Error(`SEND_MODE must be "broadcast" or "simulate", not "${value}"`);
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const jupiterApiKey = env["JUPITER_API_KEY"];
  const privyVerificationKey = env["PRIVY_VERIFICATION_KEY"];
  return {
    databaseUrl: required(env, "DATABASE_URL"),
    privyAppId: required(env, "PRIVY_APP_ID"),
    solanaRpcUrl: required(env, "SOLANA_RPC_URL"),
    sendMode: sendModeOf(env["SEND_MODE"]),
    ...(env["SOLANA_SCAN_RPC_URL"] ? { solanaScanRpcUrl: env["SOLANA_SCAN_RPC_URL"] } : {}),
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
 *
 * Nothing here takes a key. Quotes come from Jupiter's keyless endpoint, which is
 * what prices a decision; `JUPITER_API_KEY` buys Ultra, which *executes* one, and
 * arrives with subsystem 3. Triggers are subsystem 3 as well, and baskets are
 * blocked on the Symmetry spike — both are present so the object is whole, and
 * both throw if called.
 */
export function buildDeps(config: Config): Deps {
  const registry = new JupiterRegistry();
  const chain = new SolanaRpc({ rpcUrl: config.solanaRpcUrl });
  const market = new JupiterMarket({ registry });

  return {
    registry,
    catalogue: registry,
    quotes: new JupiterLite(),
    triggers: new JupiterTriggersNotYet(),
    sessions: new PythSessions(),
    reference: market,
    // The mint is the authority. `market` implements the same port from
    // Jupiter's copy of the same numbers, and is what the browser falls back to.
    multipliers: new MintMultipliers({ chain }),
    prices: market,
    credit: new KaminoCredit(),
    chain,
    baskets: new SymmetryVenue({ rpcUrl: config.solanaRpcUrl }),
    lending: new KaminoLending({
      rpcUrl: config.solanaRpcUrl,
      ...(config.solanaScanRpcUrl ? { scanRpcUrl: config.solanaScanRpcUrl } : {}),
    }),
  };
}

/** Trigger orders are subsystem 3. Present so `Deps` is whole; loud if called. */
class JupiterTriggersNotYet implements TriggerSource {
  create(): never {
    throw new Error("buildDeps: trigger orders arrive with execution, subsystem 3");
  }
  status(): never {
    throw new Error("buildDeps: trigger orders arrive with execution, subsystem 3");
  }
  cancel(): never {
    throw new Error("buildDeps: trigger orders arrive with execution, subsystem 3");
  }
}

export interface ReadDeps {
  readonly instruments: InstrumentDeps;
  readonly portfolio: PortfolioDeps;
  readonly money: MoneyDeps;
  readonly activity: ActivityDeps;
  readonly orders: OrderStore;
  readonly borrow: BorrowDeps;
  readonly send: SendDeps;
}

/**
 * The read side. Each route module takes its queries as functions rather than a
 * database handle, which is what lets every route be tested with a plain object.
 */
/**
 * What the background sync needs. Built here so the cron path and the API
 * share one construction — including the pledged-stock view, because pledging
 * is not selling and the books have to keep reading it as held.
 */
export function buildReconcileDeps(deps: Deps): ReconcileDeps {
  return {
    chain: withPledged(deps.chain, deps.lending),
    prices: deps.prices,
    multipliers: deps.multipliers,
  };
}

export function buildReadDeps(
  db: Db,
  deps: Deps,
  config: Pick<Config, "solanaRpcUrl" | "sendMode">,
): ReadDeps {
  return {
    instruments: {
      catalogue: () => readCatalogue(db, deps.catalogue),
      buyers30d: (ticker) => countBuyers30d(db, ticker),
      prices: deps.prices,
      sessions: deps.sessions,
    },
    portfolio: {
      holdings: (userId) => readHoldings(db, userId),
      prices: deps.prices,
      chain: deps.chain,
      multipliers: deps.multipliers,
      usdcMint: USDC_MINT,
      pledged: (wallet) => pledgedByMint(deps.lending, wallet),
    },
    money: { chain: deps.chain, credit: deps.credit, usdcMint: USDC_MINT },
    activity: { read: (userId, limit, cursor) => readActivity(db, userId, limit, cursor) },
    orders: pgOrderStore(db),
    borrow: { lending: deps.lending, chain: deps.chain, usdcMint: USDC_MINT },
    send: { rpcUrl: config.solanaRpcUrl, mode: config.sendMode },
  };
}
