import { and, eq } from "drizzle-orm";
import {
  D,
  EMPTY_OPEN,
  replayPosition,
  type Decimal,
  type Movement,
  type OpenPosition,
  ZERO,
} from "@mercury/core";
import { movementsByToken } from "../portfolio/open.js";
import type { Db } from "../db/client.js";
import { disposals, lots, type HistoryEvent } from "../db/schema.js";
import { dollarCost, multiplierAt, type MultiplierStep, type PlannedLot } from "./cost-plan.js";
import type { CostDeps } from "./cost.js";
import { arrivalCost, pricer, scaled, type Stock } from "./cost-price.js";

/** One write of a later costing, in the order it happened. */
export type LaterStep =
  | { readonly type: "lot"; readonly lot: PlannedLot }
  | {
      readonly type: "out";
      readonly event: HistoryEvent;
      readonly shares: Decimal;
      readonly realisedUsd: Decimal | null;
    }
  | { readonly type: "move"; readonly event: HistoryEvent };

/**
 * A later costing of one stock: its new arrivals priced as lots, and its
 * departures as departures, each in the order it happened, so a sale takes
 * out what was held before a buy that came after it. Position-sync can't do
 * this for a linked wallet: a sale and a buy back between two of its looks
 * read as nothing having happened, and the shares sold would then leave later,
 * at the average of the old and the new.
 *
 * A sale swapped for dollars realises what it was swapped for, less the
 * average cost of the shares just before it. A send to the Mercury wallet is
 * a move, carried there with its cost (`toMercury`); a pledge is nothing.
 */
export async function laterCosting(
  deps: CostDeps,
  prices: ReturnType<typeof pricer>,
  own: ReadonlyMap<string, string>,
  walletId: string,
  stock: Stock & { readonly instrumentId: string },
  events: readonly HistoryEvent[],
  steps: readonly MultiplierStep[],
  current: Decimal,
  at: (e: HistoryEvent) => Date,
  toMercury: (e: HistoryEvent) => boolean,
  fromOwnBasket: (e: HistoryEvent) => boolean,
): Promise<{ readonly sequence: readonly LaterStep[]; readonly lots: readonly PlannedLot[] }> {
  const sequence: LaterStep[] = [];
  const arrived: PlannedLot[] = [];
  let held = await heldNow(deps.db, walletId, stock.tokenId);

  for (const e of events) {
    if (e.amountRaw === null || e.amountRaw <= 0n || fromOwnBasket(e)) continue;
    const multiplier = multiplierAt(at(e), steps, current);
    const shares = scaled(e.amountRaw, stock.decimals).mul(multiplier);
    if (e.kind === "in") {
      const cost = await arrivalCost(deps, prices, own, stock, e, shares, at(e));
      const lot: PlannedLot = {
        tokenQty: e.amountRaw,
        shares,
        unitCostUsd: cost.unitCostUsd,
        referencePriceUsd: cost.referencePriceUsd,
        estimateSource: cost.estimateSource,
        acquiredAt: at(e),
        multiplier,
      };
      sequence.push({ type: "lot", lot });
      arrived.push(lot);
      held = replayPosition([
        ...asMovements(held),
        {
          kind: "in",
          tokenQty: lot.tokenQty,
          shares,
          costUsd: shares.mul(lot.unitCostUsd),
          referenceUsd: shares.mul(lot.referencePriceUsd ?? lot.unitCostUsd),
          feeUsd: ZERO,
          acquiredAt: lot.acquiredAt,
          isEstimated: lot.estimateSource !== null,
        },
      ]);
      continue;
    }
    if (e.kind !== "out") continue; // a pledge or a withdrawal: the shares stayed the person's
    if (toMercury(e)) {
      // A move to the Mercury wallet, carried there in its place in the sequence.
      sequence.push({ type: "move", event: e });
      held = replayPosition([...asMovements(held), { kind: "out", tokenQty: e.amountRaw }]);
      continue;
    }
    // Swapped for dollars: what they fetched, less their share of what was held, at average cost.
    const proceeds = dollarCost(e.counterMint, e.counterAmountRaw, D(1));
    const realisedUsd =
      proceeds === null || held.tokenQty <= 0n || e.amountRaw > held.tokenQty
        ? null
        : proceeds.sub(held.costUsd.mul(D(e.amountRaw.toString())).div(D(held.tokenQty.toString())));
    sequence.push({ type: "out", event: e, shares, realisedUsd });
    held = replayPosition([...asMovements(held), { kind: "out", tokenQty: e.amountRaw }]);
  }
  return { sequence, lots: arrived };
}

/** An open position as the one movement that would make it, to replay more onto. */
export const asMovements = (open: OpenPosition): Movement[] =>
  open.tokenQty === 0n
    ? []
    : [
        {
          kind: "in",
          tokenQty: open.tokenQty,
          shares: open.shares,
          costUsd: open.costUsd,
          referenceUsd: open.referenceUsd,
          feeUsd: open.feeUsd,
          acquiredAt: open.heldSince ?? new Date(0),
          isEstimated: open.isEstimated,
        },
      ];

/** What the wallet's records hold of a token now: every lot and departure, in the order recorded. */
export async function heldNow(db: Db, walletId: string, tokenId: string): Promise<OpenPosition> {
  const [lotRows, disposalRows] = await Promise.all([
    db
      .select()
      .from(lots)
      .where(and(eq(lots.walletId, walletId), eq(lots.tokenId, tokenId))),
    db
      .select()
      .from(disposals)
      .where(and(eq(disposals.walletId, walletId), eq(disposals.tokenId, tokenId))),
  ]);
  const moves = movementsByToken(
    lotRows.map((l) => ({ ...l, recordedAtUs: l.recordedAt.getTime() * 1000 })),
    disposalRows.map((d) => ({ ...d, recordedAtUs: d.recordedAt.getTime() * 1000 })),
  ).get(tokenId);
  return moves === undefined ? EMPTY_OPEN : replayPosition(moves);
}
