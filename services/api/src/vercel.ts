import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { createApp } from "./app.js";
import { syncCatalogue } from "./catalogue/sync.js";
import { buildAuthDeps, buildDeps, buildReadDeps, readConfig } from "./deps.js";

/**
 * The API as one Vercel function. Same app as `index.ts`, built once per cold
 * start and reused while the function stays warm. The one thing a function
 * cannot do is keep a job running after it answers, so the catalogue sync that
 * `index.ts` runs on boot is a route here, called by a Vercel Cron once a day
 * (the token universe changes on the order of hours, not seconds).
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

app.route("/", createApp(() => deps, auth, read));

export default getRequestListener(app.fetch);
