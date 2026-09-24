import { serve } from "@hono/node-server";
import { buildAuthDeps, buildDeps, readConfig } from "./deps.js";
import { createApp } from "./app.js";

const config = readConfig();
const port = Number(process.env.PORT ?? 8787);

// buildDeps is passed unevaluated: subsystem 2 has not landed, so calling it
// now would take the auth path down with it.
serve({ fetch: createApp(() => buildDeps(config), buildAuthDeps(config)).fetch, port }, (info) => {
  console.log(`harbor api listening on :${info.port}`);
});
