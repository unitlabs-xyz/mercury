import { and, eq } from "drizzle-orm";
import { USDC_MINT, type ChainHistory, type SignatureRef } from "@mercury/chain";
import type { Db } from "../db/client.js";
import { activities, users, walletStreams, wallets } from "../db/schema.js";
import { movementsIn, type Movement } from "./movements.js";
import { walkStream } from "./walk.js";

export interface WalletEventsDeps {
  readonly history: ChainHistory;
}

export interface EventsSummary {
  readonly wallets: number;
  readonly checked: number;
  readonly failed: number;
  /** Activity rows actually inserted. Zero on a pass that found nothing new. */
  readonly written: number;
}

/** A money column is numeric(38,18); a Decimal goes in at full scale or not at all. */
const fixed = (v: { toFixed: (dp: number) => string }): string => v.toFixed(18);

interface Advance {
  readonly address: string;
  readonly cursor: string;
}

/**
 * One wallet's pass over both its streams.
 *
 * Throws on any failure, which the caller counts and moves past. Nothing is
 * written and no cursor moves, so the next pass retries the same window — free,
 * because the unique index absorbs anything already recorded.
 */
async function syncWallet(
  db: Db,
  deps: WalletEventsDeps,
  userId: string,
  walletId: string,
  address: string,
): Promise<number> {
  const existing = await db.select().from(walletStreams).where(eq(walletStreams.walletId, walletId));
  const byAddress = new Map(existing.map((s) => [s.address, s]));

  // The wallet's own address finds native SOL, and the transaction that creates
  // the USDC account. Its USDC account finds every transfer after that one.
  if (!byAddress.has(address)) {
    await db.insert(walletStreams).values({ walletId, address });
    byAddress.set(address, { walletId, address, cursor: null, checkedAt: null });
  }

  const hasTokenStream = [...byAddress.keys()].some((a) => a !== address);
  if (!hasTokenStream) {
    // Discovered once, then stored: the address never changes. Empty until the
    // first USDC arrives, and that transfer is caught by the wallet's stream.
    for (const account of await deps.history.tokenAccountsFor(address, USDC_MINT)) {
      if (byAddress.has(account)) continue;
      await db.insert(walletStreams).values({ walletId, address: account });
      byAddress.set(account, { walletId, address: account, cursor: null, checkedAt: null });
    }
  }

  const found = new Map<string, SignatureRef>();
  const advances: Advance[] = [];

  for (const stream of byAddress.values()) {
    const walk = await walkStream(deps.history, stream.address, stream.cursor);
    for (const sig of walk.signatures) found.set(sig.signature, sig);
    if (walk.newestSignature !== null) {
      advances.push({ address: stream.address, cursor: walk.newestSignature });
    }
  }

  // Oldest first, so a crash part way through replays rather than leaving a
  // hole. Slot orders across both streams; the signature settles a tie.
  const ordered = [...found.values()].sort((a, b) =>
    a.slot === b.slot ? a.signature.localeCompare(b.signature) : a.slot - b.slot,
  );

  const moved: Movement[] = [];
  const now = new Date();
  for (const sig of ordered) {
    const tx = await deps.history.transaction(sig.signature);
    // Stopping costs a retry. Skipping would advance a cursor past a movement
    // and lose it permanently.
    if (tx === null) throw new Error(`transaction ${sig.signature} could not be read`);
    moved.push(...movementsIn(tx, { wallet: address, now }));
  }

  return db.transaction(async (tx) => {
    let written = 0;
    if (moved.length > 0) {
      const inserted = await tx
        .insert(activities)
        .values(
          moved.map((m) => ({
            userId,
            kind: m.kind,
            occurredAt: m.occurredAt,
            title: m.title,
            subtitle: m.subtitle,
            amountUsd: m.amountUsd === null ? null : fixed(m.amountUsd),
            txSignature: m.signature,
            mint: m.mint,
          })),
        )
        .onConflictDoNothing({
          target: [activities.userId, activities.txSignature, activities.mint],
        })
        .returning({ id: activities.id });
      written = inserted.length;
    }

    // Only now. A cursor that moved before its rows were committed would step
    // over them on the next pass.
    for (const a of advances) {
      await tx
        .update(walletStreams)
        .set({ cursor: a.cursor, checkedAt: now })
        .where(and(eq(walletStreams.walletId, walletId), eq(walletStreams.address, a.address)));
    }
    return written;
  });
}

/**
 * Turn every account's recent history into activity rows.
 *
 * One wallet failing does not stop the rest, as `position-sync` already does.
 * A wallet we cannot read is a wallet whose feed stays where it was — behind
 * but right — which is the correct answer when an upstream is down.
 */
export async function syncAllWalletEvents(db: Db, deps: WalletEventsDeps): Promise<EventsSummary> {
  const rows = await db
    .select({ userId: users.id, walletId: wallets.id, address: wallets.address })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .where(eq(wallets.isPrimary, true));

  let checked = 0;
  let failed = 0;
  let written = 0;

  for (const row of rows) {
    try {
      written += await syncWallet(db, deps, row.userId, row.walletId, row.address);
      checked += 1;
    } catch (error: unknown) {
      failed += 1;
      // The user, never the address: an address in a log is a person's
      // holdings in a log.
      console.error(`wallet-events: wallet for user ${row.userId} failed`, error);
    }
  }

  return { wallets: rows.length, checked, failed, written };
}
