import { and, asc, count, desc, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { loanAlerts, walletLinkChallenges, walletStreams, wallets, type Wallet } from "../db/schema.js";
import { logger } from "../log/index.js";
import { queueHistory } from "../history/queue.js";
import { CHALLENGE_TTL_MS, linkMessage, linkNonce } from "./message.js";

const log = logger("wallets");

/** A wallet as the person's own routes see it. */
export interface WalletView {
  readonly id: string;
  readonly address: string;
  readonly kind: Wallet["kind"];
  readonly isPrimary: boolean;
  readonly label: string | null;
  readonly linkedAt: Date | null;
}

/**
 * Why a link was refused.
 *
 * - `link_limit`: the person already has as many linked as they may.
 * - `already_linked`: this address is already one of theirs, linked or the Mercury wallet itself.
 * - `linked_elsewhere`: another account holds this address. Never says whose.
 * - `challenge_invalid`: no such challenge for this person, or it expired, or it was used.
 * - `bad_signature`: the signature is not this address's, over this message.
 */
export type LinkRefusal =
  | "link_limit"
  | "already_linked"
  | "linked_elsewhere"
  | "challenge_invalid"
  | "bad_signature"
  | "too_many_challenges";

/**
 * The most link challenges one person may open in a challenge's lifetime (ten
 * minutes). Linking takes one, and a person retrying a wallet that won't sign
 * a few more; nobody needs twenty. Without a ceiling, each request wrote a row
 * until the daily prune, as fast as it was sent.
 */
export const CHALLENGES_PER_WINDOW = 20;

const view = (w: Wallet): WalletView => ({
  id: w.id,
  address: w.address,
  kind: w.kind,
  isPrimary: w.isPrimary,
  label: w.label,
  linkedAt: w.linkedAt,
});

/**
 * The person's wallets that are being followed: the Mercury wallet first, then
 * linked wallets in the order they were linked. An unlinked wallet is not here.
 */
export async function listWallets(db: Db, userId: string): Promise<readonly WalletView[]> {
  const rows = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.userId, userId), isNull(wallets.unlinkedAt)))
    .orderBy(desc(wallets.isPrimary), asc(wallets.linkedAt), asc(wallets.createdAt));
  return rows.map(view);
}

/** A wallet unlinked with its history kept: what the person can still delete. */
export interface KeptWallet {
  readonly id: string;
  readonly address: string;
  readonly label: string | null;
  readonly unlinkedAt: Date;
}

/**
 * Wallets unlinked with their history kept, newest unlinked first. Nothing
 * reads or shows them, so without this list the only way to delete what was
 * kept was to link the wallet again. The account owns that history, not the
 * address: the person's own session is enough to delete it, no signature.
 */
export async function keptWallets(db: Db, userId: string): Promise<readonly KeptWallet[]> {
  const rows = await db
    .select({
      id: wallets.id,
      address: wallets.address,
      label: wallets.label,
      unlinkedAt: wallets.unlinkedAt,
    })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), isNotNull(wallets.unlinkedAt)))
    .orderBy(desc(wallets.unlinkedAt));
  return rows.map((r) => ({ ...r, unlinkedAt: r.unlinkedAt! }));
}

/** Linked wallets being followed, which is what the limit counts. The Mercury wallet is not one. */
const activeLinks = async (db: Pick<Db, "select">, userId: string): Promise<number> => {
  const [row] = await db
    .select({ n: count() })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.kind, "external"), isNull(wallets.unlinkedAt)));
  return row?.n ?? 0;
};

/**
 * Whether `address` can be linked to `userId` now, and the row it already has
 * if it is theirs and unlinked.
 */
const linkable = async (
  db: Pick<Db, "select">,
  userId: string,
  address: string,
  limit: number,
): Promise<{ ok: true; existing: Wallet | null } | { ok: false; reason: LinkRefusal }> => {
  const [existing] = await db.select().from(wallets).where(eq(wallets.address, address)).limit(1);
  if (existing !== undefined && existing.userId !== userId) return { ok: false, reason: "linked_elsewhere" };
  if (existing !== undefined && existing.unlinkedAt === null) return { ok: false, reason: "already_linked" };
  // Linking an unlinked wallet again counts like a new link.
  if ((await activeLinks(db, userId)) >= limit) return { ok: false, reason: "link_limit" };
  return { ok: true, existing: existing ?? null };
};

export interface OpenChallengeInput {
  readonly userId: string;
  readonly address: string;
  readonly appUrl: string;
  readonly limit: number;
  readonly now: Date;
}

/**
 * A message for `address` to sign, or why there is no point asking.
 *
 * Refuses before anything is signed when the link would be refused anyway, so
 * nobody signs a message only to be turned away. The same checks run again
 * when the signature comes back, under a lock, because they can change between
 * the two.
 */
export async function openChallenge(
  db: Db,
  input: OpenChallengeInput,
): Promise<
  | { kind: "ok"; challengeId: string; message: string; expiresAt: Date }
  | { kind: "refused"; reason: LinkRefusal }
> {
  const check = await linkable(db, input.userId, input.address, input.limit);
  if (!check.ok) return { kind: "refused", reason: check.reason };
  const [recent] = await db
    .select({ n: count() })
    .from(walletLinkChallenges)
    .where(
      and(
        eq(walletLinkChallenges.userId, input.userId),
        gt(walletLinkChallenges.createdAt, new Date(input.now.getTime() - CHALLENGE_TTL_MS)),
      ),
    );
  if ((recent?.n ?? 0) >= CHALLENGES_PER_WINDOW) return { kind: "refused", reason: "too_many_challenges" };

  const expiresAt = new Date(input.now.getTime() + CHALLENGE_TTL_MS);
  const message = linkMessage({
    appUrl: input.appUrl,
    address: input.address,
    nonce: linkNonce(),
    issuedAt: input.now,
    expiresAt,
  });
  const [row] = await db
    .insert(walletLinkChallenges)
    .values({ userId: input.userId, address: input.address, message, expiresAt, createdAt: input.now })
    .returning({ id: walletLinkChallenges.id });
  return { kind: "ok", challengeId: row!.id, message, expiresAt };
}

export interface CompleteLinkInput {
  readonly userId: string;
  readonly challengeId: string;
  /** base58, as the wallet signed it. */
  readonly signature: string;
  readonly limit: number;
  readonly now: Date;
  /** Whether `signature` is `address`'s over `message`. See `verify.ts`. */
  readonly verify: (address: string, message: string, signature: string) => Promise<boolean>;
}

/**
 * Checks the signature against the stored challenge and links the wallet.
 *
 * One transaction, under a lock on the person: the count and the insert can
 * otherwise interleave, and two links sent at once would make one more than the
 * limit. The challenge is marked used in the same transaction, so a signature
 * links once.
 *
 * A wallet this person unlinked comes back as the same row, with its kept
 * history, rather than as a second row for the same address.
 */
export async function completeLink(
  db: Db,
  input: CompleteLinkInput,
): Promise<
  { kind: "linked"; wallet: WalletView; relinked: boolean } | { kind: "refused"; reason: LinkRefusal }
> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`wallet-link:${input.userId}`}, 0))`,
    );

    const [challenge] = await tx
      .select()
      .from(walletLinkChallenges)
      .where(
        and(eq(walletLinkChallenges.id, input.challengeId), eq(walletLinkChallenges.userId, input.userId)),
      )
      .limit(1);
    if (challenge === undefined || challenge.usedAt !== null || challenge.expiresAt <= input.now) {
      return { kind: "refused", reason: "challenge_invalid" } as const;
    }
    if (!(await input.verify(challenge.address, challenge.message, input.signature))) {
      return { kind: "refused", reason: "bad_signature" } as const;
    }

    const check = await linkable(tx, input.userId, challenge.address, input.limit);
    if (!check.ok) return { kind: "refused", reason: check.reason } as const;

    let wallet: Wallet | undefined;
    if (check.existing !== null) {
      [wallet] = await tx
        .update(wallets)
        .set({ unlinkedAt: null, linkedAt: input.now })
        .where(eq(wallets.id, check.existing.id))
        .returning();
      // Deleted since the check, which the shared lock rules out; refused rather than half-linked if it ever is.
      if (wallet === undefined) return { kind: "refused", reason: "challenge_invalid" } as const;
    } else {
      // Another account can take the address between the check and here; the
      // unique index decides, and this one gets nothing back.
      [wallet] = await tx
        .insert(wallets)
        .values({
          userId: input.userId,
          address: challenge.address,
          kind: "external",
          isPrimary: false,
          linkedAt: input.now,
        })
        .onConflictDoNothing()
        .returning();
      if (wallet === undefined) return { kind: "refused", reason: "linked_elsewhere" } as const;
    }

    await tx
      .update(walletLinkChallenges)
      .set({ usedAt: input.now })
      .where(eq(walletLinkChallenges.id, challenge.id));

    /*
     * Its past is read by the history reader. Queued in this transaction, so a
     * linked wallet never lacks a job; linking again queues the gap from the
     * kept cursors, and the wallet is "Calculating…" until it is read.
     */
    await queueHistory(tx, { walletId: wallet!.id, userId: input.userId, now: input.now });

    /*
     * Linked again: what happened while it was unlinked is the history
     * reader's to read, from its kept cursors. The live activity job forgets
     * where it stopped and starts from now, as for a wallet it has never seen:
     * walking months of gap from its old cursor stalls it at its page cap, and
     * a transfer from the gap is not news to announce.
     */
    if (check.existing !== null) {
      await tx.delete(walletStreams).where(eq(walletStreams.walletId, wallet!.id));
    }

    const relinked = check.existing !== null;
    /* The person, never the address: an address in a log is a person's holdings in a log. */
    log.info({ userId: input.userId, walletId: wallet!.id, relinked }, "linked a wallet");
    return { kind: "linked", wallet: view(wallet!), relinked } as const;
  });
}

/** Renames one of the person's linked wallets. `null` clears the name. */
export async function renameWallet(
  db: Db,
  input: { readonly userId: string; readonly walletId: string; readonly label: string | null },
): Promise<{ kind: "renamed"; wallet: WalletView } | { kind: "not_found" } | { kind: "primary" }> {
  const [target] = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.id, input.walletId), eq(wallets.userId, input.userId), isNull(wallets.unlinkedAt)))
    .limit(1);
  if (target === undefined) return { kind: "not_found" };
  if (target.isPrimary) return { kind: "primary" };
  const [row] = await db
    .update(wallets)
    .set({ label: input.label })
    .where(eq(wallets.id, target.id))
    .returning();
  return { kind: "renamed", wallet: view(row!) };
}

/**
 * Stops following a linked wallet, and with `deleteHistory` forgets it.
 *
 * Unlink keeps every row and hides them: nothing reads, shows or warns about a
 * wallet whose `unlinked_at` is set. Its remembered loan health is cleared, so
 * if it is linked again a loan already in trouble is warned about at once.
 *
 * Unlink and delete history deletes the wallet row, and the foreign keys take
 * its positions, lots, disposals, activity (and the inbox notices on it),
 * snapshots, loan and Earn events, loan alert and history with it. Its orders
 * stay, without a wallet, because they record the fee charged. The address is
 * then free for any account.
 *
 * Either works on a wallet that is already unlinked, so its kept history can be
 * deleted later. The Mercury wallet can be neither.
 */
export async function unlinkWallet(
  db: Db,
  input: {
    readonly userId: string;
    readonly walletId: string;
    readonly deleteHistory: boolean;
    readonly now: Date;
  },
): Promise<{ kind: "unlinked" } | { kind: "not_found" } | { kind: "primary" }> {
  return db.transaction(async (tx) => {
    /*
     * The lock linking holds. Without it, "unlink and delete history" could
     * delete the row between a relink's check and its update, and the relink
     * would go on to queue history for a wallet that is gone.
     */
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`wallet-link:${input.userId}`}, 0))`,
    );
    const [target] = await tx
      .select()
      .from(wallets)
      .where(and(eq(wallets.id, input.walletId), eq(wallets.userId, input.userId)))
      .limit(1);
    if (target === undefined) return { kind: "not_found" } as const;
    if (target.isPrimary) return { kind: "primary" } as const;

    if (input.deleteHistory) {
      await tx.delete(wallets).where(eq(wallets.id, target.id));
    } else if (target.unlinkedAt === null) {
      await tx.update(wallets).set({ unlinkedAt: input.now }).where(eq(wallets.id, target.id));
      await tx.delete(loanAlerts).where(eq(loanAlerts.walletId, target.id));
    }
    log.info(
      { userId: input.userId, walletId: target.id, deleteHistory: input.deleteHistory },
      "unlinked a wallet",
    );
    return { kind: "unlinked" } as const;
  });
}

/** A day: a challenge is good for ten minutes, and nothing reads one after it is used. */
const CHALLENGE_RETENTION_MS = 24 * 60 * 60_000;

/** Deletes challenges older than a day. Returns how many. */
export async function pruneLinkChallenges(db: Db, now: Date): Promise<number> {
  const gone = await db
    .delete(walletLinkChallenges)
    .where(lt(walletLinkChallenges.createdAt, new Date(now.getTime() - CHALLENGE_RETENTION_MS)))
    .returning({ id: walletLinkChallenges.id });
  return gone.length;
}
