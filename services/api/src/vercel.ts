import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { createApp } from "./app.js";
import { syncCatalogue } from "./catalogue/sync.js";
import { buildAuthDeps, buildDeps, buildReadDeps, buildReconcileDeps, readConfig } from "./deps.js";
import { syncAllPositions } from "./portfolio/sync.js";

/**
 * The API as one Vercel function. Same app as `index.ts`, built once per cold
 * start and reused while the function stays warm. The one thing a function
 * cannot do is keep a job running after it answers, so the background work is
 * routes here, called by Vercel Cron: the catalogue sync `index.ts` runs on
 * boot, and the position sync that keeps everyone's records level with the
 * chain. Neither ever runs on a read.
 */
const config = readConfig();
const auth = buildAuthDeps(config);
const deps = buildDeps(config);
const read = buildReadDeps(auth.db, deps, config);

const app = new Hono();

// Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET"; nobody else can.
app.get("/cron/catalogue", async (c) => {
  const secret = process.env["CRON_SECRET"];
  if (!secret || c.req.header("authorization") !== `Bearer ${secret}`) {
    return c.json({ error: { code: "forbidden", message: "Cron only." } }, 403);
  }
  const summary = await syncCatalogue(auth.db, { catalogue: deps.catalogue, prices: deps.prices });
  return c.json({ ok: true, ...summary });
});

/** Every account's books, brought level with the chain. Cron only, same as above. */
app.get("/cron/position-sync", async (c) => {
  const secret = process.env["CRON_SECRET"];
  if (!secret || c.req.header("authorization") !== `Bearer ${secret}`) {
    return c.json({ error: { code: "forbidden", message: "Cron only." } }, 403);
  }
  const summary = await syncAllPositions(auth.db, buildReconcileDeps(deps));
  return c.json({ ok: true, ...summary });
});

app.route(
  "/",
  createApp(() => deps, auth, read),
);

export default getRequestListener(app.fetch);
