# ADR 0005 · Baskets are real tokens

**Status:** accepted · 19 September 2026 · one sub-decision resolved in week 1

## Context
A basket can be an allocation rule the app remembers, or an actual token backed by the
constituents. The first is days of work, the second is weeks, and the second is the thing no
off-chain broker can copy.

## Decision
**Baskets are real tokens.** Holding a basket means holding one SPL token whose backing is the
constituent stock tokens held in a vault. It can be transferred, gifted, and later pledged as a
single collateral position.

## Build or integrate, decided by a one-day spike in week one
**Symmetry Protocol** already does this on Solana: create a basket, it mints a token representing
the underlying assets, with an SDK, oracle aggregation, up to a hundred tokens per basket, and
permissions and cooldowns. Over three hundred community baskets exist.

The spike answers one question: **does Symmetry support the xStocks mints we need?** If yes, we
integrate and spend the saved fortnight on the product, and composability is a judging criterion
we score on rather than a claim. If no, we build the minimal vault described in
[10 Baskets](../10-baskets.md).

Either way the user-facing result is identical, so the product and design work does not wait for
the answer.

## Design constraint that applies to both paths
**No swaps inside the program.** The client executes the constituent swaps through Jupiter and
then deposits in kind. The vault only counts what it receives and mints pro-rata. Redemption
burns and returns the constituents in kind, with the client optionally selling them afterwards.

This keeps the program small enough to read in one sitting, removes cross-program swap risk, and
means a failed swap never leaves the vault in a strange state.

## Consequences
**Good.** The claim in [00 Overview](../00-overview.md) about baskets being sendable becomes
true in the present tense. One position instead of six. A clean path to using a basket as
collateral in version two.

**Bad.** A Solana program holding user funds is the highest-risk thing in the repository and it
is being written in three weeks. Mitigations: no swaps inside, no admin withdrawal path, no
upgrade authority after launch, caps on vault size during the hackathon, and the program is the
first thing written and the last thing changed.

**Rebalancing is out of scope for version one.** Baskets drift from their target weights and the
app says so on the basket page. Rebalancing is a version 1.1 feature and needs its own record.
