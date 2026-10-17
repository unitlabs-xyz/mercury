import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { users, waitlist } from "../db/schema.js";
import { newCode } from "./rules.js";

/** The waitlist's founding cohort: the first 500 places. */
const FOUNDING = 500;

export interface ReferralStore {
  /** This person's code, made the first time anyone asks for it. */
  codeFor(userId: string): Promise<string>;
  /** Among the first 500 on the waitlist, matched by the email Privy gave us. */
  isFounding(userId: string): Promise<boolean>;
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

  return {
    codeFor,
    isFounding: async (userId) => {
      const row = await waitlistRow(userId);
      return row !== null && row.position <= FOUNDING;
    },
  };
};
