import { sql } from "drizzle-orm";
import type { CatalogueSource } from "@mercury/chain";
import type { PriceBoard } from "@mercury/market";
import type { Db } from "../db/client.js";
import { instruments, multiplierEvents, tokens } from "../db/schema.js";
import { planCatalogue } from "./plan.js";

export interface CatalogueDeps {
  readonly catalogue: CatalogueSource;
  readonly prices: PriceBoard;
}

export interface CatalogueSummary {
  readonly instruments: number;
  readonly tokens: number;
  readonly events: number;
}

/**
 * Reads the live universe and writes it down. Everything that decides *what* to
 * write is in `planCatalogue`; this only reads, calls and writes.
 *
 * Upserts throughout, keyed on the natural keys — a ticker and a mint — so
 * running it twice changes nothing the second time. The worker takes this over
 * in subsystem 4; until then the API calls it on boot.
 */
export async function syncCatalogue(db: Db, deps: CatalogueDeps): Promise<CatalogueSummary> {
  const live = await deps.catalogue.instruments();
  const mints = live.flatMap((i) => i.wrappers.map((w) => w.mint));
  const [prices, stored] = await Promise.all([
    deps.prices.pricesFor(mints),
    db.select({ mint: tokens.mint, multiplier: tokens.multiplier }).from(tokens),
  ]);

  const plan = planCatalogue({ live, prices, stored, now: new Date() });
  if (plan.instruments.length === 0) return { instruments: 0, tokens: 0, events: 0 };

  const instrumentIds = new Map<string, string>();
  for (const row of plan.instruments) {
    const [saved] = await db
      .insert(instruments)
      .values({ ...row, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: instruments.ticker,
        set: {
          name: row.name,
          sector: row.sector,
          description: row.description,
          logoUrl: row.logoUrl,
          isTradable: row.isTradable,
          updatedAt: new Date(),
        },
      })
      .returning({ id: instruments.id });
    if (saved !== undefined) instrumentIds.set(row.ticker, saved.id);
  }

  const tokenIds = new Map<string, string>();
  for (const row of plan.tokens) {
    const instrumentId = instrumentIds.get(row.ticker);
    if (instrumentId === undefined) continue;
    const [saved] = await db
      .insert(tokens)
      .values({
        instrumentId,
        mint: row.mint,
        issuer: row.issuer,
        symbol: row.symbol,
        decimals: row.decimals,
        multiplier: row.multiplier,
        multiplierUpdatedAt: new Date(),
        isRoutable: row.isRoutable,
      })
      .onConflictDoUpdate({
        target: tokens.mint,
        set: {
          symbol: row.symbol,
          decimals: row.decimals,
          multiplier: row.multiplier,
          // Only stamped when the value actually moved, so the column keeps
          // meaning "when this last changed" rather than "when we last looked".
          multiplierUpdatedAt: sql`case when ${tokens.multiplier} <> ${row.multiplier}
                                        then now() else ${tokens.multiplierUpdatedAt} end`,
          isRoutable: row.isRoutable,
        },
      })
      .returning({ id: tokens.id });
    if (saved !== undefined) tokenIds.set(row.mint, saved.id);
  }

  for (const event of plan.events) {
    const tokenId = tokenIds.get(event.mint);
    if (tokenId === undefined) continue;
    await db.insert(multiplierEvents).values({
      tokenId,
      oldMultiplier: event.oldMultiplier,
      newMultiplier: event.newMultiplier,
      kind: event.kind,
      observedAt: event.observedAt,
    });
  }

  return { instruments: plan.instruments.length, tokens: plan.tokens.length, events: plan.events.length };
}
