# ADR 0008 · Jupiter Ultra everywhere, no Router path

**Status:** accepted · 19 September 2026 · decided rather than asked

## Context
Jupiter offers two integration paths. **Ultra** delegates execution to Jupiter, which handles
routing, slippage, priority fees, transaction landing and retries, and is the cleanest
integration. Its transactions cannot be modified after they are returned, so no cross-program
invocation and no appended instructions. **Router** hands back swap instructions for you to
compose, which allows CPI but makes landing, retries and fee estimation your problem.

Path B in [10 Baskets](../10-baskets.md) composes constituent swaps with a vault deposit, which
looked like it forced the Router path.

## Decision
**Ultra everywhere. No Router path in version one.**

## Reasoning
The composition requirement was never real. Six Jupiter swap routes plus a vault deposit will not
fit in one Solana transaction regardless of which path we use, so the basket flow was always
going to be several transactions. Once it is several transactions, nothing needs composing, and
the reason to choose Router disappears.

What remains is the actual trade: Ultra takes over transaction landing. Getting a transaction to
land reliably on Solana under load, with the right priority fee and a sane retry policy, is the
most tedious and most user-visible failure surface in the stack. Handing that to the people who
do it a million times a day is worth more than composability we do not need.

## How the basket flow works instead
Six independent Ultra swaps, then one deposit transaction. Not atomic, and that is acceptable
because the intermediate state is benign: if the swaps land and the deposit does not, the user
holds six stock tokens, which is exactly what they paid for and is worth the same money.

The app detects that state and offers *"finish your Semiconductors investment"*, which resumes at
the deposit. Recording the intent before the first swap is what makes the resume possible, and
`order` already stores its decision blob, so this is a status value rather than new machinery.

An atomic mega-transaction would have failed entirely instead of partially, which is a worse
outcome presented as a safer one.

## Consequences
**Good.** Less transaction plumbing to write and debug. One integration path rather than two.
Failures concentrate in a place Jupiter is better at handling than we are.

**Bad.** If a future feature genuinely needs CPI inside a swap, we add the Router path then. That
is additive and the `BasketVenue` interface in [10 Baskets](../10-baskets.md) already isolates
where it would go.

**Removes** open question 8 and half of the day-one spike. The spike still has to answer whether
the xStocks mints are supported and whether basket tokens route through Jupiter at all.
