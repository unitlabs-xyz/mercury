# ADR 0016 · Price history is ours, recorded per token, and not read out of pools

**Status:** accepted · 14 October 2026

## Context

Nothing in the system keeps a price. The board in `@mercury/market` is spot and forgets within a
minute. Instrument charts read Yahoo's unofficial chart endpoint for the underlying share
(`packages/market/src/yahoo.ts`), which has no contract and no SLA. The portfolio chart reads
`portfolio_snapshot`, written once an hour for every account, and that has three costs:

- **It grows with accounts.** Each hour is an RPC balance read, a Kamino read and a Glider read per
  primary wallet.
- **It cannot be backfilled.** The job's own comment says it: an hour not recorded is a hole in the
  chart forever.
- **It cannot be recomputed.** When a valuation bug is found, the price the wrong number was
  computed from was never kept, so the history stays wrong.

The question raised was whether to replace Jupiter with a self-hosted pool indexer (Raptor,
Solroute, or Yellowstone gRPC with Vixen) and get price history and PnL from that.

## What was measured, 14 October 2026

Live Jupiter `swap/v1/quote`, USDC in:

| Issuer                  | Liquidity      | Impact at $1,000 | Where it routes                                                       |
| ----------------------- | -------------- | ---------------- | --------------------------------------------------------------------- |
| Backed xStocks, 8 tried | $0.6M to $4.5M | 0.000% to 0.112% | GoonFi V2, Riptide, BinaryFi, Hadron, Raydium CLMM, Byreal, Whirlpool |
| Ondo, 7 tried           | $0 to $10k     | 48% to 98%       | Manifest, nearly empty                                                |

Two things moved since [the 19 September measurement](../2026-09-19-solana-measurements.json).
SPYon went from 0.1% impact to 50%. NVDAx routed through Riptide then and through GoonFi V2 now.

## Decision

1. **We record our own price history, per token, from the price we already read.** A
   `price_bar` row per token per bucket, at one minute, one hour and one day, written by the
   `prices` job from the same `price/v3` answer that warms the board. No new upstream, and no
   new request.
2. **Two prices per bar, both per share.** The market price is what one share of this wrapper
   fetches in the pool, `usdPricePerToken ÷ multiplier`, which is the number holdings are valued
   at. The reference price is the issuer's quote for the underlying, `stockData.price`. The
   multiplier in force is recorded beside them. These are the two halves `stackedReturn` already
   splits a return into, and a history with one of them can tell only half the story.
3. **Per-account history is derived, not sampled.** An account's value at any moment is the shares
   it held then times the market price then. Lots already say what was held; this table says
   what it was worth. `portfolio_snapshot` stays until cash, debt and baskets each have a ledger
   of their own. After that it becomes a cache we can rebuild, not the only record.
4. **No pool indexer for prices.** Raptor, Solroute and Yellowstone with Vixen are not adopted for
   pricing.
5. **The warm set gets bars, not the universe.** That is every mint anyone has held plus the
   featured shelf, the set `warmPrices` already keeps fresh. Warming all 468 priceable tickers
   would cost twelve requests a pass against a keyless allowance of thirty a minute. A ticker
   that only ever appears in search has no bars, and its chart comes from the reference history.

## Why not a pool indexer

**It does not have history either.** A router keeps live pool state in memory to answer "what would
this swap fetch now", which is the question `price/v3` already answers. Changing who answers it
still leaves the recorder to build. Raptor ships as a closed binary (`solanatracker/raptor-binary`),
authenticated by a signature file and free during a beta. Solroute is a research implementation.

**It cannot see where xStocks are deepest.** Much of the best xStocks liquidity sits at
market-maker venues. GoonFi is a proprietary AMM: its swap logic is not published, and makers
reach Jupiter through an SDK they supply to Jupiter. We found no public documentation for Riptide,
BinaryFi or Hadron. A $1,000 order and a $10,000 order paying the same impact (MSTRx 0.000%, METAx
0.016%) looks like oracle-priced quoting rather than a curve. That is inferred, not confirmed. A
router that can simulate only public pools would price xStocks from the shallower ones.

**Ondo has nothing to index.** With $0 to $10k of liquidity, a $5 trade moves a pool-derived price,
and anyone can use that to push a chart or a PnL figure.

**The pool is not the stock.** Across twenty xStocks on 9 October, wrapper and underlying sat a
median 0.49% apart, and up to 9.4%. Through a dividend window the pool price ran 20bp low
([ADR 0006](0006-pricing.md)). It also drifts all weekend against a reference that has stopped. An
indexer supplies only the market half.

**It costs a stream and a service.** A mainnet Yellowstone stream starts at $499 a month on Helius's
Business plan, before metered data. On top of that is a Rust service that has to keep up with DEX
program upgrades, all to price a few dozen mints.
[ADR 0008](0008-jupiter-ultra.md)'s argument still holds: routing is what Jupiter does a million
times a day.

**Jupiter is not where the reference is weak.** `stockData.price` is the issuer's quote, and Jupiter
only passes it along ([ADR 0010](0010-client-side-prices.md)). Replacing that transport means
Chainlink, not a pool.

## Where streaming belongs

Positions, not prices. `position-sync` re-reads every primary wallet over RPC every two seconds,
eight at a time, so a pass grows with the number of accounts until the two-second cadence stops
holding. A subscription to those wallets' token accounts scales with activity instead. Watching the
issuer mints would also give a dividend's exact instant, rather than whenever the six-hourly
`stocks` job notices it. That is a separate decision, to take when the account count makes polling
hurt.

If we ever want a market price that is not Jupiter's, build it from a tape of fills: the token
balance changes in transactions that touch our mints. That works at every venue, prop AMMs
included, because it reads what executed instead of simulating a pool.

## Consequences

- **Market-price history starts when the recorder ships.** No upstream we read keeps it, so it
  cannot be backfilled. Every day before then is a day no chart will ever show.
- **Reference history can be backfilled, and should move off Yahoo.** Chainlink Data Streams is the
  source [ADR 0006](0006-pricing.md) chose. `/api/v1/reports/page` returns reports in order from a
  start time. Its tokenized-asset report schema (v10) carries the multiplier and when a new one
  takes effect, and its Candlestick API serves OHLC for charts. Access is credentialed and
  commercial, as [ADR 0010](0010-client-side-prices.md) recorded.
- **A sample is never a stale price stamped with a new time.** The recorder asks the board for a
  price no older than five seconds, so it waits for a fresh answer instead of taking a cached one
  under stale-while-revalidate.
- **Storage is small.** Fifty mints at 1,440 minutes is 72,000 one-minute rows a day, and one-minute
  rows are dropped after thirty days. Hourly and daily rows are kept.

## Order of work

1. Record `price_bar`. This ADR.
2. Derive portfolio value and PnL history from lots and bars.
3. Move reference history to Chainlink, and backfill five years.
4. Event-driven positions, when the account count calls for it.
