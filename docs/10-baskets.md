# 10 · Baskets

Baskets are real tokens, built on **Symmetry Protocol**. Decision and reasoning in
[ADR 0005](adr/0005-basket-vaults.md).

## What the user experiences

> Put $500 into Semiconductors. You now hold one position called Semiconductors. You can send it
> to somebody. You can sell it back whenever you want.

## The model

Symmetry is permissionless asset-management infrastructure on Solana. A basket is a vault holding
up to a hundred SPL or Token-2022 mints at target weights, with per-token oracle configuration.
Creating one mints a token representing the underlying assets.

```
          ┌────────────── Symmetry vault ───────────┐
 USDC ──► │ NVDAx  AVGOx  AMDx  TSMx  ASMLx  MUx    │ ──► basket token to the user
          │ 30%    22%    18%   14%   10%    6%     │
          └─────────────────────────────────────────┘
```

We are a client of this, not the operator of it. Users contribute tokens and receive vault
tokens; they burn vault tokens and receive the underlying assets.

## Investing · two possible paths

Which one we ship is decided by the day-one spike in [ADR 0005](adr/0005-basket-vaults.md).

### Path A · one swap, if basket tokens route through Jupiter
A `@jup-ag/symmetry-sdk` package exists, so this may simply work.

```
1  User enters $500.
2  Execution engine quotes USDC → basket token through Jupiter.
3  The premium gate applies as normal, against the basket's net asset value
   rather than a single share price.
4  One swap. One signature. Done.
```

Dramatically better, and it makes baskets feel like buying a stock rather than assembling one.

### Path B · six swaps and a deposit, if not
```
1  User enters $500.
2  API runs the full execution decision on every constituent at its weight.
     $150 NVDA, $110 AVGO, $90 AMD, $70 TSM, $50 ASML, $30 MU
   Any leg that refuses fails the whole basket. Nothing is silently rebalanced.
3  Client executes six Jupiter swaps, USDC in, stock tokens out.
4  Client deposits the six amounts into the Symmetry vault.
5  Vault mints basket tokens pro-rata and sends them to the user.
```

Steps 3 and 4 are signed together where transaction size allows. If step 4 never lands, the user
simply holds six stock tokens, which is recoverable and not a loss.

## Redeeming

Path A is a single swap back to USDC. Path B burns the basket tokens, receives a pro-rata slice
of every constituent in kind, and sells those slices through the normal execution path.

In-kind redemption is the important property: the vault never needs to find a route, so it can
never fail because liquidity moved.

## Net asset value

```
nav        = Σ (constituent balance × oracle price)
sharePrice = nav / basketTokenSupply
```

Oracles are configured per constituent and we set Chainlink where available, per
[ADR 0006](adr/0006-pricing.md). Multipliers need no special handling for valuation, because a
token's price already embeds its multiplier. Multipliers matter for displaying share counts and
comparing wrappers, not for valuing a vault.

## Drift

Version one does not rebalance. Weights drift as constituents move, and the basket page shows
current weight against target so drift is visible rather than hidden. Symmetry supports
rebalancing and keepers; turning it on is a version 1.1 decision with its own record, because a
rebalance means the vault swaps.

## The venue interface

Nothing in `packages/core` knows Symmetry exists. The integration lives in `packages/chain`
behind four methods:

```ts
interface BasketVenue {
  quote(basketId: string, usdAmount: Decimal): Promise<BasketQuote>;
  invest(basketId: string, usdAmount: Decimal, owner: Address): Promise<UnsignedTx[]>;
  redeem(basketId: string, tokens: bigint, owner: Address): Promise<UnsignedTx[]>;
  value(basketId: string): Promise<{ nav: Decimal; sharePrice: Decimal; weights: Weight[] }>;
}
```

That boundary is what keeps writing our own vault a week of work rather than a rewrite.

## What we promise users about the dependency

- **Redemption works without us.** A user can withdraw directly through Symmetry's own interface
  if our app disappears. We verify this before launch and say it in the product.
- **Basket definitions live in our database too**, so the same baskets can be recreated elsewhere.
- **We are not the custodian and do not pretend to be.** The basket page names the protocol.
