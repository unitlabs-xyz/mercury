import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { users, wallets } from "../db/schema.js";
import { logger } from "../log/index.js";
import type { Notice, Notifier } from "../notify/ports.js";
import type { NewLiquidation } from "./chain-loan.js";
import { loanWalletName, type LoanWallet } from "./watch.js";

const log = logger("loan-watch");

/** How far back a liquidation found is still news. Older, it is the wallet's past. */
export const LIQUIDATION_NEWS_MS = 24 * 60 * 60_000;

/**
 * From when a liquidation found in a wallet's loan history is news: the last
 * day, and only since Mercury has followed the wallet. A linked wallet's past
 * liquidations, read when it was linked, are history and stay quiet; one in the
 * last day, after linking, is something the person may not know yet.
 */
export async function liquidationNewsSince(db: Db, walletId: string, now: Date): Promise<Date | null> {
  const [w] = await db
    .select({ isPrimary: wallets.isPrimary, createdAt: wallets.createdAt, linkedAt: wallets.linkedAt })
    .from(wallets)
    .where(eq(wallets.id, walletId))
    .limit(1);
  if (w === undefined) return null;
  const followedSince = w.isPrimary ? w.createdAt : (w.linkedAt ?? now);
  const recent = new Date(now.getTime() - LIQUIDATION_NEWS_MS);
  return followedSince.getTime() > recent.getTime() ? followedSince : recent;
}

/**
 * The mail for a liquidation, in the words a phone shows. It already happened,
 * so it says what was sold and what it repaid, not what to do to stop it; the
 * warnings before it said that. A linked wallet's loan is named, so the
 * person knows which of their loans it was.
 */
export const liquidationNotice = (
  found: NewLiquidation,
  wallet: LoanWallet,
): Pick<Notice, "subject" | "body"> => {
  const e = found.event;
  const what = e.ticker === null ? "some of your collateral" : e.subtitle!.split(" · ")[0]!;
  const where = wallet.kind === "external" ? ` in your linked wallet ${loanWalletName(wallet)}` : "";
  const repaid = e.ticker === null || e.usdAmount === null ? "" : `, which repaid $${e.usdAmount.toFixed(2)}`;
  return {
    subject:
      wallet.kind === "external"
        ? `Kamino sold collateral to repay your loan (${loanWalletName(wallet)})`
        : "Kamino sold collateral to repay your loan",
    body:
      `Your loan${where} passed the point where Kamino sells collateral to repay it, ` +
      `and Kamino sold ${what}${repaid}. ` +
      `Mercury has recorded the sale. What is left of the loan, and of your shares, is in the app.`,
  };
};

/**
 * Mail each liquidation that is news. Best effort: the feed row and the inbox
 * notification are already written, and are what somebody opening the app
 * sees; a mail that fails is logged and not tried again, since the sale it
 * reports is done and a late mail about it is worth less than a duplicate.
 */
export async function mailLiquidations(
  db: Db,
  notifier: Notifier | undefined,
  userId: string,
  walletId: string,
  found: readonly NewLiquidation[],
): Promise<number> {
  if (notifier === undefined || found.length === 0) return 0;
  const [row] = await db
    .select({ email: users.email, kind: wallets.kind, label: wallets.label, address: wallets.address })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .where(eq(wallets.id, walletId))
    .limit(1);
  if (row === undefined || row.email === null) return 0;
  let sent = 0;
  for (const f of found) {
    const ok = await notifier.send({ to: row.email, ...liquidationNotice(f, row) }).catch((err: unknown) => {
      log.error({ userId, err }, "could not mail a liquidation");
      return false;
    });
    if (ok) sent += 1;
  }
  return sent;
}
