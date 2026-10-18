import { eq, sql } from "drizzle-orm";
import { D, toWire, type Decimal } from "@mercury/core";
import type { Db } from "../db/client.js";
import { earnEvents, users } from "../db/schema.js";

export interface EarnRecord {
  readonly userId: string;
  readonly kind: "deposit" | "withdraw";
  readonly usdc: Decimal;
  readonly vault: string;
  readonly signature: string;
  readonly occurredAt: Date;
}

/** The vault new cash goes to by default: the last one moved into. Null is the app's default. */
export interface EarnSettings {
  readonly vault: string | null;
}

/** The default vault and the ledger behind "earned so far". Functions, so a route test needs no database. */
export interface EarnLedger {
  settings(userId: string): Promise<EarnSettings>;
  /** Only the fields given change. */
  save(userId: string, change: Partial<EarnSettings>): Promise<void>;
  /** Deposits less withdrawals, in USDC, per vault. A vault with nothing recorded is absent. */
  netDeposited(userId: string): Promise<ReadonlyMap<string, Decimal>>;
  /** True when written; false when this signature was already recorded. */
  record(event: EarnRecord): Promise<boolean>;
}

export const pgEarnLedger = (db: Db): EarnLedger => ({
  async settings(userId) {
    const [row] = await db.select({ vault: users.earnVault }).from(users).where(eq(users.id, userId));
    return { vault: row?.vault ?? null };
  },
  async save(userId, change) {
    if (change.vault !== undefined)
      await db.update(users).set({ earnVault: change.vault }).where(eq(users.id, userId));
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
  async record(e) {
    const rows = await db
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
    return rows.length > 0;
  },
});
