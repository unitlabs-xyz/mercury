import { serve } from "@hono/node-server";
import {
  backgroundDeps,
  buildAuthDeps,
  buildDeps,
  buildReadDeps,
  buildReconcileDeps,
  readConfig,
  syncConfiguredCatalog,
} from "./deps.js";
import { applyMigrations } from "./db/migrate.js";
import { createRelayClient } from "./funding/relay.js";
import { createFundingStore } from "./funding/store.js";
import { pollUnsettledDeposits } from "./funding/poll.js";
import { syncStocks } from "./stocks/sync.js";
import { warmPrices } from "./prices/warm.js";
import { RECORD_MAX_AGE_MS, prunePriceBars, recordPriceBars } from "./prices/record.js";
import { syncAllPositions } from "./portfolio/sync.js";
import { syncAllWalletEvents } from "./wallet-events/sync.js";
import { KAMINO_LENDING_PROGRAM } from "./lending/kamino.js";
import { snapshotAllPortfolios } from "./portfolio/snapshot.js";
import { watchAllLoans } from "./lending/watch-loans.js";
import { loggingNotifier, resendNotifier } from "./notify/resend.js";
import { createApp } from "./app.js";
import { inMemoryBuilds } from "./relay/builds.js";
import { keypairRelaySigner } from "./relay/signer.js";
import { exitOnUncaught, oneLineErrors } from "./log.js";
import { telemetryEndpoint } from "./telemetry/otel.js";
import { forwardConsoleToOtel } from "./telemetry/console-logs.js";
import { every, type EveryDeps } from "./jobs/every.js";
import { cadence, presence } from "./jobs/presence.js";
import { logger } from "./log/index.js";

/*
 * First, so that nothing after it, a bad config included, logs a stack trace.
 * See `log.ts`; LOG_STACKS=1 turns both off.
 */
oneLineErrors();
exitOnUncaught();
/*
 * Anything that still writes to the console, on to the collector.
 *
 * Our own code logs through pino now (`log/index.ts`), so this is no longer
 * the path our log lines take — it is the net under everything else. Hono, the
 * Solana libraries and the Kamino SDK all write to the console on their own,
 * and without this their output stops at the container's stdout, which nothing
 * reads: `grafana/otel-lgtm` ingests OTLP only.
 *
 * After `oneLineErrors`, so an Error has already become its one line by the
 * time this reads the arguments. Reversed, the forward would see the raw Error
 * and send a stack.
 */
forwardConsoleToOtel();

/**
 * The boot sequence's own logger.
 *
 * Each capability announces itself with `on` as a field rather than only in a
 * sentence, which is what the comments below have been asking for all along: a
 * deployment that believes it is sponsoring transactions, or warning
 * borrowers, and is not looks exactly like one whose upstream is down, and the
 * two are fixed in different places. As a field, "which capabilities were off
 * on this deploy" is a query.
 */
const boot = logger("boot");

const config = readConfig();
const port = Number(process.env.PORT ?? 8787);

/*
 * Before anything else, and before the server can answer.
 *
 * A failure here ends the process rather than serving against a schema the code
 * does not match. On a rolling deploy that leaves the previous container taking
 * traffic, which is the right outcome: the old code and the old schema agree.
 */
await applyMigrations(config.databaseUrl);
boot.info("migrations up to date");

/*
 * Whether anything is watching, said out loud.
 *
 * The same reason the relayer, Jupiter's tier and the Pyth feed each announce
 * themselves: a deployment that believes it is reporting telemetry and is not
 * looks exactly like one whose collector is down, and those two are fixed in
 * different places and by different people. The SDK itself started before this
 * line — before `index.ts` was even imported — so this reports a fact rather
 * than deciding one.
 */
const telemetry = telemetryEndpoint();
boot.info(
  { on: telemetry !== null, ...(telemetry === null ? {} : { endpoint: telemetry }) },
  telemetry === null ? "telemetry off (OTEL_EXPORTER_OTLP_ENDPOINT unset)" : "telemetry on",
);

await syncConfiguredCatalog(config);

/* Who is using the app right now, so position-sync can be quick for them alone. */
const here = presence();
const auth = { ...buildAuthDeps(config), onSeen: here.seen };
const deps = buildDeps(config);
/*
 * The relayer, if one is configured. Built here because loading a key is async.
 *
 * Its address is logged so whoever deploys knows which wallet to fund — a
 * silent relayer that cannot pay looks exactly like one that is switched off.
 */
const relay =
  config.relayerSecretKey === undefined
    ? undefined
    : { signer: await keypairRelaySigner(config.relayerSecretKey), builds: inMemoryBuilds() };
boot.info(
  /* `payer` is our own hot wallet, not a user's, and naming it is the point:
     a relayer nobody funded looks exactly like one that is switched off. */
  { on: relay !== undefined, ...(relay === undefined ? {} : { payer: relay.signer.address }) },
  relay === undefined
    ? "sponsorship off (RELAYER_SECRET_KEY unset); stock trades are refused, sends pay their own network costs"
    : "sponsorship on",
);
/* The rate every trade turns on, and where the money goes, so neither has to
   be inferred. `collector` is our own relayer account, as `payer` above. */
boot.info(
  {
    bps: config.tradingFeeBps,
    ...(relay === undefined ? { collected: false } : { collected: true, collector: relay.signer.address }),
  },
  relay === undefined ? "trading fee set, but no trades without a relayer" : "trading fee collected",
);
// Which Jupiter tier the rate limits in the logs below belong to.
boot.info(
  {
    keys: config.jupiterApiKeys.length,
    host: config.jupiterApiKeys.length === 0 ? "lite-api.jup.ag" : "api.jup.ag",
  },
  config.jupiterApiKeys.length === 0
    ? "jupiter keyless (JUPITER_API_KEYS unset); free tier"
    : "jupiter keys rotated per request",
);

/*
 * Which feed the quote path is actually checked against, for the same reason as
 * the two above. The issuer's feed freezes at the close, so a deployment that
 * believes it reads Pyth and does not would refuse orders all weekend without
 * anything saying why.
 */
boot.info(
  { pyth: config.pythApiKey !== undefined },
  config.pythApiKey === undefined
    ? "reference feed is the issuer's only (PYTH_API_KEY unset); it stops advancing at the closing bell"
    : "reference feed is Pyth, with the issuer's as fallback",
);

/*
 * The same shape as the relayer above, and for the same reason: a capability
 * that is off should say so at boot. A deployment that believes it is warning
 * borrowers and is not is worse than one that never claimed to.
 */
const notifier =
  config.resendApiKey === undefined
    ? loggingNotifier()
    : resendNotifier({ apiKey: config.resendApiKey, from: config.notifyFrom });
boot.info(
  { emailed: config.resendApiKey !== undefined },
  config.resendApiKey === undefined
    ? "loan alerts in-app only (RESEND_API_KEY unset); nothing is emailed"
    : "loan alerts emailed",
);

/*
 * Funding from any chain, if Relay is configured.
 *
 * One dependency now rather than four. The treasury and its three keys are
 * gone: a refund goes back to the wallet that sent the deposit, which is
 * correct by construction once every deposit comes from a connected wallet,
 * and nothing we hold has to receive one.
 *
 * Absent a key the routes are not mounted, `/v1/money/fund/sources` 404s, and
 * the interface hides the method — the same way sponsorship degrades when
 * RELAYER_SECRET_KEY is unset.
 */
const fund =
  config.relayApiKey === undefined
    ? (boot.info({ on: false }, "funding off (RELAY_API_KEY unset); add cash from another chain is hidden"),
      undefined)
    : {
        relay: createRelayClient({ apiKey: config.relayApiKey }),
        store: createFundingStore(auth.db),
        minimumUsd: config.fundMinimumUsd,
        fee: { bps: config.depositFeeBps, recipient: config.depositFeeRecipient },
        webhookSecret: config.relayApiKey,
      };
if (fund !== undefined) {
  boot.info({ on: true, minimumUsd: config.fundMinimumUsd }, "funding on, refunds to the sending wallet");
  /* Where deposit fees go, said once, because Relay holds them until somebody
     claims them. `recipient` is one of our own accounts, not a user's. */
  const depositFeeOn = config.depositFeeRecipient !== undefined && config.depositFeeBps !== 0;
  boot.info(
    {
      on: depositFeeOn,
      bps: config.depositFeeBps,
      ...(config.depositFeeRecipient === undefined ? {} : { recipient: config.depositFeeRecipient }),
    },
    depositFeeOn
      ? "deposit fee charged on anything but Circle USDC, credited by Relay"
      : "deposit fee off (DEPOSIT_FEE_RECIPIENT unset or DEPOSIT_FEE_BPS 0); no deposit is charged",
  );
}

const read = buildReadDeps(auth.db, deps, config, relay, fund);

/*
 * The jobs' own chain readers, over the public endpoints in turn, so the paid
 * plan is left for what a person waits on. See `backgroundDeps`.
 */
const jobs = backgroundDeps(deps, config);
const jobRead = buildReadDeps(auth.db, jobs.deps, config, relay, fund);
boot.info(
  { lane: jobs.lane === null ? "paid" : "public", endpoints: jobs.lane?.urls.length ?? 1 },
  jobs.lane === null
    ? "background jobs read the paid RPC (SOLANA_PUBLIC_RPC_URLS set empty)"
    : "background jobs read public RPCs in turn",
);

/**
 * When a job first runs, and what it backs off on. Offsets, so a deploy does
 * not have every job read every wallet in the same second: that is what the
 * node refused, every call, for the first minute after the Earn deploy (22
 * October 2026). A job on the public lane waits longer between passes while
 * the lane is refusing.
 */
const jobClock = (startAfterMs: number, onLane = true): EveryDeps => ({
  startAfterMs,
  ...(onLane && jobs.lane !== null ? { strainedAt: () => jobs.lane!.strainedAt } : {}),
});

/**
 * The background half of the system, and the whole of it. This is the only
 * thing that writes a stock row or a position: no request does, so the same
 * read twice cannot produce two different answers.
 *
 * It runs inside the API because the API is a long-running server. There is no
 * worker process — one was planned and never built, and the package that held
 * its job plan was deleted rather than left to describe a system that does not
 * exist — and no serverless cron, because this is not deployed as functions.
 *
 * | Job                  | Cadence | Writes                                                                        |
 * | -------------------- | ------- | ----------------------------------------------------------------------------- |
 * | `prices`             | 20s     | `price_bar`, and it fills the shared price board                              |
 * | `price-bar-prune`    | 6h      | deletes minute bars past thirty days                                          |
 * | `stocks`             | 6h      | `instrument`, `token`, `multiplier_event`                                     |
 * | `position-sync`      | 2s/1m   | `lot`, `position`, `activity` (dividends too); `disposal` written and deleted |
 * | `wallet-events`      | 30s     | `activity`, for SOL and USDC transfers                                        |
 * | `funding-poll`       | 60s     | `funding_intent`, Relay's verdict on a deposit; only when Relay is configured |
 * | `portfolio-snapshot` | 1h      | `portfolio_snapshot`                                                          |
 * | `loan-watch`         | 5m      | `loan_alert`, `activity`, and an email                                        |
 *
 * `position-sync` reads a wallet every 2s while its owner is using the app,
 * and once a minute otherwise. The jobs that read the chain do it over public
 * endpoints in turn, and start at different offsets after boot (`jobClock`).
 *
 * One job the design called for is not here: a poller for Jupiter trigger
 * orders. Trigger orders are not built, and `gateExecution` turns the decision
 * that would create one into a refusal rather than a queue nobody watches.
 *
 * The other, a price cache, arrived as `prices` plus `CachedPriceBoard`
 * between them. The board holds every price lookup in the server, collects the
 * misses of callers who arrive together into one request, and serves an entry
 * past its window while replacing it behind the reader; `prices` keeps the two
 * sets somebody is about to want — holdings and the featured shelf — already
 * in it. So no read blocks on Jupiter for a price anyone has looked at lately,
 * and what the server spends no longer grows with the number of accounts.
 */
/**
 * Twenty seconds, which is not a refresh rate — it is a promise that nothing
 * anybody is about to read has gone cold.
 *
 * `CachedPriceBoard` serves an entry for a minute past its window while
 * replacing it behind the reader, so this tick only has to land inside that
 * minute; at twenty seconds it can miss two passes and still have nobody wait.
 * Running it as fast as the five-second freshness window would be fifteen
 * requests a minute instead of three, and buy nothing, because a reader who
 * finds a price four seconds old is not blocked by it.
 *
 * One request covers it: the featured shelf is 41 mints and holdings are few.
 * A pass says nothing unless the set changed size — at this cadence a line
 * every twenty seconds would bury the jobs that matter.
 *
 * The same answer is recorded as `price_bar`, the only history of a price the
 * system keeps (ADR 0016). That is why this pass names an age and waits for
 * it, where a reader would take the stale entry: a sample is stamped with the
 * moment it is written, so it has to have been true then. It costs no extra
 * request — a pass at this cadence finds every entry past its window anyway.
 */
let warmed = -1;
every("prices", 20_000, async () => {
  const s = await warmPrices(auth.db, {
    supportedStocks: read.instruments.supportedStocks,
    prices: deps.prices,
    ask: { maxAgeMs: RECORD_MAX_AGE_MS },
  });
  await recordPriceBars(auth.db, s.board, new Date());
  if (s.mints === warmed) return null;
  warmed = s.mints;
  return `${s.priced}/${s.mints} mints warm and recorded`;
});

/**
 * Six hours, because a minute bar thirty days old is no worse at thirty days
 * and six hours. Quiet when there was nothing to drop.
 */
every(
  "price-bar-prune",
  6 * 60 * 60 * 1000,
  async () => {
    const dropped = await prunePriceBars(auth.db, new Date());
    return dropped === 0 ? null : `${dropped} minute bars past thirty days dropped`;
  },
  jobClock(90_000, false),
);

every(
  "stocks",
  6 * 60 * 60 * 1000,
  async () => {
    const s = await syncStocks(auth.db, { supportedStocks: deps.supportedStocks, prices: deps.prices });
    return `${s.instruments} instruments, ${s.tokens} tokens`;
  },
  jobClock(60_000, false),
);

/**
 * Two seconds, so a deposit shows up while the person who made it is still
 * looking at the screen.
 *
 * At that cadence a quiet pass is the common case, so only a pass that changed
 * something or failed says anything — logging every two seconds would bury the
 * passes that matter.
 */
const syncCadence = cadence({ here });
every(
  "position-sync",
  2_000,
  async () => {
    const s = await syncAllPositions(auth.db, buildReconcileDeps(jobs.deps), syncCadence);
    if (s.written === 0 && s.failed === 0) return null;
    return (
      `${s.written} rows across ${s.reconciled}/${s.wallets} wallets` +
      (s.failed > 0 ? `, ${s.failed} failed` : "")
    );
  },
  jobClock(3_000),
);

/*
 * Relay's own verdict, pulled rather than pushed.
 *
 * The webhook is the fast path and this is the same authority over a second
 * transport — so a webhook that was never enabled, or one delivery that got
 * lost, cannot leave somebody's deposit reading `submitted` for ever with
 * their money already spent. Only rows nothing has touched for ninety
 * seconds, so it never races a fill that is merely in flight.
 */
if (fund !== undefined) {
  const funding = fund;
  every(
    "funding-poll",
    60_000,
    async () => {
      const s = await pollUnsettledDeposits({ store: funding.store, relay: funding.relay });
      if (s.settled === 0 && s.failed === 0) return null;
      return `${s.settled} settled of ${s.asked} asked` + (s.failed > 0 ? `, ${s.failed} failed` : "");
    },
    jobClock(20_000, false),
  );
}

/**
 * Thirty seconds, because this answers "what happened" and `position-sync`
 * already answers "what do I hold" every two. The balance a user checks is the
 * fresh one; only the row in the feed waits.
 *
 * Two streams per wallet — its own address for native SOL, its USDC account for
 * cash — so a quiet pass is four calls a minute per wallet and says nothing.
 */
every(
  "wallet-events",
  30_000,
  async () => {
    const s = await syncAllWalletEvents(auth.db, {
      history: jobs.deps.history,
      lendingProgram: KAMINO_LENDING_PROGRAM,
      ...(relay === undefined ? {} : { relayer: relay.signer.address }),
      ...(deps.basketProvider ? { exitOperations: deps.basketProvider } : {}),
      ...(fund === undefined ? {} : { fundingDeposits: true }),
    });
    if (s.written === 0 && s.failed === 0) return null;
    return (
      `${s.written} rows across ${s.checked}/${s.wallets} wallets` +
      (s.failed > 0 ? `, ${s.failed} failed` : "")
    );
  },
  jobClock(10_000),
);

/**
 * An hour, because this is the only record of what an account used to be worth
 * and nothing can reconstruct a reading that was never taken. Everything else
 * here can catch up after an outage; this cannot.
 *
 * It runs 45 seconds after the process starts, so a deploy takes the current
 * hour's reading at once rather than waiting up to an hour for its first one,
 * without reading every wallet in the same second as every other job. The
 * primary key on (user, hour) is what makes a second reading in one hour safe.
 *
 * `jobRead.portfolio` is built the way GET /v1/portfolio's dependencies are,
 * over the jobs' own chain readers, so the chart and the page's headline figure
 * cannot come from different books.
 */
every(
  "portfolio-snapshot",
  60 * 60 * 1000,
  async () => {
    const s = await snapshotAllPortfolios(auth.db, jobRead.portfolio, new Date());
    if (s.wallets === 0) return null;
    return `${s.written}/${s.wallets} accounts` + (s.failed > 0 ? `, ${s.failed} failed` : "");
  },
  jobClock(45_000),
);

/**
 * Five minutes, because a loan is the only thing here that can cost somebody
 * money while they are not looking.
 *
 * Slower than the other per-wallet jobs because each pass is an RPC round trip
 * per borrower, and faster than it needs to be for an ordinary market: our
 * alarm sits about 15% of collateral value short of Kamino's line, which no
 * ordinary move closes in five minutes. A move that does would have outrun any
 * cadence worth paying for.
 *
 * A quiet pass says nothing. Someone whose loan is fine does not need a line in
 * the log every five minutes, and a log that scrolls is a log nobody reads.
 */
every(
  "loan-watch",
  5 * 60 * 1000,
  async () => {
    const s = await watchAllLoans(auth.db, { ...jobRead.borrow, notifier }, new Date());
    if (s.alerted === 0 && s.failed === 0) return null;
    return (
      `${s.alerted} alerts across ${s.loans} loans, ${s.delivered} delivered` +
      (s.failed > 0 ? `, ${s.failed} failed` : "")
    );
  },
  jobClock(30_000),
);

serve({ fetch: createApp(() => deps, auth, read).fetch, port }, (info) => {
  boot.info({ port: info.port }, "mercury api listening");
});
