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

---

## Amendment · 12 October 2026

Two corrections and one addition, after reading Privy's current documentation
and building the first path.

### Addition: connect a wallet, and build the transfer ourselves

**Decision 3 above is split in two.** "Plain receive" stays — the address and a
QR code. Beside it, a person can now attach a wallet they already hold and push
USDC in from it, with the transaction built in the browser and signed by that
wallet. Nothing of Privy's funding machinery is involved.

This was not what the original decision assumed, because the original decision
assumed Privy's crypto path was a connect-and-sign flow. It is not: Privy
generates an intermediate deposit address and the user goes to their wallet and
sends to it, which is the same job as "plain receive" with an extra account in
the middle. A connected wallet is strictly better for Solana-native USDC —
one signature, no copying, nothing to switch apps for.

It is also better than the address for a reason the address cannot fix. People
sent SOL to it, which is why `useUsdcAck` now makes somebody agree to a rule
before it will show them their address at all. A transaction we build cannot
have the wrong mint or the wrong network, because it is not the sender who
chooses them.

**This does not contradict [ADR 0003](0003-custody.md).** That decision removed
the external wallet as _the account_. Custody is unchanged: the embedded wallet
is still the account, and an attached wallet signs one transfer and leaves. It
holds nothing of ours, and nothing of ours is held for it.

**It did cost one thing worth recording.** Seventeen places read
`useWallets().wallets[0]`, six of them to pick the key that signs a buy, sell,
send or loan. That was safe only because external wallets were switched off, so
there has only ever been one connected wallet. `useEmbeddedWallet` now names the
wallet instead of indexing for it, and fails closed. Any future decision to let
a wallet connect for any reason inherits that requirement.

### Correction: "no fees or minimums charged to us" is not supportable

The original text says card purchases carry no fees or minimums charged to us.
Privy's card-onramp and deposit-modal pages no longer state fees at all; both
now say to contact sales. Two costs the original decision did not account for:

- **Privy takes up to 0.25% of the input amount on any swap**, included in the
  rate, plus the underlying DEX protocol fee and, cross-chain, a bridge relayer
  fee. That applies to decision 1 — the universal deposit address — which is the
  one called "the important one".
- **Crypto deposits require app-pays gas sponsorship**, charged to our gas
  credits. Privy's own docs list its absence as an error case. So the
  destination-side gas for every crypto deposit is ours, not the user's.

The Solana-native path added above has neither, because a same-asset same-chain
transfer is not a swap and no Privy machinery touches it.

### Correction: the hook named in "Work required" is twice deprecated

`useFiatOnramp` is now `useFundWallet` → `useAddFunds` → `useDepositFunds`, and
the two current hooks are marked `@experimental`. That churn, not the fee, is
the reason to keep the path that depends on none of them.
