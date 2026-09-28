import { serve } from "@hono/node-server";
import { buildAuthDeps, buildDeps, buildReadDeps, buildReconcileDeps, readConfig } from "./deps.js";
import { syncAllPositions } from "./portfolio/sync.js";
import { syncCatalogue } from "./catalogue/sync.js";
import { createApp } from "./app.js";

const config = readConfig();
const port = Number(process.env.PORT ?? 8787);

const auth = buildAuthDeps(config);
const deps = buildDeps(config);
const read = buildReadDeps(auth.db, deps, config);

/**
 * The catalogue is filled on boot and then left alone: the token universe
 * changes when an issuer lists something, which is hours, not seconds.
 *
 * A failure here is logged and not fatal. The instruments shelf would be empty,
 * but identity, money and activity have nothing to do with Jupiter being up.
 */
syncCatalogue(auth.db, { catalogue: deps.catalogue, prices: deps.prices })
  .then((summary) => console.log(`catalogue: ${summary.instruments} instruments, ${summary.tokens} tokens`))
  .catch((error: unknown) => console.error("catalogue sync failed, shelf will be empty:", error));

/**
 * The background half, on a long-running server. Serverless has no such thing,
 * so the deployed API runs the same function from `/cron/position-sync` on a
 * Vercel Cron instead — see vercel.ts. Either way it is the only writer of a
 * position, and no read ever triggers it.
 *
 * Runs sequentially: a pass that overran its interval must not have a second
 * one start behind it and write the same books twice.
 */
const POSITION_SYNC_MS = 5 * 60 * 1000;
const positionSync = async () => {
  try {
    const summary = await syncAllPositions(auth.db, buildReconcileDeps(deps));
    if (summary.wallets > 0) {
      console.log(
        `position-sync: ${summary.reconciled}/${summary.wallets} wallets` +
          (summary.failed > 0 ? `, ${summary.failed} failed` : ""),
      );
    }
  } catch (error: unknown) {
    console.error("position-sync failed:", error);
  }
  setTimeout(() => void positionSync(), POSITION_SYNC_MS);
};
setTimeout(() => void positionSync(), 10_000);

serve({ fetch: createApp(() => deps, auth, read).fetch, port }, (info) => {
  console.log(`mercury api listening on :${info.port}`);
  if (config.sendMode === "simulate") {
    console.log(
      "SEND_MODE=simulate: dry run. Signed transactions are simulated against mainnet and never sent.",
    );
  }
});
