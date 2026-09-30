# Backend design

**Status:** accepted · 23 September 2026 · 19 days to the 12 October deadline

The server side the web app currently does without. This spec is the _build_ design. It does not
restate the schema or the route surface — [05 Data model](../../05-data-model.md) and
[06 API](../../06-api.md) already specify those and remain the contract. What follows is what to
construct, in what order, and the decisions those two documents leave open.

---

## 1 · Where we actually are

Verified by reading the repo on 23 September 2026, not from the docs.

**Real and working**

- `packages/core` — `decide()`, cost basis, exposure, basket allocation. Pure, no I/O, 35 passing
  tests. **This spec does not change it.**
- `packages/types` — wire types and Zod schemas.
- `packages/chain/src/jupiter/ultra.ts` — a complete, typed Jupiter Ultra client against `/order`
  and `/execute`. Keyed, so server-only. Nothing imports it.
- `services/api/src/app.ts` — seven Hono routes and a real `priceOrder` that composes the ports
  into `decide()`.
- `apps/web/src/market/*` — live, keyless reads of Jupiter, Pyth and Kamino, proven from a
  browser on 20 September 2026.

**Declared but not implemented**

- `packages/market/src/ports.ts` — `SessionSource`, `ReferenceSource`, `MultiplierSource`. No
  implementations anywhere.
- `packages/chain/src/ports.ts` — `TokenRegistry`, `QuoteSource`, `TriggerSource`, `BasketVenue`.
  Only `QuoteSource` has one.
- `packages/chain/src/symmetry/venue.ts` — all four methods throw `"awaiting the spike"`.

**Absent**

- `services/api/src/deps.ts` — `buildDeps()` throws outright: _"registry, triggers, sessions,
  reference and multipliers are not implemented yet."_ **The API cannot start today.**
- No Postgres, no Drizzle, no migrations.
- No Privy anywhere. The auth modal is a staged mock with `setTimeout` waits.
- `services/worker` prints its job plan and exits.

**The observation the whole plan rests on:** the browser already implements the market ports the
server is missing. This is not a rewrite; it is a lift.

---

## 2 · Decisions taken

| #   | Decision                                                                                                      | Consequence                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Design all five subsystems in one spec, build strictly in dependency order, stop wherever 12 October finds us | This document covers work that will not ship. That is intentional — it stops subsystem 2 being designed into a corner that subsystem 4 cannot get out of. |
| 2   | Market data: **server preferred, browser falls back**                                                         | The most resilient and the most code. Made affordable by §3: both paths run the _same_ implementation.                                                    |
| 3   | **Deployed.** Judges visit a URL                                                                              | Hosting, secrets and uptime are in scope.                                                                                                                 |
| 4   | **No dummy data.** Real providers end to end                                                                  | `apps/web/src/app/data.ts` and `apps/web/src/market/placeholder.ts` are both deleted by the end of subsystem 2.                                           |
| 5   | Price history is **recorded by us**, not bought                                                               | See §6. Costs a new table and a job; buys honesty.                                                                                                        |

Approach chosen: **lift and adapt, read upstream per request.**

To be precise about the cache, because §4 and §6 both mention one: the API reads upstream per
request throughout subsystems 1–3. The `price-cache` job arrives in subsystem 4 and is consumed
**by the worker**, so that snapshotting every user's holdings does not call upstream per user.
Whether the API then also serves reads from that cache is a later, optional change — it alters
what is behind the API rather than its contract, so it needs no redesign.

Rejected: building fresh server adapters on Chainlink Data Streams and Jupiter Ultra. ADR 0006
measured Chainlink at 0.8bp error through a dividend window against 17–20bp for the
alternatives, so it is the more correct system — but nothing in this repo has ever called it,
and 19 days is not the moment to introduce unproven credentialed surface. Recorded as the
upgrade path in ADR 0010.

---

## 3 · Boundaries

`packages/market` stops being ports with no implementations. Each lifted module is made
runtime-agnostic: `fetch` is injected, no Node built-ins, no `window`.

| Browser file today                      | Becomes                           | Implements              |
| --------------------------------------- | --------------------------------- | ----------------------- |
| `market/pyth.ts`                        | `@mercury/market/pyth`            | `SessionSource`         |
| `market/jupiter.ts` → `stockData.price` | `@mercury/market/jupiter`         | `ReferenceSource`       |
| `market/jupiter.ts` → `scaledUiConfig`  | same module                       | `MultiplierSource`      |
| `market/universe.ts` + `searchTokens`   | `@mercury/chain/jupiter/registry` | `TokenRegistry`         |
| `market/jupiter.ts` → `/swap/v1/quote`  | `@mercury/chain/jupiter/lite`     | `QuoteSource` (keyless) |
| `market/kamino.ts`                      | `@mercury/market/kamino`          | new `CreditSource` port |

Stays in the web app: `hooks.ts` (React Query is app-level), `meta.ts` display names.

**Two adapters, one port.** `QuoteSource` gets two implementations — the keyless
`/swap/v1/quote` for _pricing_ a decision, and the existing `JupiterUltra` for _executing_ one.
`priceOrder` is unchanged; it uses whichever it is given.

**The dependency rule changes.** [03 Architecture](../../03-architecture.md) enforces
`apps ──► sdk ──► types` by lint. The browser fallback requires `apps ──► market, chain`. This is
a deliberate amendment, written down here so it is not discovered when the lint breaks.

**Effect on existing scaffolds**

- `services/api/src/deps.ts` — `buildDeps()` stops throwing. Config splits: **required**
  (`DATABASE_URL`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `SOLANA_RPC_URL`), **optional**
  (`JUPITER_API_KEY`, needed only for execution). `CHAINLINK_FEED_URL` and `PYTH_API_KEY` are
  removed — neither is used on this path.
- `services/api/src/app.ts` — the in-memory `orders` Map becomes Postgres; routes gain auth.
- `packages/core` — untouched.

---

## 4 · Build sequence

Strict dependency order. Each subsystem is shippable on its own, and **each gets its own
implementation plan** — this spec settles the shape so that subsystem 2 is not designed into a
corner subsystem 4 cannot escape, but five subsystems is too much for one plan to hold.

### 1 · Identity

`@privy-io/react-auth` (3.45.0) in web, **`@privy-io/node`** (0.35.0) in the API. Privy embedded
wallets only, per [ADR 0003](../../adr/0003-custody.md); no external wallets in v1.

Not `@privy-io/server-auth`. Privy's own docs name `@privy-io/node`, and the release history
agrees: `node` and `react-auth` both shipped 21 September 2026, `server-auth` last moved in
April. `server-auth` also hard-depends on `@solana/web3.js@1`, the legacy client
[03 Architecture](../../03-architecture.md) explicitly chose `@solana/kit` to avoid;
`@privy-io/node` depends on `jose` v6 and nothing chain-specific.

Every chain-specific peer of both packages is optional, so nothing EVM is pulled in.
**`@solana/kit` is deliberately not installed until subsystem 3**, where signing needs it. That
also sidesteps a live conflict: kit is at 8.3.0, `react-auth` accepts `>=3.0.3` but
`@privy-io/node` asks for `^5.1.0`. Optional peers, so it warns rather than fails — but there is
no reason to take the warning before we need the package.

**Email is Privy's, not ours.** Privy sends the OTP; there is no hook to substitute a provider,
and customising the sender or branding is enterprise-gated. No transactional email dependency in
v1. When the worker starts sending fill and dividend notices in subsystem 4, the question to
answer first is not which email service but whether Mercury stores addresses at all — docs/05
currently says it does not.

The auth modal's step machine is kept as designed. `useLoginWithEmail` returns
`sendCode({email})`, `loginWithCode({code})` and a `state` of
`initial | sending-code | awaiting-code-input | submitting-code | done | error`, which maps
almost directly onto the modal's existing `Pending` union.

**`SEND_MS`, `CHECK_MS` and `CREATE_MS` stop being simulated latency and become a minimum
display duration.** This is deliberate and must not be read later as a bug. A response that
arrives before the progress hairline finishes is held until it does, because the alternative is a
sub-100ms flicker through three designed states. A response that arrives _after_ it finishes
hands the same 2px rule over to an indeterminate sweep, because a full bar that has not advanced
reads as broken within about a second. Both cases are required; the first alone leaves the slow
path looking hung.

Server verifies the Privy access token per request — a standard ES256 JWT, so verifiable with
`@privy-io/node` or any JWT library — and creates `user` + `wallet` rows on first sight. The
server never holds a key.

**Done when:** a real email produces a real Solana wallet, and `GET /v1/portfolio` returns 401
without a token.

### 2 · Read models

Drizzle schema exactly as [05 Data model](../../05-data-model.md) specifies. Tables:
`instrument`, `token`, `multiplier_event`, `user`, `wallet`, `lot`, `position`, `order`,
`activity`. Baskets and plans land with their subsystems.

The hard case is already answered by docs/05: a Privy wallet that arrives already holding tokens
has no purchase history we witnessed. Those become `transfer_in` lots priced at the reference on
arrival, `is_estimated = true`, and the UI says so. Profit and loss must not be quietly wrong.

`apps/web/src/app/data.ts` is deleted here — `HOLDINGS`, `TOTAL`, `SPLIT`, `CASH`, `ADDRESS` and
`MARKET` all become reads. `placeholder.ts` loses its buyer counts to the `order` table; its
return figures wait for §6.

**Done when:** Portfolio, Money and Activity render from Postgres and chain, and
`grep -r "data.ts" apps/web/src` returns nothing. This closes the defect PRODUCT.md records.

### 3 · Execution

- `POST /v1/orders` — runs `decide()`, persists the `Decision` verbatim as jsonb. docs/05 is
  right that this blob is the answer to "why was I sold that wrapper?"
- `POST /v1/orders/:id/execute` — returns an unsigned transaction from Jupiter Ultra.
- Client signs via Privy and submits.
- `POST /v1/orders/:id/confirm` — verifies on chain, writes the lot, updates the position,
  appends activity.

**The server recomputes the decision at execute time.** A client-supplied decision is a
client-supplied price.

**Done when:** a real order for a real small amount fills on mainnet and produces a correct lot.

### 4 · Worker

The five jobs in `services/worker/src/jobs/index.ts` — `price-cache`, `multiplier-watch`,
`queued-orders`, `recurring`, `position-sync` — plus `portfolio-snapshot` from §6. A plain
interval loop with a lock, not a queue; [03 Architecture](../../03-architecture.md) already chose
this and it is right at this scale.

`price-cache` and `portfolio-snapshot` ship together: pricing every user's holdings per snapshot
by calling upstream would be wasteful.

### 5 · Baskets

**Blocked, and first to be cut.** `SymmetryVenue`'s four methods all throw. The block is three
questions already written down in `SPIKE_QUESTIONS`:

1. Are the xStocks mints in Symmetry's supported token list? Call `getTokenListData()`.
2. Do basket tokens route through Jupiter? If so, investing is one swap, not seven.
3. Can Chainlink be configured as the oracle per constituent?

Answering them is roughly half a day. Writing basket code before they are answered is not worth
doing, because question 2 decides whether the implementation is one code path or seven.

---

## 5 · Cross-cutting

**Fallback trigger.** The browser reads upstream directly only on _transport_ failure — a 2s
timeout or a 5xx. Never on a 4xx. A 401 or 422 is the API answering correctly and must surface as
an error; rerouting it would hide the bug behind a path that cannot authenticate anyway.

**Fallback scope.** Market data only. Positions, orders and activity have no keyless equivalent —
they are ours. The degraded state is therefore precise: **live prices, no portfolio.** Screens
handle that pairing rather than assuming the API is all-or-nothing.

**Idempotency.** `POST /v1/orders/:id/confirm` keys on the transaction signature. A retried or
double-submitted confirm must not write a second lot. This is the one place a bug costs money
rather than a pixel.

**Testing, weighted to the risk actually taken on:**

- `core` — 35 tests, untouched.
- **Parity test, the important one.** The risk of decision 2 is the two paths disagreeing. Both
  adapters run the _same_ implementation, so a test that runs each against the same recorded
  fixtures and asserts identical output makes drift structurally impossible rather than merely
  unlikely.
- Cost basis, the dividend case: multiplier rises → zero-cost lot written → average cost per
  share falls. docs/05 predicts this is the mistake other integrations make. It gets a test that
  fails loudly.
- Idempotent confirm: the same signature submitted twice writes one lot.
- One live smoke test per upstream, run by hand, never in CI.

**Deployment.** Web on Vercel. API and worker as two processes of one Fly.io app. Postgres on
Neon. Secrets in the platform, never in the repo; `.env.example` stays value-free.

---

## 6 · Price history

`placeholder.ts` states its own problem: period returns and 5Y CAGR need a historical price
series, and 30-day buyer counts need our own order table. The buyer count is solved by subsystem 2. The series is not, because no provider we use serves one — Jupiter gives spot, Pyth gives spot
and a calendar, Kamino gives rates.

**Decision: record it ourselves.** A `portfolio_snapshot` table, written hourly per user by the
worker, valued as positions × cached reference price. 168 points covers `1W`, ~720 covers `1M` —
more than the chart can draw.

```
portfolio_snapshot: id, user_id, captured_at, total_usd numeric(38,18),
                    stocks_usd, baskets_usd, cash_usd
```

**Built on 30 September 2026.** `portfolio_snapshot` is keyed on (user, hour)
rather than carrying an id, so a deploy mid-hour upserts that hour instead of
appending a second reading. `baskets_usd` was dropped from the sketch above:
nothing computes it, and a column that is always `0` advertises a capability the
system does not have. The route is `GET /v1/portfolio/history?range=`, and it
withholds a lone reading — one point is a dot, not a line.

**Consequences, stated plainly rather than designed around:**

- By 12 October there are at most 19 days of history, and a brand-new account has none.
- `1W` and `1M` ship. Longer ranges stay hidden until there is data behind them.
- A new account needs a real empty state. _"Not enough history yet"_ is a truthful thing for a
  new account to say, and more credible than a chart with no source.
- Period returns and 5Y CAGR stay unavailable in v1. They are removed from the UI rather than
  estimated.

---

## 7 · Explicitly cut

Written down as cut, so nobody rediscovers them as gaps:

- Chainlink Data Streams — recorded as the upgrade path per ADR 0010.
- External wallets — ADR 0003.
- Lot selection and tax reporting — docs/05 excludes them.
- The mobile app and the landing app that appear in docs/03's tree but do not exist.
- Baskets, if the spike has not resolved by the time subsystems 1–4 are done.

---

## 8 · Document amendments this requires

1. **[03 Architecture](../../03-architecture.md)** — the API is no longer _"the only surface the
   apps talk to"_, and `apps ──► market, chain` becomes a legal dependency edge. The lint rule
   changes with it.
2. **New ADR 0011** — records that the keyless browser path became the fallback rather than the
   only path, superseding the part of ADR 0010 that implied it was the whole answer.

---

## 9 · Open questions

Each names how it closes. None blocks starting.

| Question                                                                                            | Closes by                                                                                          |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Are the xStocks mints in Symmetry's token list, and do basket tokens route through Jupiter?         | Running the spike in `SPIKE_QUESTIONS`. Half a day. Decides whether baskets are one swap or seven. |
| Does a Privy embedded wallet expose a signer usable with Jupiter Ultra's unsigned-transaction flow? | Reading Privy's Solana docs and signing one devnet transaction. Blocks subsystem 3, not 1 or 2.    |
| What hourly snapshot cadence costs on Neon's free tier at demo user counts                          | Measuring after subsystem 4 lands. Cadence is a constant, trivially lowered.                       |
