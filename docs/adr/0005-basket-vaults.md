# ADR 0005 · Baskets are real tokens, built on Symmetry

**Status:** superseded by [ADR 0013](0013-baskets-on-glider.md) · 19 September 2026 · supersedes the build-or-integrate version

> Baskets are now user-owned Glider portfolios, not Symmetry vault tokens. This record is kept
> for history; the Symmetry spike below never closed.

## Context

A basket can be an allocation rule the app remembers, or an actual token backed by the
constituents. The second is the thing no off-chain broker can copy, and writing a vault program
that holds user funds in three weeks is the riskiest thing we could do.

## Decision

**Baskets are real tokens, and we use Symmetry Protocol rather than writing our own vault.**

Symmetry is permissionless asset-management infrastructure on Solana. Anyone can create a vault,
deposit, withdraw or run keeper infrastructure. A basket holds up to a hundred SPL or Token-2022
mints with target weights and per-token oracle configuration, and creating one mints a token
representing the underlying assets. Users contribute tokens and receive vault tokens, or burn
vault tokens and receive the underlying assets. That is exactly the in-kind model we had
specified, already deployed and already used.

The SDK is `@symmetry-hq/baskets-sdk`, the docs are at `docs.symmetry.fi`, and the reference
interface at `app.symmetry.fi` is open source.

## Why this is the right call, not just the fast one

1. **The dangerous code disappears.** A three-week-old program holding user funds was the single
   largest risk in the plan. It no longer exists.
2. **Composability is a judging criterion.** Building on a live protocol scores where a bespoke
   vault would not.
3. **A fortnight of one engineer comes back.** Reallocated in [08 Roadmap](../08-roadmap.md).
4. **Jupiter already integrates it.** A `@jup-ag/symmetry-sdk` package exists, which raises the
   possibility that basket tokens are routable through Jupiter directly. If so, investing in a
   basket becomes a single swap rather than six swaps and a deposit. See the spike below.

## The day-one spike, 20 September

Three questions, one day, written into this record the same day.

1. **Does Symmetry's supported token list include the xStocks mints we need?** Call
   `getTokenListData()` and check. This is the only question that can stop us.
2. **Are basket tokens routable through Jupiter?** If yes, buying a basket is one swap and the
   whole multi-leg flow in [10 Baskets](../10-baskets.md) becomes a fallback rather than the
   primary path.
3. **Can we configure Chainlink as the oracle per constituent**, per [ADR 0006](0006-pricing.md)?

## Exit path

"At least for now" is load-bearing. Symmetry is a dependency that holds user assets, so:

- Redemption must work without our app. Verify a user can withdraw directly through
  `app.symmetry.fi` if we disappear, and say so in the product.
- Basket configuration lives in our database as well as on chain, so the same baskets can be
  recreated elsewhere.
- Nothing in `packages/core` depends on Symmetry. The integration lives behind a `BasketVenue`
  interface in `packages/chain` with exactly four methods: quote, invest, redeem, value.

Writing our own vault stays available as a later decision, and that interface is what makes it a
week of work rather than a rewrite.

## Consequences

**Good.** Baskets are genuinely sendable and genuinely one position. No program audit burden. No
upgrade authority to revoke. The product claim in [00 Overview](../00-overview.md) is true in the
present tense.

**Bad.** A dependency we do not control sits between users and their assets. Symmetry's fees and
its keeper behaviour are theirs, not ours. If the spike fails on question one, we fall back to
writing the minimal vault and the schedule tightens sharply.
