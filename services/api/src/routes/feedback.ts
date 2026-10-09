import { Hono } from "hono";
import { z } from "zod";
import type { Notifier } from "../notify/ports.js";

/**
 * The feedback button in the app. Public, not under /v1: the person most in
 * need of it is the one who cannot get signed in.
 *
 * Being public, it is bounded three ways: a few sends per address an hour,
 * a cap on the text, and a cap on the screenshots, which the browser has
 * already shrunk before they arrive.
 */
export interface FeedbackDeps {
  readonly notifier: Notifier;
  /** Where it lands. */
  readonly to: string;
  /** Sends per IP in a rolling hour. */
  readonly perHour?: number;
  readonly now?: () => number;
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
const MAX_IMAGES = 3;
/** Decoded, per image. The browser sends ~300KB; this is the ceiling, not the norm. */
const MAX_IMAGE_BYTES = 1_500_000;

export const FeedbackRequest = z.object({
  message: z.string().trim().min(1).max(5000),
  /** Who sent it, when they were signed in. A claim, used only as Reply-To. */
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  /** The page they were on, so "this is broken" has a "this". */
  page: z.string().trim().max(300).optional(),
  images: z
    .array(
      z.object({
        name: z.string().trim().max(120),
        type: z.enum(IMAGE_TYPES),
        /** Base64, no data: prefix. */
        data: z.string().max(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4),
      }),
    )
    .max(MAX_IMAGES)
    .default([]),
});

const fail = (code: string, message: string) => ({ error: { code, message } });

const EXT: Record<(typeof IMAGE_TYPES)[number], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function feedbackRoutes(deps: FeedbackDeps): Hono {
  const app = new Hono();
  const perHour = deps.perHour ?? 5;
  const now = deps.now ?? Date.now;
  /* Per instance, so a ceiling rather than a guarantee. Enough to stop a loop. */
  const seen = new Map<string, number[]>();

  app.post("/feedback", async (c) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";
    const hourAgo = now() - 3_600_000;
    const recent = (seen.get(ip) ?? []).filter((t) => t > hourAgo);
    if (recent.length >= perHour) {
      return c.json(fail("rate_limited", "That's a lot of feedback at once. Try again in a while."), 429);
    }

    const parsed = FeedbackRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json(fail("invalid", "Write a message, and attach at most three images."), 400);
    const { message, email, page, images } = parsed.data;

    const files = images.map((image, i) => ({
      filename: `screenshot-${i + 1}.${EXT[image.type]}`,
      content: Buffer.from(image.data, "base64"),
    }));
    if (files.some((f) => f.content.length === 0 || f.content.length > MAX_IMAGE_BYTES)) {
      return c.json(fail("invalid", "One of the images is too large."), 400);
    }

    const firstLine = message.split("\n")[0]!.slice(0, 60);
    const ok = await deps.notifier.send({
      to: deps.to,
      subject: `Feedback: ${firstLine}${message.length > firstLine.length ? "…" : ""}`,
      body: [
        message,
        "",
        "—",
        `From: ${email ?? "not signed in"}`,
        `Page: ${page ?? "unknown"}`,
        `Agent: ${c.req.header("user-agent") ?? "unknown"}`,
        files.length > 0 ? `Screenshots: ${files.length}, attached` : "No screenshots",
      ].join("\n"),
      ...(email ? { replyTo: email } : {}),
      ...(files.length > 0 ? { attachments: files } : {}),
    });
    if (!ok)
      return c.json(fail("unavailable", "We couldn't send that just now. Try again in a moment."), 502);

    seen.set(ip, [...recent, now()]);
    return c.json({ ok: true });
  });

  return app;
}
