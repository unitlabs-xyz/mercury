# ADR 0006 · Chainlink for tokenized equity prices, not Pyth

**Status:** accepted · 19 September 2026

## Context
The execution engine compares an on-chain quote against the real share price. Everything depends
on that reference being right. Two oracle networks serve Solana.

## Decision
**Chainlink**, through its xStocks Data Streams, is the reference price for tokenized equities.

## Reasons
Chainlink is the official oracle for xStocks under an agreement with Backed, providing sub-second
price latency and real-time verification of corporate actions including dividends and splits.
Kamino already uses it for the same assets and applies a band against the last market close
outside trading hours.

Accuracy matters more than preference here. A naive Pyth equity price multiplied by the token's
multiplier reads about 17.3 basis points low, where Chainlink reads within 0.8 basis points of
fair price. Our premium tolerance is 100 basis points, so a 17 basis point systematic error is
seventeen percent of the thing we are measuring.

## Consequences
The `market` package reads Chainlink for reference prices and corporate-action state. A second
source is kept for cross-checking and staleness detection, and a disagreement beyond a threshold
blocks trading in that instrument rather than guessing. The public issuer feed used for the
measurements in [01 Evidence](../01-evidence.md) stays as a development convenience and a
tiebreaker, not as production truth.
