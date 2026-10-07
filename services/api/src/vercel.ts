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
const read = buildReadDeps(auth.db, deps, config);

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
