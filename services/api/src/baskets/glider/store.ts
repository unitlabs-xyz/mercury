import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import { ManagedBasketTag } from "@mercury/types";
import catalogJson from "../../../catalog.json" with { type: "json" };
import type { BasketStore } from "../core/deps.js";
import type { BasketTemplate } from "../core/primitives.js";
import type { EnrollmentChallenge, EnrollmentIntent } from "../core/primitives.js";
import type { Db } from "../../db/client.js";
import { basketActions } from "../../db/schema.js";

const SOLANA = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const LOCK_KEY = 4_919_208;
const schedule = z.object({ type: z.literal("interval"), frequency: z.literal("daily") });
const allocation = z.object({
  ticker: z.string().min(1),
  sourceAssetId: z.string().min(1),
  weightBps: z.number().int().min(1).max(10_000),
});
const tags = z
  .array(ManagedBasketTag)
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
  status: z.enum(["candidate", "disabled", "enabled"]),
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
    const [saved] = await this.actionsDb().insert(basketActions).values({
      userId: intent.userId, slug: intent.slug, kind: "enroll", ownerAccountId: intent.ownerAccountId,
      strategyId: intent.strategyId, payload: intent.challenge, expiresAt: intent.expiresAt,
    }).returning({ id: basketActions.id });
    if (!saved) throw new Error("Could not save enrollment authorization");
    return saved.id;
  }

  async enrollmentIntent(id: string): Promise<EnrollmentIntent | null> {
    const row = await this.actionsDb().query.basketActions.findFirst({ where: eq(basketActions.id, id) });
    if (!row || row.kind !== "enroll") return null;
    return {
      id: row.id, userId: row.userId, slug: row.slug, ownerAccountId: row.ownerAccountId,
      strategyId: row.strategyId, challenge: row.payload as EnrollmentChallenge,
      expiresAt: row.expiresAt, portfolioId: row.portfolioId,
    };
  }

  async completeEnrollmentIntent(id: string, portfolioId: string): Promise<void> {
    await this.actionsDb().update(basketActions).set({ portfolioId }).where(eq(basketActions.id, id));
  }

  async load(): Promise<readonly BasketTemplate[]> {
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
        ...(entry.gliderStrategyId === undefined ? {} : { providerId: entry.gliderStrategyId }),
        name: entry.name,
        description: entry.description,
        sourceStrategyId: entry.sourceStrategyId,
        status: entry.status,
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
