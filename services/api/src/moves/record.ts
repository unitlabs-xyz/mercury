import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { D, type Decimal, replayPosition } from "@mercury/core";
import { USDC_DECIMALS } from "@mercury/chain";
import type { Db } from "../db/client.js";
import { activities, disposals, historyJobs, lots, tokens, wallets } from "../db/schema.js";
import { movementsByToken } from "../portfolio/open.js";
import { moveTitles } from "./names.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface MoveRecord {
  readonly userId: string;
  /** The wallet the tokens left. */
  readonly fromWalletId: string;
  /** The wallet they arrived in: the person's Mercury wallet. */
  readonly toWalletId: string;
  readonly signature: string;
  readonly occurredAt: Date;
  /**
   * From when a departure position-sync wrote for these tokens is this move,
   * seen early: when it was built, or a little before it landed for one sent by hand.
   */
  readonly startedAt: Date;
  readonly moved: readonly { readonly mint: string; readonly amountRaw: bigint }[];
  /** USDC's mint: its rows carry their dollars, so the two sides cancel under every wallet at once. */
  readonly usdcMint?: string;
}

const fixed = (d: Decimal) => d.toFixed();
const scaled = (raw: bigint, decimals: number) => D(raw.toString()).div(D(10).pow(decimals));

/**
 * One landed move, written into the books: the shares leave one wallet's
 * records and arrive in the Mercury wallet's with the cost they had.
 *
 * The cost is read from the source wallet's own lots, not its position row:
 * position-sync may already have seen the shares leave and emptied the
 * position, which would leave nothing to read. Its young departure for them
 * is taken back first, so the lots say what was held just before the move,
 * and the move then writes the departure itself, once.
 *
 * Shares with a known cost leave first, as position-sync counts them: a move
 * of no more than the costed shares arrives fully costed, exact or estimated
 * as it was, and any beyond them arrive with none. USDC carries no lot; its
 * rows carry the dollars.
 *
 * The feed row on the source side is the record that it was done: a second
 * call for the same signature writes nothing.
 */
export async function recordMoveIn(tx: Tx, input: MoveRecord): Promise<{ written: boolean }> {
  const named = await tx
    .select({ id: wallets.id, label: wallets.label, address: wallets.address, isPrimary: wallets.isPrimary })
    .from(wallets)
    .where(inArray(wallets.id, [input.fromWalletId, input.toWalletId]));
  const titles = moveTitles(
    named.find((w) => w.id === input.fromWalletId),
    named.find((w) => w.id === input.toWalletId),
  );
  const mints = input.moved.map((m) => m.mint);
  const stocks =
    mints.length === 0
      ? []
      : await tx
          .select({
            id: tokens.id,
            mint: tokens.mint,
            instrumentId: tokens.instrumentId,
            decimals: tokens.decimals,
            multiplier: tokens.multiplier,
          })
          .from(tokens)
          .where(inArray(tokens.mint, mints));

  /*
   * One row per mint. A move takes a token from each account the wallet holds
   * it in (`planMove`), so one transaction can carry the same mint twice; the
   * feed row is unique per wallet, signature and mint, and a second entry
   * would find it written and carry nothing.
   */
  const byMint = new Map<string, bigint>();
  for (const m of input.moved) {
    if (m.amountRaw > 0n) byMint.set(m.mint, (byMint.get(m.mint) ?? 0n) + m.amountRaw);
  }

  let written = false;
  for (const [mint, amountRaw] of byMint) {
    const m = { mint, amountRaw };
    const dollars = m.mint === input.usdcMint ? fixed(scaled(m.amountRaw, USDC_DECIMALS)) : null;
    const [first] = await tx
      .insert(activities)
      .values({
        userId: input.userId,
        walletId: input.fromWalletId,
        kind: "transfer_out",
        occurredAt: input.occurredAt,
        title: titles.out,
        subtitle: null,
        amountUsd: dollars,
        txSignature: input.signature,
        mint: m.mint,
      })
      .onConflictDoNothing()
      .returning({ id: activities.id });
    if (first === undefined) continue;
    written = true;
    await tx
      .insert(activities)
      .values({
        userId: input.userId,
        walletId: input.toWalletId,
        kind: "transfer_in",
        occurredAt: input.occurredAt,
        title: titles.in,
        subtitle: null,
        amountUsd: dollars,
        txSignature: input.signature,
        mint: m.mint,
      })
      .onConflictDoNothing();

    const stock = stocks.find((s) => s.mint === m.mint);
    if (stock === undefined) continue; // USDC and the like: no lot to carry

    // A departure position-sync already wrote for this move: taken back, so the shares leave once.
    await tx
      .delete(disposals)
      .where(
        and(
          eq(disposals.walletId, input.fromWalletId),
          eq(disposals.tokenId, stock.id),
          eq(disposals.kind, "transfer_out"),
          gte(disposals.recordedAt, input.startedAt),
        ),
      );

    // What the source held of this token just before the move, as its own lots say.
    const open = await openBefore(tx, input.fromWalletId, stock.id);

    const multiplier = D(stock.multiplier);
    await tx.insert(disposals).values({
      userId: input.userId,
      walletId: input.fromWalletId,
      tokenId: stock.id,
      instrumentId: stock.instrumentId,
      tokenQty: m.amountRaw,
      shares: fixed(scaled(m.amountRaw, stock.decimals).mul(multiplier)),
      kind: "transfer_out",
      occurredAt: input.occurredAt,
    });

    const costedRaw = m.amountRaw < open.tokenQty ? m.amountRaw : open.tokenQty;
    if (costedRaw <= 0n || !open.shares.gt(0) || !open.costUsd.gt(0)) continue;
    await tx.insert(lots).values({
      userId: input.userId,
      walletId: input.toWalletId,
      tokenId: stock.id,
      instrumentId: stock.instrumentId,
      tokenQty: costedRaw,
      shares: fixed(scaled(costedRaw, stock.decimals).mul(multiplier)),
      unitCostUsd: fixed(open.costUsd.div(open.shares)),
      feeUsd: "0",
      referencePriceUsd: fixed(open.referenceUsd.div(open.shares)),
      acquiredAt: input.occurredAt,
      source: "transfer_in",
      isEstimated: open.isEstimated,
      estimateSource: open.isEstimated ? "own_wallet" : null,
    });
  }
  return { written };
}

/** The open position of one token in one wallet, from its lots and disposals. */
async function openBefore(tx: Tx, walletId: string, tokenId: string) {
  const us = (col: typeof lots.recordedAt | typeof disposals.recordedAt) =>
    sql<number>`(extract(epoch from ${col}) * 1000000)::bigint`.mapWith(Number);
  const [lotRows, disposalRows] = await Promise.all([
    tx
      .select({
        id: lots.id,
        tokenId: lots.tokenId,
        tokenQty: lots.tokenQty,
        shares: lots.shares,
        unitCostUsd: lots.unitCostUsd,
        referencePriceUsd: lots.referencePriceUsd,
        feeUsd: lots.feeUsd,
        acquiredAt: lots.acquiredAt,
        recordedAtUs: us(lots.recordedAt),
        isEstimated: lots.isEstimated,
      })
      .from(lots)
      .where(and(eq(lots.walletId, walletId), eq(lots.tokenId, tokenId))),
    tx
      .select({
        id: disposals.id,
        tokenId: disposals.tokenId,
        tokenQty: disposals.tokenQty,
        recordedAtUs: us(disposals.recordedAt),
      })
      .from(disposals)
      .where(and(eq(disposals.walletId, walletId), eq(disposals.tokenId, tokenId))),
  ]);
  return replayPosition(movementsByToken(lotRows, disposalRows).get(tokenId) ?? []);
}

/** A source wallet whose past the cost pass has yet to reach. A failed read never will, so it records now. */
const STILL_READING: ReadonlySet<string> = new Set(["queued", "running", "read"]);

/**
 * A move the relayer sent, recorded in its own transaction.
 *
 * Not while the source wallet's past is still being read: its lots are not
 * written yet, so there is no cost to carry, and the cost pass carries the
 * move itself when it reaches it. Left to it, the move is recorded once,
 * with its cost, rather than now without one.
 */
export async function recordMove(db: Db, input: MoveRecord): Promise<{ written: boolean; deferred?: true }> {
  const [job] = await db
    .select({ status: historyJobs.status })
    .from(historyJobs)
    .where(eq(historyJobs.walletId, input.fromWalletId))
    .limit(1);
  if (job !== undefined && STILL_READING.has(job.status)) return { written: false, deferred: true };
  return db.transaction((tx) => recordMoveIn(tx, input));
}
