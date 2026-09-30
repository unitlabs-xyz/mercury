import {
  DEFAULT_POLICY,
  D,
  decide,
  fairPricePerShare,
  type Candidate,
  type Decimal,
  type Decision,
  type Side,
} from "@mercury/core";
import type { Deps } from "./deps.js";
import { sellableAmounts } from "./orders/sellable.js";

export interface PriceRequest {
  readonly ticker: string;
  readonly side: Side;
  /**
   * Dollars, on both sides.
   *
   * A sell is executed in tokens, not dollars — but nobody thinks in
   * four-decimal share counts, and a ticket whose two tabs disagreed about what
   * a quantity is would be its own bug. The conversion happens here, once, at
   * the reference price.
   */
  readonly amount: string;
  /**
   * Taken off the minimum for this call.
   *
   * The network charge comes out of the amount, so a $5 order is quoted as a
   * $4.75 swap — and the floor is a rule about what the buyer asked for, not
   * about what is left once we have been paid. Lowering it by the charge
   * enforces the floor on the amount they typed, which is the one they saw it
   * against. Buys only: `decide` does not apply the floor to a sell.
   */
  readonly feeUsdc?: string;
  /**
   * Sell the whole position, in tokens rather than dollars.
   *
   * A dollar figure always leaves dust behind — slippage guarantees it — and
   * dust worth less than the network fee can never be swept. This quotes the
   * wallet's exact balance, so the position closes.
   */
  readonly max?: boolean;
  /**
   * The seller's wallet. Required for a sell, ignored for a buy.
   *
   * Absent, a sell reads no balances and refuses, rather than falling back to
   * quoting wrappers the caller may not own.
   */
  readonly owner?: string;
}

/**
 * Gather every wrapper's quote, the reference price and the session, then let
 * `@mercury/core` decide. Nothing here makes a judgement; that all lives in `decide`.
 *
 * The two sides gather differently, and have to. A buy commits dollars, so
 * every wrapper is quoted for the same dollar amount and the cheapest wins. A
 * sell commits shares the wallet already holds, so each wrapper is quoted for
 * its own token amount — through its own multiplier, capped at its own balance
 * — and the one paying most wins.
 */
export async function priceOrder(deps: Deps, req: PriceRequest): Promise<Decision | null> {
  const [wrappers, reference, session] = await Promise.all([
    deps.registry.wrappersFor(req.ticker),
    deps.reference.priceFor(req.ticker),
    deps.sessions.current(),
  ]);

  if (reference === null || wrappers.length === 0) return null;
  const selling = req.side === "sell";
  const fair = fairPricePerShare(reference);

  const multipliers = new Map(
    await Promise.all(
      wrappers.map(async (w) => [w.mint, (await deps.multipliers.multiplierFor(w.mint)) ?? D(1)] as const),
    ),
  );

  /*
   * What each wrapper is quoted for. One number for every wrapper on a buy;
   * a per-wrapper token amount on a sell, and nothing at all for a wrapper the
   * wallet does not hold.
   */
  const sellable = selling
    ? sellableAmounts(
        wrappers.map((w) => ({
          mint: w.mint,
          decimals: w.decimals,
          multiplier: multipliers.get(w.mint) ?? D(1),
        })),
        req.owner === undefined ? [] : await deps.chain.tokenBalances(req.owner),
        req.max === true ? null : D(req.amount).div(fair),
      )
    : [];

  const amounts = selling
    ? new Map(sellable.map((a) => [a.mint, a.tokens] as const))
    : new Map(wrappers.map((w) => [w.mint, D(req.amount)] as const));

  const candidates: Candidate[] = await Promise.all(
    wrappers
      .filter((w) => amounts.has(w.mint))
      .map(async (w) => {
        const multiplier = multipliers.get(w.mint) ?? D(1);
        const [quote, paused] = await Promise.all([
          // Slippage is a policy number, not an adapter default: it is spent from
          // the same budget as the premium tolerance, so the policy names it.
          deps.quotes.quote({
            side: req.side,
            mint: w.mint,
            decimals: w.decimals,
            amount: amounts.get(w.mint) ?? D(0),
            slippageBps: DEFAULT_POLICY.slippageBps,
          }),
          deps.multipliers.isPaused(w.mint),
        ]);
        return { mint: w.mint, symbol: w.symbol, issuer: w.issuer, multiplier, quote: paused ? null : quote };
      }),
  );

  /* Every candidate paused is a halt. No candidates at all is not — that is a
     wallet holding none of this stock, and `decide` says so in its own words. */
  const anyPaused = candidates.length > 0 && candidates.every((c) => c.quote === null);

  /*
   * `decide` wants shares for a sell. For `max` that is everything the wallet
   * holds, across every wrapper — the order fills from one of them, and the
   * winner's `filledShares` reports which part of it was actually sold.
   */
  const asShares = (): Decimal =>
    req.max === true
      ? sellable.reduce((total, a) => total.add(a.tokens.mul(multipliers.get(a.mint) ?? D(1))), D(0))
      : D(req.amount).div(fair);

  return decide({
    ticker: req.ticker,
    side: req.side,
    amount: selling ? asShares() : D(req.amount),
    candidates,
    reference,
    status: anyPaused ? "halted" : session.status,
    policy:
      req.feeUsdc === undefined || D(req.feeUsdc).lte(0)
        ? DEFAULT_POLICY
        : { ...DEFAULT_POLICY, minOrderUsd: DEFAULT_POLICY.minOrderUsd.sub(D(req.feeUsdc)) },
    now: new Date(),
    ...(session.nextOpenAt !== null ? { marketOpensAt: session.nextOpenAt } : {}),
  });
}
