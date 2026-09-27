import { serve } from "@hono/node-server";
import { buildAuthDeps, buildDeps, buildReadDeps, readConfig } from "./deps.js";
import { syncCatalogue } from "./catalogue/sync.js";
import { createApp } from "./app.js";

const config = readConfig();
const port = Number(process.env.PORT ?? 8787);

const auth = buildAuthDeps(config);
const deps = buildDeps(config);
const read = buildReadDeps(auth.db, deps, config);

/**
 * The catalogue is filled on boot and then left alone: the token universe
 * changes when an issuer lists something, which is hours, not seconds. The
 * worker takes this over in subsystem 4.
 *
 * A failure here is logged and not fatal. The instruments shelf would be empty,
 * but identity, money and activity have nothing to do with Jupiter being up.
 */
syncCatalogue(auth.db, { catalogue: deps.catalogue, prices: deps.prices })
  .then((summary) => console.log(`catalogue: ${summary.instruments} instruments, ${summary.tokens} tokens`))
  .catch((error: unknown) => console.error("catalogue sync failed, shelf will be empty:", error));

serve({ fetch: createApp(() => deps, auth, read).fetch, port }, (info) => {
  console.log(`mercury api listening on :${info.port}`);
  if (config.sendMode === "simulate") {
    console.log(
      "SEND_MODE=simulate: dry run. Signed transactions are simulated against mainnet and never sent.",
    );
  }
});
