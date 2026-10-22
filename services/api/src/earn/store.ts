import { eq, sql } from "drizzle-orm";
import { D, toWire, type Decimal } from "@mercury/core";
import { USDC_MINT } from "@mercury/chain";
import type { Db } from "../db/client.js";
import { activities, earnEvents, users } from "../db/schema.js";

export interface EarnRecord {
  readonly userId: string;
  readonly kind: "deposit" | "withdraw";
  readonly usdc: Decimal;
  readonly vault: string;
  /** For the feed: "Steakhouse USDC". */
  readonly vaultName: string;
  readonly signature: string;
  readonly occurredAt: Date;
}

export interface EarnSettings {
  /** The vault new cash goes to by default: the last one moved into. Null is the app's default. */
  readonly vault: string | null;
  /** Which wording of Earn's risks this person accepted. Null: none yet. */
  readonly riskAccepted: string | null;
}

/** The default vault, the risks accepted, and the ledger behind "earned so far". Functions, so a route test needs no database. */
export interface EarnLedger {
  settings(userId: string): Promise<EarnSettings>;
  /** Only the fields given change. Accepting the risks records when, too. */
  save(userId: string, change: Partial<EarnSettings>): Promise<void>;
  /** Deposits less withdrawals, in USDC, per vault. A vault with nothing recorded is absent. */
  netDeposited(userId: string): Promise<ReadonlyMap<string, Decimal>>;
  /** True when written; false when this signature was already recorded. */
  record(event: EarnRecord): Promise<boolean>;
}

/** How a move reads in Activity. Cash moving within the account, so no sign either way. */
const FEED = {
  deposit: { kind: "earn_deposit", title: "Moved to Earn" },
  withdraw: { kind: "earn_withdraw", title: "Withdrew from Earn" },
} as const;

export const pgEarnLedger = (db: Db): EarnLedger => ({
  async settings(userId) {
    const [row] = await db
      .select({ vault: users.earnVault, riskVersion: users.earnRiskVersion })
      .from(users)
      .where(eq(users.id, userId));
    return { vault: row?.vault ?? null, riskAccepted: row?.riskVersion ?? null };
  },
  async save(userId, change) {
    const set = {
      ...(change.vault === undefined ? {} : { earnVault: change.vault }),
      ...(change.riskAccepted === undefined
        ? {}
        : { earnRiskVersion: change.riskAccepted, earnRiskAcceptedAt: new Date() }),
    };
    if (Object.keys(set).length > 0) await db.update(users).set(set).where(eq(users.id, userId));
  },
  async netDeposited(userId) {
    const rows = await db
      .select({
        vault: earnEvents.vault,
        net: sql<string>`sum(case when ${earnEvents.kind} = 'deposit' then ${earnEvents.usdcAmount} else -${earnEvents.usdcAmount} end)`,
      })
      .from(earnEvents)
      .where(eq(earnEvents.userId, userId))
      .groupBy(earnEvents.vault);
    return new Map(rows.map((r) => [r.vault, D(r.net)]));
  },
  /*
   * The ledger row and the feed row together, or neither: a move that is in
   * "earned so far" but not in Activity, or the other way round, is the gap
   * this closes. Both are unique on the signature, so a second confirm writes
   * nothing.
   */
  async record(e) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(earnEvents)
        .values({
          userId: e.userId,
          kind: e.kind,
          usdcAmount: toWire(e.usdc),
          vault: e.vault,
          txSignature: e.signature,
          occurredAt: e.occurredAt,
        })
        .onConflictDoNothing()
        .returning({ id: earnEvents.id });
      if (row === undefined) return false;
      await tx
        .insert(activities)
        .values({
          userId: e.userId,
          kind: FEED[e.kind].kind,
          occurredAt: e.occurredAt,
          title: FEED[e.kind].title,
          subtitle: e.vaultName,
          amountUsd: toWire(e.usdc),
          refTable: "earn_event",
          refId: row.id,
          txSignature: e.signature,
          mint: USDC_MINT,
        })
        .onConflictDoNothing();
      return true;
    });
  },
});
