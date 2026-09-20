# ADR 0010 · Live prices in the browser, which means Jupiter and not Chainlink

**Status:** accepted · 20 September 2026 · supersedes part of [ADR 0006](0006-pricing.md) for v1

## Context
[ADR 0006](0006-pricing.md) chose Chainlink xStocks Data Streams as the reference price and Pyth
for sessions. It was decided on accuracy, and the measurement behind it still stands. It assumed
a server would do the fetching.

We wanted live prices in the web app now, without standing up `services/api` first.

## The constraint that decides it
**Chainlink Data Streams is credentialed.** It authenticates per request, so putting it in the
browser means shipping the credential to every visitor. There is no client-side version of that
decision — only a server-side one behind a proxy we have not built.

**Pyth's price endpoint is CORS-blocked.** Verified from `localhost` on 20 September 2026 against
`/v2/updates/price/latest` in bracket, percent-encoded and v1 forms: all refused, no
`Access-Control-Allow-Origin`. Its *metadata* endpoint, `/v2/price_feeds`, is open.

So the browser can have Pyth's calendar but not Pyth's prices, and cannot have Chainlink at all.

## Decision
For the client-only build:

| What | Source | Endpoint |
| --- | --- | --- |
| Reference price, per real share | Jupiter `price/v3` → `stockData.price` | free, no key |
| Token multiplier | Jupiter `price/v3` → `scaledUiConfig.multiplier` | free, no key |
| Execution price, impact, route | Jupiter `swap/v1/quote` | free, no key |
| Session, holidays, next open | Pyth `/v2/price_feeds` → `market_hours` | free, no key |

No API keys. `lite-api.jup.ag` is the unkeyed host; the keyed host exists for higher rate limits
and we deliberately avoid it, because a key shipped to a browser is a public key.

## Why this is not the circularity ADR 0006 warned about
`stockData.price` is the underlying share price, not a pool observation. It is Jupiter's
transport, not Jupiter's opinion. The premium calculation still compares an independent reference
against a routed quote, so the queue path still works — verified live: VIDAx showed +11.33%
against reference and the engine offered to queue rather than fill.

## What we give up
- **Accuracy in a dividend window.** ADR 0006 measured Chainlink at 0.8bp where a naive read was
  17.3bp low. We have not measured `stockData.price` through an ex-dividend date, and should not
  claim it matches Chainlink until we have.
- **The second source.** ADR 0006 wanted a cross-check that blocks trading on disagreement. With
  reference, multiplier and quote all arriving from one vendor, a Jupiter outage or a bad
  `stockData` field has nothing to contradict it. That is a real single point of failure and the
  main reason this is a v1 decision rather than a permanent one.

## Consequences
Restoring ADR 0006 means moving the reference read behind `services/api` and implementing
`ReferenceSource` against Chainlink there. `packages/market`'s ports already describe that shape,
and the web app reaches live data through `src/market/`, so the swap is a module rather than a
rewrite.

Until then, no screen may attribute a price to Chainlink. The previous copy on the stock page did,
above a hardcoded number, and has been removed.

## Verification, 20 September 2026
Verified tokens only. Search returns impersonators beside the real thing — an `NVDAx` with one
holder, an `NVDAon` with seventeen — so the universe filters on `isVerified` plus the issuer's own
tag. Symbol matching alone would route customer money into a lookalike.

Instruments are listed only where some wrapper holds roughly the depth a $1,000 order needs to
stay inside the 1.5% impact cap. Every verified Backed wrapper cleared it ($80k–$6.6m); every Ondo
wrapper fell below ($80–$48k). Both legs are kept wherever both exist, so the comparison survives.
