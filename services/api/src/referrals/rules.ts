import { randomInt } from "node:crypto";
import { D, Decimal } from "@mercury/core";
import { ReferralCode } from "@mercury/types";

/**
 * Every number in the referral programme, from section 04 of the revenue deck
 * (14 October 2026). Nothing else in the codebase writes one of these down.
 */
export const FRIEND_DISCOUNT = D("0.25");
export const FRIEND_DISCOUNT_DAYS = 90;
export const QUALIFYING_FUNDING_USD = D(50);
/** A code claimed later than this did not bring the person in. */
export const CLAIM_WINDOW_DAYS = 7;

const DAY = 86_400_000;

export const isCode = (s: string): boolean => ReferralCode.safeParse(s).success;

/* No i, l, o, 0 or 1: a code read aloud or copied by hand should survive it. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export const newCode = (): string =>
  Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

export const discountEndsAt = (referredAt: Date): Date =>
  new Date(referredAt.getTime() + FRIEND_DISCOUNT_DAYS * DAY);

export const discountActive = (referredAt: Date, now: Date): boolean =>
  now.getTime() < discountEndsAt(referredAt).getTime();

export interface FeePricing {
  /** Mercury's rate for this trade, in basis points. Not always whole: 37.5 is a quarter off 50. */
  readonly bps: number;
  /** Present only while an invited friend's discount runs, so the confirm screen can say why. */
  readonly discount: { readonly pct: number; readonly until: Date } | null;
}

/** Mercury's rate for one person at one moment. Only Mercury's fee is discounted, never the network's. */
export const pricingFor = (baseBps: number, referredAt: Date | null, now: Date): FeePricing =>
  referredAt === null || baseBps === 0 || !discountActive(referredAt, now)
    ? { bps: baseBps, discount: null }
    : {
        bps: D(baseBps).mul(D(1).sub(FRIEND_DISCOUNT)).toNumber(),
        discount: { pct: FRIEND_DISCOUNT.mul(100).toNumber(), until: discountEndsAt(referredAt) },
      };

/** 25% under ten funded friends, 30% from ten, 35% from fifty. The founding 500 never drop below 30%. */
export const inviterShare = (funded: number, founding: boolean): Decimal => {
  const byCount = funded >= 50 ? D("0.35") : funded >= 10 ? D("0.30") : D("0.25");
  return founding ? Decimal.max(byCount, D("0.30")) : byCount;
};
