import { serve } from "@hono/node-server";
import { buildDeps, readConfig } from "./deps.js";
import { createApp } from "./app.js";

const deps = buildDeps(readConfig());
const port = Number(process.env.PORT ?? 8787);

serve({ fetch: createApp(deps).fetch, port }, (info) => {
  console.log(`harbor api listening on :${info.port}`);
});
