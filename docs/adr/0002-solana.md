# ADR 0002 · Solana, not Robinhood Chain

**Status:** accepted · 19 September 2026

## Context

Tokenized equities live on several chains. Robinhood Chain has the tightest narrative, being the
chain built for them. Colosseum's Crypto World's Fair has tracks for both.

## Decision

Build on Solana.

## Reasons

1. **Exposure deduplication needs two issuers.** Solana has Backed and Ondo side by side.
   Robinhood Chain has Robinhood. Our headline feature cannot exist there.
2. **Borrowing is an integration on Solana.** Kamino already lends against eight tokenized stocks
   with an off-hours price band. Elsewhere we would write a lending market.
3. **The card path only works on Solana.** Bridge supports Solana and does not support Robinhood
   Chain.
4. **Prizes.** The Solana track carries $100,000 across ten winners. The four Ethereum tracks
   share $100,000, so Robinhood Chain is roughly $25,000 across five. Colosseum's accelerator,
   which writes $250,000 per team, is Solana-centric.
5. **Consumer surface.** Phantom and Jupiter, against a chain two and a half months old.

## Consequences

We give up a tighter story and a lighter field. Robinhood Chain has deeper single-chain equity
liquidity, and we lose that. Acceptable.
