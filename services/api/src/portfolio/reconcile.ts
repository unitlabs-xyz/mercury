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
  /** The sum of our lots' shares x unit cost. Fees are not in it. */
  readonly recordedCostUsd: Decimal;
  /**
   * The sum of our lots' shares x the price the stock was quoted at when each
   * was acquired. A lot with no reference recorded contributes its execution
   * price instead, which reads as no premium paid rather than as a guess.
   */
  readonly recordedReferenceUsd: Decimal;
  /** The sum of our lots' fees. */
  readonly recordedFeeUsd: Decimal;
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
  readonly kind: "dividend";
  readonly title: string;
  readonly subtitle: string;
  readonly amountUsd: Decimal | null;
  readonly refTable: "token";
  readonly refId: string;
  readonly occurredAt: Date;
}

export interface PositionWrite {
  readonly instrumentId: string;
  /** What the chain says is held. */
  readonly shares: Decimal;
  /** How many of those shares we hold a lot for, and so can price a cost against. */
  readonly sharesWithBasisUsd: Decimal;
  readonly costBasisUsd: Decimal;
  /** The same shares at the quotes they were bought against. See `HeldToken`. */
  readonly referenceBasisUsd: Decimal;
  /** Fees paid to acquire the shares still held. */
  readonly feeUsd: Decimal;
  readonly avgUnitCostUsd: Decimal;
}

export interface Reconciliation {
  readonly lots: readonly LotWrite[];
  readonly activity: readonly ActivityWrite[];
  readonly positions: readonly PositionWrite[];
}

/** Smallest units to whole tokens. Exact: a Decimal divide, never a float. */
/**
 * Below this, a rise in the multiplier is arithmetic rather than a dividend.
 *
 * Shares are stored to eighteen decimal places, and the multiplier is read
 * fresh from the mint on every pass. So the recorded multiplier is a rounded
 * quotient chasing an unrounded one, and it can miss by the last few bits
 * forever — which it did: one "paid a dividend" row every two seconds, each
 * adding nothing, because the gap the write was meant to close survived the
 * rounding that wrote it.
 *
 * A billionth of a share is far below any dividend a holder could receive and
 * far above what that rounding can produce, so it separates the two cleanly.
 */
const DIVIDEND_FLOOR = D("0.000000001");

const scaled = (raw: bigint, decimals: number): Decimal => D(raw.toString()).div(D(10).pow(decimals));

/**
 * Trims trailing zeros so "1 share" does not read as "1.000000000000000000
 * shares" — but only after a decimal point: "100" must not become "1".
 */
const plural = (shares: Decimal): string => {
  const s = shares.toDecimalPlaces(6).toFixed();
  const n = s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
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
  const byInstrument = new Map<
    string,
    { shares: Decimal; withBasis: Decimal; cost: Decimal; reference: Decimal; fee: Decimal }
  >();

  for (const token of held) {
    // What the chain says you hold. This is a fact and it is never inferred.
    const chainShares = scaled(token.chainRawAmount, token.decimals).mul(token.multiplier);

    let recordedShares = token.recordedShares;
    const cost = token.recordedCostUsd;
    const reference = token.recordedReferenceUsd;
    const fee = token.recordedFeeUsd;

    // A dividend: the multiplier rose, so the tokens we have lots for are worth
    // more shares than those lots record. Zero cost, so the average cost per
    // share falls — the same money now buys more shares, which is the figure
    // other integrations get wrong.
    //
    // Driven by the multiplier on the lots we hold, never by a gap between the
    // chain and our records. A gap means tokens arrived from somewhere we did
    // not witness, and calling that a dividend would hand the holder free
    // shares in the accounts.
    const recordedQty = scaled(token.recordedRawAmount, token.decimals);
    if (recordedQty.gt(ZERO) && recordedShares.gt(ZERO)) {
      const recordedMultiplier = recordedShares.div(recordedQty);
      const gained = recordedQty.mul(token.multiplier.sub(recordedMultiplier));
      if (gained.gte(DIVIDEND_FLOOR)) {
        lots.push({
          tokenId: token.tokenId,
          instrumentId: token.instrumentId,
          tokenQty: 0n,
          shares: gained,
          unitCostUsd: ZERO,
          source: "dividend",
          isEstimated: false,
          acquiredAt: now,
        });
        activity.push({
          kind: "dividend",
          // Labelled like every row, and said as what it was paid in: the
          // multiplier rose, so the dividend arrived as shares, at no cost.
          title: `${token.ticker} dividend`,
          subtitle: `Paid as ${plural(gained)}`,
          amountUsd: token.referencePricePerShare === null ? null : gained.mul(token.referencePricePerShare),
          refTable: "token",
          refId: token.tokenId,
          occurredAt: now,
        });
        recordedShares = recordedShares.add(gained);
      }
    }

    // Two separate truths, kept separate.
    //
    // `shares` is the chain's answer to what you hold. `withBasis` is how much
    // of it we can prove a cost for, which is whatever our lots cover — a
    // deposit we did not witness has no lot, so it counts toward the holding
    // and not toward the basis. Nothing here invents a price: a share with no
    // lot behind it is reported as one we have no cost for, and the screens say
    // so rather than showing a profit measured against a guess.
    //
    // Lots can also exceed the chain, when tokens left the wallet by a path we
    // do not track yet. The basis is then capped and its cost scaled with it,
    // which leaves the average untouched — that is average-cost accounting.
    const withBasis = Decimal.min(recordedShares, chainShares);
    const ratio = recordedShares.isZero() ? ZERO : withBasis.div(recordedShares);

    const running = byInstrument.get(token.instrumentId) ?? {
      shares: ZERO,
      withBasis: ZERO,
      cost: ZERO,
      reference: ZERO,
      fee: ZERO,
    };
    byInstrument.set(token.instrumentId, {
      shares: running.shares.add(chainShares),
      withBasis: running.withBasis.add(withBasis),
      cost: running.cost.add(cost.mul(ratio)),
      // Scaled by the same ratio as the cost, and they have to be: a capped
      // basis whose reference was not capped with it would report the shares
      // that left as a market move, and the two lines would stop summing to
      // the dollars.
      reference: running.reference.add(reference.mul(ratio)),
      fee: running.fee.add(fee.mul(ratio)),
    });
  }

  const positions: PositionWrite[] = [...byInstrument.entries()].map(([instrumentId, r]) => ({
    instrumentId,
    shares: r.shares,
    sharesWithBasisUsd: r.withBasis,
    costBasisUsd: r.cost,
    referenceBasisUsd: r.reference,
    feeUsd: r.fee,
    avgUnitCostUsd: r.withBasis.isZero() ? ZERO : r.cost.div(r.withBasis),
  }));

  return { lots, activity, positions };
}
