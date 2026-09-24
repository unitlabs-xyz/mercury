import { D, Decimal, ZERO, type LotSource } from "@mercury/core";

/** One wrapper the user holds or has held, with everything needed to judge it. */
export interface HeldToken {
  readonly tokenId: string;
  readonly instrumentId: string;
  readonly mint: string;
  readonly symbol: string;
  readonly ticker: string;
  readonly decimals: number;
  /** The multiplier in force now. One token is this many shares. */
  readonly multiplier: Decimal;
  /** What one real share costs. Null when no upstream would price it. */
  readonly referencePricePerShare: Decimal | null;
  /** What the chain says, in the mint's smallest unit. */
  readonly chainRawAmount: bigint;
  /** The sum of our lots' token quantities. */
  readonly recordedRawAmount: bigint;
  /** The sum of our lots' share counts. */
  readonly recordedShares: Decimal;
  /** The sum of our lots' shares x unit cost. */
  readonly recordedCostUsd: Decimal;
}

export interface LotWrite {
  readonly tokenId: string;
  readonly instrumentId: string;
  readonly tokenQty: bigint;
  readonly shares: Decimal;
  readonly unitCostUsd: Decimal;
  readonly source: LotSource;
  readonly isEstimated: boolean;
  readonly acquiredAt: Date;
}

export interface ActivityWrite {
  readonly kind: "transfer_in" | "dividend";
  readonly title: string;
  readonly subtitle: string;
  readonly amountUsd: Decimal | null;
  readonly refTable: "token";
  readonly refId: string;
  readonly occurredAt: Date;
}

export interface PositionWrite {
  readonly instrumentId: string;
  readonly shares: Decimal;
  readonly costBasisUsd: Decimal;
  readonly avgUnitCostUsd: Decimal;
}

export interface Reconciliation {
  readonly lots: readonly LotWrite[];
  readonly activity: readonly ActivityWrite[];
  readonly positions: readonly PositionWrite[];
}

/** Smallest units to whole tokens. Exact: a Decimal divide, never a float. */
const scaled = (raw: bigint, decimals: number): Decimal => D(raw.toString()).div(D(10).pow(decimals));

/** Trims trailing zeros so "1 share" does not read as "1.000000000000000000 shares". */
const plural = (shares: Decimal): string => {
  const n = shares
    .toDecimalPlaces(6)
    .toFixed()
    .replace(/\.?0+$/, "");
  return `${n} ${shares.eq(1) ? "share" : "shares"}`;
};

/**
 * What the chain says, reconciled against what we recorded.
 *
 * Pure. No database, no clock, no network — the same reason `@mercury/core` is
 * pure, and for the same payoff: every rule here is a millisecond to test, and
 * this is the code where a mistake costs money rather than a pixel.
 *
 * Idempotent by construction. Everything it writes closes the gap it was written
 * for, so a second pass over the result of the first writes nothing.
 */
export function planReconciliation(held: readonly HeldToken[], now: Date): Reconciliation {
  const lots: LotWrite[] = [];
  const activity: ActivityWrite[] = [];
  const byInstrument = new Map<string, { shares: Decimal; cost: Decimal }>();

  for (const token of held) {
    const expectedShares = scaled(token.chainRawAmount, token.decimals).mul(token.multiplier);
    let shares = token.recordedShares;
    let cost = token.recordedCostUsd;

    const reference = token.referencePricePerShare;
    if (reference !== null) {
      // 1. Tokens arrived that we never sold. We cannot know what they cost, so
      //    the lot is priced at today's reference and flagged as an estimate.
      const surplus = token.chainRawAmount - token.recordedRawAmount;
      if (surplus > 0n) {
        const gained = scaled(surplus, token.decimals).mul(token.multiplier);
        lots.push({
          tokenId: token.tokenId,
          instrumentId: token.instrumentId,
          tokenQty: surplus,
          shares: gained,
          unitCostUsd: reference,
          source: "transfer_in",
          isEstimated: true,
          acquiredAt: now,
        });
        activity.push({
          kind: "transfer_in",
          title: `Received ${token.symbol}`,
          subtitle: `${plural(gained)}, cost estimated at today's price`,
          amountUsd: gained.mul(reference),
          refTable: "token",
          refId: token.tokenId,
          occurredAt: now,
        });
        shares = shares.add(gained);
        cost = cost.add(gained.mul(reference));
      }

      // 2. More shares than our lots account for, with no new tokens to explain
      //    them: the multiplier rose, which is a dividend. Zero cost, so the
      //    average cost per share falls. That is correct — the same money now
      //    buys more shares — and it is the figure other integrations get wrong.
      const shortfall = expectedShares.sub(shares);
      if (shortfall.gt(ZERO)) {
        lots.push({
          tokenId: token.tokenId,
          instrumentId: token.instrumentId,
          tokenQty: 0n,
          shares: shortfall,
          unitCostUsd: ZERO,
          source: "dividend",
          isEstimated: false,
          acquiredAt: now,
        });
        activity.push({
          kind: "dividend",
          title: `${token.ticker} paid a dividend`,
          subtitle: `${plural(shortfall)} added, at no cost`,
          amountUsd: shortfall.mul(reference),
          refTable: "token",
          refId: token.tokenId,
          occurredAt: now,
        });
        shares = shares.add(shortfall);
      }
    }

    // 3. Tokens left the wallet, or we could not price an arrival. Either way the
    //    position takes the smaller of the two truths: never more shares than the
    //    chain holds, and never more than we have a cost for. Cost scales with it,
    //    which leaves the average untouched — that is average-cost accounting.
    const target = Decimal.min(shares, expectedShares);
    const ratio = shares.isZero() ? ZERO : target.div(shares);

    const running = byInstrument.get(token.instrumentId) ?? { shares: ZERO, cost: ZERO };
    byInstrument.set(token.instrumentId, {
      shares: running.shares.add(target),
      cost: running.cost.add(cost.mul(ratio)),
    });
  }

  const positions: PositionWrite[] = [...byInstrument.entries()].map(([instrumentId, r]) => ({
    instrumentId,
    shares: r.shares,
    costBasisUsd: r.cost,
    avgUnitCostUsd: r.shares.isZero() ? ZERO : r.cost.div(r.shares),
  }));

  return { lots, activity, positions };
}
