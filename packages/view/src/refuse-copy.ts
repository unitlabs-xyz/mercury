import type { RefuseDecision } from "@mercury/core";

/*
 * Why an order will not go through, in the reader's words rather than ours.
 * "Route", "the pool", "slip", "liquidity", "the reference price" and
 * "ex-dividend" are how we describe the machinery; none of them tell someone
 * new to shares what happened or what to do next. Each one names the problem
 * and, where there is one, the way out.
 */
export const REFUSE_COPY: Record<RefuseDecision["reason"], { title: string; body: string }> = {
  below_minimum: { title: "Too small to buy", body: "The smallest order we can place is $5." },
  no_route: {
    title: "Can't buy this right now",
    body: "There isn't enough of it available to trade at the moment. Try again shortly.",
  },
  impact_too_high: {
    title: "This order would move the price",
    body: "Not much of it trades on Solana right now, so at this size buying would push the price up against you. Try a smaller amount.",
  },
  reference_stale: {
    title: "Price is out of date",
    body: "We can't confirm what a share is worth right now, so we're not placing orders. Try again in a moment.",
  },
  instrument_halted: { title: "Trading halted", body: "The exchange has halted this stock." },
  corp_action_pending: {
    title: "Dividend being applied",
    body: "Your share count is about to change. Buying reopens as soon as it has.",
  },
  no_candidates: { title: "Not available", body: "We don't offer this stock yet." },
};

/**
 * The refusals that read differently when the order points the other way.
 *
 * Four of the seven above are written for a buyer and are reachable on a sell,
 * and `no_candidates` is not merely awkward but wrong: "we don't offer this
 * stock yet" is a fact about us, when what happened is the wallet holds none of
 * it. `below_minimum` has no sell wording because the minimum is a buy-side
 * rule — see `decide`.
 */
const SELL_COPY: Partial<Record<RefuseDecision["reason"], { title: string; body: string }>> = {
  no_route: {
    title: "Can't sell this right now",
    body: "There isn't enough being traded at the moment to take this size. Try again shortly.",
  },
  impact_too_high: {
    title: "This order would move the price",
    body: "Not much of it trades on Solana right now, so at this size selling would push the price down against you. Try a smaller amount.",
  },
  corp_action_pending: {
    title: "Dividend being applied",
    body: "Your share count is about to change. Selling reopens as soon as it has.",
  },
  no_candidates: {
    title: "Nothing to sell",
    body: "You don't hold this stock in a wallet we can sell from.",
  },
};

export const refuseCopy = (reason: RefuseDecision["reason"], side: "buy" | "sell") =>
  (side === "sell" ? SELL_COPY[reason] : undefined) ?? REFUSE_COPY[reason];
