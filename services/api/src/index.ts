import { serve } from "@hono/node-server";
import {
  buildAuthDeps,
  buildDeps,
  buildReadDeps,
  buildReconcileDeps,
  readConfig,
  syncConfiguredCatalog,
} from "./deps.js";
import { applyMigrations } from "./db/migrate.js";
import { syncStocks } from "./stocks/sync.js";
import { syncAllPositions } from "./portfolio/sync.js";
import { syncAllWalletEvents } from "./wallet-events/sync.js";
import { KAMINO_LENDING_PROGRAM } from "./lending/kamino.js";
import { snapshotAllPortfolios } from "./portfolio/snapshot.js";
import { watchAllLoans } from "./lending/watch-loans.js";
import { loggingNotifier, resendNotifier } from "./notify/resend.js";
import { createApp } from "./app.js";
import { inMemoryBuilds } from "./relay/builds.js";
import { keypairRelaySigner } from "./relay/signer.js";

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
console.log("migrations: up to date");

await syncConfiguredCatalog(config);

const auth = buildAuthDeps(config);
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
console.log(
  relay === undefined
    ? "sponsorship: off (RELAYER_SECRET_KEY unset); buyers pay their own network costs"
    : `sponsorship: on, paying from ${relay.signer.address}`,
);
// Which Jupiter tier the rate limits in the logs below belong to.
console.log(
  config.jupiterApiKeys.length === 0
    ? "jupiter: keyless (JUPITER_API_KEYS unset); lite-api.jup.ag free tier"
    : `jupiter: ${config.jupiterApiKeys.length} key${config.jupiterApiKeys.length === 1 ? "" : "s"}, rotated per request; api.jup.ag`,
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
console.log(
  config.resendApiKey === undefined
    ? "loan alerts: in-app only (RESEND_API_KEY unset); nothing is emailed"
    : `loan alerts: emailed from ${config.notifyFrom}`,
);

const read = buildReadDeps(auth.db, deps, config, relay);

/**
 * A background job, on its own clock.
 *
 * The next run is scheduled after the last one finishes, never on a fixed
 * tick: a pass that overruns its interval must not have a second one start
 * behind it and write the same rows twice. A failure is logged and the
 * schedule continues — an upstream being down is a reason to try again later,
 * not to stop trying.
 */
const every = (name: string, ms: number, run: () => Promise<string | null>) => {
  const tick = async () => {
    try {
      const note = await run();
      if (note !== null) console.log(`${name}: ${note}`);
    } catch (error: unknown) {
      console.error(`${name} failed:`, error);
    }
    setTimeout(() => void tick(), ms).unref();
  };
  void tick();
};

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
 * | Job                  | Cadence | Writes                                               |
 * | -------------------- | ------- | ---------------------------------------------------- |
 * | `stocks`             | 6h      | `instrument`, `token`, `multiplier_event`            |
 * | `position-sync`      | 2s      | `lot`, `position`, `activity` — including dividends  |
 * | `wallet-events`      | 30s     | `activity`, for SOL and USDC transfers               |
 * | `portfolio-snapshot` | 1h      | `portfolio_snapshot`                                 |
 * | `loan-watch`         | 5m      | `loan_alert`, `activity`, and an email               |
 *
 * Two jobs the design called for are not here. A price cache: prices are read
 * from upstream per call instead, which every portfolio read and every
 * snapshot pass pays for. And a poller for Jupiter trigger orders: trigger
 * orders are not built, and `gateExecution` turns the decision that would
 * create one into a refusal rather than a queue nobody watches.
 */
every("stocks", 6 * 60 * 60 * 1000, async () => {
  const s = await syncStocks(auth.db, { supportedStocks: deps.supportedStocks, prices: deps.prices });
  return `${s.instruments} instruments, ${s.tokens} tokens`;
});

/**
 * Two seconds, so a deposit shows up while the person who made it is still
 * looking at the screen.
 *
 * At that cadence a quiet pass is the common case, so only a pass that changed
 * something or failed says anything — logging every two seconds would bury the
 * passes that matter.
 */
every("position-sync", 2_000, async () => {
  const s = await syncAllPositions(auth.db, buildReconcileDeps(deps));
  if (s.written === 0 && s.failed === 0) return null;
  return (
    `${s.written} rows across ${s.reconciled}/${s.wallets} wallets` +
    (s.failed > 0 ? `, ${s.failed} failed` : "")
  );
});

/**
 * Thirty seconds, because this answers "what happened" and `position-sync`
 * already answers "what do I hold" every two. The balance a user checks is the
 * fresh one; only the row in the feed waits.
 *
 * Two streams per wallet — its own address for native SOL, its USDC account for
 * cash — so a quiet pass is four calls a minute per wallet and says nothing.
 */
every("wallet-events", 30_000, async () => {
  const s = await syncAllWalletEvents(auth.db, {
    history: deps.history,
    lendingProgram: KAMINO_LENDING_PROGRAM,
  });
  if (s.written === 0 && s.failed === 0) return null;
  return (
    `${s.written} rows across ${s.checked}/${s.wallets} wallets` +
    (s.failed > 0 ? `, ${s.failed} failed` : "")
  );
});

/**
 * An hour, because this is the only record of what an account used to be worth
 * and nothing can reconstruct a reading that was never taken. Everything else
 * here can catch up after an outage; this cannot.
 *
 * `every` runs a job as soon as the process starts, so a deploy takes the
 * current hour's reading immediately rather than waiting up to an hour for its
 * first one. The primary key on (user, hour) is what makes that safe.
 *
 * `read.portfolio` is the same dependency set GET /v1/portfolio reads through,
 * so the chart and the page's headline figure cannot come from different books.
 */
every("portfolio-snapshot", 60 * 60 * 1000, async () => {
  const s = await snapshotAllPortfolios(auth.db, read.portfolio, new Date());
  if (s.wallets === 0) return null;
  return `${s.written}/${s.wallets} accounts` + (s.failed > 0 ? `, ${s.failed} failed` : "");
});

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
every("loan-watch", 5 * 60 * 1000, async () => {
  const s = await watchAllLoans(auth.db, { ...read.borrow, notifier }, new Date());
  if (s.alerted === 0 && s.failed === 0) return null;
  return (
    `${s.alerted} alerts across ${s.loans} loans, ${s.delivered} delivered` +
    (s.failed > 0 ? `, ${s.failed} failed` : "")
  );
});

serve({ fetch: createApp(() => deps, auth, read).fetch, port }, (info) => {
  console.log(`mercury api listening on :${info.port}`);
});
