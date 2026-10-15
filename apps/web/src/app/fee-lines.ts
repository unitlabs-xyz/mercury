import { usd } from "@mercury/view";

/** A trade's charge in dollars, by part. `total` is what comes off the amount or the proceeds. */
export interface Charge {
  readonly total: number;
  readonly network: number;
  readonly mercury: number;
  readonly mercuryBps: number;
}

/** The charge as `/v1/quote` sends it. The parts are optional because older servers sent `usdc` alone. */
export interface WireCharge {
  readonly usdc: string;
  readonly network?: string;
  readonly mercury?: string;
  readonly mercuryBps?: number;
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
  };
};

/* 50 is "0.5%": as written, without the zeros, and never rounded to a rate we did not charge. */
export const rateLabel = (bps: number): string => `${Number((bps / 100).toFixed(2))}%`;

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
      tip: ctx.selling
        ? `${rateLabel(charge.mercuryBps)} of what the shares sell for. Taken from the proceeds.`
        : `${rateLabel(charge.mercuryBps)} of the ${usd(ctx.amount)}. Taken from it, with the network fee, so ${usd(ctx.invested)} is invested.`,
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
