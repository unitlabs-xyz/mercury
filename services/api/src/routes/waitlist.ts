import { randomBytes } from "node:crypto";
import { resolve4, resolveMx } from "node:dns/promises";
import { Hono, type Context } from "hono";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { waitlist } from "../db/schema.js";
import type { Notifier } from "../notify/ports.js";
import { pickBackground, renderCard, renderWordmark } from "../waitlist/card.js";
import { cardPage, cardView, welcomeNotice } from "../waitlist/share.js";

/** X's own rule: letters, digits and underscores, at most fifteen. */
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

export const JoinWaitlistRequest = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(120).optional(),
  country: z.string().trim().min(2).max(80),
  // Typed with or without the @, and pasted as a profile link more often than
  // you would think. Blank is the same as absent.
  handle: z
    .string()
    .trim()
    .transform((h) => h.replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").replace(/^@/, ""))
    .pipe(z.union([z.literal(""), z.string().regex(HANDLE)]))
    .optional()
    .transform((h) => (h ? h : undefined)),
});
export type JoinWaitlist = z.infer<typeof JoinWaitlistRequest>;

export interface WaitlistRow {
  readonly email: string;
  readonly name: string | null;
  readonly country: string;
  readonly handle: string | null;
  readonly position: number;
  readonly createdAt: string;
}

/** What a card is drawn from. Public by its slug, so no email in it. */
export interface CardRow {
  readonly slug: string;
  readonly position: number;
  readonly handle: string | null;
  readonly name: string | null;
  readonly background: string | null;
}

export interface WaitlistDeps {
  /** Writes once per email. `created` is false for a repeat, and `card` is theirs either way. */
  readonly join: (entry: JoinWaitlist) => Promise<{ created: boolean; card: CardRow }>;
  readonly card: (slug: string) => Promise<CardRow | null>;
  readonly list: () => Promise<readonly WaitlistRow[]>;
  /** False only when the domain certainly cannot receive mail. */
  readonly acceptsMail: (domain: string) => Promise<boolean>;
  readonly render: (card: CardRow) => Promise<Buffer>;
  /** The wordmark badge the welcome email carries, as a PNG. */
  readonly wordmark: () => Promise<Buffer>;
  /** Sends the welcome email. Without a provider it logs and sends nothing. */
  readonly notifier?: Notifier;
  /**
   * The origin share links are built on. Unset, the request's own — which is
   * right until the landing domain proxies `/f/*` and `/waitlist/cards/*` here.
   */
  readonly publicBase?: string;
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

const toCard = (r: typeof waitlist.$inferSelect): CardRow => ({
  slug: r.slug,
  position: r.position,
  handle: r.handle,
  name: r.name,
  background: r.background,
});

export const pgWaitlist = (
  db: Db,
  adminToken?: string,
  acceptsMail = dnsAcceptsMail,
  extra: Partial<Pick<WaitlistDeps, "notifier" | "publicBase" | "render" | "wordmark">> & {
    readonly pick?: (previous: string | null) => Promise<string | null>;
  } = {},
): WaitlistDeps => ({
  acceptsMail,
  join: async (entry) => {
    // A missing folder is not a reason to lose a signup: null draws one by position.
    // The last signup's photo, so this one is different.
    const [last] = await db
      .select({ background: waitlist.background })
      .from(waitlist)
      .orderBy(desc(waitlist.position))
      .limit(1);
    const background = await (extra.pick ?? pickBackground)(last?.background ?? null).catch(() => null);
    const [inserted] = await db
      .insert(waitlist)
      .values({
        email: entry.email,
        name: entry.name || null,
        country: entry.country,
        handle: entry.handle ?? null,
        slug: randomBytes(9).toString("base64url"),
        background,
      })
      .onConflictDoNothing({ target: waitlist.email })
      .returning();
    if (inserted) return { created: true, card: toCard(inserted) };
    const [existing] = await db.select().from(waitlist).where(eq(waitlist.email, entry.email));
    return { created: false, card: toCard(existing!) };
  },
  card: async (slug) => {
    const [row] = await db.select().from(waitlist).where(eq(waitlist.slug, slug));
    return row ? toCard(row) : null;
  },
  list: async () => {
    const rows = await db.select().from(waitlist).orderBy(desc(waitlist.createdAt));
    return rows.map((r) => ({
      email: r.email,
      name: r.name,
      country: r.country,
      handle: r.handle,
      position: r.position,
      createdAt: r.createdAt.toISOString(),
    }));
  },
  render: extra.render ?? renderCard,
  wordmark: extra.wordmark ?? renderWordmark,
  ...(extra.notifier ? { notifier: extra.notifier } : {}),
  ...(extra.publicBase ? { publicBase: extra.publicBase.replace(/\/$/, "") } : {}),
  ...(adminToken ? { adminToken } : {}),
});

const csvCell = (v: string | null) => `"${(v ?? "").replaceAll('"', '""')}"`;

/** The origin a stranger can reach this deployment on, behind a proxy or not. */
const originOf = (c: Context, configured?: string) => {
  if (configured) return configured;
  const url = new URL(c.req.url);
  const proto = c.req.header("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = c.req.header("x-forwarded-host") ?? url.host;
  return `${proto}://${host}`;
};

/**
 * Public on the way in, private on the way out.
 *
 * A new signup gets their card back, to show and share. A repeat gets `ok` and
 * nothing else, and no second email, so the form can neither be used to read
 * someone else's card by their address nor to fill their inbox. That a repeat
 * answers differently from a first signup does say the address is listed;
 * that is the price of handing a card back at all.
 *
 * Reading the list needs the admin token as a bearer; without one configured
 * it is not served at all.
 */
export function waitlistRoutes(deps: WaitlistDeps) {
  const app = new Hono();

  app.post("/waitlist", async (c) => {
    const parsed = JoinWaitlistRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const handleWrong = parsed.error.issues.some((i) => i.path[0] === "handle");
      return c.json(
        {
          error: {
            code: "validation_failed",
            message: handleWrong
              ? "That isn't an X handle: letters, numbers and _ only, 15 at most."
              : "Enter a valid email and country.",
          },
        },
        400,
      );
    }
    if (!(await deps.acceptsMail(parsed.data.email.split("@")[1]!))) {
      return c.json(
        { error: { code: "validation_failed", message: "That email's domain doesn't accept mail." } },
        400,
      );
    }
    const { created, card } = await deps.join(parsed.data);
    if (!created) return c.json({ ok: true });

    const view = cardView(card, originOf(c, deps.publicBase));
    // Awaited, because a function host stops the process once it has answered.
    // Neither failing loses the signup: the row is written, and the card URL
    // draws on demand.
    if (deps.notifier) {
      try {
        const [png, wordmark] = await Promise.all([deps.render(card), deps.wordmark()]);
        await deps.notifier.send(welcomeNotice(parsed.data.email, view, png, wordmark));
      } catch (error: unknown) {
        console.error("waitlist: welcome email not sent", error);
      }
    }
    return c.json({ ok: true, card: view });
  });

  app.get("/waitlist/cards/:file", async (c) => {
    const slug = c.req.param("file").replace(/\.png$/, "");
    const card = await deps.card(slug);
    if (!card) return c.json({ error: { code: "not_found", message: "No such card." } }, 404);
    const png = await deps.render(card);
    return c.body(new Uint8Array(png), 200, {
      "content-type": "image/png",
      // A day, not forever: the design is still changing, and a card should
      // pick the new one up.
      "cache-control": "public, max-age=86400",
    });
  });

  app.get("/f/:slug", async (c) => {
    const slug = c.req.param("slug");
    const card = await deps.card(slug);
    if (!card) return c.redirect("https://trymercury.xyz", 302);
    // ?preview stays on the page and shows the image, to check what X will
    // unfurl; without it a person is sent straight on to the site.
    const preview = c.req.query("preview") !== undefined;
    return c.html(cardPage(cardView(card, originOf(c, deps.publicBase)), slug, preview));
  });

  app.get("/admin/waitlist", async (c) => {
    const token = deps.adminToken;
    if (token === undefined || c.req.header("authorization") !== `Bearer ${token}`) {
      return c.json({ error: { code: "not_found", message: "No such route." } }, 404);
    }
    const rows = await deps.list();
    if (c.req.query("format") === "csv") {
      const body = [
        "position,email,name,handle,country,created_at",
        ...rows.map((r) =>
          [String(r.position), r.email, r.name, r.handle, r.country, r.createdAt].map(csvCell).join(","),
        ),
      ].join("\n");
      return c.body(body, 200, { "content-type": "text/csv; charset=utf-8" });
    }
    return c.json({ count: rows.length, entries: rows });
  });

  return app;
}
