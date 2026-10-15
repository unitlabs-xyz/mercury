import { and, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import { BasketTag } from "@mercury/types";
import catalogJson from "../../../catalog.json" with { type: "json" };
import type { BasketStore } from "../core/deps.js";
import type { CuratedBasket } from "../core/primitives.js";
import type {
  EnrollmentChallenge,
  EnrollmentIntent,
  ExitIntent,
  ExitIntentPayload,
} from "../core/primitives.js";
import type { Db } from "../../db/client.js";
import { activities, basketAccounts, basketActions, wallets } from "../../db/schema.js";

const SOLANA = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const LOCK_KEY = 4_919_208;
const schedule = z.object({ type: z.literal("interval"), frequency: z.literal("daily") });
const allocation = z.object({
  ticker: z.string().min(1),
  sourceAssetId: z.string().min(1),
  weightBps: z.number().int().min(1).max(10_000),
});
const tags = z
  .array(BasketTag)
  .refine(
    (values) =>
      new Set(values).size === values.length &&
      values.filter((tag) => tag.startsWith("theme:") || tag === "shelf:pros").length === 1,
    "Each strategy needs exactly one primary theme or pros tag and no duplicates",
  );
const strategy = z.object({
  slug: z.string().min(1),
  tags,
  name: z.string().min(1),
  description: z.string().min(1),
  sourceStrategyId: z.string().min(1),
  gliderStrategyId: z.string().min(1).optional(),
  schedule,
  allocations: z.array(allocation).min(1),
});
const schema = z.object({
  version: z.literal(1),
  mints: z.record(z.string().min(1)),
  strategies: z.array(strategy),
});

/** The checked-in catalog is read-only at runtime; this adapter also guards first-start sync. */
export class JsonBasketStore implements BasketStore {
  constructor(
    private readonly databaseUrl: string,
    private readonly source: unknown = catalogJson,
    private readonly appDb?: Db,
  ) {}

  private actionsDb(): Db {
    if (!this.appDb) throw new Error("Basket action store is not configured");
    return this.appDb;
  }

  async saveEnrollmentIntent(intent: Omit<EnrollmentIntent, "id" | "portfolioId">): Promise<string> {
    const [saved] = await this.actionsDb()
      .insert(basketActions)
      .values({
        userId: intent.userId,
        slug: intent.slug,
        kind: "enroll",
        ownerAccountId: intent.ownerAccountId,
        strategyId: intent.strategyId,
        payload: intent.challenge,
        expiresAt: intent.expiresAt,
      })
      .returning({ id: basketActions.id });
    if (!saved) throw new Error("Could not save enrollment authorization");
    return saved.id;
  }

  async enrollmentIntent(id: string): Promise<EnrollmentIntent | null> {
    const row = await this.actionsDb().query.basketActions.findFirst({ where: eq(basketActions.id, id) });
    if (!row || row.kind !== "enroll") return null;
    return {
      id: row.id,
      userId: row.userId,
      slug: row.slug,
      ownerAccountId: row.ownerAccountId,
      strategyId: row.strategyId,
      challenge: row.payload as EnrollmentChallenge,
      expiresAt: row.expiresAt!,
      portfolioId: row.portfolioId,
    };
  }

  async completeEnrollmentIntent(id: string, portfolioId: string): Promise<void> {
    await this.actionsDb().update(basketActions).set({ portfolioId }).where(eq(basketActions.id, id));
  }

  async saveRebalance(action: {
    userId: string;
    slug: string;
    ownerAccountId: string;
    strategyId: string;
    portfolioId: string;
    operationId: string;
    submittedAt: string;
  }): Promise<void> {
    await this.actionsDb()
      .insert(basketActions)
      .values({
        userId: action.userId,
        slug: action.slug,
        kind: "rebalance",
        ownerAccountId: action.ownerAccountId,
        strategyId: action.strategyId,
        portfolioId: action.portfolioId,
        operationId: action.operationId,
        payload: { submittedAt: action.submittedAt },
      })
      .onConflictDoNothing({ target: [basketActions.userId, basketActions.operationId] });
  }

  private toExitIntent(row: typeof basketActions.$inferSelect): ExitIntent | null {
    if (
      (row.kind !== "withdraw_in_kind" && row.kind !== "liquidate_to_usdc") ||
      !row.portfolioId ||
      !row.nonce
    )
      return null;
    return {
      id: row.id,
      userId: row.userId,
      slug: row.slug,
      ownerAccountId: row.ownerAccountId,
      strategyId: row.strategyId,
      portfolioId: row.portfolioId,
      nonce: row.nonce,
      payload: row.payload as ExitIntentPayload,
      operationId: row.operationId,
      submittedAt: row.submittedAt,
      createdAt: row.createdAt,
    };
  }

  async exitIntent(userId: string, nonce: string): Promise<ExitIntent | null> {
    const row = await this.actionsDb().query.basketActions.findFirst({
      where: and(eq(basketActions.userId, userId), eq(basketActions.nonce, nonce)),
    });
    return row ? this.toExitIntent(row) : null;
  }

  async saveExitIntent(action: {
    userId: string;
    slug: string;
    ownerAccountId: string;
    strategyId: string;
    portfolioId: string;
    nonce: string;
    expiresAt: Date;
    payload: ExitIntentPayload;
  }): Promise<ExitIntent> {
    const saved = await this.actionsDb()
      .insert(basketActions)
      .values({
        userId: action.userId,
        slug: action.slug,
        kind: action.payload.mode === "in_kind" ? "withdraw_in_kind" : "liquidate_to_usdc",
        ownerAccountId: action.ownerAccountId,
        strategyId: action.strategyId,
        portfolioId: action.portfolioId,
        nonce: action.nonce,
        payload: action.payload,
        expiresAt: action.expiresAt,
        reconciliationState: "pending",
      })
      .onConflictDoNothing({ target: basketActions.nonce })
      .returning();
    const row =
      saved[0] ??
      (await this.actionsDb().query.basketActions.findFirst({
        where: eq(basketActions.nonce, action.nonce),
      }));
    const intent = row ? this.toExitIntent(row) : null;
    if (!intent) throw new Error("Could not save basket exit authorization");
    return intent;
  }

  async attachExitOperation(id: string, operationId: string, submittedAt: Date): Promise<void> {
    await this.actionsDb()
      .update(basketActions)
      .set({ operationId, submittedAt, reconcileAfter: new Date() })
      .where(
        and(
          eq(basketActions.id, id),
          or(isNull(basketActions.operationId), eq(basketActions.operationId, operationId)),
        ),
      );
    const row = await this.actionsDb().query.basketActions.findFirst({ where: eq(basketActions.id, id) });
    if (row?.operationId !== operationId) throw new Error("Basket exit operation conflicts with its intent");
  }

  async recentActions(userId: string, portfolioId: string) {
    return this.actionsDb()
      .select({
        id: basketActions.id,
        kind: basketActions.kind,
        createdAt: basketActions.createdAt,
        operationId: basketActions.operationId,
      })
      .from(basketActions)
      .where(
        and(
          eq(basketActions.userId, userId),
          eq(basketActions.portfolioId, portfolioId),
          or(eq(basketActions.kind, "enroll"), isNotNull(basketActions.operationId)),
        ),
      )
      .orderBy(desc(basketActions.createdAt))
      .limit(20);
  }

  async completedEnrollments(userId: string, ownerAccountId: string) {
    const rows = await this.actionsDb()
      .select({
        portfolioId: basketActions.portfolioId,
        strategyId: basketActions.strategyId,
        createdAt: basketActions.createdAt,
      })
      .from(basketActions)
      .where(
        and(
          eq(basketActions.userId, userId),
          eq(basketActions.ownerAccountId, ownerAccountId),
          eq(basketActions.kind, "enroll"),
          isNotNull(basketActions.portfolioId),
        ),
      )
      .orderBy(desc(basketActions.createdAt));
    return rows.flatMap((row) =>
      row.portfolioId === null ? [] : [{ ...row, portfolioId: row.portfolioId }],
    );
  }

  async confirmFunding(input: {
    userId: string;
    slug: string;
    portfolioId: string;
    title: string;
    signature: string;
    mint: string;
    amountRaw: bigint;
    occurredAt: Date;
  }): Promise<void> {
    const amountUsd = `${input.amountRaw / 1_000_000n}.${String(input.amountRaw % 1_000_000n).padStart(6, "0")}`;
    const saved = await this.actionsDb()
      .insert(activities)
      .values({
        userId: input.userId,
        kind: "basket_funding",
        occurredAt: input.occurredAt,
        title: input.title,
        subtitle: "Transfer to your Glider smart account",
        amountUsd,
        txSignature: input.signature,
        mint: input.mint,
        basketSlug: input.slug,
        basketPortfolioId: input.portfolioId,
      })
      .onConflictDoUpdate({
        target: [activities.userId, activities.txSignature, activities.mint],
        set: {
          kind: "basket_funding",
          occurredAt: input.occurredAt,
          title: input.title,
          subtitle: "Transfer to your Glider smart account",
          amountUsd,
          basketSlug: input.slug,
          basketPortfolioId: input.portfolioId,
        },
        setWhere: sql`${activities.kind} = 'transfer_out' OR (${activities.kind} = 'basket_funding' AND ${activities.basketPortfolioId} = ${input.portfolioId})`,
      })
      .returning({ id: activities.id });
    if (saved.length === 0) throw new Error("Funding signature belongs to another activity");
  }

  /**
   * The smart account this owner's basket money moves through.
   *
   * Keyed by user and address, so re-resolving the same account is a no-op and
   * a second portfolio through the same account cannot displace the first.
   * Silent when the owner has no wallet row: nothing here is worth failing a
   * funding preparation over.
   */
  async rememberBasketAccount(input: {
    ownerAccountId: string;
    portfolioId: string;
    address: string;
  }): Promise<void> {
    const owner = input.ownerAccountId.slice(input.ownerAccountId.lastIndexOf(":") + 1);
    const [wallet] = await this.actionsDb()
      .select({ userId: wallets.userId })
      .from(wallets)
      .where(eq(wallets.address, owner))
      .limit(1);
    if (wallet === undefined) return;
    await this.actionsDb()
      .insert(basketAccounts)
      .values({ userId: wallet.userId, address: input.address, portfolioId: input.portfolioId })
      .onConflictDoNothing();
  }

  async recentFunding(userId: string, portfolioId: string) {
    return this.actionsDb()
      .select({
        id: activities.id,
        occurredAt: activities.occurredAt,
        title: activities.title,
        amountUsd: activities.amountUsd,
        txSignature: activities.txSignature,
      })
      .from(activities)
      .where(
        and(
          eq(activities.userId, userId),
          eq(activities.basketPortfolioId, portfolioId),
          eq(activities.kind, "basket_funding"),
        ),
      )
      .orderBy(desc(activities.occurredAt))
      .limit(20);
  }

  async recentSettlements(userId: string, portfolioId: string) {
    return this.actionsDb()
      .select({
        id: activities.id,
        kind: activities.kind,
        occurredAt: activities.occurredAt,
        title: activities.title,
        subtitle: activities.subtitle,
        amountUsd: activities.amountUsd,
        tokenQuantity: activities.tokenQuantity,
        txSignature: activities.txSignature,
      })
      .from(activities)
      .where(
        and(
          eq(activities.userId, userId),
          eq(activities.basketPortfolioId, portfolioId),
          sql`${activities.kind} IN ('withdraw_in_kind', 'liquidate_to_usdc')`,
        ),
      )
      .orderBy(desc(activities.occurredAt))
      .limit(40);
  }

  async load(): Promise<readonly CuratedBasket[]> {
    const catalog = schema.parse(this.source);
    const slugs = new Set<string>();
    const sourceIds = new Set<string>();
    const providerIds = new Set<string>();
    return catalog.strategies.map((entry) => {
      if (slugs.has(entry.slug)) throw new Error(`duplicate strategy slug: ${entry.slug}`);
      if (sourceIds.has(entry.sourceStrategyId))
        throw new Error(`duplicate source strategy: ${entry.sourceStrategyId}`);
      slugs.add(entry.slug);
      sourceIds.add(entry.sourceStrategyId);
      if (entry.gliderStrategyId !== undefined) {
        if (providerIds.has(entry.gliderStrategyId))
          throw new Error(`duplicate Glider strategy ID: ${entry.gliderStrategyId}`);
        providerIds.add(entry.gliderStrategyId);
      }

      const mints = new Set<string>();
      let totalBps = 0;
      const assets = entry.allocations.map(({ ticker, weightBps }) => {
        const mint = catalog.mints[ticker];
        if (mint === undefined) throw new Error(`${entry.slug}: no Solana mint for ${ticker}`);
        if (mints.has(mint)) throw new Error(`${entry.slug}: duplicate Solana asset ${ticker}`);
        mints.add(mint);
        totalBps += weightBps;
        return { ticker, assetId: `${SOLANA}/spl:${mint}`, weightBps };
      });
      if (totalBps !== 10_000)
        throw new Error(`${entry.slug}: weights must total 10,000 bps, got ${totalBps}`);
      return {
        slug: entry.slug,
        tags: entry.tags,
        providerId: entry.gliderStrategyId ?? null,
        name: entry.name,
        description: entry.description,
        sourceStrategyId: entry.sourceStrategyId,
        assets,
        schedule: entry.schedule,
      };
    });
  }

  async withSyncLock<T>(work: () => Promise<T>): Promise<T> {
    const client = postgres(this.databaseUrl, { max: 1 });
    const db = drizzle(client);
    try {
      await db.execute(sql`select pg_advisory_lock(${LOCK_KEY})`);
      try {
        return await work();
      } finally {
        await db.execute(sql`select pg_advisory_unlock(${LOCK_KEY})`);
      }
    } finally {
      await client.end();
    }
  }
}
