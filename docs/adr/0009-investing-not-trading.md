# ADR 0009 · An investing product, not a trading product

**Status:** accepted · 19 September 2026

## Context

Backpack already ships a unified portfolio holding tokenized stocks beside crypto, cash earning
3.35% usable as collateral, and portfolio margin across assets. See
[11 References](../11-references.md). So "stocks and crypto in one account" is not a claim
available to us.

Backpack is a trading product: perpetuals, margin, advanced charts, order types, subaccounts.
That is the fork in the road and it is worth taking deliberately rather than drifting.

## Decision

**We build an investing product.** Permanently out of scope, not merely deprioritised:

- Perpetual futures and any derivative
- Margin trading and leveraged positions
- Options
- Candlestick charts, order books, depth charts
- Limit orders as a user-facing feature
- Anything that rewards frequency

## The distinction that will otherwise get muddled

**Borrowing against holdings is not margin trading, and it stays.** A Lombard loan lets someone
spend without selling and realising a gain. It creates liquidity from a portfolio the user
already wanted to own. Margin borrows to buy more of the same thing and multiplies exposure to it.

The test: does the borrowed money increase market exposure? If yes, it is margin and we do not
ship it. If it leaves exposure unchanged and produces cash, it is a Lombard loan and it is
version two.

One consequence: borrowed funds cannot be used to buy stocks inside the app. That restriction
should be enforced in code, not stated in terms.

## What this does to the interface

Queued orders exist because a token can trade away from the real share price, and the mechanism
is a limit order underneath. The user never sees the words "limit order" and never sets a trigger
price by hand. They see _"wait for the real price"_. The machinery is a risk control, not a
trading feature.

No price alerts that invite checking. No day-change colour as the dominant visual. No streaks,
leaderboards or anything that makes trading more often feel like progress.

## Positioning

M1's line, and they are right: **built for investors, not traders.**

## Consequences

**Good.** A smaller product, a clearer story, and an honest difference from the incumbent. Every
differentiator in [00 Overview](../00-overview.md) survives, because none of them was about
holding two asset types in one list.

**Bad.** Users will ask for perps. Crypto-native judges may read the absence as a gap rather than
a position, so the submission has to say it out loud rather than leave it to be noticed.
