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
    // onConflictDoNothing: two overlapping passes racing to discover the same
    // stream must not fail a wallet that is perfectly healthy.
    await db.insert(walletStreams).values({ walletId, address }).onConflictDoNothing();
    byAddress.set(address, { walletId, address, cursor: null, checkedAt: null });
  }

  // The wallet's own persisted cursor, read now — before this pass can move
  // it — so the backfill decision below rests on durable state rather than
  // this pass's memory. A pass that discovers a token stream, commits it, and
  // then dies before finishing must look to the next pass exactly like what
  // it is: an already-known wallet with one stream still unwalked. Memory of
  // "I just discovered this" does not survive that crash; a null cursor next
  // to a wallet whose own stream has moved on does.
  const own = byAddress.get(address);

  const hasTokenStream = [...byAddress.keys()].some((a) => a !== address);
  if (!hasTokenStream) {
    // Re-run every pass until the account exists, then stored: once
    // discovered the address never changes. Nothing before that account
    // existed is missed — there was nothing to find — but anything that lands
    // between its creation and its discovery here is not caught by the
    // wallet's own stream, which is why a stream discovered on an
    // already-known wallet gets backfilled below rather than baselined.
    for (const account of await deps.history.tokenAccountsFor(address, USDC_MINT)) {
      if (byAddress.has(account)) continue;
      await db.insert(walletStreams).values({ walletId, address: account }).onConflictDoNothing();
      byAddress.set(account, { walletId, address: account, cursor: null, checkedAt: null });
    }
  }

  // A token stream with no cursor, on a wallet whose own stream already has
  // one, can only be a stream discovered after the wallet became known: on
  // the wallet's very first pass every stream starts with a null cursor, own
  // address included, so `own` being unset (or itself still null) is what
  // keeps that case baselined rather than backfilled. See §8 of the design
  // doc.
  const shouldBackfill = (s: { address: string; cursor: string | null }): boolean =>
    s.address !== address && s.cursor === null && own?.cursor != null;

  const found = new Map<string, SignatureRef>();
  const advances: Advance[] = [];

  for (const stream of byAddress.values()) {
    const walk = await walkStream(deps.history, stream.address, stream.cursor, {
      backfill: shouldBackfill(stream),
      // Identifies the stream in a page-cap error without the address itself
      // — never the address, never logged.
      label: stream.address === address ? "the wallet's own stream" : "its USDC stream",
    });
    for (const sig of walk.signatures) found.set(sig.signature, sig);
    if (walk.newestSignature !== null) {
      advances.push({ address: stream.address, cursor: walk.newestSignature });
    }
  }

  // Oldest first. Not for crash safety — the insert below is one statement in
  // one transaction, so a crash rolls it all back whole — but for a
  // deterministic, readable insert order across both streams. Slot orders;
  // the signature settles a tie.
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
    //
    // Every stream walked this pass gets `checkedAt` — that column answers
    // "when did we last look," and a stream with nothing new was still
    // looked at. Only a stream with a newer position gets its `cursor` moved.
    const cursorByAddress = new Map(advances.map((a) => [a.address, a.cursor]));
    for (const streamAddress of byAddress.keys()) {
      const cursor = cursorByAddress.get(streamAddress);
      await tx
        .update(walletStreams)
        .set({ checkedAt: now, ...(cursor === undefined ? {} : { cursor }) })
        .where(and(eq(walletStreams.walletId, walletId), eq(walletStreams.address, streamAddress)));
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
