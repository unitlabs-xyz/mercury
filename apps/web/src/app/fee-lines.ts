import { usd } from "@mercury/view";

/** Why Mercury's rate is lower than published: an invited friend's first 90 days. */
export interface FeeDiscount {
  readonly pct: number;
  /** ISO. When the full rate applies again. */
  readonly until: string;
}

/** A trade's charge in dollars, by part. `total` is what comes off the amount or the proceeds. */
export interface Charge {
  readonly total: number;
  readonly network: number;
  readonly mercury: number;
  readonly mercuryBps: number;
  readonly discount?: FeeDiscount;
}

/** The charge as `/v1/quote` sends it. The parts are optional because older servers sent `usdc` alone. */
export interface WireCharge {
  readonly usdc: string;
  readonly network?: string;
  readonly mercury?: string;
  readonly mercuryBps?: number;
  readonly discount?: FeeDiscount;
}

const num = (v: string | undefined): number | null => {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

/*
 * A missing breakdown is the network cost alone, because that is all the
 * charge was before Mercury had a fee. Reading it any other way would show a
 * fee nobody was charged.
 */
export const chargeFromWire = (fee: WireCharge): Charge => {
  const total = num(fee.usdc) ?? 0;
  return {
    total,
    network: num(fee.network) ?? total,
    mercury: num(fee.mercury) ?? 0,
    mercuryBps: fee.mercuryBps ?? 0,
    ...(fee.discount === undefined ? {} : { discount: fee.discount }),
  };
};

/*
 * 50 is "0.5%", 37.5 is "0.375%", 26.25 is "0.2625%": as written, without the
 * zeros, and never rounded to a rate we did not charge. A whole-bps base times
 * the three-quarters a friend pays has at most two decimals of a basis point,
 * which is four of a percent, so four decimals are always exact.
 */
export const rateLabel = (bps: number): string => `${Number((bps / 100).toFixed(4))}%`;

export interface FeeLine {
  readonly key: "mercury" | "network";
  readonly label: string;
  readonly value: number;
  readonly tip: string;
}

/**
 * One line per part of the charge, Mercury's first, as the confirm screen
 * lists them. A part that comes to nothing has no line: there is no fee to
 * explain.
 */
export const feeLines = (
  charge: Charge,
  ctx: { readonly selling: boolean; readonly amount: number; readonly invested: number },
): FeeLine[] => {
  const lines: FeeLine[] = [];
  if (charge.mercury > 0) {
    lines.push({
      key: "mercury",
      label: `Mercury fee (${rateLabel(charge.mercuryBps)})`,
      value: charge.mercury,
      tip:
        (ctx.selling
          ? `${rateLabel(charge.mercuryBps)} of what the shares sell for. Taken from the proceeds.`
          : `${rateLabel(charge.mercuryBps)} of the ${usd(ctx.amount)}. Taken from it, with the network fee, so ${usd(ctx.invested)} is invested.`) +
        (charge.discount === undefined
          ? ""
          : ` ${charge.discount.pct}% off as an invited friend, until ${new Date(charge.discount.until).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.`),
    });
  }
  if (charge.network > 0) {
    lines.push({
      key: "network",
      label: "Network fee",
      value: charge.network,
      tip: ctx.selling
        ? "Covers sending the dollars to your wallet. Taken from the proceeds."
        : `Covers opening your account for this stock, once. Taken from the ${usd(ctx.amount)}, so ${usd(ctx.invested)} is invested.`,
    });
  }
  return lines;
};
