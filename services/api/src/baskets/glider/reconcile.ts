import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import {
  BasketExitMessage,
  BasketExitMode,
  BasketExitSubmission,
  type ManagedBasketOperation,
} from "@mercury/types";
import { type ChainHistory, type TransactionDetail } from "@mercury/chain";
import { z } from "zod";
import type { Db } from "../../db/client.js";
import { activities, basketActions } from "../../db/schema.js";
import type { ExitIntentPayload } from "../core/primitives.js";

const SOLANA = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:";
const PAGE = 100;
const MAX_PAGES = 3;
const MAX_TRANSACTIONS = 50;
const MAX_ATTEMPTS = 48;
const RETRY_SECONDS = [30, 60, 120, 300, 600, 1_800] as const;

const payloadSchema = z.object({
  mode: BasketExitMode,
  submission: BasketExitSubmission.optional(),
  smartAccountId: z.string().startsWith(SOLANA),
  recipientAccountId: z.string().startsWith(SOLANA),
  baselineSignature: z.string().nullable(),
  authorization: z.object({ message: BasketExitMessage, signature: z.string().min(1) }),
  authorizedAssets: z.array(z.object({ mint: z.string().min(1), amountRaw: z.string().regex(/^[1-9]\d*$/) })),
  expectedTransfers: z.array(
    z.object({
      mint: z.string().min(1),
      symbol: z.string().min(1),
      amountRaw: z
        .string()
        .regex(/^[1-9]\d*$/)
        .nullable(),
    }),
  ),
  templateName: z.string().min(1),
});

type ExitRow = Omit<
  typeof basketActions.$inferSelect,
  "payload" | "portfolioId" | "nonce" | "operationId"
> & {
  payload: ExitIntentPayload;
  portfolioId: string;
  nonce: string;
  operationId: string;
};

export interface VerifiedExitTransfer {
  readonly mint: string;
  readonly rawAmount: bigint;
  readonly decimals: number;
}

const addressOf = (accountId: string) => accountId.slice(accountId.lastIndexOf(":") + 1);
const tokenBalance = (balances: TransactionDetail["preTokens"], owner: string, mint: string): bigint =>
  balances.reduce(
    (sum, item) => (item.owner === owner && item.mint === mint ? sum + item.rawAmount : sum),
    0n,
  );

/** Match only direct, successful smart-account-to-owner token transfers. */
export function verifiedExitTransfers(
  tx: TransactionDetail,
  payload: Pick<ExitIntentPayload, "smartAccountId" | "recipientAccountId" | "expectedTransfers">,
): readonly VerifiedExitTransfer[] {
  if (!tx.succeeded) return [];
  const sourceOwner = addressOf(payload.smartAccountId);
  const destinationOwner = addressOf(payload.recipientAccountId);
  const expected = new Map(payload.expectedTransfers.map((item) => [item.mint, item.amountRaw]));
  const grouped = new Map<string, { instructionAmount: bigint; decimals: number }>();
  for (const transfer of tx.tokenTransfersIn ?? []) {
    if (
      transfer.sourceOwner !== sourceOwner ||
      transfer.destinationOwner !== destinationOwner ||
      !expected.has(transfer.mint)
    )
      continue;
    const prior = grouped.get(transfer.mint);
    if (prior && prior.decimals !== transfer.decimals) return [];
    grouped.set(transfer.mint, {
      instructionAmount: (prior?.instructionAmount ?? 0n) + transfer.rawAmount,
      decimals: transfer.decimals,
    });
  }
  const verified: VerifiedExitTransfer[] = [];
  for (const [mint, actual] of grouped) {
    const sourceDebit =
      tokenBalance(tx.preTokens, sourceOwner, mint) - tokenBalance(tx.postTokens, sourceOwner, mint);
    const destinationCredit =
      tokenBalance(tx.postTokens, destinationOwner, mint) -
      tokenBalance(tx.preTokens, destinationOwner, mint);
    const amountRaw = expected.get(mint);
    if (
      sourceDebit <= 0n ||
      destinationCredit <= 0n ||
      actual.instructionAmount !== sourceDebit ||
      destinationCredit > sourceDebit ||
      (amountRaw !== null && amountRaw !== undefined && sourceDebit !== BigInt(amountRaw))
    )
      continue;
    verified.push({ mint, rawAmount: destinationCredit, decimals: actual.decimals });
  }
  return verified;
}

const fixedQuantity = (raw: bigint, decimals: number): string => {
  if (decimals < 0 || decimals > 18) throw new Error(`Unsupported token decimals: ${decimals}`);
  if (decimals === 0) return `${raw}.${"0".repeat(18)}`;
  const digits = raw.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals);
  return `${whole}.${fraction.padEnd(18, "0")}`;
};

const displayQuantity = (raw: bigint, decimals: number): string => {
  const fixed = fixedQuantity(raw, decimals);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
};

const retryAt = (now: Date, attempts: number): Date =>
  new Date(
    now.getTime() + RETRY_SECONDS[Math.min(Math.max(attempts - 1, 0), RETRY_SECONDS.length - 1)]! * 1_000,
  );

async function defer(db: Db, row: ExitRow, now: Date): Promise<void> {
  const attempts = row.reconcileAttempts + 1;
  await db
    .update(basketActions)
    .set(
      attempts >= MAX_ATTEMPTS
        ? { reconcileAttempts: attempts, reconciliationState: "exhausted", resolvedAt: now }
        : { reconcileAttempts: attempts, reconcileAfter: retryAt(now, attempts) },
    )
    .where(eq(basketActions.id, row.id));
}

async function stop(db: Db, row: ExitRow, state: "failed" | "cancelled", now: Date): Promise<void> {
  await db
    .update(basketActions)
    .set({ reconciliationState: state, resolvedAt: now, reconcileAfter: null })
    .where(eq(basketActions.id, row.id));
}

async function signaturesSince(
  history: ChainHistory,
  address: string,
  baseline: string | null,
  from: number,
  through: number,
) {
  const found = [];
  let before: string | undefined;
  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
    const page = await history.signatures(address, {
      limit: PAGE,
      ...(baseline ? { until: baseline } : {}),
      ...(before ? { before } : {}),
    });
    for (const item of page) {
      if (!item.failed && item.blockTime !== null && item.blockTime >= from && item.blockTime <= through)
        found.push(item);
    }
    if (page.length < PAGE) break;
    const oldest = page[page.length - 1];
    if (!oldest || (oldest.blockTime !== null && oldest.blockTime < from)) break;
    before = oldest.signature;
  }
  return found.slice(0, MAX_TRANSACTIONS);
}

async function recordTransfer(
  db: Db,
  row: ExitRow,
  tx: TransactionDetail,
  transfer: VerifiedExitTransfer,
): Promise<boolean> {
  const expected = row.payload.expectedTransfers.find((item) => item.mint === transfer.mint);
  if (!expected) return false;
  const quantity = fixedQuantity(transfer.rawAmount, transfer.decimals);
  const isUsdc = row.payload.mode === "liquidate_usdc";
  const inserted = await db
    .insert(activities)
    .values({
      userId: row.userId,
      kind: isUsdc ? "liquidate_to_usdc" : "withdraw_in_kind",
      occurredAt: tx.blockTime === null ? new Date() : new Date(tx.blockTime * 1_000),
      title: isUsdc ? `Exited ${row.payload.templateName} to USDC` : `Received ${expected.symbol}`,
      subtitle: `${displayQuantity(transfer.rawAmount, transfer.decimals)} ${expected.symbol} from ${row.payload.templateName}`,
      amountUsd: isUsdc ? quantity : null,
      tokenQuantity: quantity,
      refTable: "basket_action",
      refId: row.id,
      txSignature: tx.signature,
      mint: transfer.mint,
      basketSlug: row.slug,
      basketPortfolioId: row.portfolioId,
    })
    .onConflictDoUpdate({
      target: [activities.userId, activities.txSignature, activities.mint],
      set: {
        kind: isUsdc ? "liquidate_to_usdc" : "withdraw_in_kind",
        occurredAt: tx.blockTime === null ? new Date() : new Date(tx.blockTime * 1_000),
        title: isUsdc ? `Exited ${row.payload.templateName} to USDC` : `Received ${expected.symbol}`,
        subtitle: `${displayQuantity(transfer.rawAmount, transfer.decimals)} ${expected.symbol} from ${row.payload.templateName}`,
        amountUsd: isUsdc ? quantity : null,
        tokenQuantity: quantity,
        refTable: "basket_action",
        refId: row.id,
        basketSlug: row.slug,
        basketPortfolioId: row.portfolioId,
      },
      setWhere: sql`${activities.kind} = 'transfer_in' OR (${activities.refTable} = 'basket_action' AND ${activities.refId} = ${row.id})`,
    })
    .returning({ id: activities.id });
  return inserted.length === 1;
}

const parsedRows = (rows: readonly (typeof basketActions.$inferSelect)[]): ExitRow[] =>
  rows.flatMap((row) => {
    const parsed = payloadSchema.safeParse(row.payload);
    return parsed.success && row.portfolioId && row.nonce && row.operationId
      ? [
          {
            ...row,
            portfolioId: row.portfolioId,
            nonce: row.nonce,
            operationId: row.operationId,
            payload: parsed.data,
          },
        ]
      : [];
  });

async function allExpectedRecorded(db: Db, row: ExitRow): Promise<boolean> {
  const recorded = await db
    .select({ mint: activities.mint })
    .from(activities)
    .where(and(eq(activities.refTable, "basket_action"), eq(activities.refId, row.id)));
  const mints = new Set(recorded.flatMap((item) => (item.mint ? [item.mint] : [])));
  return row.payload.expectedTransfers.every((item) => mints.has(item.mint));
}

async function markSettled(db: Db, row: ExitRow, now: Date): Promise<void> {
  await db
    .update(basketActions)
    .set({ reconciliationState: "settled", resolvedAt: now, reconcileAfter: null })
    .where(eq(basketActions.id, row.id));
}

interface ExitReconcileDeps {
  readonly history: ChainHistory;
  operation(portfolioId: string, operationId: string): Promise<ManagedBasketOperation>;
}

type ExitState = "pending" | "settled" | "stopped";
interface ExitProgress {
  recorded: number;
}

async function recordCandidates(
  db: Db,
  history: ChainHistory,
  row: ExitRow,
  unresolved: readonly ExitRow[],
  signatures: readonly string[],
  progress: ExitProgress,
): Promise<void> {
  for (const signature of [...new Set(signatures)].slice(0, MAX_TRANSACTIONS)) {
    const tx = await history.transaction(signature);
    if (!tx) continue;
    for (const transfer of verifiedExitTransfers(tx, row.payload)) {
      const contenders = unresolved.filter(
        (other) =>
          other.userId === row.userId &&
          other.createdAt.getTime() <= (tx.blockTime ?? 0) * 1_000 + 60_000 &&
          verifiedExitTransfers(tx, other.payload).some((item) => item.mint === transfer.mint),
      );
      if (contenders.length !== 1 || contenders[0]!.id !== row.id) continue;
      if (await recordTransfer(db, row, tx, transfer)) progress.recorded += 1;
    }
  }
}

async function recentIncomingSignatures(
  db: Db,
  row: ExitRow,
  from: number,
  through: number,
): Promise<string[]> {
  const existing = await db
    .select({ signature: activities.txSignature })
    .from(activities)
    .where(
      and(
        eq(activities.userId, row.userId),
        eq(activities.kind, "transfer_in"),
        inArray(
          activities.mint,
          row.payload.expectedTransfers.map((item) => item.mint),
        ),
        gte(activities.occurredAt, new Date(from * 1_000)),
        lte(activities.occurredAt, new Date(through * 1_000)),
        isNotNull(activities.txSignature),
      ),
    )
    .limit(MAX_TRANSACTIONS);
  return existing.flatMap((item) => (item.signature ? [item.signature] : []));
}

async function reconcileExit(
  db: Db,
  deps: ExitReconcileDeps,
  row: ExitRow,
  unresolved: readonly ExitRow[],
  now: Date,
  progress: ExitProgress,
): Promise<ExitState> {
  const operation = await deps.operation(row.portfolioId, row.operationId);
  if (operation.operationId !== row.operationId || operation.portfolioId !== row.portfolioId) {
    await defer(db, row, now);
    return "pending";
  }
  if (operation.state === "failed" || operation.state === "cancelled") {
    await stop(db, row, operation.state, now);
    return "stopped";
  }
  if (operation.state !== "completed") {
    await defer(db, row, now);
    return "pending";
  }
  if (await allExpectedRecorded(db, row)) {
    await markSettled(db, row, now);
    return "settled";
  }

  const from = Math.floor(row.createdAt.getTime() / 1_000) - 60;
  const finished = operation.finishedAt ? Date.parse(operation.finishedAt) : now.getTime();
  const through = Math.floor((Number.isFinite(finished) ? finished : now.getTime()) / 1_000) + 60;
  // USDC normally already exists as Added cash. Check it before scanning the smart account.
  if (row.payload.mode === "liquidate_usdc") {
    const existing = await recentIncomingSignatures(db, row, from, through);
    await recordCandidates(db, deps.history, row, unresolved, existing, progress);
    if (await allExpectedRecorded(db, row)) {
      await markSettled(db, row, now);
      return "settled";
    }
  }

  const refs = await signaturesSince(
    deps.history,
    addressOf(row.payload.smartAccountId),
    row.payload.baselineSignature,
    from,
    through,
  );
  await recordCandidates(
    db,
    deps.history,
    row,
    unresolved,
    refs.map((item) => item.signature),
    progress,
  );

  if (await allExpectedRecorded(db, row)) {
    await markSettled(db, row, now);
    return "settled";
  }
  await defer(db, row, now);
  return "pending";
}

export interface ExitReconcileSummary {
  readonly checked: number;
  readonly recorded: number;
  readonly settled: number;
  readonly stopped: number;
  readonly failed: number;
}

/** Reconcile only durable, unresolved exits; every chain scan is finite and baseline-bound. */
export async function reconcileBasketExits(
  db: Db,
  deps: ExitReconcileDeps,
  now = new Date(),
): Promise<ExitReconcileSummary> {
  const unresolvedWhere = and(
    eq(basketActions.reconciliationState, "pending"),
    isNotNull(basketActions.operationId),
  );
  const unresolved = parsedRows(
    await db.select().from(basketActions).where(unresolvedWhere).orderBy(asc(basketActions.createdAt)),
  );
  const due = parsedRows(
    await db
      .select()
      .from(basketActions)
      .where(
        and(
          unresolvedWhere,
          or(isNull(basketActions.reconcileAfter), lte(basketActions.reconcileAfter, now)),
        ),
      )
      .orderBy(asc(basketActions.createdAt))
      .limit(100),
  );
  let settled = 0;
  let recorded = 0;
  let stopped = 0;
  let failed = 0;

  for (const row of due) {
    const progress: ExitProgress = { recorded: 0 };
    try {
      const state = await reconcileExit(db, deps, row, unresolved, now, progress);
      if (state === "settled") settled += 1;
      if (state === "stopped") stopped += 1;
    } catch (error) {
      failed += 1;
      console.error(`basket-exit reconciliation failed for action ${row.id}`, error);
      await defer(db, row, now).catch(() => undefined);
    } finally {
      recorded += progress.recorded;
    }
  }

  return { checked: due.length, recorded, settled, stopped, failed };
}
