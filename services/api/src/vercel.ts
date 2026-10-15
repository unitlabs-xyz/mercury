import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { createApp } from "./app.js";
import { applyMigrations } from "./db/migrate.js";
import {
  buildAuthDeps,
  buildDeps,
  buildReadDeps,
  buildReconcileDeps,
  readConfig,
  syncConfiguredCatalog,
} from "./deps.js";
import { syncStocks } from "./stocks/sync.js";
import { syncAllPositions } from "./portfolio/sync.js";
import { syncAllWalletEvents } from "./wallet-events/sync.js";
import { KAMINO_LENDING_PROGRAM } from "./lending/kamino.js";
import { oneLineErrors } from "./log.js";

/**
 * The API as one Vercel function. Same app as `index.ts`, built once per cold
 * start and reused while the function stays warm.
 *
 * A function cannot keep a job running after it answers, so the three
 * intervals `index.ts` runs are routes here, called by Vercel Cron. On the
 * Hobby plan that is once a day each — far slower than the long-running
 * server's cadence. `index.ts` (the Dockerfile) is still the real home for
 * the background work; this keeps the HTTP surface deployable meanwhile.
 */
/*
 * Errors as one line, as in index.ts. Not its uncaught-error handler: the
 * function runtime owns what happens to a process that throws.
 */
oneLineErrors();
const config = readConfig();

/*
 * Migrate before the first request, as index.ts does. Once per cold start; an
 * up-to-date schema makes it a single cheap read, and the advisory lock keeps
 * two cold starts from running the same migration at once. A failure throws
 * here, so the function errors instead of serving against the wrong schema.
 */
await applyMigrations(config.databaseUrl);
await syncConfiguredCatalog(config);
const auth = buildAuthDeps(config);
const deps = buildDeps(config);
/*
 * No relayer here, deliberately, and not merely unwired.
 *
 * The relayer signs only messages this server composed, and it recognises them
 * from a digest held in process memory (`relay/builds.ts`). That holds for the
 * container because the container is one process. A function is not: prepare
 * and confirm can land on different instances, so `recognises` would refuse a
 * transaction this server really did build, intermittently, for a reason no
 * log would explain. A hot key that sometimes will not sign is worse than a
 * wallet told plainly that it pays its own network fee — which is what every
 * sponsored route answers while `read.send.relay` is undefined, and what the
 * app already renders. Sponsorship needs a shared store before it can live
 * here.
 */
const read = buildReadDeps(auth.db, deps, config);

/*
 * What this deployment does not do, said out loud on every cold start.
 *
 * index.ts announces each optional capability for the same reason, and the
 * gaps are wider here: the three jobs below run once a day rather than on a
 * seconds-to-minutes clock, and two of the container's six do not run at all —
 * portfolio-snapshot, so the performance chart never gains history, and
 * loan-watch, so no borrower is warned before a liquidation. Both want a
 * cadence Vercel Cron does not offer on this plan.
 *
 * So this keeps the HTTP surface deployable, and no more. Pointing an app's
 * API base at it gets a working read path, no sponsorship, a feed up to a day
 * behind and a flat chart. That is a reasonable thing to deploy and a poor
 * thing to discover, so it is stated rather than left to a comment.
 */
console.log(
  [
    "vercel: HTTP surface only.",
    "sponsorship: off (needs a shared build store, not per-instance memory).",
    "jobs: stocks, position-sync and wallet-events daily; no snapshot, no loan alerts.",
    "The container (index.ts) is the real home for all of it.",
  ].join(" "),
);

const app = new Hono();

// Vercel Cron calls these with "Authorization: Bearer $CRON_SECRET"; nobody else can.
const cron = (path: string, run: () => Promise<object>) =>
  app.get(path, async (c) => {
    const secret = process.env["CRON_SECRET"];
    if (!secret || c.req.header("authorization") !== `Bearer ${secret}`) {
      return c.json({ error: { code: "forbidden", message: "Cron only." } }, 403);
    }
    return c.json({ ok: true, ...(await run()) });
  });

cron("/cron/stocks", () =>
  syncStocks(auth.db, { supportedStocks: deps.supportedStocks, prices: deps.prices }),
);
cron("/cron/position-sync", () => syncAllPositions(auth.db, buildReconcileDeps(deps)));
cron("/cron/wallet-events", () =>
  syncAllWalletEvents(auth.db, {
    history: deps.history,
    lendingProgram: KAMINO_LENDING_PROGRAM,
    ...(deps.basketProvider ? { exitOperations: deps.basketProvider } : {}),
  }),
);

app.route(
  "/",
  createApp(() => deps, auth, read),
);

export default getRequestListener(app.fetch);
