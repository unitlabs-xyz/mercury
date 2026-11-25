import { and, eq, inArray } from "drizzle-orm";
import type { ChainHistory, SignatureRef } from "@mercury/chain";
import type { Db } from "../db/client.js";
import { earnEvents, historyEvents, historyTxs, orders } from "../db/schema.js";
import { balanceOf, emptyBefore, movementsOf, rawJson, transactionFromRaw } from "./events.js";
import { dropWalk, holdLease, keepCursor, keepWalk } from "./queue.js";
import { stillFollowed, Unlinked } from "../wallets/active.js";

/** Signatures asked for at a time: the node's most. */
export const PAGE = 1_000;

/** Kamino could not be read, so what is pledged is unknown: the pass is tried again later, uncounted. */
export class PledgeUnknown extends Error {
  constructor(cause: unknown) {
    super("what the wallet has pledged to Kamino could not be read", { cause });
    this.name = "PledgeUnknown";
  }
}

/**
 * The node listed a signature on the account but would not return the
 * transaction: not indexed yet, or pruned. Thrown rather than skipped, so a
 * purchase in it is not lost for good; the pass fails and is tried again.
 */
export class TransactionUnavailable extends Error {
  constructor(readonly signature: string) {
    super(`the node did not return a listed transaction (${signature.slice(0, 8)}…); trying again later`);
    this.name = "TransactionUnavailable";
  }
}

/**
 * This wallet's turn is up and another is waiting: where it got to is kept
 * (`history_job.walks`), and it goes back in the queue to carry on from there.
 */
export class TurnOver extends Error {
  constructor() {
    super("history reader took its turn and gave the next wallet one");
    this.name = "TurnOver";
  }
}

/**
 * Where a walk through one token account got to when its wallet's turn was up:
 * enough to carry on exactly as if it had never stopped. Raw amounts are
 * strings, as JSON keeps them.
 */
export interface Walk {
  /** The newest signature on the account when the walk began: its cursor once the walk ends. */
  readonly newest: string;
  /** The last signature dealt with; the walk carries on from just older than it. */
  readonly before: string;
  /** What was pledged to Kamino just before that point, worked back so far. */
  readonly pledged: string;
  /** What was held before the oldest transaction with its details read so far, pledged included; null before any. */
  readonly oldestRaw: string | null;
  readonly oldestAt: string | null;
  /** Transactions read into events so far, for a cap. */
  readonly count: number;
}

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
  /**
   * What the wallet has pledged to Kamino today, by mint, in raw units. Pledged
   * shares are still held, so an account emptied by pledging is read like any
   * other, and the walk back stops only where wallet and pledge were both
   * empty. Throws when Kamino cannot be read: the pass waits rather than read
   * on half the picture. Absent, nothing is taken to be pledged.
   */
  readonly pledged?: (
    owner: string,
  ) => Promise<readonly { readonly mint: string; readonly rawAmount: bigint }[]>;
  /**
   * The most transactions read back on one account. None by default: a walk
   * goes back until the account was empty, however long that takes, because
   * a cost guessed where a walk stopped short is wrong for good, and an
   * interrupted walk loses nothing (each transaction is kept as it is read).
   */
  readonly cap?: number;
  /** Signatures asked for at a time; the node's most unless a test needs paging on less. */
  readonly page?: number;
  /**
   * Whether this wallet's turn is up and another wallet is waiting for the
   * reader. Asked before each call to the node; true, the walk keeps its place
   * and gives way (`TurnOver`). Absent, a pass runs to its end.
   */
  readonly turnOver?: () => Promise<boolean>;
}

export interface ReadResult {
  /** The newest signature seen on each account read this pass. */
  readonly cursors: Record<string, string>;
  readonly accounts: number;
  readonly transactions: number;
  readonly events: number;
  /** Accounts whose walk back stopped at the cap rather than at an empty balance. */
  readonly capped: number;
  /**
   * Per token account whose first read ended without reaching a moment the
   * wallet held none (the cap, or a node that keeps no older history): what
   * was held just before the oldest transaction read, in the wallet's account
   * and pledged to Kamino, in raw units, and when. Shares no transaction read
   * explains, so the cost pass prices them at the price then, marked `~`.
   */
  readonly opening: Record<string, Opening>;
}

/** Tokens held before the oldest transaction a first read reached. See `ReadResult.opening`. */
export interface Opening {
  readonly mint: string;
  /** In the wallet's account and pledged to Kamino together, raw. */
  readonly raw: string;
  /** The oldest transaction's time, as ISO; null when the node gave none (or no transaction was read). */
  readonly at: string | null;
}

/**
 * Read one linked wallet's past, or what is new since the last pass.
 *
 * It reads the wallet's **token accounts**, not the wallet: each holds one
 * token, so its history is only the transactions that moved that token. For
 * each account Mercury lists:
 *
 * - **First read** (no cursor): newest first, until the transaction before
 *   which the wallet held none of the token, in its account or pledged to
 *   Kamino. Nothing older can change what today's shares cost. An account
 *   empty today with nothing pledged needs none of its past, only a cursor:
 *   nothing it holds needs a cost.
 * - **Later passes** (a cursor): everything newer than the cursor.
 *
 * Each transaction is kept raw in `history_tx` the moment it is read, and
 * read back from there before the node is asked. So a pass the node or the
 * jobs' lane stops part way loses nothing: the next one lists the signatures
 * again (one call a thousand) and asks the node only for what it never got.
 * On a shared allowance, a long account's first read finishes across several
 * short windows rather than needing one long one it may never get.
 *
 * Where a transaction moved the token, it is also a `history_event`.
 * Signatures Mercury itself recorded (its own trades and Earn actions) are
 * not: those are already in its books, at their exact figures. A first read
 * still fetches them for the walk back, which must see where the wallet held
 * none; later passes skip them outright. A first read that never reaches such
 * a moment says what was held before the oldest transaction it read
 * (`opening`), and only that is priced as held from before. An
 * account's cursor is kept as soon as its events are written, so a pass
 * stopped on a later account doesn't walk this one again.
 */
export async function readWallet(
  deps: ReaderDeps,
  job: {
    readonly walletId: string;
    readonly address: string;
    readonly cursors: Readonly<Record<string, string>>;
    /** Only these mints' accounts: the Mercury wallet's Earn shares, never its stocks or cash. */
    readonly onlyMints?: ReadonlySet<string>;
    /** Walks a turn ended part way through, by account: carried on from where each stopped. */
    readonly walks?: Readonly<Record<string, Walk>>;
  },
): Promise<ReadResult> {
  const { db, history } = deps;
  const cap = deps.cap ?? Number.POSITIVE_INFINITY;
  const pageSize = deps.page ?? PAGE;
  if (history.ownedTokenAccounts === undefined)
    throw new Error("the chain client cannot list token accounts");

  const listed = await deps.listedMints();
  const accounts = (await history.ownedTokenAccounts(job.address)).filter(
    (a) => listed.has(a.mint) && (job.onlyMints === undefined || job.onlyMints.has(a.mint)),
  );
  const recorded = await mercurySignatures(db, job.walletId);
  const pledgedNow = new Map<string, bigint>();
  if (deps.pledged !== undefined) {
    const rows = await deps.pledged(job.address).catch((e: unknown) => {
      throw new PledgeUnknown(e);
    });
    for (const r of rows) pledgedNow.set(r.mint, (pledgedNow.get(r.mint) ?? 0n) + r.rawAmount);
  }

  const cursors: Record<string, string> = {};
  const opening: Record<string, Opening> = {};
  let transactions = 0;
  let events = 0;
  let capped = 0;
  /*
   * Transactions dealt with this turn. A turn ends only once it has done some:
   * calls slowed by the reader's budget could otherwise use up a turn before
   * its first transaction, and two wallets hand the reader back and forth for
   * ever without either moving.
   */
  let handled = 0;
  const turnIsOver = async () => handled > 0 && (await deps.turnOver?.()) === true;

  for (const account of accounts) {
    if (deps.laneBusy()) throw new GiveWay();
    const cursor = job.cursors[account.address];
    const resumed = job.walks?.[account.address];

    // Pledged today, worked back through each pledge and withdrawal the walk passes.
    let pledged = resumed === undefined ? (pledgedNow.get(account.mint) ?? 0n) : BigInt(resumed.pledged);

    // Empty today, nothing pledged, and never read: nothing held needs a cost. Note where it is, for later arrivals.
    if (resumed === undefined && cursor === undefined && account.rawAmount === 0n && pledged === 0n) {
      const [newest] = await history.signatures(account.address, { limit: 1 });
      if (newest !== undefined) {
        await db.transaction(async (tx) => {
          if (!(await stillFollowed(tx, job.walletId))) throw new Unlinked();
          await keepCursor(tx, job.walletId, account.address, newest.signature);
        });
        cursors[account.address] = newest.signature;
      }
      continue;
    }

    const read: { ref: SignatureRef; tx: NonNullable<Awaited<ReturnType<ChainHistory["transaction"]>>> }[] =
      [];
    let newest: string | undefined = resumed?.newest;
    let before: string | undefined = resumed?.before;
    let done = false;
    let hitCap = false;
    /** The first read found the moment before which the wallet held none of the token. */
    let reachedEmpty = false;
    /**
     * What was held just before the oldest transaction with its details a first
     * read reached, in the account and pledged, and when.
     */
    let oldest: { raw: bigint; at: number | null } | undefined =
      resumed?.oldestRaw == null
        ? undefined
        : {
            raw: BigInt(resumed.oldestRaw),
            at: resumed.oldestAt === null ? null : Date.parse(resumed.oldestAt) / 1000,
          };
    /** Transactions read into events by earlier turns of this walk. */
    const earlier = resumed?.count ?? 0;
    /** The last signature dealt with: where the walk carries on from if its turn ends here. */
    let lastDone: string | undefined;

    /*
     * The wallet's turn is up and another is waiting: what this walk read so far
     * becomes events, its place is kept, and it gives way. Events from a later
     * pass are written before the rest of that pass is read; the cost pass
     * leaves a wallet alone while any of its walks is unfinished, so they are
     * costed together, in order.
     */
    const giveTurn = async (): Promise<never> => {
      const at = lastDone ?? before;
      if (newest === undefined || at === undefined) throw new TurnOver();
      const rows = eventRows(read);
      const walk: Walk = {
        newest,
        before: at,
        pledged: pledged.toString(),
        oldestRaw: oldest === undefined ? null : oldest.raw.toString(),
        oldestAt: oldest?.at == null ? null : new Date(oldest.at * 1000).toISOString(),
        count: earlier + read.length,
      };
      await db.transaction(async (tx) => {
        if (!(await stillFollowed(tx, job.walletId))) throw new Unlinked();
        if (rows.length > 0) await tx.insert(historyEvents).values(rows).onConflictDoNothing();
        await keepWalk(tx, job.walletId, account.address, walk);
      });
      throw new TurnOver();
    };

    const eventRows = (txs: typeof read) =>
      txs.flatMap(({ ref, tx }) =>
        movementsOf(tx, job.address, account.mint).map((m) => ({
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
        })),
      );

    while (!done) {
      if (deps.laneBusy()) throw new GiveWay();
      if (await turnIsOver()) await giveTurn();
      await holdLease(db, job.walletId, new Date());
      const page = await history.signatures(account.address, {
        limit: pageSize,
        ...(cursor === undefined ? {} : { until: cursor }),
        ...(before === undefined ? {} : { before }),
      });
      newest ??= page[0]?.signature;
      /*
       * Mercury's own transactions are in its books already, so they become no
       * event. On a first read they are still fetched: the walk back has to see
       * them, because a buy through Mercury can be the moment the wallet went
       * from holding none to holding some, and a walk that skipped it read on
       * past the point it should have stopped. Later passes skip them outright.
       */
      const skip = (r: SignatureRef) => r.failed || (cursor !== undefined && recorded.has(r.signature));
      // What an earlier pass already read of this page: from the database, not the node.
      const wanted = page.filter((r) => !skip(r)).map((r) => r.signature);
      const kept = new Map(
        wanted.length === 0
          ? []
          : (
              await db
                .select({ signature: historyTxs.signature, raw: historyTxs.raw })
                .from(historyTxs)
                .where(inArray(historyTxs.signature, wanted))
            ).map((r) => [r.signature, transactionFromRaw(r.raw)]),
      );

      for (const ref of page) {
        if (earlier + read.length >= cap) {
          done = true;
          hitCap = true;
          break;
        }
        if (skip(ref)) {
          lastDone = ref.signature;
          continue;
        }
        const ours = recorded.has(ref.signature);
        let tx = kept.get(ref.signature) ?? null;
        if (tx === null) {
          if (deps.laneBusy()) throw new GiveWay();
          if (await turnIsOver()) await giveTurn();
          tx = await history.transaction(ref.signature);
          // Listed but not given: not indexed yet, or pruned by this node. Skipped, a buy in it
          // would never get its cost, so the pass fails and is tried again, further out each
          // time. What it read so far is kept, so a retry asks the node for nothing twice.
          if (tx === null) throw new TransactionUnavailable(ref.signature);
          // Kept at once: whatever stops this pass, the next one won't ask for it again.
          await db
            .insert(historyTxs)
            .values({
              signature: ref.signature,
              slot: BigInt(ref.slot),
              blockTime: tx.blockTime === null ? null : new Date(tx.blockTime * 1000),
              raw: rawJson(tx),
            })
            .onConflictDoNothing();
        }
        if (!ours) read.push({ ref, tx });
        lastDone = ref.signature;
        handled += 1;
        if (cursor !== undefined) continue;
        // A transaction the node kept without its details says nothing about balances: its
        // empty token lists are not "held none before", so the walk goes on past it.
        if (!tx.succeeded) continue;
        for (const m of movementsOf(tx, job.address, account.mint)) {
          if (m.kind === "loan_deposit") pledged = pledged > m.amountRaw ? pledged - m.amountRaw : 0n;
          else if (m.kind === "loan_withdraw") pledged += m.amountRaw;
        }
        oldest = { raw: balanceOf(tx.preTokens, job.address, account.mint) + pledged, at: tx.blockTime };
        // Held nowhere before this: in neither the wallet nor the loan.
        if (pledged === 0n && emptyBefore(tx, job.address, account.mint)) {
          reachedEmpty = true;
          done = true;
          break;
        }
      }

      if (page.length < pageSize) done = true;
      before = page[page.length - 1]?.signature;
      if (before === undefined) done = true;
    }

    const rows = eventRows(read);

    /*
     * This account is read: its events and its cursor kept now, together, so a
     * pass stopped on a later account doesn't walk it again, and a crash between
     * the two can't leave events with no cursor. Only while the wallet is still
     * followed: one unlinked mid-pass is frozen as it was, and the pass stops.
     */
    await db.transaction(async (tx) => {
      if (!(await stillFollowed(tx, job.walletId))) throw new Unlinked();
      if (rows.length > 0) await tx.insert(historyEvents).values(rows).onConflictDoNothing();
      if (newest !== undefined) await keepCursor(tx, job.walletId, account.address, newest);
      // The walk is over: nothing left to carry on.
      if (resumed !== undefined) await dropWalk(tx, job.walletId, account.address);
    });
    if (newest !== undefined) cursors[account.address] = newest;
    transactions += read.length;
    events += rows.length;
    if (hitCap) capped += 1;
    // A first read that never reached an empty moment: what was held before the oldest one it read.
    if (cursor === undefined && !reachedEmpty) {
      const raw = oldest === undefined ? account.rawAmount + pledged : oldest.raw;
      if (raw > 0n) {
        const at = oldest?.at ?? null;
        opening[account.address] = {
          mint: account.mint,
          raw: raw.toString(),
          at: at === null ? null : new Date(at * 1000).toISOString(),
        };
      }
    }
  }

  return { cursors, accounts: accounts.length, transactions, events, capped, opening };
}

/**
 * The transactions Mercury itself recorded for this wallet: its trades and
 * Earn actions. Already in the books at their exact figures, so the reader
 * skips them rather than reading them a second time.
 *
 * Not its loans. A pledge moves no cost, so reading one changes nothing in
 * the books, and the walk back has to see it: it is how the reader knows the
 * shares were still held, in the loan, where the wallet's own balance says
 * none were.
 */
async function mercurySignatures(db: Db, walletId: string): Promise<ReadonlySet<string>> {
  const [trades, earn] = await Promise.all([
    db.select({ s: orders.txSignature }).from(orders).where(eq(orders.walletId, walletId)),
    db
      .select({ s: earnEvents.txSignature })
      .from(earnEvents)
      .where(and(eq(earnEvents.walletId, walletId), eq(earnEvents.originSource, "mercury"))),
  ]);
  return new Set([...trades, ...earn].flatMap((r) => (r.s === null ? [] : [r.s])));
}
