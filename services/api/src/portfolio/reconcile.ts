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
  /** Tokens our records still hold: every lot, less every disposal, replayed (`replayPosition`). */
  readonly recordedRawAmount: bigint;
  /** The shares those open records come to. */
  readonly recordedShares: Decimal;
  /** What those open shares cost, shares x unit cost. Fees are not in it. */
  readonly recordedCostUsd: Decimal;
  /**
   * The same open shares at the price the stock was quoted at when each was
   * acquired. A lot with no reference recorded contributes its execution price
   * instead, which reads as no premium paid rather than as a guess.
   */
  readonly recordedReferenceUsd: Decimal;
  /** Fees paid to acquire the open shares. */
  readonly recordedFeeUsd: Decimal;
  /**
   * A sell of this stock is executing, or settled moments ago.
   *
   * The balance the pass reads can trail the transaction a sell is settled
   * from, whether the node behind it is slow or a confirm raced the pass, so
   * for a while the chain and the records disagree about a sell that is fine.
   * The pass leaves the stock as it was, rather than reading the gap as a
   * transfer out and removing the same shares twice.
   */
  readonly settling: boolean;
  /**
   * The ids of this token's `transfer_out` disposals recorded within the last
   * couple of minutes. Young enough that the low reading behind them may yet
   * come back (see `planReconciliation`). Older ones are not listed, and stand.
   */
  readonly provisional: readonly string[];
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

/** Tokens that left by a path other than a sell, which writes its own. */
export interface DisposalWrite {
  readonly tokenId: string;
  readonly instrumentId: string;
  readonly tokenQty: bigint;
  /** At the multiplier in force now. For reading; the replay counts tokens. */
  readonly shares: Decimal;
  readonly kind: "transfer_out";
  readonly occurredAt: Date;
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
  readonly disposals: readonly DisposalWrite[];
  /** Ids of recent transfer outs to take back: the low reading behind each has come back. */
  readonly retracted: readonly string[];
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
  const disposals: DisposalWrite[] = [];
  const byInstrument = new Map<
    string,
    { shares: Decimal; withBasis: Decimal; cost: Decimal; reference: Decimal; fee: Decimal }
  >();

  // Every wrapper of a stock with a sell in flight sits this pass out. See
  // `HeldToken.settling`. Its position row stays as it was: stale for as long
  // as the sell is in flight, up to ten minutes, and right.
  const settling = new Set(held.filter((t) => t.settling).map((t) => t.instrumentId));

  /*
   * A transfer out is provisional while it is young. The low reading behind it
   * can be a lag rather than a send: the pledged side of the balance is read at
   * confirmed and the wallet at finalized, so a Kamino withdrawal shows the
   * pledge gone before the wallet has the tokens, and a buy's lot can be
   * written before a lagging node shows its tokens. The open records already
   * count the transfer out, so a chain that now reads above them means the low
   * reading has come back, and the transfer is taken back. Left standing, the
   * tokens returning would count as arrivals we did not witness, and the cost
   * they carried would be gone for good.
   *
   * The stock's position waits for the next pass, which finds the records and
   * the chain in agreement. Working it out now would price it against records
   * that are about to change. Once a transfer out is old enough to leave
   * `provisional` it stands, and a chain above the records is an arrival.
   */
  const retracted: string[] = [];
  const retracting = new Set<string>();
  for (const token of held) {
    if (settling.has(token.instrumentId)) continue;
    if (token.provisional.length > 0 && token.chainRawAmount > token.recordedRawAmount) {
      retracted.push(...token.provisional);
      retracting.add(token.instrumentId);
    }
  }

  for (const token of held) {
    if (settling.has(token.instrumentId) || retracting.has(token.instrumentId)) continue;

    // What the chain says you hold. This is a fact and it is never inferred.
    const chainShares = scaled(token.chainRawAmount, token.decimals).mul(token.multiplier);

    let recordedRaw = token.recordedRawAmount;
    let recordedShares = token.recordedShares;
    let cost = token.recordedCostUsd;
    let reference = token.recordedReferenceUsd;
    let fee = token.recordedFeeUsd;

    /*
     * Tokens that left by a path other than a sell: a send from another app,
     * or anything we do not watch. A sell writes its own disposal when it
     * settles, so a gap here is everything else. It is recorded, so the cost
     * leaves with the shares rather than staying behind to be mixed into the
     * next purchase, which is what made a sell followed by a buy report the
     * wrong cost.
     *
     * Scaled by tokens rather than shares, as the replay is: tokens are exact,
     * and a dividend not yet written would make shares disagree.
     */
    if (token.chainRawAmount < recordedRaw) {
      const goneRaw = recordedRaw - token.chainRawAmount;
      disposals.push({
        tokenId: token.tokenId,
        instrumentId: token.instrumentId,
        tokenQty: goneRaw,
        shares: scaled(goneRaw, token.decimals).mul(token.multiplier),
        kind: "transfer_out",
        occurredAt: now,
      });
      const kept = D(token.chainRawAmount.toString()).div(D(recordedRaw.toString()));
      recordedRaw = token.chainRawAmount;
      recordedShares = recordedShares.mul(kept);
      cost = cost.mul(kept);
      reference = reference.mul(kept);
      fee = fee.mul(kept);
    }

    // A dividend: the multiplier rose, so the tokens we have lots for are worth
    // more shares than those lots record. Zero cost, so the average cost per
    // share falls — the same money now buys more shares, which is the figure
    // other integrations get wrong.
    //
    // Driven by the multiplier on the open records, after any transfer out, so
    // a dividend is never credited on tokens that have already left. Never
    // driven by a gap between the chain and our records: a gap upward means
    // tokens arrived from somewhere we did not witness, and calling that a
    // dividend would hand the holder free shares in the accounts.
    const recordedQty = scaled(recordedRaw, token.decimals);
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
    // of it we can prove a cost for, which is whatever our open records cover —
    // a deposit we did not witness has no lot, so it counts toward the holding
    // and not toward the basis. Nothing here invents a price: a share with no
    // lot behind it is reported as one we have no cost for, and the screens say
    // so rather than showing a profit measured against a guess.
    //
    // After a transfer out the records equal the chain, so this cap only bites
    // when shares arrived unwitnessed.
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

  return { lots, activity, disposals, retracted, positions };
}
