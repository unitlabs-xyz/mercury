import { and, eq } from "drizzle-orm";
import type { ChainHistory, SignatureRef } from "@mercury/chain";
import type { Db } from "../db/client.js";
import { earnEvents, historyEvents, historyTxs, loanEvents, orders } from "../db/schema.js";
import { emptyBefore, movementOf, rawJson } from "./events.js";

/** Signatures asked for at a time: the node's most. */
export const PAGE = 1_000;
/** The most transactions read back on one account in one pass. About forty minutes at two a second. */
export const READ_CAP = 5_000;

/** The jobs' own lane was refused mid-pass: the reader stops and gives way, and the pass is tried again later. */
export class GiveWay extends Error {
  constructor() {
    super("history reader gave way to the jobs' lane");
    this.name = "GiveWay";
  }
}

export interface ReaderDeps {
  readonly db: Db;
  /** The chain's history, through the reader's budget. */
  readonly history: ChainHistory;
  /** Every mint Mercury lists: the stocks' tokens, USDC, and the Earn vaults' share tokens. */
  readonly listedMints: () => Promise<ReadonlySet<string>>;
  /** True while the jobs' own lane is being refused: the reader reads nothing then. */
  readonly laneBusy: () => boolean;
  readonly cap?: number;
  /** Signatures asked for at a time; the node's most unless a test needs paging on less. */
  readonly page?: number;
}

export interface ReadResult {
  /** The newest signature seen on each account read this pass. */
  readonly cursors: Record<string, string>;
  readonly accounts: number;
  readonly transactions: number;
  readonly events: number;
  /** Accounts whose walk back stopped at the cap rather than at an empty balance. */
  readonly capped: number;
}

/**
 * Read one linked wallet's past, or what is new since the last pass.
 *
 * It reads the wallet's **token accounts**, not the wallet: each holds one
 * token, so its history is only the transactions that moved that token. For
 * each account Mercury lists:
 *
 * - **First read** (no cursor): newest first, until the transaction before
 *   which the wallet held none of the token. Nothing older can change what
 *   today's shares cost. At most `READ_CAP` transactions back. An account
 *   empty today needs none of its past, only a cursor: nothing it holds needs
 *   a cost.
 * - **Later passes** (a cursor): only what is newer than the cursor.
 *
 * Each transaction is kept raw in `history_tx` and, where it moved the token,
 * as a `history_event`. Signatures Mercury itself recorded (its own trades,
 * loans and Earn actions) are skipped: those are already in its books, at
 * their exact figures. Cursors move only once the account's writes commit, so
 * a pass that stops part way reads the rest next time and writes nothing twice.
 */
export async function readWallet(
  deps: ReaderDeps,
  job: {
    readonly walletId: string;
    readonly address: string;
    readonly cursors: Readonly<Record<string, string>>;
  },
): Promise<ReadResult> {
  const { db, history } = deps;
  const cap = deps.cap ?? READ_CAP;
  const pageSize = deps.page ?? PAGE;
  if (history.ownedTokenAccounts === undefined)
    throw new Error("the chain client cannot list token accounts");

  const listed = await deps.listedMints();
  const accounts = (await history.ownedTokenAccounts(job.address)).filter((a) => listed.has(a.mint));
  const recorded = await mercurySignatures(db, job.walletId);

  const cursors: Record<string, string> = {};
  let transactions = 0;
  let events = 0;
  let capped = 0;

  for (const account of accounts) {
    if (deps.laneBusy()) throw new GiveWay();
    const cursor = job.cursors[account.address];

    // Empty today and never read: nothing held needs a cost. Note where it is, for later arrivals.
    if (cursor === undefined && account.rawAmount === 0n) {
      const [newest] = await history.signatures(account.address, { limit: 1 });
      if (newest !== undefined) cursors[account.address] = newest.signature;
      continue;
    }

    const read: { ref: SignatureRef; tx: NonNullable<Awaited<ReturnType<ChainHistory["transaction"]>>> }[] =
      [];
    let newest: string | undefined;
    let before: string | undefined;
    let done = false;
    let hitCap = false;

    while (!done) {
      if (deps.laneBusy()) throw new GiveWay();
      const page = await history.signatures(account.address, {
        limit: pageSize,
        ...(cursor === undefined ? {} : { until: cursor }),
        ...(before === undefined ? {} : { before }),
      });
      newest ??= page[0]?.signature;

      for (const ref of page) {
        if (read.length >= cap) {
          done = true;
          hitCap = true;
          break;
        }
        if (ref.failed || recorded.has(ref.signature)) continue;
        if (deps.laneBusy()) throw new GiveWay();
        const tx = await history.transaction(ref.signature);
        if (tx === null) continue; // pruned by the node: nothing to learn from it
        read.push({ ref, tx });
        if (cursor === undefined && emptyBefore(tx, job.address, account.mint)) {
          done = true;
          break;
        }
      }

      if (page.length < pageSize) done = true;
      before = page[page.length - 1]?.signature;
      if (before === undefined) done = true;
    }

    const rows = read.flatMap(({ ref, tx }) => {
      const m = movementOf(tx, job.address, account.mint);
      return m === null
        ? []
        : [
            {
              walletId: job.walletId,
              account: account.address,
              signature: ref.signature,
              blockTime: tx.blockTime === null ? null : new Date(tx.blockTime * 1000),
              kind: m.kind,
              mint: account.mint,
              amountRaw: m.amountRaw,
              counterMint: m.counterMint,
              counterAmountRaw: m.counterAmountRaw,
              sourceOwner: m.sourceOwner,
              destinationOwner: m.destinationOwner,
            },
          ];
    });

    await db.transaction(async (tx) => {
      if (read.length > 0) {
        await tx
          .insert(historyTxs)
          .values(
            read.map(({ ref, tx: detail }) => ({
              signature: ref.signature,
              slot: BigInt(ref.slot),
              blockTime: detail.blockTime === null ? null : new Date(detail.blockTime * 1000),
              raw: rawJson(detail),
            })),
          )
          .onConflictDoNothing();
      }
      if (rows.length > 0) await tx.insert(historyEvents).values(rows).onConflictDoNothing();
    });

    if (newest !== undefined) cursors[account.address] = newest;
    transactions += read.length;
    events += rows.length;
    if (hitCap) capped += 1;
  }

  return { cursors, accounts: accounts.length, transactions, events, capped };
}

/**
 * The transactions Mercury itself recorded for this wallet: its trades,
 * loans and Earn actions. Already in the books at their exact figures, so
 * the reader skips them rather than reading them a second time.
 */
async function mercurySignatures(db: Db, walletId: string): Promise<ReadonlySet<string>> {
  const [trades, loans, earn] = await Promise.all([
    db.select({ s: orders.txSignature }).from(orders).where(eq(orders.walletId, walletId)),
    db
      .select({ s: loanEvents.txSignature })
      .from(loanEvents)
      .where(and(eq(loanEvents.walletId, walletId), eq(loanEvents.originSource, "mercury"))),
    db
      .select({ s: earnEvents.txSignature })
      .from(earnEvents)
      .where(and(eq(earnEvents.walletId, walletId), eq(earnEvents.originSource, "mercury"))),
  ]);
  return new Set([...trades, ...loans, ...earn].flatMap((r) => (r.s === null ? [] : [r.s])));
}
