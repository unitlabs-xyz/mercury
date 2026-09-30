# Debt in the books

**Status:** accepted · 30 September 2026

## Why

Borrowing is built, live, and invisible to the accounts.

`valuePortfolio` returns `totalUsd: stocksUsd.add(cashUsd)` and subtracts no debt. Kamino sends
borrowed USDC to the borrower's own wallet, into the same token account as their cash, so the
moment a loan is drawn the headline figure on the Portfolio page rises by the amount borrowed.
The hourly snapshot records that figure, which means the performance chart draws borrowing as a
gain and repayment as a loss.

Nothing else in this system is wrong in the user's favour. This is.

## The rule

**Never block what somebody does with their own money. Never report a number that is wrong in
their favour.**

The first half settles a question [ADR 0009](../../adr/0009-investing-not-trading.md) answered
differently. It said borrowed funds must not buy stocks, "enforced in code, not stated in terms".
That was written for a custodial product. This one is self-custodial: `POST /v1/money/send` ships,
wallet export ships and is advertised, so anybody refused here borrows, sends the USDC one hop, and
buys anyway. A refusal that stops nobody is theatre, and it would be the only piece of theatre in
this codebase.

Looping — borrow against a holding, buy more of it, pledge that, borrow again — is therefore
legal. It is also how someone turns a 22% cushion into a single-digit one in three steps, so the
second half of the rule carries the weight the first half used to.

## What changes

### 1 · Debt is read, and the total is net

`PortfolioDeps` gains `debt`, alongside the `pledged` it already has. Both read `deps.lending`.

```ts
readonly debt: (walletAddress: string) => Promise<Decimal | null>;
```

`valuePortfolio` gains a `debtUsd` parameter and returns it, with
`totalUsd = stocksUsd + cashUsd − debtUsd`.

Holdings are untouched and stay gross. Somebody who levers into $15,000 of NVDAx holds $15,000 of
NVDAx; that is the number that should be large. What they are _worth_ is that less what they owe.

### 2 · Null means unknown, and unknown is not zero

`pledged` catches a Kamino failure and returns `[]`, which makes a holder look like they hold
less — wrong, in the harmless direction. The same treatment of debt would make a borrower look
richer, which is the direction that ends in a liquidation nobody expected.

So `debt` returns `null` when Kamino cannot be read, and the route falls back to the most recent
`portfolio_snapshot` for that user, marking the answer stale. An account that has never borrowed
has zero in every snapshot and notices nothing during an outage. An account with a loan gets an
hour-old figure, labelled as one.

If there is no snapshot either — a brand-new account during an outage — debt is zero and stale.
A new account has no loan to misreport.

### 3 · The chart stops drawing loans

`portfolio_snapshot` gains `debt_usd`, and `total_usd` becomes net. Borrowing then moves the line
by nothing, and leverage appears as what it is: a portfolio that moves further on the same market
move.

Rows recorded before this are gross. For an account that never borrowed, gross and net are the
same number and nothing changes. An account with a loan sees one step at the cutover. That step
stays: backfilling `debt_usd` would be inventing a measurement that was never taken.

### 4 · The page

- Headline: net.
- Under Cash: **Borrowed −$5,000**, so the money is visibly present and visibly owed.
- Holdings: unchanged.
- Whenever debt is not zero, one line in the header — **"Safe unless your stocks fall 22%"** —
  from `safeUntilDrop`, which `capacity.ts` already computes.

That last line is the disclosure that replaces the refusal. It is the figure that shrinks on every
loop, so it belongs on the screen people actually look at rather than in a sheet they opened once.

### 5 · ADR 0009 is amended, not rewritten

The borrowed-funds restriction comes out, dated, with the reasoning that removed it and what
replaced it. The rest of the ADR — no perps, no margin _trading_, no order books — stands.

## Out of scope, and why

**A loan watcher.** Nothing watches a loan while its owner is not looking at the page, and that is
the failure most likely to cost somebody real money. It is blocked on a notification channel that
does not exist: docs/05 records no email addresses, and the backend spec left "whether Mercury
stores addresses at all" open. A job with nowhere to send a warning writes to a screen the user was
already not looking at. It needs its own decision, and it is the first thing to build after this.

**The card.** Needs an issuer, identity and an off-ramp. Because borrowed cash lands in the wallet
as ordinary spendable USDC, funding a card later is a transfer rather than a rebuild. Nothing here
forecloses it.

## Testing

`capacity.ts` is already covered. What is new and worth a test:

- `valuePortfolio` nets debt, and treats no debt and unknown debt differently.
- The stale fallback: Kamino down with a snapshot, Kamino down without one, Kamino fine.
- `debt_usd` survives `numeric(38,18)` and comes back out of the snapshot round trip.
- The whole path, over a real database: borrow recorded, total net, chart flat across the borrow.

Every test is mutation-tested, as everything else in this repository is.
