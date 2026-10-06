/**
 * The waitlist and its founding cards, on their own, against a throwaway
 * in-memory Postgres. For trying the landing page's signup locally without a
 * database, a Privy app or an RPC. Nothing is kept after it stops, and only the
 * :mail variant below reads .env.
 *
 *   pnpm --filter @mercury/api dev:waitlist      # http://localhost:8787
 *
 * Emails are not sent. Each one is written to ./.waitlist-mail/ instead, as the
 * HTML it would have been plus the attached card, so it can be opened and checked.
 *
 *   pnpm --filter @mercury/api dev:waitlist:mail  # same, but really sends
 *
 * That one reads .env for RESEND_API_KEY and NOTIFY_FROM only, and emails each
 * signup for real. The database is still the throwaway one. The card in the
 * email body points at localhost, so only the attachment shows in a real inbox.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { testDb } from "../src/db/testing.js";
import type { Notifier } from "../src/notify/ports.js";
import { resendNotifier } from "../src/notify/resend.js";
import { pgWaitlist, waitlistRoutes } from "../src/routes/waitlist.js";

const port = Number(process.env["PORT"] ?? 8787);
const outbox = join(process.cwd(), ".waitlist-mail");
await mkdir(outbox, { recursive: true });

const toDisk: Notifier = {
  async send(notice) {
    const stem = join(outbox, `${Date.now()}-${notice.to.replace(/[^a-z0-9]+/gi, "_")}`);
    let html = notice.html ?? `<pre>${notice.body}</pre>`;
    for (const a of notice.attachments ?? []) {
      const file = `${stem}-${a.filename}`;
      await writeFile(file, a.content);
      // An inline image points at the file beside it, so the HTML opens as it would arrive.
      if (a.contentId) html = html.replaceAll(`cid:${a.contentId}`, file.split("/").pop()!);
    }
    await writeFile(`${stem}.html`, html);
    console.log(`mail: "${notice.subject}" to ${notice.to} → ${stem}.html`);
    return true;
  },
};

const key = process.env["RESEND_API_KEY"];
const notifier =
  process.env["WAITLIST_SEND_MAIL"] === "1" && key
    ? resendNotifier({ apiKey: key, from: process.env["NOTIFY_FROM"] ?? "Mercury <hello@trymercury.xyz>" })
    : toDisk;

const app = new Hono();
app.use("*", cors());
app.get("/health", (c) => c.json({ ok: true }));
// No DNS check: offline is a fine place to try this.
app.route("/", waitlistRoutes(pgWaitlist(await testDb(), "local", async () => true, { notifier })));

serve({ fetch: app.fetch, port }, () => {
  console.log(`waitlist (in-memory) on http://localhost:${port}`);
  console.log(notifier === toDisk ? `mail: written to ${outbox}` : "mail: sent for real, through Resend");
  console.log(`admin list: curl -H "authorization: Bearer local" http://localhost:${port}/admin/waitlist`);
});
