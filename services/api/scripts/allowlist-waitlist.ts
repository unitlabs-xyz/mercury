/**
 * Everyone on the waitlist, pushed to Privy's allowlist.
 *
 *   pnpm --filter @mercury/api allowlist
 *
 * The gate has to live inside Privy: `sendCode` goes from the browser straight
 * to them, so nothing this API runs can stand in front of it.
 *
 * Safe on a schedule. Privy upserts — re-adding an address answers 200 and
 * leaves one entry — so the whole table is re-sent each run with no record of
 * who went before. Hence "sent" and not "added".
 *
 * Reads DATABASE_URL, PRIVY_APP_ID and PRIVY_APP_SECRET.
 */
import { PrivyClient } from "@privy-io/node";
import { asc } from "drizzle-orm";
import { createDb } from "../src/db/client.js";
import { waitlist } from "../src/db/schema.js";

const need = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

/** No published rate limit, so one at a time with a gap. */
const GAP_MS = 120;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/*
 * Privy currently upserts, so this never fires. Kept so that a provider which
 * starts rejecting repeats does not turn every scheduled run red.
 */
const isDuplicate = (error: unknown): boolean => {
  const status = (error as { status?: number } | null)?.status;
  const message = error instanceof Error ? error.message : String(error);
  return status === 409 || /already|exists|duplicate/i.test(message);
};

const db = createDb(need("DATABASE_URL"));
const privy = new PrivyClient({
  appId: need("PRIVY_APP_ID"),
  appSecret: need("PRIVY_APP_SECRET"),
  // The SDK defaults to two and retries rejections too, which would treble
  // every run against an endpoint with no published rate limit. The schedule
  // is the retry.
  maxRetries: 0,
  // Set only to point at a local stub, so a test does not reach the real list.
  ...(process.env["PRIVY_API_URL"] ? { apiUrl: process.env["PRIVY_API_URL"] } : {}),
});

// In signup order, so a run that dies halfway has still admitted the earliest positions.
const rows = await db.select({ email: waitlist.email }).from(waitlist).orderBy(asc(waitlist.position));
console.log(`waitlist: ${rows.length} emails`);

let sent = 0;
let already = 0;
const failed: string[] = [];

for (const { email: stored } of rows) {
  // Signup lower-cases on the way in, so this only bites a row written by
  // hand — but an allowlist entry whose case does not match the address
  // someone types is a silent refusal, and the call costs nothing.
  const email = stored.toLowerCase();
  try {
    await privy.apps().inviteToAllowlist({ type: "email", value: email });
    sent += 1;
  } catch (error: unknown) {
    if (isDuplicate(error)) {
      already += 1;
    } else {
      failed.push(email);
      console.error(`${email}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await pause(GAP_MS);
}

console.log(
  [`sent ${sent}`, already > 0 ? `already there ${already}` : null, `failed ${failed.length}`]
    .filter(Boolean)
    .join(", "),
);

// Non-zero so a scheduled run that is quietly failing is not a green tick.
process.exit(failed.length > 0 ? 1 : 0);
