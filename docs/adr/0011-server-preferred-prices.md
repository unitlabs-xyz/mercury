# 0011 · Server-preferred prices, browser fallback

**Status:** accepted, 24 September 2026
**Supersedes in part:** [0010](0010-client-side-prices.md)

## Context

ADR 0010 recorded that the browser reads Jupiter, Pyth and Kamino directly, with no
key and no server. That was true when nothing server-side existed. Subsystem 2 lifts
those reads into `@mercury/market` and `@mercury/chain`, and the API now serves them.

## Decision

The API is the preferred source for market data. The browser keeps its direct reads
as a fallback, used only on **transport** failure — a timeout or a 5xx — and never on
a 4xx, because a 401 or a 422 is the API answering correctly and rerouting it would
hide the bug behind a path that cannot authenticate anyway.

The fallback is market data only. Positions, orders and activity are ours and have no
keyless equivalent, so the degraded state is precise: **live prices, no portfolio.**

Both paths run the same code. The adapters are runtime-agnostic — `fetch` injected, no
Node built-ins, no `window` — so the server and the browser import the same module
rather than two implementations that would drift.

One port has two implementations on purpose. `MultiplierSource` is read from the
Token-2022 ScaledUiAmount extension on the mint by the server, and from Jupiter's
`scaledUiConfig` by the browser, which cannot make an RPC call it has no URL for. A
live parity test asserts the two agree. Both apply the switchover rule: the multiplier
in force is `newMultiplier` once its effective timestamp has passed, which the browser
code did not do and which understated shares by 0.08% on NVDAx in September 2026.

## Consequences

- `apps ──► market, chain` becomes a legal dependency edge. [03](../03-architecture.md)
  is amended to match.
- Chainlink Data Streams remains the upgrade path recorded in 0010, unchanged. It is
  more correct and nothing calls it.
- A second implementation of one port is a drift risk. The live parity test is the
  control, and it is run by hand rather than in CI because it needs an RPC.
