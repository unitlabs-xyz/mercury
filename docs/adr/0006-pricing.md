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

Accuracy matters more than preference, and this was measured on live mainnet on 19 September 2026
during an actual dividend window. SPY went ex-dividend $1.889 on 18 September; the next day the
SPYx mint still carried June's multiplier.

| Source | Error against fair price |
| --- | --- |
| Chainlink | 0.8 bp |
| Naive underlying × multiplier | 17.3 bp low |
| Raw Jupiter DEX price | 20 bp low |

Our premium tolerance is 100 basis points, so a 17 to 20 basis point systematic error is a fifth
of the thing we are measuring. Measurements from the Rambu project, see
[11 References](../11-references.md).

**Sessions come from Pyth.** Its `market_session_schedule` covers regular, pre-market,
post-market and overnight, plus holidays and early closes. Deriving the calendar ourselves would
be worse and is pointless work.

**Multipliers and halts are read on chain.** The Token-2022 `ScaledUiAmount` extension carries
the multiplier and `Pausable` carries the issuer halt, both readable directly from the mint. An
API poll is a fallback, not the source.

## Consequences
The `market` package reads Chainlink for reference prices and corporate-action state. A second
source is kept for cross-checking and staleness detection, and a disagreement beyond a threshold
blocks trading in that instrument rather than guessing. The public issuer feed used for the
measurements in [01 Evidence](../01-evidence.md) stays as a development convenience and a
tiebreaker, not as production truth.
