/**
 * "Mercury is live" to the waitlist, through Resend.
 *
 *   pnpm --filter @mercury/api beta-mail --preview
 *       the email to ./.beta-mail/live.html; nothing is sent, no env needed
 *   pnpm --filter @mercury/api beta-mail --test you@example.com
 *       one email, to that address only (no database)
 *   pnpm --filter @mercury/api beta-mail --all [--limit 50]
 *       dry run: who would get it, nothing sent
 *   pnpm --filter @mercury/api beta-mail --all --go [--limit 50]
 *       sends, in signup order
 *
 * `waitlist.beta_mailed_at` is stamped as each one goes, and anyone already
 * stamped is skipped — so a run that dies halfway can simply be started
 * again, and the scheduled job cannot mail someone this has already reached.
 * It is in the database and not in a file here because two senders have to
 * agree, and a sender that remembers privately agrees with nobody.
 *
 * Reads RESEND_API_KEY and NOTIFY_FROM (and DATABASE_URL for --all). BETA_URL
 * overrides where the button goes (default https://beta.trymercury.xyz).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { asc, count, eq, isNull } from "drizzle-orm";
import { createDb } from "../src/db/client.js";
import { waitlist } from "../src/db/schema.js";
import { resendNotifier } from "../src/notify/resend.js";
import { BETA_URL, betaNotice } from "../src/waitlist/beta.js";
import { renderWordmark } from "../src/waitlist/card.js";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const need = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const appUrl = process.env["BETA_URL"] ?? BETA_URL;
const outbox = join(process.cwd(), ".beta-mail");
await mkdir(outbox, { recursive: true });
const wordmark = await renderWordmark();

/** Resend's default limit is 2 requests a second; stay under it. */
const GAP_MS = 600;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

if (flag("preview")) {
  const n = betaNotice({ email: "you@example.com", position: 42, name: "Alex" }, wordmark, appUrl);
  await writeFile(join(outbox, "mercury.png"), wordmark);
  await writeFile(join(outbox, "live.html"), n.html!.replaceAll("cid:wordmark", "mercury.png"));
  console.log(`"${n.subject}" → .beta-mail/live.html`);
  process.exit(0);
}

const send = resendNotifier({ apiKey: need("RESEND_API_KEY"), from: need("NOTIFY_FROM") });

const test = option("test");
if (test) {
  const ok = await send.send(betaNotice({ email: test, position: 42, name: null }, wordmark, appUrl));
  console.log(ok ? `sent to ${test}` : `failed to send to ${test}`);
  process.exit(ok ? 0 : 1);
}

if (!flag("all")) {
  console.log("Nothing to do. Use --preview, --test <email>, or --all [--go]. See the top of this file.");
  process.exit(1);
}

const db = createDb(need("DATABASE_URL"));
const [counts] = await db.select({ total: count(), mailed: count(waitlist.betaMailedAt) }).from(waitlist);
// In signup order, so the earliest positions hear first.
const rows = await db
  .select({ id: waitlist.id, email: waitlist.email, position: waitlist.position, name: waitlist.name })
  .from(waitlist)
  .where(isNull(waitlist.betaMailedAt))
  .orderBy(asc(waitlist.position));
const limit = Number(option("limit") ?? Infinity);
const todo = rows.slice(0, limit);
console.log(
  `waitlist: ${counts?.total ?? 0}, already sent: ${counts?.mailed ?? 0}, this run: ${todo.length} (→ ${appUrl})`,
);

if (!flag("go")) {
  for (const r of todo.slice(0, 10)) console.log(`  #${r.position} ${r.email}`);
  if (todo.length > 10) console.log(`  … and ${todo.length - 10} more`);
  console.log("Dry run. Add --go to send.");
  process.exit(0);
}

let sent = 0;
const failed: string[] = [];
for (const r of todo) {
  const email = r.email.toLowerCase();
  if (await send.send(betaNotice({ ...r, email }, wordmark, appUrl))) {
    sent += 1;
    // Stamped only once Resend has taken it, so a crash re-sends at worst one.
    await db.update(waitlist).set({ betaMailedAt: new Date() }).where(eq(waitlist.id, r.id));
  } else {
    failed.push(email);
  }
  await pause(GAP_MS);
}
console.log(`sent ${sent}, failed ${failed.length}${failed.length ? `: ${failed.join(", ")}` : ""}`);
process.exit(failed.length > 0 ? 1 : 0);
