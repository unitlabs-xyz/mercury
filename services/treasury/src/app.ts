import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { TreasuryConfig } from "./config.js";

/** Constant-time, and length-safe: `timingSafeEqual` throws on a mismatch. */
const sameSecret = (sent: string | undefined, expected: string): boolean => {
  if (sent === undefined) return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * The treasury's whole surface.
 *
 * Two routes, and the larger returns three strings. That is deliberate: a
 * service holding spendable keys should be small enough to read in one sitting,
 * and anything added to it has to justify itself against the fact that a bug
 * here reaches the refund float.
 *
 * Nothing signs. Settling is a later decision and will not be a route that
 * signs on request — see docs/adr/0015-treasury-service.md.
 */
export const createTreasuryApp = (config: TreasuryConfig) => {
  const app = new Hono();

  /* No secret, and nothing about the keys. Something unauthenticated may reach
     this, so it says `ok` and stops. */
  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/addresses", (c) => {
    if (!sameSecret(c.req.header("x-treasury-secret"), config.secret)) {
      /* A code and nothing else. An unauthenticated caller learns whether the
         service is up, which `/health` already tells them, and no more. */
      return c.json({ error: { code: "unauthorized" } }, 401);
    }
    return c.json({ addresses: config.addresses });
  });

  app.notFound((c) => c.json({ error: { code: "not_found" } }, 404));
  return app;
};
