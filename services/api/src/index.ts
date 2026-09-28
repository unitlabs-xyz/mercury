import { serve } from "@hono/node-server";
import { buildAuthDeps, buildDeps, buildReadDeps, buildReconcileDeps, readConfig } from "./deps.js";
import { syncStocks } from "./stocks/sync.js";
import { syncAllPositions } from "./portfolio/sync.js";
import { createApp } from "./app.js";

const config = readConfig();
const port = Number(process.env.PORT ?? 8787);

const auth = buildAuthDeps(config);
const deps = buildDeps(config);
const read = buildReadDeps(auth.db, deps, config);

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
 * The background half of the system. This is the only thing that writes a
 * stock row or a position: no request does, so the same read twice cannot
 * produce two different answers.
 *
 * It runs here because the API is a long-running server. There is no separate
 * worker process — `services/worker` cannot reach the database — and no
 * serverless cron, because this is not deployed as functions.
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

serve({ fetch: createApp(() => deps, auth, read).fetch, port }, (info) => {
  console.log(`mercury api listening on :${info.port}`);
  if (config.sendMode === "simulate") {
    console.log(
      "SEND_MODE=simulate: dry run. Signed transactions are simulated against mainnet and never sent.",
    );
  }
});
