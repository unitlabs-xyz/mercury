import { serve } from "@hono/node-server";
import { buildDeps } from "./deps.js";
import { createApp } from "./app.js";

const deps = buildDeps();
const port = Number(process.env.PORT ?? 8787);

serve({ fetch: createApp(deps).fetch, port }, (info) => {
  console.log(`harbor api listening on :${info.port} in ${deps.mode} mode`);
  if (deps.mode === "fixture") {
    console.log("fixture mode: real measurements from 19 Sep 2026, no keys needed. HARBOR_MODE=live to switch.");
  }
});
