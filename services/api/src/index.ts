import { serve } from "@hono/node-server";
import { buildAuthDeps, buildDeps, readConfig } from "./deps.js";
import { createApp } from "./app.js";

const config = readConfig();
const port = Number(process.env.PORT ?? 8787);

serve({ fetch: createApp(buildDeps(config), buildAuthDeps(config)).fetch, port }, (info) => {
  console.log(`harbor api listening on :${info.port}`);
});
