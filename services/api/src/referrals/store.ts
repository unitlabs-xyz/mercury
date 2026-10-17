import { USDC_MINT } from "@mercury/chain";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { activities, orders, referrals, users, waitlist } from "../db/schema.js";
import { CLAIM_WINDOW_DAYS, FUNDING_SETTLE_MINUTES, QUALIFYING_FUNDING_USD, newCode } from "./rules.js";

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
  /** Mark every invited friend who now has $50 in and one filled trade. Returns how many changed. */
  qualifyPending(now: Date): Promise<number>;
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

  /*
   * One statement, so a friend is counted at most once however often it runs.
   *
   * Money in is the same rows the performance line reads as flows: USDC
   * `transfer_in` to the wallet itself, not a basket. Two kinds are left out.
   * A transfer whose signature also appears in the inviter's own activity is
   * the inviter's money going round. A row tagged `referral_payout` is a
   * reward, not funding.
   *
   * The inviter exclusion is best-effort. It relies on the inviter's row
   * having been written within the settle window, so a transfer is missed
   * only if the inviter's wallet has failed to sync for longer than that.
   */
  const qualifyPending = async (now: Date): Promise<number> => {
    const fundedUsd = sql`(
      select coalesce(sum(a.amount_usd), 0)
      from ${activities} a
      where a.user_id = ${referrals.friendId}
        and a.kind = 'transfer_in'
        and a.mint = ${USDC_MINT}
        and a.basket_portfolio_id is null
        and a.amount_usd is not null
        and a.ref_table is distinct from 'referral_payout'
        and a.occurred_at <= ${now}::timestamptz - (${FUNDING_SETTLE_MINUTES} * interval '1 minute')
        and not exists (
          select 1 from ${activities} b
          where b.user_id = ${referrals.inviterId} and b.tx_signature = a.tx_signature
        )
    )`;
    const traded = sql`exists (
      select 1 from ${orders} o where o.user_id = ${referrals.friendId} and o.status = 'filled'
    )`;
    const changed = await db
      .update(referrals)
      .set({ qualifiedAt: now })
      .where(
        and(isNull(referrals.qualifiedAt), traded, sql`${fundedUsd} >= ${QUALIFYING_FUNDING_USD.toString()}`),
      )
      .returning({ id: referrals.id });
    return changed.length;
  };

  return {
    codeFor,
    isFounding: async (userId) => {
      const row = await waitlistRow(userId);
      return row !== null && row.position <= FOUNDING;
    },
    claim,
    referredAt: async (userId) => (await existing(userId))?.createdAt ?? null,
    qualifyPending,
  };
};
