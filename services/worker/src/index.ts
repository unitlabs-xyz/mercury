import { JOB_PLAN } from "./jobs/index.js";

/**
 * Not wired yet. Week two. Each entry in JOB_PLAN becomes a registered job, and the
 * runner is a plain interval loop with a lock, not a queue. See docs/03.
 */
console.log("harbor worker. planned jobs:");
for (const j of JOB_PLAN) console.log(`  ${j.name.padEnd(18)} every ${j.everyMs / 1000}s`);
