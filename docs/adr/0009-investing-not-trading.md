# ADR 0009 · An investing product, not a trading product

**Status:** accepted · 19 September 2026
**Amended 30 September 2026:** the borrowed-funds restriction below is withdrawn. It is
unenforceable in a self-custodial product and is replaced by disclosure — see
[Amendment](#amendment-30-september-2026). Everything else stands.

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
should be enforced in code, not stated in terms. _(Withdrawn — see the amendment below.)_

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

---

## Amendment, 30 September 2026

**The borrowed-funds restriction is withdrawn.** It was never implemented, and implementing it
would have been theatre.

This is a self-custodial product. `POST /v1/money/send` ships, wallet export ships and is
advertised as a feature — leaving is trivial and we say so. Anybody refused at our buy button
borrows, sends the USDC one hop, and buys there instead, or exports the wallet and uses Jupiter.
A rule that stops nobody costs an honest user a confusing error and costs a determined one
thirty seconds.

**So looping is legal.** Borrow against a holding, buy more of it, pledge that, borrow again.
Somebody who wants leverage can have it, on their own wallet, with their own money.

**What carries the weight instead is the accounting, and it now tells the truth.** Net worth is
stocks plus cash less debt, so borrowing moves the headline figure by nothing and leverage shows
up where it is real: in the holdings, which grow, and in the day's move, which swings further.
The fall that would cost somebody their collateral sits under the Borrowed figure and shrinks
every time the loop goes round. See
[the design](../superpowers/specs/2026-09-30-debt-in-the-books-design.md).

**The test in this record is unchanged and still correct.** Borrowing to buy more of the same
thing is margin, and multiplying exposure is what it does. What changed is the answer to what we
do about it: we do not pretend to prevent it, we make it impossible to do by accident. Mercury
still ships no perpetuals, no order books, no portfolio margin, and no leverage of its own —
Kamino is the lender, and the user's wallet is the account.
