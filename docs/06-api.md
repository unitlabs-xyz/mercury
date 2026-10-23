# 06 · API

Hono on Node. JSON in, JSON out. Zod schemas in `packages/types` define the request and response
shapes, and the routes live in `services/api/src/app.ts` and `services/api/src/routes`. This page
lists what is registered and why it is shaped the way it is. For the exact fields, read the schema.

## Conventions

- **Auth** is a Privy access token as a bearer token, and the identity token in
  `X-Privy-Identity-Token` when the client has one. Everything under `/v1` needs it, except market data and the basket
  templates (see Public below).
- **Money in requests** is a decimal string in USD, for example `"250.00"`. Never a number.
- **Errors** are `{ error: { code, message } }` with a stable `code`. A 500 also carries the
  `requestId` that its log line has.
- **The server never signs for the user.** Routes that touch chain return an unsigned
  transaction for the user's wallet. On a sponsored one the relayer co-signs as fee payer, and
  `POST /v1/transactions/send` checks the transaction before it does.

## Public

```
GET  /health
GET  /v1/instruments?q=&shelf=&sector=&scope=
GET  /v1/instruments/:ticker
GET  /v1/instruments/:ticker/history?span=
GET  /v1/instruments/history?span=&tickers=     several sparklines in one call
GET  /v1/basket-templates
GET  /v1/basket-templates/:slug
GET  /v1/basket-templates/:slug/insights
POST /feedback                                   the in-app feedback button
POST /webhooks/relay                             signed by Relay, not by a session
GET  /f/:slug                                    old waitlist share links, sent on to the site
```

Market data is public so a visitor can browse prices before signing in.

## Account

```
GET  /v1/me                                      who is calling, and which wallet is theirs
GET  /v1/market/status
```

## Orders

```
POST /v1/quote                                   the decision and the charge, nothing recorded
POST /v1/orders                                  → { orderId, decision }
POST /v1/orders/:id/execute                      → the unsigned transaction
POST /v1/orders/:id/confirm  { signature }       verifies the fill on chain, writes the lot
GET  /v1/orders/:id
POST /v1/transactions/send                       a signed transaction, co-signed and sent
```

The three steps (create, execute, confirm) exist so the decision can be shown to the user before
anything is signed, and so a signature is always tied to a decision we recorded. `decision` is
the object from `packages/core`, kept verbatim on the order row.

Trigger orders are not built. A decision that would queue one is refused instead.

## Portfolio

```
GET  /v1/portfolio
GET  /v1/portfolio/exposure/:ticker
GET  /v1/portfolio/history?range=1D|1W|1M
GET  /v1/portfolio/basket-returns
```

## Baskets

Two kinds. `/v1/baskets` is the original curated set, priced leg by leg. `/v1/basket-templates`
is Glider's managed portfolios.

```
GET  /v1/baskets
POST /v1/baskets/:slug/preview

GET  /v1/basket-portfolios
GET  /v1/basket-templates/:slug/portfolio
GET  /v1/basket-templates/:slug/activity
GET  /v1/basket-templates/:slug/enrollment
POST /v1/basket-templates/:slug/enrollment/prepare
POST /v1/basket-templates/:slug/enrollment
POST /v1/basket-templates/:slug/funding/prepare
POST /v1/basket-templates/:slug/funding/confirm
POST /v1/basket-templates/:slug/rebalance
POST /v1/basket-templates/:slug/exit/:mode/prepare
POST /v1/basket-templates/:slug/exit/:mode
GET  /v1/basket-templates/:slug/operations/:operationId
```

`preview` runs the full decision on every leg without executing, which makes the all-or-nothing
rule in [04](04-execution-engine.md) visible to the user before they commit.

## Money

```
GET  /v1/money
POST /v1/money/send/quote
POST /v1/money/send/prepare                      → the unsigned transfer, then /v1/transactions/send
```

### Funding from another chain

Registered only when Relay is configured, so without it these answer 404 and the app hides the
method.

```
GET  /v1/money/fund/sources
GET  /v1/money/fund/tokens?q=&chainId=
POST /v1/money/fund/swap
POST /v1/money/fund/submitted
GET  /v1/money/fund/intents
```

## Borrowing

```
GET  /v1/borrow
GET  /v1/borrow/:ticker
POST /v1/borrow/transactions                     deposit, borrow, both, repay or withdraw; unsigned
POST /v1/borrow/confirm
```

## Earn

Idle USDC lent through Kamino Earn vaults, a vault at a time, put in and taken out by the person.
Nothing moves on its own.

```
GET  /v1/earn                                    what is in Earn, vault by vault; whether the risks are accepted
GET  /v1/earn/vaults                             every vault on offer, Mercury's picks first
GET  /v1/earn/vaults/:address?range=1M|3M|1Y     a vault's rate over time and where it lends
PUT  /v1/earn/settings  { vault }                the vault new cash goes to by default
PUT  /v1/earn/risk  { version }                  accept the risks, as worded at `version`
POST /v1/earn/transactions                       deposit or withdraw; unsigned, the relayer paying
POST /v1/earn/confirm  { signature, action }     files what the transaction moved
```

- **Deposits need the current wording of the risks accepted** (`risk_not_accepted` otherwise).
  Withdrawals never wait on it.
- **Money goes in only to a vault on the list, and comes out of any Kamino USDC vault**, so a
  vault that drops off the list never strands what is in it.
- **The send path records each move itself.** `POST /v1/transactions/send` tells Earn about every
  transaction the node takes, and Earn files the ones it built once they can be read. Confirm is
  the fast path, not the only one; both are idempotent on the signature.

## Activity

```
GET  /v1/activity?limit=&cursor=
GET  /v1/activity/:id                            the receipt
```

## Realtime

None. The clients poll with TanStack Query, and the background jobs in `services/api/src/index.ts`
keep what they poll current. Portfolio, money and activity every 30 seconds (`apps/web/src/api/live.ts`,
and the same in the mobile app), and everything at once after the app's own transactions
(`settle.ts`). Every poll of portfolio and money reads the chain on the paid RPC, which is why it is
not faster.
