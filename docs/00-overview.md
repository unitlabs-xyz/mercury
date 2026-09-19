# 00 · Overview

## What we are building

An investment account that lives in a crypto wallet.

You arrive holding stablecoins. You buy shares of Nvidia, Apple or the S&P 500. You put money
into ready-made baskets of stocks. You set a fixed amount to invest every month. You watch one
portfolio that holds your stocks and your crypto together. Later you borrow against those
holdings instead of selling them.

It is not a trading terminal. It is closer to a brokerage account, and the person using it
should never need to know which blockchain it runs on.

## Why it can exist now

Real US shares are held by regulated custodians and mirrored as tokens on Solana. Two issuers
do this at scale: Backed, whose tokens end in `x`, and Ondo Global Markets, whose tokens end in
`on`. Between them there are 590 US stocks and funds on Solana. They trade around the clock,
the minimum is a few dollars, and no brokerage account is required anywhere in the world.

That last point is the opportunity. A person in Lagos, Jakarta or São Paulo cannot open a US
brokerage account. They can hold a stablecoin today.

## Who it is for

**Version one is for people who already hold crypto.** No bank transfers, no card top-ups, no
identity checks. That decision removes the two hardest problems in consumer finance, which are
payment rails and per-country money licensing, and it is why we can ship something real in
three weeks rather than three quarters.

The wider audience, people with no brokerage access anywhere, arrives when a fiat on-ramp does.
That is deliberately a later problem.

## The one-sentence positioning

> Your investment account, in your own wallet, open every hour of the week.

## What makes it different from a nice UI over a DEX

Five things, none of which a traditional broker can copy. They are argued properly in
[01 Evidence](01-evidence.md) and [02 Product](02-product.md).

1. **Your true exposure to a company, across issuers.** A user can hold three different Nvidia
   tokens at once. We add them up correctly using each token's multiplier, and warn when too
   much sits with one issuer. No broker has this problem, so no broker has this screen.
2. **Protection from the wrong wrapper.** Same stock, two issuers. On our own measurements one
   of them can cost eighty-five percent more for the identical share. We check every time.
3. **A basket you can hold, send and pledge as one thing**, because it is a real token backed by
   a vault and not a rule in somebody's database. See [10 Baskets](10-baskets.md).
4. **A share count that grows by itself.** Dividends arrive as an increase in the token's
   multiplier, so the position quietly gets bigger. We show that as shares gained. Most
   integrations ignore the multiplier and their numbers slowly go wrong.
5. **Leaving is trivial, and we say so.** The holdings are in the user's own wallet.

## What we are not building

Named here so nobody has to ask twice. Reasoning in [02 Product](02-product.md).

Bank deposits and withdrawals. Identity checks. News, earnings, analyst data and a screener. A
tax centre. Savings goals. A full web application. User-created baskets. An AI chat assistant.

## The deadline

Colosseum's Crypto World's Fair closes **12 October 2026**. The Solana track carries $100,000
across ten winners, with a separate grand prize and twenty runner-up prizes, and the accelerator
behind it writes $250,000 per accepted team. Judging weighs functionality, impact, novelty, user
experience, open-source composability and the business plan.

What has to be working by then is in [08 Roadmap](08-roadmap.md).
