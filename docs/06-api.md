# 06 · API

Hono on Node. Base path `/v1`. JSON in, JSON out. Zod schemas in `packages/types` are the single
definition, imported by the server for validation and by the SDK for types.

## Conventions

- **Auth** is a bearer token from the wallet session. Every route except market status needs it.
- **Money in requests** is a decimal string in USD, for example `"250.00"`. Never a number.
- **Errors** are `{ error: { code, message, details? } }` with a stable `code`.
- **Idempotency**: any POST that moves money accepts an `Idempotency-Key` header.
- **The server never signs.** Routes that touch chain return an unsigned transaction.

## Discovery

```
GET  /v1/market/status
     → { session, openState, nextOpenAt, nextCloseAt, isWeekend }

GET  /v1/instruments?q=&shelf=popular|movers|sector&sector=
     → { instruments: [{ ticker, name, sector, price, changePct24h, logoUrl }] }

GET  /v1/instruments/:ticker
     → { instrument, price, changePct24h, chart, wrappers: [{ issuer, symbol, mint,
         multiplier, isRoutable }] }

GET  /v1/instruments/:ticker/chart?range=1d|1w|1m|1y|all
```

## Orders

```
POST /v1/orders
     { ticker, side, usdAmount }
     → { orderId, decision }

     decision is the object from packages/core verbatim: kind, best candidate,
     premiumPct, every candidate with its price per share, impact and verdict.
     Nothing has happened on chain yet.

POST /v1/orders/:id/execute
     → { unsignedTransaction, expiresAt }

POST /v1/orders/:id/confirm
     { signature }
     → { order }          server verifies on chain, writes the lot, updates the position

POST /v1/orders/:id/queue
     { triggerPricePerShare }
     → { unsignedTransaction }     a Jupiter trigger order

POST /v1/orders/:id/cancel
GET  /v1/orders?status=&limit=&cursor=
GET  /v1/orders/:id
```

The three-step create, execute, confirm shape exists so the decision can be shown to the user
before anything is signed, and so a signature is always tied to a decision we recorded.

## Portfolio

```
GET  /v1/portfolio
     → { totalValueUsd, cashUsd, changeUsd, changePct,
         holdings: [{ instrument, shares, valueUsd, costBasisUsd, unrealisedPnlUsd,
                      changePct24h, wrapperCount }],
         baskets: [...] }

GET  /v1/portfolio/exposure/:ticker
     → { shares, valueUsd,
         wrappers: [{ issuer, symbol, shares, valueUsd, sharePct, multiplier }],
         warnings: [{ code, message }] }

GET  /v1/portfolio/history?range=
```

## Baskets

```
GET  /v1/baskets
GET  /v1/baskets/:slug
     → { basket, constituents: [{ instrument, weightBps }], performance, minimumUsd }

POST /v1/baskets/:slug/preview
     { usdAmount }
     → { legs: [{ instrument, usdAmount, decision }], overall: "executable"|"partial"|"refused" }

POST /v1/baskets/:slug/invest
     { usdAmount, acceptQueued: boolean }
     → { basketInvestmentId, transactions: [unsigned...] }
```

`preview` runs the full decision on every leg without executing, which is what makes the
all-or-nothing rule in [04](04-execution-engine.md) visible to the user before they commit.

## Recurring

```
GET  /v1/plans
POST /v1/plans
     { usdAmount, cadence, allocations: [{ targetKind, targetId, weightBps }] }
POST /v1/plans/:id/pause
POST /v1/plans/:id/resume
DELETE /v1/plans/:id
```

## Money

```
GET  /v1/money
     → { balanceUsd, yieldAprPct, interestEarnedYtdUsd, depositAddress,
         borrowingPower: { availableUsd, enabled: false } }

POST /v1/money/send
     { toAddress, usdAmount }
     → { unsignedTransaction }
```

## Activity

```
GET  /v1/activity?limit=&cursor=
     → { items: [{ id, kind, occurredAt, title, subtitle, amountUsd, txSignature }], nextCursor }

GET  /v1/activity/export.csv
```

## Webhooks and realtime

Version one polls with TanStack Query. A single server-sent events stream at
`/v1/stream` pushes order status changes and fills once polling starts to hurt. Not needed for
the hackathon build.

## Rate limits

Per wallet: 120 requests a minute, 10 order creations a minute. The quote endpoints behind
`/instruments/:ticker` are cached for fifteen seconds while the market is open and sixty seconds
when it is shut, which is also what the worker refreshes at.
