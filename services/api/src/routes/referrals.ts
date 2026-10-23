import { Hono } from "hono";
import { ClaimReferralRequest, type ReferralSummary } from "@mercury/types";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";
import { FRIEND_DISCOUNT, FRIEND_DISCOUNT_DAYS } from "../referrals/rules.js";
import type { ReferralStore } from "../referrals/store.js";

export interface ReferralDeps {
  readonly store: ReferralStore;
  /**
   * Whether an invited friend gets their discount (`REFERRAL_DISCOUNT`). Off
   * unless switched on. Tracking runs either way: codes, claims and funded
   * friends pay nothing.
   */
  readonly friendDiscount?: boolean;
  /** Injected so a test can stand at a chosen moment. */
  readonly now?: () => Date;
}

/** Where a shared link lands: the site, whose buttons carry the code on into the app. */
export const SITE = "https://trymercury.xyz";

const fail = (code: string, message: string) => ({ error: { code, message } });

export function referralRoutes(deps: ReferralDeps): Hono {
  const app = new Hono();
  const now = deps.now ?? (() => new Date());

  app.get("/v1/referrals", async (c) => {
    const s = await deps.store.summary(c.get("identity").userId, now());
    const on = deps.friendDiscount === true;
    const body: ReferralSummary = {
      code: s.code,
      link: `${SITE}/?ref=${encodeURIComponent(s.code)}`,
      invited: s.invited,
      funded: s.funded,
      friendDiscount: on ? { pct: FRIEND_DISCOUNT.mul(100).toNumber(), days: FRIEND_DISCOUNT_DAYS } : null,
      discountUntil: on ? (s.discountUntil?.toISOString() ?? null) : null,
    };
    return c.json(body);
  });

  /*
   * Called by the web once someone is signed in with a code waiting. Every
   * refusal is final, and the web drops the code on any 4xx except 401, 408
   * and 429, so the codes say why for the logs rather than for a screen.
   */
  app.post("/v1/referrals/claim", async (c) => {
    const parsed = ClaimReferralRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", "Not an invite code."), 400);

    const result = await deps.store.claim(c.get("identity").userId, parsed.data.code, now());
    switch (result.kind) {
      case "claimed":
      case "already":
        return c.json({ status: result.kind });
      case "unknown_code":
        return c.json(fail("not_found", "Nobody has that invite code."), 404);
      case "self":
        return c.json(fail("self_referral", "That is your own invite code."), 409);
      case "taken":
        return c.json(fail("already_referred", "Someone else invited you first."), 409);
      case "too_late":
        return c.json(fail("too_late", "Invite codes count only for new accounts."), 409);
    }
  });

  return app;
}
