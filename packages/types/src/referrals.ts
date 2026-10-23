import { z } from "zod";
import { Iso } from "./primitives.js";

/** Exact and case-sensitive: waitlist slugs are base64url, and those links are still out there. */
export const ReferralCode = z.string().regex(/^[A-Za-z0-9_-]{6,16}$/);

export const ClaimReferralRequest = z.object({ code: ReferralCode });

export const ReferralSummary = z.object({
  code: ReferralCode,
  /** The link to share. It lands on the site, which carries the code into the app. */
  link: z.string().url(),
  invited: z.number().int().nonnegative(),
  /** Invited friends who have put in $50 and traded once. */
  funded: z.number().int().nonnegative(),
  /**
   * What a friend who joins through the link gets, while the discount is
   * switched on (`REFERRAL_DISCOUNT`). Null while it is off: the Invite panel
   * then promises nothing.
   */
  friendDiscount: z.object({ pct: z.number().positive(), days: z.number().int().positive() }).nullable(),
  /** When this person's own invited-friend discount ends, if they have one running. */
  discountUntil: Iso.nullable(),
});

export type ClaimReferralRequest = z.infer<typeof ClaimReferralRequest>;
export type ReferralSummary = z.infer<typeof ReferralSummary>;
