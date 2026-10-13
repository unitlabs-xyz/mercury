import { serve } from "@hono/node-server";
import { createTreasuryApp } from "./app.js";
import { readTreasuryConfig } from "./config.js";

/*
 * No try/catch. A treasury that cannot read its keys must not start: it would
 * report nothing, the API would hide funding, and the cause would be a line in
 * a log nobody read. Failing here puts the variable's name in the crash.
 */
const config = await readTreasuryConfig(process.env);
const port = Number(process.env["PORT"] ?? 8080);

/*
 * Addresses are public, and an operator checking them against a block explorer
 * is the entire point of deriving them. The keys are never logged.
 */
console.log("treasury: derived addresses");
for (const [family, address] of Object.entries(config.addresses)) {
  console.log(`  ${family}  ${address}`);
}

serve({ fetch: createTreasuryApp(config).fetch, port });
console.log(`treasury: listening on ${port} (internal network only)`);
