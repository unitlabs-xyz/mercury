import { and, eq, sql } from "drizzle-orm";
import { D, toWire, type Decimal } from "@mercury/core";
import { USDC_MINT } from "@mercury/chain";
import type { Db } from "../db/client.js";
import { activities, earnEvents, users, wallets } from "../db/schema.js";
import type { WalletOwner } from "../wallets/active.js";

export interface EarnRecord {
  readonly userId: string;
  /** The wallet whose Earn position moved. */
  readonly walletId: string;
  readonly kind: "deposit" | "withdraw";
  readonly usdc: Decimal;
  readonly vault: string;
  /** For the feed: "Steakhouse USDC". */
  readonly vaultName: string;
  readonly signature: string;
  readonly occurredAt: Date;
  /** Who wrote it: Mercury at confirm time, or the history reader afterwards. Mercury unless said. */
  readonly origin?: "mercury" | "chain";
  /**
   * Vault shares that arrived or left with no USDC beside them: sent from or to
   * another wallet. `usdc` is then what they were worth that day, an estimate,
   * and the feed says shares moved rather than cash.
   */
  readonly transfer?: boolean;
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
  /** One wallet's deposits less withdrawals, in USDC, per vault. A vault with nothing recorded is absent. */
  netDeposited(owner: WalletOwner): Promise<ReadonlyMap<string, Decimal>>;
  /**
   * The vaults whose ledger holds a share transfer valued at a day's share
   * price rather than dollars that moved: what they earned is marked `~`.
   */
  estimatedVaults(owner: WalletOwner): Promise<ReadonlySet<string>>;
  /** True when written; false when this signature was already recorded. */
  record(event: EarnRecord): Promise<boolean>;
}

/** How a move reads in Activity. Cash moving within the account, so no sign either way. */
const FEED = {
  deposit: { kind: "earn_deposit", title: "Moved to Earn" },
  withdraw: { kind: "earn_withdraw", title: "Withdrew from Earn" },
} as const;

/** Shares that moved without cash: said as shares, so nobody reads them as money added or taken out. */
const SHARES = {
  deposit: { kind: "earn_deposit", title: "Earn shares received" },
  withdraw: { kind: "earn_withdraw", title: "Earn shares sent" },
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
  async netDeposited(owner) {
    const rows = await db
      .select({
        vault: earnEvents.vault,
        net: sql<string>`sum(case when ${earnEvents.kind} = 'deposit' then ${earnEvents.usdcAmount} else -${earnEvents.usdcAmount} end)`,
      })
      .from(earnEvents)
      .where(and(eq(earnEvents.userId, owner.userId), eq(earnEvents.walletId, owner.walletId)))
      .groupBy(earnEvents.vault);
    return new Map(rows.map((r) => [r.vault, D(r.net)]));
  },
  async estimatedVaults(owner) {
    const rows = await db
      .selectDistinct({ vault: earnEvents.vault })
      .from(earnEvents)
      .where(
        and(
          eq(earnEvents.userId, owner.userId),
          eq(earnEvents.walletId, owner.walletId),
          eq(earnEvents.estimated, true),
        ),
      );
    return new Set(rows.map((r) => r.vault));
  },
  /*
   * The ledger row and the feed row together, or neither: a move that is in
   * "earned so far" but not in Activity, or the other way round, is the gap
   * this closes. Both are unique on the signature, so a second confirm writes
   * nothing.
   */
  async record(e) {
    return db.transaction((tx) => writeEarnRecord(tx, e));
  },
});

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * One Earn move into the ledger and the feed, inside a transaction the caller
 * holds: the confirm route's, or the cost pass's when it reads a linked
 * wallet's past. False when this signature was already recorded, which keeps
 * a move Mercury recorded as Mercury recorded it.
 */
export async function writeEarnRecord(tx: Tx, e: EarnRecord): Promise<boolean> {
  const [row] = await tx
    .insert(earnEvents)
    .values({
      userId: e.userId,
      walletId: e.walletId,
      kind: e.kind,
      usdcAmount: toWire(e.usdc),
      vault: e.vault,
      estimated: e.transfer === true,
      ...(e.origin === undefined ? {} : { originSource: e.origin }),
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
      walletId: e.walletId,
      kind: (e.transfer === true ? SHARES : FEED)[e.kind].kind,
      occurredAt: e.occurredAt,
      title: (e.transfer === true ? SHARES : FEED)[e.kind].title,
      subtitle:
        e.transfer === true
          ? `${e.vaultName} · worth about this then`
          : e.origin === "chain"
            ? `${e.vaultName} · found in history`
            : e.vaultName,
      amountUsd: toWire(e.usdc),
      refTable: "earn_event",
      refId: row.id,
      txSignature: e.signature,
      mint: USDC_MINT,
    })
    .onConflictDoNothing();
  return true;
}

/**
 * Whether this wallet has ever moved money into or out of Earn: this wallet,
 * not any wallet of the same person. Joined on the person, one Earn deposit
 * from the Mercury wallet made every linked wallet read Kamino on every
 * portfolio and money request. A linked wallet's own Earn moves from before
 * it was linked are found by the history reader, and count from then.
 */
export const hasEarnHistory = async (db: Db, wallet: string): Promise<boolean> => {
  const [row] = await db
    .select({ id: earnEvents.id })
    .from(earnEvents)
    .innerJoin(wallets, eq(wallets.id, earnEvents.walletId))
    .where(eq(wallets.address, wallet))
    .limit(1);
  return row !== undefined;
};
