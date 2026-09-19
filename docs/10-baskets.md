# 10 · Baskets

Baskets are real tokens. Decision and rationale in [ADR 0005](adr/0005-basket-vaults.md).

## What the user experiences

> Put $500 into Semiconductors. You now hold one position called Semiconductors. You can send it
> to somebody. You can sell it back whenever you want.

Everything below exists to make those three sentences true.

## The model

```
          ┌────────────── vault ───────────────┐
 USDC ──► │ NVDAx  AVGOx  AMDx  TSMx  ASMLx    │ ──► basket token minted to user
          │ 30%    22%    18%   14%   10% ...  │
          └────────────────────────────────────┘
```

A basket has a target weighting. The vault holds constituent tokens. The basket token is a claim
on a pro-rata share of whatever the vault holds. Its price is the vault's net asset value divided
by supply.

## Investing, step by step

The swaps happen outside the program. This is the central design constraint.

```
1  User enters $500.
2  API runs the full execution decision on every constituent at its weight.
     $150 NVDA, $110 AVGO, $90 AMD, $70 TSM, $50 ASML, $30 MU
   Any leg that refuses fails the whole basket. Nothing is silently rebalanced.
3  Client executes the six Jupiter swaps, USDC in, stock tokens out.
4  Client calls deposit on the vault with the six token amounts in one transaction.
5  Vault values the deposit against Chainlink, compares to net asset value, mints
   basket tokens pro-rata, and sends them to the user.
```

Steps 3 and 4 are signed together where transaction size allows, and sequenced with a recovery
path where it does not. If step 4 never happens the user simply holds six stock tokens, which is
a recoverable state and not a loss.

## Redeeming

```
1  User sells $200 of Semiconductors.
2  Burn the corresponding basket tokens.
3  Vault returns a pro-rata slice of every constituent in kind.
4  Client sells those slices to USDC through the normal execution path.
```

In-kind redemption means the vault never needs to swap, so it never needs a route, so it can
never fail because liquidity moved.

## Net asset value

```
nav        = Σ (constituent balance × chainlink price)
sharePrice = nav / basketTokenSupply
```

Prices come from Chainlink per [ADR 0006](adr/0006-pricing.md). The multiplier needs no special
handling here, because a token's price already embeds it. The multiplier matters for displaying
share counts and comparing wrappers, not for valuing a vault.

## Drift, and being honest about it

Version one does not rebalance. Weights drift as constituents move, and the basket page shows
current weight against target so drift is visible rather than hidden. Rebalancing arrives in
version 1.1 and needs its own decision record, because a rebalance means the vault swaps, which
reintroduces everything this design avoids.

## Fees

A management fee accrues by minting a small quantity of basket tokens to the curator over time,
which dilutes holders by the fee rate. No separate charge, no balance to collect. Version one
ships with the fee set to zero and the mechanism present.

## The program, if we write it ourselves

Minimal on purpose. Roughly three hundred lines of Anchor.

| Instruction | Does |
| --- | --- |
| `initialize_basket` | Creates the vault, the basket mint, and the target weights |
| `deposit` | Takes constituent tokens in, values against Chainlink, mints pro-rata |
| `redeem` | Burns basket tokens, returns constituents pro-rata |
| `accrue_fee` | Mints the management fee to the curator |
| `pause` | Blocks deposits, never blocks redemption |

Deliberately absent: any swap, any admin withdrawal, any path that moves a user's assets without
burning their claim. Redemption can never be paused, because a user's exit must not depend on our
goodwill.

## Safety rules for the hackathon

- Upgrade authority is revoked before the submission link goes out.
- A hard cap on vault size while the code is young. A few thousand dollars, not more.
- Every deposit and redemption is checked against an independently computed expected value in
  tests before it runs on mainnet.
- The program is written first, in week one, and frozen in week three.
