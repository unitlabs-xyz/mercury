import { resolve4, resolveMx } from "node:dns/promises";
import { Hono } from "hono";
import { desc } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { waitlist } from "../db/schema.js";

export const JoinWaitlistRequest = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(120).optional(),
  country: z.string().trim().min(2).max(80),
});
export type JoinWaitlist = z.infer<typeof JoinWaitlistRequest>;

export interface WaitlistRow {
  readonly email: string;
  readonly name: string | null;
  readonly country: string;
  readonly createdAt: string;
}

export interface WaitlistDeps {
  /** Writes once per email; a repeat is not an error. */
  readonly join: (entry: JoinWaitlist) => Promise<void>;
  readonly list: () => Promise<readonly WaitlistRow[]>;
  /** False only when the domain certainly cannot receive mail. */
  readonly acceptsMail: (domain: string) => Promise<boolean>;
  /** Unset, the export does not exist: every call to it is a 404. */
  readonly adminToken?: string;
}

const NO_SUCH_DOMAIN = new Set(["ENOTFOUND", "ENODATA", "ESERVFAIL"]);

/**
 * Does the domain take mail: an MX record, or failing that an address (which
 * mail servers fall back to). Only a definite "no such thing" says no — a slow
 * or failing resolver lets the signup through, since losing a real person is
 * worse than keeping a typo.
 */
export async function dnsAcceptsMail(domain: string, timeoutMs = 3000): Promise<boolean> {
  const lookup = async () => {
    try {
      if ((await resolveMx(domain)).some((mx) => mx.exchange.length > 0)) return true;
    } catch (error) {
      if (!NO_SUCH_DOMAIN.has((error as NodeJS.ErrnoException).code ?? "")) return true;
    }
    try {
      return (await resolve4(domain)).length > 0;
    } catch (error) {
      return !NO_SUCH_DOMAIN.has((error as NodeJS.ErrnoException).code ?? "");
    }
  };
  const timeout = new Promise<boolean>((done) => setTimeout(() => done(true), timeoutMs).unref());
  return Promise.race([lookup(), timeout]);
}

export const pgWaitlist = (db: Db, adminToken?: string, acceptsMail = dnsAcceptsMail): WaitlistDeps => ({
  acceptsMail,
  join: async (entry) => {
    await db
      .insert(waitlist)
      .values({ email: entry.email, name: entry.name || null, country: entry.country })
      .onConflictDoNothing({ target: waitlist.email });
  },
  list: async () => {
    const rows = await db.select().from(waitlist).orderBy(desc(waitlist.createdAt));
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  },
  ...(adminToken ? { adminToken } : {}),
});

const csvCell = (v: string | null) => `"${(v ?? "").replaceAll('"', '""')}"`;

/**
 * Public on the way in, private on the way out.
 *
 * Joining answers the same whether the email is new or already listed, so the
 * form cannot be used to find out who has signed up. Reading needs the admin
 * token as a bearer; without one configured it is not served at all.
 */
export function waitlistRoutes(deps: WaitlistDeps) {
  const app = new Hono();

  app.post("/waitlist", async (c) => {
    const parsed = JoinWaitlistRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: { code: "validation_failed", message: "Enter a valid email and country." } }, 400);
    }
    if (!(await deps.acceptsMail(parsed.data.email.split("@")[1]!))) {
      return c.json({ error: { code: "validation_failed", message: "That email's domain doesn't accept mail." } }, 400);
    }
    await deps.join(parsed.data);
    return c.json({ ok: true });
  });

  app.get("/admin/waitlist", async (c) => {
    const token = deps.adminToken;
    if (token === undefined || c.req.header("authorization") !== `Bearer ${token}`) {
      return c.json({ error: { code: "not_found", message: "No such route." } }, 404);
    }
    const rows = await deps.list();
    if (c.req.query("format") === "csv") {
      const body = [
        "email,name,country,created_at",
        ...rows.map((r) => [r.email, r.name, r.country, r.createdAt].map(csvCell).join(",")),
      ].join("\n");
      return c.body(body, 200, { "content-type": "text/csv; charset=utf-8" });
    }
    return c.json({ count: rows.length, entries: rows });
  });

  return app;
}
