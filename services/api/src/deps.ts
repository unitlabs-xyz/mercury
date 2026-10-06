import {
  JupiterLite,
  JupiterRegistry,
  SolanaRpc,
  SymmetryVenue,
  USDC_MINT,
  type BasketVenue,
  type SupportedStocks,
  type ChainHistory,
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
  YahooHistory,
  type CreditSource,
  type HistorySource,
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
import { debtFrom } from "./lending/debt.js";
import { recordLoanEvents } from "./lending/record.js";
import { pledgedByMint, withPledged } from "./lending/pledged.js";
import type { LendingSource } from "./lending/ports.js";
import type { InstrumentDeps } from "./routes/instruments.js";
import type { MoneyDeps } from "./routes/money.js";
import type { PortfolioDeps } from "./routes/portfolio.js";
import { pgOrderStore, type OrderStore } from "./orders/store.js";
import { pgWaitlist, type WaitlistDeps } from "./routes/waitlist.js";
import { loggingNotifier, resendNotifier } from "./notify/resend.js";
import { settleOrder, tokenRefFor, type FillDeps } from "./orders/settle.js";
import { countBuyers30d, readSupportedStocks } from "./instruments/queries.js";
import { readHoldings, readLatestDebt, readSnapshots } from "./portfolio/queries.js";
import { readActivity } from "./portfolio/activity-queries.js";
import type { ReconcileDeps } from "./portfolio/apply.js";
import { BasketService } from "./baskets/core/service.js";
import { GliderClient } from "./baskets/glider/client.js";
import { JsonBasketStore } from "./baskets/glider/store.js";

export interface Deps {
  readonly registry: TokenRegistry;
  readonly supportedStocks: SupportedStocks;
  readonly quotes: QuoteSource;
  readonly triggers: TriggerSource;
  readonly sessions: SessionSource;
  readonly reference: ReferenceSource;
  readonly multipliers: MultiplierSource;
  readonly prices: PriceBoard;
  readonly credit: CreditSource;
  /** Price history for the underlying share, for charts and the returns table. */
  readonly priceHistory: HistorySource;
  readonly chain: ChainReader;
  /** The same adapter, asked what happened rather than what is held. */
  readonly history: ChainHistory;
  readonly baskets: BasketVenue;
  /** Kamino's xStocks market through the klend SDK: reads, and unsigned transactions. */
  readonly lending: LendingSource;
}

export interface Config {
  /** Required. Nothing works without these. */
  readonly databaseUrl: string;
  readonly privyAppId: string;
  /** Optional. Enables one Glider strategy-catalog reconciliation at startup. */
  readonly gliderApiKey?: string;
  /** Resend, for the loan watcher. Unset means it warns nobody and says so. */
  readonly resendApiKey?: string;
  readonly notifyFrom: string;
  /**
   * Optional. Privy publishes the public key as a JWKS derived from the app id,
   * so this is only needed to pin a specific key instead of fetching it.
   */
  readonly privyVerificationKey?: string;
  readonly solanaRpcUrl: string;
  /** Optional. Program scans (Kamino's reserve lookup), if the main RPC plan refuses them. */
  readonly solanaScanRpcUrl?: string;
  /**
   * Optional. The key that pays for sponsored transactions.
   *
   * Absent, sponsorship is off and buyers pay their own network costs — which
   * is the behaviour today, not a broken state. The send route falls back to
   * requiring the buyer to be their own fee payer, so a deployment without a
   * funded relayer still sells stock.
   */
  readonly relayerSecretKey?: string;
  /** Optional. The bearer token for `GET /admin/waitlist`; unset, that route is a 404. */
  readonly waitlistAdminToken?: string;
  /**
   * Optional. The origin founding-card links are built on, once the landing
   * domain proxies `/f/*` and `/waitlist/cards/*` here. Unset, each link uses
   * the address the request came in on.
   */
  readonly waitlistPublicUrl?: string;
}

const required = (env: NodeJS.ProcessEnv, key: string): string => {
  const value = env[key];
  if (value === undefined || value.length === 0) throw new Error(`${key} is required`);
  return value;
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const privyVerificationKey = env["PRIVY_VERIFICATION_KEY"];
  return {
    databaseUrl: required(env, "DATABASE_URL"),
    privyAppId: required(env, "PRIVY_APP_ID"),
    ...(env["GLIDER_API_KEY"] ? { gliderApiKey: env["GLIDER_API_KEY"] } : {}),
    ...(env["RESEND_API_KEY"] ? { resendApiKey: env["RESEND_API_KEY"] } : {}),
    notifyFrom: env["NOTIFY_FROM"] ?? "Mercury <alerts@mercury.invalid>",
    solanaRpcUrl: required(env, "SOLANA_RPC_URL"),
    ...(env["SOLANA_SCAN_RPC_URL"] ? { solanaScanRpcUrl: env["SOLANA_SCAN_RPC_URL"] } : {}),
    ...(env["RELAYER_SECRET_KEY"] ? { relayerSecretKey: env["RELAYER_SECRET_KEY"] } : {}),
    // Spread rather than assign: exactOptionalPropertyTypes rejects undefined.
    ...(privyVerificationKey ? { privyVerificationKey } : {}),
    ...(env["WAITLIST_ADMIN_TOKEN"] ? { waitlistAdminToken: env["WAITLIST_ADMIN_TOKEN"] } : {}),
    ...(env["WAITLIST_PUBLIC_URL"] ? { waitlistPublicUrl: env["WAITLIST_PUBLIC_URL"] } : {}),
  };
}

/** Reconcile optional Glider strategies without affecting unrelated API startup. */
export async function syncConfiguredCatalog(config: Config): Promise<void> {
  if (config.gliderApiKey === undefined) return;
  try {
    const service = new BasketService({
      provider: new GliderClient(config.gliderApiKey),
      store: new JsonBasketStore(config.databaseUrl),
    });
    const result = await service.sync();
    console.log(
      `Glider catalog: ${result.recorded} recorded, ${result.reused} reused, ${result.created} created`,
    );
  } catch (error: unknown) {
    console.error("Glider catalog sync failed; other API features remain available:", error);
  }
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
 * Nothing here takes a key. Jupiter's keyless endpoints both price an order and
 * build the transaction that fills it, which is the whole of execution — the
 * Ultra adapter that once needed `JUPITER_API_KEY` is gone, and so is the key.
 * Triggers are the one piece still missing, and baskets are blocked on the
 * Symmetry spike — both are present so the object is whole, and both throw.
 */
export function buildDeps(config: Config): Deps {
  const registry = new JupiterRegistry();
  const chain = new SolanaRpc({ rpcUrl: config.solanaRpcUrl });
  const market = new JupiterMarket({ registry });

  return {
    registry,
    supportedStocks: registry,
    quotes: new JupiterLite(),
    triggers: new JupiterTriggersNotYet(),
    sessions: new PythSessions(),
    reference: market,
    // The mint is the authority. `market` implements the same port from
    // Jupiter's copy of the same numbers, and is what the browser falls back to.
    multipliers: new MintMultipliers({ chain }),
    prices: market,
    credit: new KaminoCredit(),
    // Unofficial, keyless, and the only equity history we can reach: Pyth
    // Benchmarks refuses equity feeds on our entitlement and serves one
    // timestamp per call rather than a range. See the adapter for the measurements.
    priceHistory: new YahooHistory(),
    chain,
    history: chain,
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
  readonly basketTemplates: BasketService;
  readonly instruments: InstrumentDeps;
  readonly portfolio: PortfolioDeps;
  readonly money: MoneyDeps;
  readonly activity: ActivityDeps;
  readonly orders: OrderStore;
  readonly waitlist: WaitlistDeps;
  readonly fills: FillDeps;
  readonly borrow: BorrowDeps;
  readonly send: SendDeps;
}

/**
 * The read side. Each route module takes its queries as functions rather than a
 * database handle, which is what lets every route be tested with a plain object.
 */
/**
 * What the background sync needs. Built here so it shares one construction with
 * the read path — including the pledged-stock view, because pledging is not
 * selling and the books have to keep reading it as held.
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
  config: Pick<
    Config,
    | "databaseUrl"
    | "gliderApiKey"
    | "solanaRpcUrl"
    | "waitlistAdminToken"
    | "waitlistPublicUrl"
    | "resendApiKey"
    | "notifyFrom"
  >,
  /** Built at boot, because loading a key is async and this is not. */
  relay?: SendDeps["relay"],
): ReadDeps {
  return {
    basketTemplates: new BasketService({
      store: new JsonBasketStore(config.databaseUrl, undefined, db),
      ...(config.gliderApiKey === undefined ? {} : { provider: new GliderClient(config.gliderApiKey) }),
    }),
    instruments: {
      supportedStocks: () => readSupportedStocks(db, deps.supportedStocks),
      buyers30d: (ticker) => countBuyers30d(db, ticker),
      prices: deps.prices,
      sessions: deps.sessions,
      history: deps.priceHistory,
    },
    portfolio: {
      holdings: (userId) => readHoldings(db, userId),
      prices: deps.prices,
      chain: deps.chain,
      multipliers: deps.multipliers,
      usdcMint: USDC_MINT,
      pledged: (wallet) => pledgedByMint(deps.lending, wallet),
      debt: (wallet) => debtFrom(deps.lending, wallet),
      lastKnownDebt: (userId) => readLatestDebt(db, userId),
      snapshots: (userId, from) => readSnapshots(db, userId, from),
    },
    money: { chain: deps.chain, credit: deps.credit, lending: deps.lending, usdcMint: USDC_MINT },
    activity: { read: (userId, limit, cursor) => readActivity(db, userId, limit, cursor) },
    orders: pgOrderStore(db),
    waitlist: pgWaitlist(db, config.waitlistAdminToken, undefined, {
      // The welcome email, through the same provider as loan alerts. Without a
      // key it is logged and not sent; the card still shows on the page.
      notifier:
        config.resendApiKey === undefined
          ? loggingNotifier()
          : resendNotifier({ apiKey: config.resendApiKey, from: config.notifyFrom }),
      ...(config.waitlistPublicUrl ? { publicBase: config.waitlistPublicUrl } : {}),
    }),
    fills: {
      tokenRef: (mint) => tokenRefFor(db, mint),
      settle: (input) => settleOrder(db, input),
    },
    borrow: {
      lending: deps.lending,
      chain: deps.chain,
      usdcMint: USDC_MINT,
      history: deps.history,
      record: (planned, input) => recordLoanEvents(db, planned, input),
    },
    send: { rpcUrl: config.solanaRpcUrl, ...(relay === undefined ? {} : { relay }) },
  };
}
