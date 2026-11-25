import {
  JupiterLite,
  JupiterRegistry,
  jupiterAccess,
  parseJupiterKeys,
  SolanaRpc,
  SymmetryVenue,
  rotatingFetch,
  rotation,
  solanaSubscriptions,
  subscriptionEndpoints,
  type ChainSubscriptions,
  type Rotation,
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
  BoardReference,
  FallbackReference,
  PythReference,
  CachedPriceBoard,
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
import type { NotificationDeps } from "./routes/notifications.js";
import type { WalletDeps } from "./routes/wallets.js";
import type { BorrowDeps } from "./routes/borrow.js";
import type { SendDeps } from "./routes/send.js";
import type { MoveDeps } from "./routes/move.js";
import { recordMove as recordWalletMove } from "./moves/record.js";
import { moveSends } from "./moves/sends.js";
import { mercuryWalletIdOf, movableMints } from "./moves/queries.js";
import { findOutsideBaskets } from "./baskets/outside.js";
import { remembered } from "./moves/remembered.js";
import { createSolanaRpc } from "@solana/kit";
import { KaminoLending } from "./lending/kamino.js";
import { KaminoEarn } from "./earn/kamino-vault.js";
import { D, ZERO } from "@mercury/core";
import { hasEarnHistory, pgEarnLedger } from "./earn/store.js";
import { onlyIfUsed } from "./earn/gate.js";
import { recordMove } from "./earn/record.js";
import { earnSends } from "./earn/sends.js";
import { earnBalance, earnDirectory, earnSummary, type EarnDirectory } from "./earn/directory.js";
import { kaminoApi, type KaminoApi } from "./earn/kamino-api.js";
import type { EarnDeps } from "./routes/earn.js";
import { debtFrom } from "./lending/debt.js";
import { loanLedger, recordLoanEvents } from "./lending/record.js";
import { pledgedByMint, withPledged } from "./lending/pledged.js";
import type { LendingSource } from "./lending/ports.js";
import type { InstrumentDeps } from "./routes/instruments.js";
import type { MoneyDeps } from "./routes/money.js";
import type { FundDeps } from "./routes/fund.js";
import type { PortfolioDeps } from "./routes/portfolio.js";
import { pgOrderStore, type OrderStore } from "./orders/store.js";
import type { FeedbackDeps } from "./routes/feedback.js";
import { loggingNotifier, resendNotifier } from "./notify/resend.js";
import { settleOrder, tokenRefFor, type FillDeps } from "./orders/settle.js";
import { countBuyers30d, readSupportedStocks } from "./instruments/queries.js";
import {
  readBasketMovements,
  basketNetFunding,
  readFlows,
  readHoldings,
  readLatestDebt,
  readLatestEarn,
  readSnapshots,
} from "./portfolio/queries.js";
import { basketReturnsReader, basketValueReader } from "./portfolio/baskets.js";
import { readActivity } from "./portfolio/activity-queries.js";
import { countUnread, markAllRead, markRead, readInbox } from "./notify/inbox-queries.js";
import { pgWalletDeps } from "./wallets/deps.js";
import { readReceipt } from "./portfolio/receipt-queries.js";
import { readSummary } from "./portfolio/summary-queries.js";
import type { ReconcileDeps } from "./portfolio/apply.js";
import { BasketService } from "./baskets/core/service.js";
import { GliderClient } from "./baskets/glider/client.js";
import { JsonBasketStore } from "./baskets/glider/store.js";
import { SolanaBasketFunding } from "./baskets/glider/funding.js";
import type { BasketProvider } from "./baskets/core/deps.js";
import { logger } from "./log/index.js";
import { declareCost } from "./portfolio/declared-cost.js";
import { noteStrain } from "./jobs/strain.js";

/** Pyth in front of the issuer's quote, or the issuer's quote alone. */
const withFallback = (pythApiKey: string | undefined, issuer: ReferenceSource): ReferenceSource =>
  pythApiKey === undefined
    ? issuer
    : new FallbackReference(new PythReference({ apiKey: pythApiKey }), issuer);

const log = logger("deps");

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
  /** The Kamino Earn vaults idle cash can be lent through. */
  readonly earn: EarnDirectory;
  /** Optional Glider capability shared by routes and the wallet-events exit reconciler. */
  readonly basketProvider?: BasketProvider;
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
  /** Where the in-app feedback button sends to. */
  readonly feedbackTo: string;
  /**
   * Optional. Privy publishes the public key as a JWKS derived from the app id,
   * so this is only needed to pin a specific key instead of fetching it.
   */
  readonly privyVerificationKey?: string;
  readonly solanaRpcUrl: string;
  /** Optional. Program scans (Kamino's reserve lookup), if the main RPC plan refuses them. */
  readonly solanaScanRpcUrl?: string;
  /**
   * Public endpoints the background jobs read through, taken in turn, so they
   * stop spending the paid plan: `SOLANA_PUBLIC_RPC_URLS`, comma-separated.
   * Unset, the keyless ones that serve the jobs (`PUBLIC_RPC_URLS`); set
   * empty, the jobs use `solanaRpcUrl` as before. Everything a person waits on, every read on a screen and every
   * transaction, keeps `solanaRpcUrl`, and so does a job's request that every
   * public endpoint refuses.
   */
  readonly solanaPublicRpcUrls: readonly string[];
  /**
   * Optional. Jupiter API keys, rotated one per request. Set, every Jupiter call
   * goes to the paid host (api.jup.ag) for its higher rate limits; empty, they
   * stay on the keyless free tier.
   */
  readonly jupiterApiKeys: readonly string[];
  /**
   * Optional. Relay, for funding from any chain. Absent, the funding method is
   * not offered at all.
   *
   * The same value is the secret Relay signs its webhooks with — their choice,
   * not ours.
   */
  readonly relayApiKey?: string;
  /** What we will not quote a deposit below. Decided at $10; see ADR 0014. */
  readonly fundMinimumUsd: number;
  /**
   * Optional. The key that pays for sponsored transactions.
   *
   * Absent, sponsorship is off. Sends fall back to the sender paying their own
   * network cost, but stock trades are refused: Mercury's fee is carried in
   * the relayer's USDC transfer, and without one a trade would fill for free.
   */
  readonly relayerSecretKey?: string;
  /**
   * The Earn vault a person gets until they choose another. Defaults to
   * Steakhouse USDC, the first of Mercury's picks (see `earn/catalog.ts`). It
   * has to be on the list (`earn/directory.ts`); one that is not is passed over
   * for the first vault that is.
   */
  readonly earnVault: string;
  /**
   * Mercury's own fee on a stock trade, in basis points of what the trade is
   * worth: 50 is 0.5%. Charged in the same USDC transfer that repays the
   * relayer, so it lands in the relayer's USDC account beside the network cost.
   */
  readonly tradingFeeBps: number;
  /**
   * Mercury's fee on a deposit Relay has to swap, in basis points of what is
   * sent: 30 is 0.3%. Circle's own USDC is never charged. Relay takes it out of
   * the deposit and holds it for us; see `depositFeeRecipient`.
   */
  readonly depositFeeBps: number;
  /**
   * Optional. The EVM address Relay credits deposit fees to, and the one that
   * claims them. Absent, no deposit is charged, because there is nobody to pay.
   */
  readonly depositFeeRecipient?: string;
  /**
   * Hermes rejects Pyth's price endpoints without one, as of 26 August 2026.
   * Unset, the reference price is the issuer's quote inside Jupiter's
   * `price/v3`, which republishes every two or three minutes — workable, but
   * the premium check then spends part of its one percent on market movement
   * rather than on dislocation.
   */
  readonly pythApiKey?: string;
  /**
   * Where the web app is served. A wallet being linked signs a message that
   * names this domain, so a signature asked for on any other site is no use
   * here. `APP_URL`, defaulting to the beta.
   */
  readonly appUrl: string;
  /**
   * How many wallets a person may have linked at once, beside their Mercury
   * wallet. `LINKED_WALLET_LIMIT`, defaulting to 5.
   */
  readonly linkedWalletLimit: number;
  /**
   * The history reader's own ceiling on the paid RPC, in calls a second.
   * `HISTORY_RPC_RPS`, defaulting to 2: well under the plan's limit, since it
   * shares one allowance with everything the app reads and sends.
   */
  readonly historyRps: number;
}

/**
 * The oldest price a quote may be checked against.
 *
 * `decide` refuses an order whose route is too far above the reference, so
 * this is a number an order turns on rather than one a screen shows — the
 * board's own five seconds would check a live quote against a price that old.
 * A second still collapses the several quotes one buy makes: the ticket
 * prices, probes and re-prices within milliseconds of itself.
 */
const REFERENCE_MAX_AGE_MS = 1_000;

/**
 * How long the price board collects misses before it asks.
 *
 * Half a second, which is a lot of latency to accept on purpose. It buys a
 * lower refusal rate: `price/v3` costs the same for one id as for fifty, so
 * everything that arrives inside the window rides one request instead of one
 * each, and the allowance is ten requests a second across every Jupiter
 * adapter in the process. A shelf that renders 500ms later is worth a quote
 * that is not refused.
 *
 * It is not paid by the paths that cannot afford it. A caller naming a
 * `maxAgeMs` — the quote path — closes the batch and sends it immediately, and
 * a mint anybody has read in the last minute is served from the board without
 * waiting for anything at all.
 */
const PRICE_WINDOW_MS = 500;

const required = (env: NodeJS.ProcessEnv, key: string): string => {
  const value = env[key];
  if (value === undefined || value.length === 0) throw new Error(`${key} is required`);
  return value;
};

/** Half a percent, the rate the founders set on 15 October 2026. */
const DEFAULT_TRADING_FEE_BPS = 50;

/** 0.3% on a deposit Relay has to swap, the rate in the revenue deck of 14 October 2026. */
const DEFAULT_DEPOSIT_FEE_BPS = 30;

/*
 * Whole basis points, below 100%, or the server does not start. "0.5" read as
 * half a percent, or a typo, would otherwise charge every trade something
 * nobody chose — and a fee is not a setting anyone checks by eye afterwards.
 */
const basisPoints = (env: NodeJS.ProcessEnv, key: string, fallback: number): number => {
  const raw = env[key];
  if (raw === undefined || raw.length === 0) return fallback;
  const bps = Number(raw);
  if (!Number.isInteger(bps) || bps < 0 || bps >= 10_000) {
    throw new Error(`${key} must be whole basis points from 0 to 9999, got "${raw}"`);
  }
  return bps;
};

/** The web app, where a wallet is linked. */
const DEFAULT_APP_URL = "https://beta.trymercury.xyz";

/** Five linked wallets beside the Mercury wallet, the number set on 21 November 2026. */
const DEFAULT_LINKED_WALLET_LIMIT = 5;

/*
 * https, or http on this machine for a local web app. The domain is what a
 * wallet shows the person when it asks them to sign, so it has to be real.
 */
const appUrl = (env: NodeJS.ProcessEnv): string => {
  const raw = env["APP_URL"];
  if (raw === undefined || raw.length === 0) return DEFAULT_APP_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`APP_URL must be a URL, got "${raw}"`);
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error(`APP_URL must be https (or http on localhost), got "${raw}"`);
  }
  return url.origin;
};

/*
 * A whole number of at least one, or the server does not start. Zero would
 * offer linking and refuse every link.
 */
const DEFAULT_HISTORY_RPS = 2;

/** A positive number of calls a second; anything else stops the server at boot. */
const historyRps = (env: NodeJS.ProcessEnv): number => {
  const raw = env["HISTORY_RPC_RPS"];
  if (raw === undefined || raw.length === 0) return DEFAULT_HISTORY_RPS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`HISTORY_RPC_RPS must be a number of calls a second above 0, got "${raw}"`);
  }
  return n;
};

const linkedWalletLimit = (env: NodeJS.ProcessEnv): number => {
  const raw = env["LINKED_WALLET_LIMIT"];
  if (raw === undefined || raw.length === 0) return DEFAULT_LINKED_WALLET_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`LINKED_WALLET_LIMIT must be a whole number of at least 1, got "${raw}"`);
  }
  return n;
};

/*
 * Relay pays app fees to an EVM address only, Solana deposits included. A
 * Solana address here would be taken by nothing and found out at the claim.
 */
/**
 * The free, keyless endpoints that answered every read the background jobs
 * make, correctly, measured 22 October 2026 call by call.
 *
 * Left out, and why. PublicNode and Pocket answer a real transaction with
 * `null`, and PublicNode a busy wallet's signatures with none: no history, and
 * no error to say so, so the jobs would take it for "nothing happened". dRPC's
 * free plan, Ankr, OnFinality, BlockPI, Tatum and the rest refused without a
 * key, or did not answer. A new endpoint goes in only after a check against a
 * wallet with history, not just a 200.
 */
const PUBLIC_RPC_URLS = ["https://api.mainnet-beta.solana.com", "https://public.rpc.solanavibestation.com"];

/**
 * Methods a public endpoint is known not to serve, so the rotation never asks
 * it for them. Solana Vibe Station keeps only recent history: a signature
 * cursor older than that is "Transaction … not found", and an older
 * transaction is null (22 October 2026). History goes to Solana's own.
 */
const PUBLIC_RPC_SKIPS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["https://public.rpc.solanavibestation.com", new Set(["getSignaturesForAddress", "getTransaction"])],
]);

/**
 * Requests a second across the public lane. Solana's endpoint documents forty
 * of one method in ten seconds and refused well under that when measured: one
 * transaction read in five at two a second, more at five (22 October 2026).
 * Three a second turns a job's first pass after boot from a burst into a
 * queue, and what is still refused falls back to the paid endpoint.
 */
const PUBLIC_RPC_PER_SECOND = 3;

/**
 * Requests a second the background jobs may send the paid endpoint, when every
 * public one refuses. The routes read the same endpoint, and it is theirs
 * first: unpaced, a job's eight workers arrived there at once (23 October
 * 2026). Two a second is a sliver of any paid plan, and what it cannot carry
 * waits for the job's next pass.
 */
const PAID_FALLBACK_PER_SECOND = 2;

/**
 * How long the routes reuse a wallet's token balances. The app polls money,
 * portfolio and Earn together, each reading both token programs; two seconds
 * is under its first refetch after a transaction (three seconds), and the send
 * route forgets a wallet's balances as soon as it sends for it.
 */
const ROUTE_BALANCES_TTL_MS = 2_000;

const publicRpcUrls = (env: NodeJS.ProcessEnv): readonly string[] => {
  const raw = env["SOLANA_PUBLIC_RPC_URLS"];
  if (raw === undefined) return PUBLIC_RPC_URLS;
  const urls = raw
    .split(",")
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
  for (const url of urls) {
    if (!/^https:\/\/[^\s/]+/.test(url)) {
      throw new Error(`SOLANA_PUBLIC_RPC_URLS: ${url} is not an https URL`);
    }
  }
  return urls;
};

const evmAddress = (env: NodeJS.ProcessEnv, key: string): string | undefined => {
  const raw = env[key];
  if (raw === undefined || raw.length === 0) return undefined;
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw))
    throw new Error(`${key} must be an EVM address (0x and 40 hex digits)`);
  return raw;
};

/** Steakhouse Financial's USDC vault on Kamino Earn. */
const STEAKHOUSE_USDC = "HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E";

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const privyVerificationKey = env["PRIVY_VERIFICATION_KEY"];
  const depositFeeRecipient = evmAddress(env, "DEPOSIT_FEE_RECIPIENT");
  return {
    databaseUrl: required(env, "DATABASE_URL"),
    privyAppId: required(env, "PRIVY_APP_ID"),
    ...(env["GLIDER_API_KEY"] ? { gliderApiKey: env["GLIDER_API_KEY"] } : {}),
    ...(env["RESEND_API_KEY"] ? { resendApiKey: env["RESEND_API_KEY"] } : {}),
    notifyFrom: env["NOTIFY_FROM"] ?? "Mercury <alerts@mercury.invalid>",
    feedbackTo: env["FEEDBACK_TO"] ?? "hello@trymercury.xyz",
    solanaRpcUrl: required(env, "SOLANA_RPC_URL"),
    ...(env["SOLANA_SCAN_RPC_URL"] ? { solanaScanRpcUrl: env["SOLANA_SCAN_RPC_URL"] } : {}),
    solanaPublicRpcUrls: publicRpcUrls(env),
    /*
     * The singular name as well, because it is the one everybody reaches for
     * and a key set under it was discarded without a word: no error, no empty
     * value, just the keyless tier's thirty requests a minute and nothing in
     * the log tying the rate limiting back to a misspelled variable.
     */
    jupiterApiKeys: parseJupiterKeys(env["JUPITER_API_KEYS"] ?? env["JUPITER_API_KEY"]),
    ...(env["RELAY_API_KEY"] ? { relayApiKey: env["RELAY_API_KEY"] } : {}),
    fundMinimumUsd: Number(env["FUND_MINIMUM_USD"] ?? 10),
    ...(env["RELAYER_SECRET_KEY"] ? { relayerSecretKey: env["RELAYER_SECRET_KEY"] } : {}),
    earnVault: env["EARN_VAULT_ADDRESS"] || STEAKHOUSE_USDC,
    tradingFeeBps: basisPoints(env, "TRADING_FEE_BPS", DEFAULT_TRADING_FEE_BPS),
    depositFeeBps: basisPoints(env, "DEPOSIT_FEE_BPS", DEFAULT_DEPOSIT_FEE_BPS),
    ...(depositFeeRecipient === undefined ? {} : { depositFeeRecipient }),
    ...(env["PYTH_API_KEY"] ? { pythApiKey: env["PYTH_API_KEY"] } : {}),
    appUrl: appUrl(env),
    linkedWalletLimit: linkedWalletLimit(env),
    historyRps: historyRps(env),
    // Spread rather than assign: exactOptionalPropertyTypes rejects undefined.
    ...(privyVerificationKey ? { privyVerificationKey } : {}),
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
    log.info(
      { recorded: result.recorded, reused: result.reused, created: result.created },
      "Glider strategies synced",
    );
  } catch (error: unknown) {
    log.error({ err: error }, "Glider strategy sync failed; the rest of the API is unaffected");
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
 * Jupiter needs no key: its keyless endpoints both price an order and build the
 * transaction that fills it, which is the whole of execution. `JUPITER_API_KEYS`
 * only moves every Jupiter call to the paid host, for its rate limits.
 * Triggers are the one piece still missing, and baskets are blocked on the
 * Symmetry spike — both are present so the object is whole, and both throw.
 */
export function buildDeps(config: Config): Deps {
  // One rotation shared by every Jupiter adapter, so the keys take turns across all of them.
  const jupiter = jupiterAccess(config.jupiterApiKeys) ?? {};
  const registry = new JupiterRegistry(jupiter);
  const chain = new SolanaRpc({ rpcUrl: config.solanaRpcUrl, balancesTtlMs: ROUTE_BALANCES_TTL_MS });
  const market = new JupiterMarket({ registry, ...jupiter });
  // Built here rather than inline below, because the reference reads through it.
  const prices = new CachedPriceBoard(market, { windowMs: PRICE_WINDOW_MS });

  const basketProvider = config.gliderApiKey ? new GliderClient(config.gliderApiKey) : undefined;
  return {
    registry,
    supportedStocks: registry,
    quotes: new JupiterLite(jupiter),
    triggers: new JupiterTriggersNotYet(),
    sessions: new PythSessions(),
    // Through the shared cache, not around it. `market` answers this port too,
    // and wiring it directly made every quote pay a fresh Jupiter request for
    // prices a shelf read had just fetched — the one path that never hit the
    // cache, on the endpoint whose keyless limit is thirty requests a minute.
    /*
     * Pyth first where it has a feed, the issuer's quote behind it.
     *
     * Pyth publishes continuously; the issuer republishes every 155 seconds at
     * the median. But Pyth carries 820 of the 1,506 tagged tickers, so
     * something has to answer for the rest — and the same fallback is what
     * keeps the product up if the key expires or Hermes is rate-limited,
     * because `priceOrder` turns a missing reference into "Unknown instrument".
     */
    reference: withFallback(
      config.pythApiKey,
      new BoardReference({ registry, board: prices, maxAgeMs: REFERENCE_MAX_AGE_MS }),
    ),
    // The mint is the authority. `market` implements the same port from
    // Jupiter's copy of the same numbers, and is what the browser falls back to.
    multipliers: new MintMultipliers({ chain }),
    // Every price lookup shares one short cache, so background jobs stop spending Jupiter's rate limit.
    prices,
    credit: new KaminoCredit(),
    // Unofficial, keyless, and the only equity history we can reach: Pyth
    // Benchmarks refuses equity feeds on our entitlement and serves one
    // timestamp per call rather than a range. See the adapter for the measurements.
    priceHistory: new YahooHistory(),
    chain,
    history: chain,
    baskets: new SymmetryVenue({ rpcUrl: config.solanaRpcUrl }),
    lending: lendingOver(config, chain),
    earn: earnOver(config, chain, kaminoApi()),
    ...(basketProvider ? { basketProvider } : {}),
  };
}

/** Kamino's xStocks market, read through `chain` for rent and over `lane` when given. */
const lendingOver = (config: Config, chain: ChainReader, lane?: Rotation) =>
  new KaminoLending({
    rpcUrl: config.solanaRpcUrl,
    ...(config.solanaScanRpcUrl ? { scanRpcUrl: config.solanaScanRpcUrl } : {}),
    ...(lane === undefined ? {} : { rotation: lane }),
    rent: chain,
  });

/** Kamino Earn's vaults, the same way. One Kamino API, so its caches are shared across lanes. */
const earnOver = (config: Config, chain: ChainReader, api: KaminoApi, lane?: Rotation) =>
  earnDirectory({
    api,
    usdcMint: USDC_MINT,
    rpcUrl: config.solanaRpcUrl,
    /*
     * Vault shares are tokens like any other, so they come from the balances
     * the rest of the page reads too, and the routes' copy of those is shared
     * for two seconds. Read separately, `/v1/earn` asked the node for the same
     * wallet's token accounts twice in one request.
     */
    shareBalances: async (wallet) =>
      new Map((await chain.tokenBalances(wallet)).map((b) => [b.mint, D(b.rawAmount.toString())])),
    ...(lane === undefined ? {} : { rotation: lane }),
    defaultVault: config.earnVault,
    make: (vault) =>
      new KaminoEarn({
        rpcUrl: config.solanaRpcUrl,
        ...(config.solanaScanRpcUrl ? { scanRpcUrl: config.solanaScanRpcUrl } : {}),
        ...(lane === undefined ? {} : { rotation: lane }),
        vault,
        usdcMint: USDC_MINT,
        rent: chain,
      }),
  });

/**
 * The background jobs' own chain readers: `deps` with every RPC reader rebuilt
 * over the public endpoints taken in turn (`Config.solanaPublicRpcUrls`), and
 * everything else shared. The jobs read every wallet on a clock; on the paid
 * plan, a deploy had them refused every call for its first minute. `lane` is
 * what a job backs off on; null when the jobs stay on the paid endpoint.
 *
 * `subscriptions` is the same lane's sockets, and it is what lets the
 * per-wallet jobs stop polling. It can only be the public lane: the paid
 * endpoint answers `accountSubscribe` with "Method not found" (14 November
 * 2026). Null when the jobs are on the paid endpoint, and a job given no
 * subscriptions polls exactly as it did before.
 */
export function backgroundDeps(
  deps: Deps,
  config: Config,
): {
  readonly deps: Deps;
  readonly lane: Rotation | null;
  readonly subscriptions: ChainSubscriptions | null;
} {
  if (config.solanaPublicRpcUrls.length === 0) return { deps, lane: null, subscriptions: null };
  // What every public endpoint refuses goes to the paid one, so the jobs do not fail it.
  const lane = rotation(config.solanaPublicRpcUrls, {
    skips: PUBLIC_RPC_SKIPS,
    perSecond: PUBLIC_RPC_PER_SECOND,
    fallback: config.solanaRpcUrl,
    fallbackPerSecond: PAID_FALLBACK_PER_SECOND,
    // The pass whose call it was backs off, not every job running at the time.
    onStrain: noteStrain,
  });
  /*
   * Two attempts, not four: the rotation has already asked every endpoint and
   * the paid one before a call fails here, and each retry asks them all again.
   * A read a job could not make waits for its next pass.
   */
  const chain = new SolanaRpc({ rpcUrl: lane.urls[0]!, fetch: rotatingFetch(lane), attempts: 2 });
  return {
    lane,
    subscriptions: solanaSubscriptions({ endpoints: subscriptionEndpoints(config.solanaPublicRpcUrls) }),
    deps: {
      ...deps,
      chain,
      history: chain,
      multipliers: new MintMultipliers({ chain }),
      lending: lendingOver(config, chain, lane),
      earn: earnOver(config, chain, deps.earn.api, lane),
    },
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
  readonly notifications: NotificationDeps;
  /** Linking, naming and unlinking the wallets beside the Mercury wallet. */
  readonly wallets: WalletDeps;
  readonly orders: OrderStore;
  readonly fills: FillDeps;
  readonly borrow: BorrowDeps;
  readonly earn: EarnDeps;
  readonly send: SendDeps;
  /**
   * Moving a linked wallet's tokens into the Mercury wallet. Optional so a test
   * app can leave it out; built whenever there is a relayer to pay for it.
   */
  readonly move?: MoveDeps;
  /** Mercury's fee on every stock trade, in basis points. See `Config.tradingFeeBps`. */
  readonly tradingFeeBps: number;
  /** The in-app feedback button. Optional so a test app can leave it out. */
  readonly feedback?: FeedbackDeps;
  /**
   * Funding from any chain, or nothing.
   *
   * Absent — no Relay key — the routes are not mounted,
   * `/v1/money/fund/sources` 404s, and the interface hides the method. The
   * same shape `AddCash.tsx` already uses to hide a method whose precondition
   * is unmet, and the same way `routes/send.ts` degrades without a relayer.
   */
  readonly fund?: FundDeps & { readonly webhookSecret: string };
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
    | "resendApiKey"
    | "notifyFrom"
    | "feedbackTo"
    | "tradingFeeBps"
    | "appUrl"
    | "linkedWalletLimit"
  >,
  /** Built at boot, because loading a key is async and this is not. */
  relay?: SendDeps["relay"],
  /** Built at boot too: the treasury's addresses arrive over HTTP. */
  fund?: ReadDeps["fund"],
): ReadDeps {
  const basketStore = new JsonBasketStore(config.databaseUrl, undefined, db);
  const earnLedger = pgEarnLedger(db);
  // Earn is read only for accounts that have used it; see `earn/gate.ts`.
  const usedEarn = (wallet: string) => hasEarnHistory(db, wallet);
  // The send path records each Earn move it sends, so the ledger does not hang on the app's confirm.
  const earnMoves = earnSends((move) =>
    recordMove(
      { history: deps.history, ledger: earnLedger, directory: deps.earn, usdcMint: USDC_MINT },
      move,
    ),
  );
  const baskets = basketValueReader(deps.basketProvider, basketStore);
  // Each move between a person's own wallets is recorded when the relayer sends it, with its cost carried over.
  const walletMoves = moveSends({
    history: deps.history,
    record: (move) => recordWalletMove(db, { ...move, usdcMint: USDC_MINT }),
  });
  const rpc = createSolanaRpc(config.solanaRpcUrl);
  const basketTemplates = new BasketService({
    store: basketStore,
    funding: new SolanaBasketFunding(
      config.solanaRpcUrl,
      relay === undefined ? undefined : { signer: relay.signer, builds: relay.builds },
    ),
    history: deps.history,
    // What went into a basket, so shares that leave it in kind carry their share of that cost.
    netFunding: (userId, owner, portfolioId) =>
      basketNetFunding(db, userId, owner.slice(owner.lastIndexOf(":") + 1), portfolioId),
    ...(deps.basketProvider === undefined ? {} : { provider: deps.basketProvider }),
  });
  return {
    basketTemplates,
    instruments: {
      supportedStocks: () => readSupportedStocks(db, deps.supportedStocks),
      buyers30d: (ticker) => countBuyers30d(db, ticker),
      prices: deps.prices,
      sessions: deps.sessions,
      history: deps.priceHistory,
    },
    portfolio: {
      walletHoldings: (userId, walletId) => readHoldings(db, userId, walletId),
      prices: deps.prices,
      chain: deps.chain,
      multipliers: deps.multipliers,
      usdcMint: USDC_MINT,
      pledged: (wallet) => pledgedByMint(deps.lending, wallet),
      debt: (wallet) => debtFrom(deps.lending, wallet),
      lastKnownDebt: (owner) => readLatestDebt(db, owner),
      lastKnownEarn: (owner) => readLatestEarn(db, owner),
      snapshots: (userId, walletIds, from) => readSnapshots(db, userId, walletIds, from),
      baskets,
      basketReturns: basketReturnsReader(deps.basketProvider),
      flows: (userId, walletIds, from) => readFlows(db, userId, walletIds, from),
      basketMovements: (owner) => readBasketMovements(db, owner),
      summary: (userId) => readSummary(db, deps.prices, userId),
      declareCost: (owner, ticker, unitCostUsd) => declareCost(db, owner, ticker, unitCostUsd),
      earn: onlyIfUsed(usedEarn, (wallet) => earnBalance(deps.earn, wallet), ZERO),
    },
    money: {
      chain: deps.chain,
      credit: deps.credit,
      lending: deps.lending,
      earn: onlyIfUsed(usedEarn, (wallet) => earnSummary(deps.earn, wallet), { balance: ZERO, apy: null }),
      usdcMint: USDC_MINT,
    },
    earn: {
      directory: deps.earn,
      api: deps.earn.api,
      chain: deps.chain,
      history: deps.history,
      usdcMint: USDC_MINT,
      ledger: earnLedger,
      sends: earnMoves,
      ...(relay === undefined ? {} : { relay: { relayer: relay.signer.address, builds: relay.builds } }),
    },
    activity: {
      read: (scope, limit, cursor) => readActivity(db, scope, limit, cursor),
      receipt: (userId, wallets, id) =>
        readReceipt(db, userId, id, wallets, {
          history: deps.history,
          ...(relay === undefined ? {} : { relayer: relay.signer.address }),
        }),
    },
    notifications: {
      list: (userId) => readInbox(db, userId, new Date()),
      unread: (userId) => countUnread(db, userId, new Date()),
      read: (userId, id) => markRead(db, userId, id, new Date()),
      readAll: (userId, upTo) => markAllRead(db, userId, upTo, new Date()),
    },
    wallets: pgWalletDeps(db, { appUrl: config.appUrl, limit: config.linkedWalletLimit }),
    orders: pgOrderStore(db),
    tradingFeeBps: config.tradingFeeBps,
    feedback: {
      to: config.feedbackTo,
      notifier:
        config.resendApiKey === undefined
          ? loggingNotifier()
          : resendNotifier({ apiKey: config.resendApiKey, from: config.notifyFrom }),
    },
    fills: {
      tokenRef: (mint) => tokenRefFor(db, mint),
      settle: (input) => settleOrder(db, input),
    },
    ...(fund === undefined ? {} : { fund }),
    borrow: {
      lending: deps.lending,
      chain: deps.chain,
      prices: deps.prices,
      usdcMint: USDC_MINT,
      history: deps.history,
      record: (planned, input) => recordLoanEvents(db, planned, input),
      ledger: (owner) => loanLedger(db, owner),
      ...(relay === undefined ? {} : { relay: { relayer: relay.signer.address, builds: relay.builds } }),
    },
    send: {
      rpcUrl: config.solanaRpcUrl,
      fees: { chain: deps.chain, prices: deps.prices, history: deps.history },
      accepted: async (messageBytes, signature) => {
        await Promise.all([
          earnMoves.accepted(messageBytes, signature),
          walletMoves.accepted(messageBytes, signature),
        ]);
      },
      sent: (wallet) => deps.chain.forgetBalances?.(wallet),
      ...(relay === undefined ? {} : { relay }),
    },
    move: {
      chain: deps.chain,
      history: deps.history,
      prices: deps.prices,
      usdcMint: USDC_MINT,
      listed: () => movableMints(db, USDC_MINT),
      mercuryWalletId: (userId) => mercuryWalletIdOf(db, userId),
      latestBlockhash: async () => (await rpc.getLatestBlockhash().send()).value,
      sends: walletMoves,
      // Baskets made outside Mercury, found on the chain; looked for at most every ten minutes a wallet.
      outside: remembered(10 * 60_000, (wallet) =>
        findOutsideBaskets(
          {
            db,
            history: deps.history,
            chain: deps.chain,
            prices: deps.prices,
            listed: () => movableMints(db, USDC_MINT),
            // Mercury's baskets, to suggest the closest when the person reinvests here.
            templates: () => basketTemplates.listTemplates(),
          },
          wallet,
        ),
      ),
    },
  };
}
