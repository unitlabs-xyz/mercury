import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { orders, referrals, users, waitlist } from "../db/schema.js";
import { CLAIM_WINDOW_DAYS, newCode } from "./rules.js";

/** The waitlist's founding cohort: the first 500 places. */
const FOUNDING = 500;

/** What a claim came to. Only `claimed` writes anything. */
export type ClaimResult =
  | { readonly kind: "claimed" | "already"; readonly inviterId: string }
  | { readonly kind: "unknown_code" | "self" | "taken" | "too_late" };

export interface ReferralStore {
  /** This person's code, made the first time anyone asks for it. */
  codeFor(userId: string): Promise<string>;
  /** Among the first 500 on the waitlist, matched by the email Privy gave us. */
  isFounding(userId: string): Promise<boolean>;
  /** Attach a code to a new account. Set once, never yourself, never late. */
  claim(friendId: string, code: string, now: Date): Promise<ClaimResult>;
  /** When this person was referred, or null if nobody did. The discount runs from here. */
  referredAt(userId: string): Promise<Date | null>;
}

export const createReferralStore = (db: Db): ReferralStore => {
  const waitlistRow = async (userId: string) => {
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
    const email = u?.email?.toLowerCase();
    if (email === undefined) return null;
    const [row] = await db
      .select({ slug: waitlist.slug, position: waitlist.position })
      .from(waitlist)
      .where(eq(waitlist.email, email));
    return row ?? null;
  };

  const taken = async (code: string) =>
    (await db.select({ id: users.id }).from(users).where(eq(users.referralCode, code))).length > 0;

  const codeFor = async (userId: string): Promise<string> => {
    const [u] = await db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId));
    if (u === undefined) throw new Error(`referrals: no user ${userId}`);
    if (u.code !== null) return u.code;

    /*
     * Looked up before it is written, as the waitlist learnt to do. The
     * `isNull` guard makes two first visits at once agree: the second write
     * matches no row, and both read back whichever code landed.
     */
    const slug = (await waitlistRow(userId))?.slug;
    for (const candidate of [...(slug === undefined ? [] : [slug]), newCode(), newCode(), newCode()]) {
      if (await taken(candidate)) continue;
      await db
        .update(users)
        .set({ referralCode: candidate })
        .where(and(eq(users.id, userId), isNull(users.referralCode)));
      const [now] = await db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId));
      if (now?.code) return now.code;
    }
    throw new Error("referrals: no free code after four tries");
  };

  const DAY = 86_400_000;

  const existing = async (friendId: string) =>
    (await db.select().from(referrals).where(eq(referrals.friendId, friendId)))[0] ?? null;

  /*
   * Who holds this code. A waitlist slug whose holder has not opened the
   * Invite panel yet is still theirs: their card's link is out there, so it
   * is claimed for them here, the same way `codeFor` would.
   */
  const holderOf = async (code: string): Promise<string | null> => {
    const [held] = await db.select({ id: users.id }).from(users).where(eq(users.referralCode, code));
    if (held !== undefined) return held.id;
    const [row] = await db.select({ email: waitlist.email }).from(waitlist).where(eq(waitlist.slug, code));
    if (row === undefined) return null;
    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${row.email}`)
      .limit(1);
    if (owner === undefined) return null;
    return (await codeFor(owner.id)) === code ? owner.id : null;
  };

  const claim = async (friendId: string, code: string, now: Date): Promise<ClaimResult> => {
    const inviterId = await holderOf(code);
    if (inviterId === null) return { kind: "unknown_code" };
    if (inviterId === friendId) return { kind: "self" };

    const prior = await existing(friendId);
    if (prior !== null)
      return prior.inviterId === inviterId ? { kind: "already", inviterId } : { kind: "taken" };

    const [friend] = await db
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, friendId));
    if (friend === undefined || now.getTime() - friend.createdAt.getTime() > CLAIM_WINDOW_DAYS * DAY) {
      return { kind: "too_late" };
    }
    const traded = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.userId, friendId), eq(orders.status, "filled")))
      .limit(1);
    if (traded.length > 0) return { kind: "too_late" };

    const written = await db
      .insert(referrals)
      .values({ inviterId, friendId, code, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: referrals.id });
    if (written.length === 1) return { kind: "claimed", inviterId };

    /* Two claims raced and the other one landed first: answer as if this were the repeat. */
    const won = await existing(friendId);
    return won?.inviterId === inviterId ? { kind: "already", inviterId } : { kind: "taken" };
  };

  return {
    codeFor,
    isFounding: async (userId) => {
      const row = await waitlistRow(userId);
      return row !== null && row.position <= FOUNDING;
    },
    claim,
    referredAt: async (userId) => (await existing(userId))?.createdAt ?? null,
  };
};
