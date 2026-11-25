import type { Portfolio } from "@mercury/types";
import { sharesBrief, usd } from "@mercury/view";

type Holding = Portfolio["holdings"][number];

/** A token the linked wallet can move, as `GET /v1/move/tokens` lists it. */
export interface MovableToken {
  readonly mint: string;
  readonly symbol: string;
  /** The stock it is a share of; null for USDC. */
  readonly ticker: string | null;
  readonly name: string;
  readonly decimals: number;
  readonly amountRaw: string;
  /** `amountRaw` in whole tokens, as a decimal string. */
  readonly amount: string;
}

/** What `POST /v1/move/prepare` hands back: the transactions to sign, and what the move costs. */
export interface PreparedMove {
  readonly transactions: readonly {
    readonly transaction: string;
    readonly moved: readonly { readonly mint: string; readonly amountRaw: string }[];
  }[];
  /** Always "0": nothing is taken from what moves. Kept for older servers. */
  readonly feeUsd: string;
  /** The rent of the Mercury wallet's new accounts, which the linked wallet pays in SOL. */
  readonly rentUsd: string;
  readonly rentSol?: string;
  readonly coveredByMercury: boolean;
}

/**
 * An amount as a person types it, in the token's smallest unit: digits and at
 * most as many places as the token has. Null for anything else, and for more
 * places than the token can hold, so nothing is rounded without them seeing.
 */
export const toRaw = (text: string, decimals: number): bigint | null => {
  const t = text.trim();
  const match = /^(\d+)(?:\.(\d*))?$/.exec(t);
  if (match === null) return null;
  const [, whole, fraction = ""] = match;
  if (fraction.length > decimals) return null;
  return BigInt(whole!) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
};

/**
 * What a stock's cost is, beside its line in the move: "cost known for 12 of
 * 15 shares". The cost travels with the shares into the Mercury wallet, so
 * this says what will arrive known and what will arrive without one. Null for
 * USDC, which has no cost, and for a stock the page has no holding for yet.
 */
export const costLine = (token: MovableToken, holdings: readonly Holding[]): string | null => {
  if (token.ticker === null) return null;
  const h = holdings.find((x) => x.ticker === token.ticker);
  if (h === undefined) return null;
  const held = Number(h.shares);
  const known = Math.min(Number(h.sharesWithBasis ?? h.shares), held);
  const estimated = Number(h.estimatedCostUsd ?? 0) > 0;
  if (known <= 0) return "Cost not known: it arrives without one";
  if (known >= held)
    return estimated ? "Cost estimated, and it moves with them" : "Cost known, and it moves with them";
  return `Cost ${estimated ? "estimated" : "known"} for ${sharesBrief(known)} of ${sharesBrief(h.shares)} shares`;
};

/** The stocks held in a loan, which stay where they are: "NVDA 2 · in a loan, stays here". */
export const pledgedLines = (holdings: readonly Holding[]): readonly string[] =>
  holdings
    .filter((h) => Number(h.pledgedShares ?? 0) > 0)
    .map((h) => `${h.ticker} ${sharesBrief(h.pledgedShares!)} · In a loan, stays here`);

/**
 * What the move costs the linked wallet, said once above the button. It pays
 * its own way in SOL: the network fee, and the rent of any account the
 * Mercury wallet doesn't have yet. Nothing is taken from what moves.
 */
export const moveCostLine = (p: Pick<PreparedMove, "rentUsd" | "rentSol">): string => {
  if (Number(p.rentUsd) > 0 || Number(p.rentSol ?? 0) > 0) {
    const sol = p.rentSol === undefined ? "" : ` (${Number(p.rentSol)} SOL)`;
    return `This wallet pays about ${usd(p.rentUsd)}${sol} in SOL to open accounts in your Mercury wallet, plus the network fee.`;
  }
  return "This wallet pays the network fee in SOL, a fraction of a cent.";
};

/** What landed, said once every transaction has been answered. */
export type MoveOutcome =
  | { readonly kind: "done"; readonly count: number }
  | { readonly kind: "partial"; readonly landed: number; readonly count: number }
  | { readonly kind: "waiting"; readonly count: number };

export const outcomeOf = (statuses: readonly ("confirmed" | "pending" | "failed")[]): MoveOutcome => {
  const landed = statuses.filter((s) => s === "confirmed").length;
  const failed = statuses.filter((s) => s === "failed").length;
  if (failed > 0) return { kind: "partial", landed, count: statuses.length };
  if (landed === statuses.length) return { kind: "done", count: statuses.length };
  return { kind: "waiting", count: statuses.length };
};

export const outcomeLine = (o: MoveOutcome): string =>
  o.kind === "done"
    ? "Moved. It's in your Mercury wallet."
    : o.kind === "waiting"
      ? "Sent. It's on its way to your Mercury wallet and will show here in a moment."
      : o.landed === 0
        ? "Nothing moved. Try again."
        : `Part of it moved: ${o.landed} of ${o.count} steps. The rest stayed in this wallet; try again to move it.`;

/** How long "Dismiss" hides the reminder, for that wallet. */
export const BANNER_HIDDEN_MS = 30 * 24 * 60 * 60_000;
const bannerKey = (walletId: string) => `mercury.move-banner.${walletId}`;

type Store = Pick<Storage, "getItem" | "setItem">;

/** Whether the reminder shows for this wallet now: not within 30 days of its dismissal. */
export const bannerShown = (walletId: string, now: number, store: Store | null): boolean => {
  try {
    const at = Number(store?.getItem(bannerKey(walletId)) ?? NaN);
    return !(Number.isFinite(at) && now - at < BANNER_HIDDEN_MS);
  } catch {
    return true;
  }
};

export const dismissBanner = (walletId: string, now: number, store: Store | null): void => {
  try {
    store?.setItem(bannerKey(walletId), String(now));
  } catch {
    // Not kept: it shows again next visit, which is the harmless way to fail.
  }
};
