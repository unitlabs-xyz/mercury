import { D, ZERO, type Decimal } from "../money.js";

/**
 * A lot entering a position: a buy, a dividend, and later an import.
 *
 * The dollar figures are the lot's totals rather than per share, so a replay
 * adds them without knowing how each was priced.
 */
export interface MovementIn {
  readonly kind: "in";
  /** Smallest unit. Zero on a dividend lot, which adds shares and no tokens. */
  readonly tokenQty: bigint;
  readonly shares: Decimal;
  /** Shares x unit cost. Fees are not in it. */
  readonly costUsd: Decimal;
  /** Shares x the quote at acquisition, or the unit cost where none was recorded. */
  readonly referenceUsd: Decimal;
  readonly feeUsd: Decimal;
  readonly acquiredAt: Date;
  readonly isEstimated: boolean;
}

/** Tokens leaving it: a sell, or a transfer out. */
export interface MovementOut {
  readonly kind: "out";
  readonly tokenQty: bigint;
}

export type Movement = MovementIn | MovementOut;

/** What is still held, and what it cost. */
export interface OpenPosition {
  readonly tokenQty: bigint;
  readonly shares: Decimal;
  readonly costUsd: Decimal;
  readonly referenceUsd: Decimal;
  readonly feeUsd: Decimal;
  /** The earliest acquisition still open, counted from when the holding was last empty. */
  readonly heldSince: Date | null;
  /** True while any open lot's cost was estimated rather than read off a trade. */
  readonly isEstimated: boolean;
}

export const EMPTY_OPEN: OpenPosition = {
  tokenQty: 0n,
  shares: ZERO,
  costUsd: ZERO,
  referenceUsd: ZERO,
  feeUsd: ZERO,
  heldSince: null,
  isEstimated: false,
};

const enter = (open: OpenPosition, m: MovementIn): OpenPosition => ({
  tokenQty: open.tokenQty + m.tokenQty,
  shares: open.shares.add(m.shares),
  costUsd: open.costUsd.add(m.costUsd),
  referenceUsd: open.referenceUsd.add(m.referenceUsd),
  feeUsd: open.feeUsd.add(m.feeUsd),
  heldSince: open.heldSince === null || m.acquiredAt < open.heldSince ? m.acquiredAt : open.heldSince,
  isEstimated: open.isEstimated || m.isEstimated,
});

/*
 * Average cost: whatever leaves takes the same fraction of every figure, so the
 * cost per share of what remains does not move. The fraction is taken in
 * tokens, because tokens are exact and shares are not — a token's shares move
 * with the multiplier, and a dividend not yet written would make the two
 * disagree. Every token gone ends the run, whatever rounding left behind.
 */
const leave = (open: OpenPosition, m: MovementOut): OpenPosition => {
  if (m.tokenQty >= open.tokenQty) return EMPTY_OPEN;
  const remaining = open.tokenQty - m.tokenQty;
  const kept = D(remaining.toString()).div(D(open.tokenQty.toString()));
  return {
    ...open,
    tokenQty: remaining,
    shares: open.shares.mul(kept),
    costUsd: open.costUsd.mul(kept),
    referenceUsd: open.referenceUsd.mul(kept),
    feeUsd: open.feeUsd.mul(kept),
  };
};

/**
 * A token's position, worked out from everything that entered and left it.
 *
 * The caller orders the movements by when each entered or left Mercury, which
 * is not when a lot was acquired: an imported lot was bought long before it
 * arrived, and applying a sell to shares that were not here yet would cost them
 * wrongly. Pure, like everything in this package.
 */
export const replayPosition = (movements: readonly Movement[]): OpenPosition =>
  movements.reduce<OpenPosition>(
    (open, m) => (m.kind === "in" ? enter(open, m) : leave(open, m)),
    EMPTY_OPEN,
  );
