# Mercury · Product Brief

> **Your investment account, in your own wallet, open every hour of the week.**
> Hold. Invest. Grow. Spend.

_Snapshot as of 6 October 2026. Built for Colosseum's Crypto World's Fair (Solana track),
submissions close 12 October 2026. Detailed sources: [`docs/`](docs) and [`docs/adr`](docs/adr)._

---

## 1 · One paragraph

Mercury is an investment account that lives in a crypto wallet. You arrive with stablecoins, buy
shares of real US companies and funds (Nvidia, Apple, the S&P 500), put money into ready-made
baskets, hold one portfolio of stocks, baskets and cash together, and borrow against your holdings
instead of selling them. It runs on Solana, but the person using it should never need to know
that. It is built for **investors, not traders**: it works like a brokerage account, not a trading
terminal.

---

## 2 · The problem we are solving

### 2.1 · Billions of people cannot own US equities

Someone in Lagos, Jakarta or São Paulo cannot open a US brokerage account. They **can** hold a
stablecoin today. Real US shares are now held by regulated custodians and mirrored as tokens on
Solana: **590 US stocks and funds**, from two issuers:

| Issuer              | Symbol suffix   | Tokens on Solana |
| ------------------- | --------------- | ---------------- |
| Backed (xStocks)    | `x` (`NVDAx`)   | 139              |
| Ondo Global Markets | `on` (`NVDAon`) | 451              |

They trade around the clock, the minimum is a few dollars, and you don't need a brokerage account
anywhere in the world. The access problem is solved on chain. The product problem is not.

### 2.2 · The raw market is unsafe for an ordinary investor

We measured the live market on 19 September 2026 ([01 Evidence](docs/01-evidence.md)). Four
findings:

**1. The same stock is several tokens, and they are not interchangeable.** Every major ticker
exists from both issuers. Each token has a **multiplier**: the number of real shares it
represents. The multiplier rises as dividends are reinvested. If you compare raw token prices
without dividing by it, you get the wrong answer. On the S&P 500, a naive comparison makes the
price gap look more than 3× bigger than it is.

**2. Only one wrapper is usually liquid, and picking the wrong one is very expensive.** Quotes for
a $1,000 buy, priced per real share:

| Ticker | Backed $/share (impact) | Ondo $/share (impact) |
| ------ | ----------------------- | --------------------- |
| NVDA   | $222.33 (0.02%)         | **$1,523.66 (85%)**   |
| TSLA   | $364.86 (0.02%)         | **$14,054.51 (97%)**  |
| QQQ    | $721.07 (0.11%)         | $2,884.48 (76%)       |
| SPY    | $764.21 (0.00%)         | $765.03 (0.10%)       |

A user who picks the wrong Nvidia token pays $1,524 for a $222 share, and nothing in the market
warns them. **This is the single strongest reason the product exists.**

**3. Tokens trade all week, but the stock exchange does not.** On weekends and holidays the token
price can drift away from the real share price, and no arbitrage pulls it back. The drift is
usually tiny (under 0.15%), but it is unbounded. On another chain, a tokenized HIMS traded at
**4.6×** its share price.

**4. Dividends silently change the maths.** Between the ex-dividend date and the issuer's
multiplier update, a naive price reads low. On SPY we measured 17.3 basis points low, which is a
sixth of our whole premium tolerance.

### 2.3 · Existing products don't address this

- **DEX front-ends** show every token, lookalikes included, and route to whatever you click.
- **Trading products** (e.g. Backpack) already offer stocks and crypto in one account, but they
  optimise for perps, margin and order books, which is the opposite of what a first-time
  investor needs.
- **Traditional brokers** don't have this problem, so they don't have a screen for it. They also
  aren't available to our users.

---

## 3 · Who it's for

**Version one: people who already hold crypto.** They arrive with stablecoins and want to _own_
Nvidia or the S&P 500 and leave it alone. They don't want leverage or candlesticks.

Starting crypto-native means no bank rails, no per-country money licensing and no identity checks
([ADR 0001](docs/adr/0001-crypto-native.md)). That is why a real product can ship in weeks instead
of quarters.

**Later: people with no brokerage access anywhere.** They arrive once a fiat on-ramp exists.
Privy's card on-ramps already give a partial path ([ADR 0007](docs/adr/0007-wallet-funding.md)).

---

## 4 · What makes Mercury different

Five things a traditional broker cannot copy:

1. **True exposure across issuers.** One person can hold three Nvidia tokens. Mercury adds them up
   as `Σ (token quantity × multiplier)`, not by counting tokens. It warns when one issuer holds
   more than 80% of a position, or more than 60% of the portfolio.
2. **Protection from the wrong wrapper.** On every order, at the actual order size, Mercury quotes
   every issuer, prices each per real share, and routes to the best one. It shows the user what it
   checked and what it avoided.
3. **A basket is one real token.** It is backed by a Symmetry vault holding the constituents, not
   a rule in our database. You can hold it, send it and (later) pledge it.
4. **A share count that grows by itself.** Dividends arrive as a rising multiplier. Mercury shows
   that as shares gained ("You now own 2.401 shares of Nvidia, up from 2.398"). Most integrations
   ignore the multiplier, and their numbers slowly drift wrong.
5. **Leaving is trivial, and we say so.** Holdings sit in the user's own wallet. Basket redemption
   works through Symmetry directly, even if Mercury disappears.

---

## 5 · The product

Four tabs. Every other screen sits inside one of them.

| Tab          | What it holds                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| **Home**     | Total value (stocks + baskets + cash), holdings, P&L, true exposure per company, dividend events     |
| **Invest**   | Search, Popular / Biggest movers / Sectors shelves, stock pages with the issuer comparison, baskets  |
| **Money**    | USDC balance earning yield, send, receive (address + QR), funding, borrowing                         |
| **Activity** | Every buy, sell, basket, dividend, send and receive, each with its transaction signature; CSV export |

### 5.1 · Buying: three designed outcomes

The user types one input, a dollar amount. The review screen shows estimated shares, price per
share, which issuer was chosen and why, the premium against the real share price, and the fee.
Every order ends in one of three outcomes, and all three are designed screens:

| Outcome     | When                                                      | What the user sees                                                |
| ----------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| **Execute** | Best wrapper is within tolerance of the real price        | Fill confirmation, with shares and fill price read off the chain  |
| **Queue**   | Premium above tolerance, usually while the market is shut | "Wait for the real price", or buy now anyway                      |
| **Refuse**  | No wrapper can fill at this size                          | Which issuers were tried, what failed, a suggested smaller amount |

The user never sees the words "limit order". A queued order is a risk control, not a trading
feature.

### 5.2 · Baskets

A basket is a named set of stocks at fixed weights, bought in one action. It's backed by a
**Symmetry Protocol** vault, and the user holds one basket token
([ADR 0005](docs/adr/0005-basket-vaults.md), [10 Baskets](docs/10-baskets.md)).

- **Core US** (70% SPYx / 30% QQQx) is locked. It's built from the two deepest tokenized equities
  on Solana, so it will never fail a leg. Minimum $25, capped at $5,000 while the integration is
  young.
- **Big Tech** and **AI & Semiconductors** are candidates. A constituent ships only if its price
  impact is under 1% at $1,000 and under 2% at $10,000.
- If any leg can't be routed, the whole basket is refused. Mercury never silently rebalances into
  the remaining names.

### 5.3 · Borrowing

Mercury borrows against xStocks through **Kamino**, up to 80% of Kamino's own limit. Borrowed USDC
arrives as ordinary cash. The headline figure is shown net of the loan, and the page shows how far
the portfolio could fall before liquidation. A background job watches every loan and warns its
owner off-app when a loan crosses a line. This is a Lombard loan (cash without extra exposure),
not margin.

### 5.4 · Funding and fees

- **Sign-in:** email creates a Privy embedded Solana wallet in seconds. No seed phrase, no
  external wallets in v1 ([ADR 0003](docs/adr/0003-custody.md)).
- **Funding:** a universal deposit address (any asset, any chain, converted to USDC on Solana),
  card on-ramps through Privy's providers, and a plain receive address.
- **No SOL needed:** a fee relayer pays network fees, so a wallet holding only USDC can trade and
  borrow. The relayer only co-signs transactions Mercury itself built.
- **One press, one signature:** Mercury's review screen _is_ the confirmation. There's no second
  wallet pop-up ([ADR 0012](docs/adr/0012-silent-signing.md)). See the risks section.

### 5.5 · Confirmed rules

| Rule                         | Value                                               |
| ---------------------------- | --------------------------------------------------- |
| Minimum order                | $5 (refused below, never rounded)                   |
| Max price impact             | 1.5%, refuse above                                  |
| Premium tolerance            | 1.0%; above it while closed, offer queue            |
| Max reference-price age      | 120s while open, 900s while closed                  |
| Issuer concentration warning | 80% of a position                                   |
| Routable tokens              | Verified issuer mints only                          |
| Listing rule                 | Listed only if some wrapper can fill a normal order |

### 5.6 · Deliberately not built

These are decisions, not gaps ([ADR 0009](docs/adr/0009-investing-not-trading.md)):

- **Never:** perpetuals, margin, options, order books, candlesticks, user-set limit orders,
  anything that rewards trading more often.
- **Not in v1:** bank deposits and withdrawals, identity checks, news, analyst data, a screener, a
  tax centre, savings goals, user-created baskets, an AI assistant.
- **Cut on 30 Sept:** recurring investing.

---

## 6 · The core: the execution engine

Everything else is a screen around this. It lives in `packages/core`, does **no I/O**, and is the
most heavily tested code in the repo ([04 Execution engine](docs/04-execution-engine.md)).

**The question it answers:** given a ticker, a side and a dollar amount, what's the right thing to
do right now?

```
1  Refuse outright if: below $5 · token halted · reference price stale · dividend pending
2  For each wrapper's quote:
     pricePerShare = (usdAmount / tokensOut) / multiplier     ← the correction
     viable        = priceImpact <= 1.5%
3  No viable wrapper → REFUSE, with every candidate and its reason
4  best = cheapest viable price per share
5  fair    = referencePrice + pendingNetDividend               ← dividend-window fix
   premium = best.pricePerShare / fair − 1
6  premium within 1%            → EXECUTE
   above 1%, market open        → EXECUTE with warning
   above 1%, market closed      → OFFER QUEUE (Jupiter trigger order)
7  Return the decision with every candidate checked. The UI shows this.
```

Queued orders become **Jupiter trigger orders**. Keepers fill them on chain, so a queued buy still
fills even if our server is down.

Selling is the same procedure inverted, with one extra rule: when prices are close, sell the
less-liquid wrapper so the user keeps the more liquid one.

---

## 7 · Tech stack

### 7.1 · Monorepo layout

```
apps/
  web/        Vite + React 19 + React Router. The submission judges open.
  mobile/     Expo 56 + React Native (iOS). Shares sdk, types and view with web.
  landing/    Astro on bun. Marketing site. Outside the pnpm workspace.
services/
  api/        Hono on Node. The only backend; background jobs run inside it.
packages/
  core/       Pure domain logic: execution engine, cost basis, portfolio, baskets. No I/O.
  chain/      Solana adapters: Jupiter, Symmetry, Kamino, RPC, token registry.
  market/     Reference prices, market hours, multipliers (Jupiter, Pyth, Kamino).
  view/       Presentation logic shared by web and mobile: formatting, order copy, activity, QR.
  types/      Shared types and Zod schemas.
  sdk/        Typed API client used by web and mobile.
```

Dependencies only flow one way, and lint enforces it. `core` never imports `chain` or `market`: it
receives quotes as plain data and returns decisions, so the engine is tested without a network.

### 7.2 · Choices

| Layer           | Choice                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------- |
| Monorepo        | pnpm 10 workspaces + Turborepo, Node 24                                                     |
| Language        | TypeScript (strict, `noUncheckedIndexedAccess`) everywhere                                  |
| API             | Hono on Node; Zod at every boundary                                                         |
| Database        | Postgres 16 + Drizzle ORM (PGlite in tests)                                                 |
| Solana client   | `@solana/kit`                                                                               |
| Swaps & queues  | Jupiter (Ultra swaps, Trigger API for queued orders)                                        |
| Baskets         | Symmetry Protocol (`@symmetry-hq/baskets-sdk`)                                              |
| Lending         | Kamino (`@kamino-finance/klend-sdk`)                                                        |
| Reference price | Jupiter `price/v3` `stockData` in v1; Chainlink xStocks Data Streams is the planned upgrade |
| Market sessions | Pyth market-hours schedule                                                                  |
| Multipliers     | Read on chain from the Token-2022 `ScaledUiAmount` extension                                |
| Wallets & auth  | Privy embedded wallets (web: `react-auth`, mobile: `expo`)                                  |
| Data fetching   | TanStack Query on web and mobile                                                            |
| Styling         | Tailwind v4 on web; shared design tokens on mobile                                          |
| Share images    | Satori + resvg (OG images)                                                                  |
| Tests           | Vitest                                                                                      |
| Hosting         | API in Docker on Coolify; web on Vercel                                                     |

### 7.3 · Background jobs (inside the API)

Each job reschedules only after its previous pass finishes, so passes never overlap.

| Job                  | Cadence | Does                                                           |
| -------------------- | ------- | -------------------------------------------------------------- |
| `stocks`             | 6h      | Refreshes the instrument universe; records multiplier changes  |
| `position-sync`      | 2s      | Reconciles positions with the chain; recognises dividends      |
| `wallet-events`      | 30s     | Turns wallet history into activity rows for SOL/USDC transfers |
| `portfolio-snapshot` | 1h      | Records account value, the only history the chart can draw     |
| `loan-watch`         | 5m      | Warns owners when a Kamino loan crosses a line                 |

### 7.4 · Request path for a buy

```
client ── POST /v1/orders ──► api: reference price + session (market)
                                   quotes from every wrapper (chain/Jupiter)
                                   decide() (core) → EXECUTE | QUEUE | REFUSE
client ◄── decision + every candidate + reasoning
client ── execute ──► api builds the UNSIGNED transaction (fee-sponsored)
client signs with the Privy wallet and submits
client ── confirm { signature } ──► api verifies on chain, writes lot + position
```

**The server never holds a private key.** The client signing is the hinge of the design: the
worst failure is a bad recommendation, not a drained wallet. If the API is unreachable, the web app
falls back to reading Jupiter, Pyth and Kamino directly, so users still see live prices, just not
their portfolio ([ADR 0011](docs/adr/0011-server-preferred-prices.md)).

There's no fixture mode, testnet or dry run. Tokenized stocks exist only on mainnet, so every
environment trades real money.

---

## 8 · Principles

1. **Read it, don't type it.** Every price, route, multiplier and calendar is read live and
   credited on screen. A number written into the source code eventually goes quietly wrong.
2. **Name the bad outcome.** Refusals, queues, liquidation and the weekend gap are part of the
   product, not fine print.
3. **Correctness before completeness.** Fewer things shown accurately beats everything shown
   approximately.
4. **Investing, not trading.** Every feature should help someone own something, not tempt them
   to churn it.
5. **Leaving stays trivial.** Self-custody _is_ the product.

Also: third parties are named, never absorbed (the basket page names Symmetry, credit names
Kamino). WCAG 2.1 AA is a binding commitment.

---

## 9 · Status, as of 6 October 2026

**Working end to end on mainnet:**

- Email sign-in and embedded wallet
- USDC deposit and receive
- Browse and search the routable universe
- Per-issuer comparison
- Buy sheet with all three outcomes
- Send
- Borrowing and repaying on Kamino, fee-sponsored
- Activity with filters and export
- Loan warnings
- iOS app at near-parity on the core flows
- Landing site. The founding-card waitlist it launched with is archived in
  [docs/archive/waitlist](docs/archive/waitlist/README.md)

**Still open before submission:**

- Portfolio, Money and Activity must run fully on real data. Return figures and 30-day buyer
  counts are still labelled placeholders (`apps/web/src/market/placeholder.ts`).
- Baskets two and three depend on the routing sweep.
- Jupiter trigger-order polling isn't built yet. Until it is, an order that would queue is refused
  instead.
- There's no price cache; prices are read upstream on every call.

**Timeline:**

| Date       | Milestone                                              |
| ---------- | ------------------------------------------------------ |
| 9 October  | Feature complete; no new features after this           |
| 11 October | Submit, a full day early                               |
| 12 October | Submissions close                                      |
| 23 October | Judging; the web build and API must stay up through it |

---

## 10 · Roadmap and business

| Release              | What                                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1.0** (Oct)        | Hackathon submission: investing, issuer protection, exposure, baskets, borrowing                                                                                     |
| **1.1** (Oct to Dec) | Basket rebalancing via Symmetry keepers; gifting a holding by link; more baskets                                                                                     |
| **2.0** (Q1)         | Fuller borrowing risk screen (today's fall and a Monday gap); **Mercury Card** spending against the borrowing limit, through a partner who handles fiat and identity |
| **3.0**              | **Creator baskets**: anyone publishes a basket and earns an automatic fee split, with a track record that's a chain of timestamped transactions                      |

**Revenue levers** (the business plan is still to be written for the submission):

- Basket management fees: modelled at around 0.5% a year; Core US ships at 0%.
- Card economics, once a card partner exists.
- Creator baskets with a protocol fee split. **This is the actual business.**

**What we don't have, and won't invent:** users, a track record, revenue, press, testimonials,
or partnerships beyond the public protocols named above.

---

## 11 · Known risks

| Risk                                                   | Mitigation / status                                                                                                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Silent signing: an XSS bug could drain a wallet        | Accepted only while wallets hold test amounts. Policy-scoped delegated signing must replace it before real users ([ADR 0012](docs/adr/0012-silent-signing.md)) |
| Single price vendor (Jupiter) in v1                    | Chainlink as primary with a cross-check is the recorded upgrade ([ADR 0010](docs/adr/0010-client-side-prices.md))                                              |
| Symmetry holds basket assets                           | Redemption works without us; basket definitions are also in our DB; a `BasketVenue` interface keeps our own vault a week of work                               |
| Depth above $10k and dislocation events are unmeasured | Engine refuses on impact; queue on premium                                                                                                                     |
| Public RPC rate limits                                 | Paid RPC (Helius / Triton), backoff with jitter, batched Kamino reads                                                                                          |
| Issuer liquidity is lopsided                           | That's why the product exists; refusals are designed outcomes                                                                                                  |
