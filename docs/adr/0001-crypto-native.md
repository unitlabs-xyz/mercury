# ADR 0001 · Crypto-native, no fiat ramps in version one

**Status:** accepted · 19 September 2026

## Context
The product could accept bank deposits and let anyone buy US stocks, or it could assume the user
already holds stablecoins.

## Decision
Version one assumes stablecoins. No bank deposits, no withdrawals, no card top-ups, no identity
checks.

## Consequences
**Good.** Removes payment rails and per-country money licensing, the two hardest problems in
consumer finance. Removes an identity vendor. Makes the product legal to use almost everywhere
without us holding a licence. Lets three weeks be enough.

**Bad.** The addressable audience shrinks to people who already hold crypto, which is not the
unbanked user the long-term thesis is about. The Money tab becomes thin.

**Later.** A card is a fiat off-ramp by definition. When it arrives, the card partner is the
ramp and carries the identity burden. That is an integration, not a reversal of this decision.
