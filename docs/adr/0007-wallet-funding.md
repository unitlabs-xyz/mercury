# ADR 0007 · How an empty wallet gets funded

**Status:** accepted · 19 September 2026

## Context

[ADR 0003](0003-custody.md) chose Privy embedded wallets only, which removed the external wallet.
The external wallet was how a user arrived holding money. A person now signs in with an email,
receives a Solana wallet, and it holds nothing. [ADR 0001](0001-crypto-native.md) ruled out
building a fiat ramp.

Left alone, the first run ends at "send USDC to this address", which means leaving for an
exchange and probably not returning.

## Decision

**Turn on every funding path Privy already offers, and build none of them.**

1. **Universal deposit address.** The user sends any supported asset from any supported chain to
   one address, and Privy bridges or swaps it into USDC on Solana. This is the important one. It
   means someone can withdraw whatever they hold, from wherever they hold it, without knowing
   which chain we are on.
2. **Card onramp.** Privy routes card purchases through Stripe, Meld, MoonPay or Coinbase by
   region, with no fees or minimums charged to us, supporting USDC on Solana and denominated in
   USD, EUR, AUD or BRL. Enabled per provider in the Privy dashboard.
3. **Plain receive.** The address and a QR code, for people who know what they are doing.
4. **A pre-funded demo account** for the hackathon, so a judge is never blocked at step one.

## Does this contradict ADR 0001?

No, and the distinction matters. ADR 0001 says we do not build or operate payment rails, hold
fiat, or take on money licensing. A card purchase through Privy's provider is operated by that
provider, who carries the identity checks and the regulatory burden. We never touch the money.
This is the same reasoning already accepted for the card in version two.

What ADR 0001 rules out remains ruled out: no bank account of ours, no fiat balance, no cash
withdrawal, no identity documents in our database.

## Consequences

**Good.** The cold-start problem largely disappears. A user with money on Binance or Coinbase can
fund in one transfer without caring about chains. A user with only a card can start in a minute.

**Bad.** Onramp coverage and limits vary by country and we do not control them, so some users
will hit a wall we cannot fix. Card onramps are the slowest and most expensive path and should be
offered last in the interface, not first.

**Work required.** Configuration in the Privy dashboard, the `useFiatOnramp` hook, and a funding
screen that presents the three options in order of speed. Roughly a day.
