# ADR 0013 · Baskets are user-owned portfolios on Glider

**Status:** accepted · 5 October 2026 · supersedes [ADR 0005](0005-basket-vaults.md)

## Context

ADR 0005 chose Symmetry vaults so that each basket would be one token. The integration never left
its spike: `SymmetryVenue` still throws "awaiting the spike", and the open questions it depended
on (xStocks mints in Symmetry's token list, basket tokens routing through Jupiter, per-constituent
oracles) were never closed. Meanwhile Glider offered a working API for managed portfolios on
Solana, with enrollment, funding, scheduled and manual rebalancing, and exits, already proven in
an NVDAx/TSLAx pilot.

## Decision

**Baskets are Glider portfolios: one smart account per user per strategy, owned by the user's
wallet, rebalanced daily by Glider's agent.** There is no pooled basket token.

The catalog of strategies lives in `services/api/catalog.json` and is synced to Glider at
startup. Mercury handles discovery, enrollment, funding, exits and the record of what the user
did; Glider holds and trades the assets. Details in [10 Baskets](../10-baskets.md).

## Why

1. **It works today.** Every step of the lifecycle exists behind Glider's API, which a vault
   integration did not.
2. **Self-custody holds.** The portfolio is the user's own smart account, and exits always go to
   the owner. Mercury never holds assets or keys.
3. **Rebalancing comes with it.** Symmetry's keeper-driven rebalancing was a version 1.1 project;
   Glider rebalances daily from day one.
4. **Composability still scores.** The product composes a live protocol rather than a bespoke
   vault.

## What we give up

- **One token per basket.** A basket cannot be sent as one thing or pledged as collateral, and
  the overview's "a basket you can hold, send and pledge" is no longer true in that form.
- **Control of execution.** Swaps, timing and the swap fee are Glider's. The tenant only accepts
  daily schedules.
- **A dependency between users and their assets.** If Glider stops, users still own the smart
  account; exits in kind should remain possible through Glider directly, and the product says
  Glider is the provider.

## Consequences

- `packages/chain/src/symmetry`, the `BasketVenue` port, the legacy `/v1/baskets` routes and the
  mobile basket screens are leftovers from ADR 0005, to be removed or migrated.
- Basket value still needs to join the portfolio's net worth.
- Writing our own vault, or a single basket token, stays possible later; nothing in
  `packages/core` depends on Glider.
