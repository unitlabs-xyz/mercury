# Observability · design

**Status:** proposed · 15 October 2026

## What this is for

Three questions nobody can answer about Mercury today:

1. Is the API healthy, and which requests are failing?
2. Are the eight background jobs doing their work, and how long does each pass take?
3. How many people are here, what are they holding, what are they trading, and which chains
   is their money arriving from?

The first two need instrumentation that does not exist. The third does not — the data is
already in Postgres and has been all along. Keeping those apart is the whole of this design,
because conflating them is what turns "add observability" into a quarter of work.

## Where we are starting from

**Telemetry: none.** No OpenTelemetry, Sentry, Prometheus or PostHog anywhere in the
workspace. The API mounts exactly one piece of middleware — `cors()` — so there is no
request id, no latency, no status counter and no route attribution. `app.onError`
(`app.ts`) writes the error to the console and answers 500. `log.ts` is a careful
one-line error formatter written for a person reading a scrolling console, which is
good at its job and the opposite of machine-readable.

The one exception: `@vercel/analytics` in `apps/web/src/main.tsx` records visitors and
page views on the Vercel deployment. Page views only — no errors, no traces, and not on
the Coolify deployment at all.

**Domain data: already there.** Eighteen tables, and the ones this dashboard wants are
already written and indexed:

| Question                            | Table                                     | Columns that answer it                                                                                                 |
| ----------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Who is here                         | `user`, `wallet`                          | `created_at`, `email`, `kind` (embedded or external)                                                                   |
| What are they worth                 | `portfolio_snapshot`                      | hourly per user: `total_usd`, `stocks_usd`, `cash_usd`, `basket_usd`, `debt_usd`                                       |
| What did they trade                 | `order`                                   | `side`, `usd_amount`, `status`, `fee_usd`, `realised_pnl_usd`, `premium_pct`, and the whole `decision` verbatim        |
| Which chain did the money come from | `funding_intent`                          | `origin_chain_id`, `origin_chain_name`, `origin_currency_symbol`, `status`, `fail_reason`, `in_tx_hash`, `out_tx_hash` |
| Baskets, loans, everything else     | `basket_action`, `loan_event`, `activity` | `kind`, `reconciliation_state`, `amount_usd`, `occurred_at`                                                            |

So "swaps happening, from-chain trend graphs" is a query and a surface. Nothing about it
needs tracking added. That is why Part B below writes no instrumentation at all.

## Decisions

These three were decided by the user on 15 October 2026, over the alternatives named.

1. **Self-hosted Grafana LGTM on Coolify**, over a managed free tier and over SigNoz.
2. **An `/admin` surface inside the Mercury web app**, over a BI tool pointed at Postgres.
3. **Both tracks at once, telemetry leading**, over shipping one first.

All three are the more expensive option, and two carry a cost worth stating once.

**On self-hosting LGTM.** Grafana's own README classifies the `grafana/otel-lgtm` image as
for "development, demo, and testing environments" and points production users at Grafana
Cloud. A talk at QCon London in 2026 put the cost of running your own observability stack
at two to three extra full-time engineers. ADR 0004 rejected microservices because "there
are two deployables and no reason for more", and this adds a third.

We take it anyway, for three reasons, and the third is the one that matters:

- The single-container image is one deployable, not the five that a split
  Loki/Tempo/Prometheus/Grafana/Collector stack would be. It respects ADR 0004 far better
  than the "production" shape would.
- Losing internal telemetry is survivable in a way losing a portfolio snapshot is not.
  `portfolio_snapshot` is the only record of what an account used to be worth and cannot be
  reconstructed; a week of missing traces costs a week of hindsight.
- **The instrumentation does not change if we move.** The application knows one thing: an
  OTLP endpoint. Every span, metric and log in Part A is emitted the same way whether the
  other end is a container on this box, SigNoz, or Grafana Cloud. So this decision is
  reversible at the cost of an environment variable, and that is what makes it safe to
  take now and revisit later.

The exit, named in advance: if the box runs short of memory, if retention has to exceed
what one volume holds, or if anyone spends a second day operating it, point
`OTEL_EXPORTER_OTLP_ENDPOINT` at a managed backend and delete the container. No
application code changes.

**On building `/admin` rather than buying.** Every new question becomes a pull request
rather than a query. The mitigation is Part B's shape: the routes return aggregates over a
date range rather than one hard-coded screen, so a new question is usually a new chart over
an existing route.

---

# Part A · Telemetry

## A1 · The bootstrap

`services/api/src/otel.ts`, started before anything it needs to patch.

The container's command today is:

```
CMD ["node", "--import", "tsx", "src/index.ts"]
```

and becomes:

```
CMD ["node", "--import", "tsx", "--import", "./src/otel.ts", "src/index.ts"]
```

`tsx` first, because `otel.ts` is TypeScript and needs the transpiler already loaded.

Load order is the entire game here. Any library imported before the SDK starts is a library
the SDK never patches, and the failure mode is silence — no error, no spans, nothing to
tell you the flag was dropped. `src/dockerfile.test.ts` already asserts on this Dockerfile's
contents; it gets a case for the flag, so the next edit to the command cannot quietly
remove it.

**It degrades like every other capability in this service.** `relay`, `fund`, `notifier`
and the Pyth feed all follow one pattern: absent configuration means the feature is not
built, the fact is announced at boot, and nothing downstream pretends otherwise.
Telemetry joins them. `OTEL_EXPORTER_OTLP_ENDPOINT` unset means the SDK never starts, the
process carries no overhead, and one line at boot says `telemetry: off
(OTEL_EXPORTER_OTLP_ENDPOINT unset)`. Tests run with it unset, which is also what keeps the
test suite from needing a collector.

Packages, all on npm and verified on 15 October 2026:

- `@opentelemetry/sdk-node@0.223.0`
- `@opentelemetry/auto-instrumentations-node@0.81.0`
- `@hono/otel@1.2.0`

## A2 · HTTP spans, and a request id

`@hono/otel@1.2.0` is first-party (`honojs/middleware`) and lists Node among its runtimes.
Mounted above `cors()` so it sees every request including the ones CORS rejects.

Two things to get right:

**Duplicate spans.** Node's HTTP auto-instrumentation creates inbound server spans of its
own, and `@hono/otel` creates them too. Whether they double up has to be checked against
real trace output rather than reasoned about; one of the two gets disabled once we know.

**The route template, never the path.** A span named `/v1/invest/:ticker`, not
`/v1/invest/AAPL`. Get this wrong and every ticker is its own time series: the error-rate
graph becomes unreadable and Prometheus's memory grows with the stock list.

**The request id is the thing that makes "request-wise tracking" work.** One value — taken
from an inbound `x-request-id` if a proxy set one, generated otherwise — that is put on the
span, echoed in the response header, and included in every log line the request produces.
It is what lets a user say "it broke" and have that become a single trace: the response
they got, the handler that ran, the queries it made, and the upstream call that failed.
Without it you have four systems and no way to join them.

## A3 · The background jobs

This is the biggest blind spot and the cheapest to fix.

Eight jobs run inside the API process, and they are the only things in the system that
write a row — `index.ts` says so explicitly: "This is the only thing that writes a stock
row or a position: no request does." `position-sync` runs every two seconds. Today a
failing pass produces one `console.error` line and nothing anybody can graph, and a pass
that merely got slower produces nothing at all.

Every one of them already goes through a single helper:

```ts
const every = (name: string, ms: number, run: () => Promise<string | null>) => { … }
```

So one edit instruments all eight. Each pass becomes a span carrying the job name, its
duration and its outcome, and the counters the jobs already compute get recorded instead
of being formatted into a sentence and discarded — `s.written`, `s.failed`, `s.wallets`,
`s.reconciled` are all right there in the return value today.

Metrics:

- `mercury_job_runs_total{job,outcome}`
- `mercury_job_duration_seconds{job}` (histogram)
- `mercury_job_rows_written_total{job}`
- `mercury_job_failures_total{job}`

The alert worth having first is not an error rate. It is `portfolio-snapshot` not having
run in ninety minutes, because that job's output cannot be backfilled.

## A4 · Outbound calls

Jupiter, Relay, Glider, Privy, Kamino, Pyth and the Solana RPC are all reached over
`fetch`. `@opentelemetry/instrumentation-undici` covers Node's fetch and gives client spans
for all of them without touching a call site.

Worth doing early because this is where failures actually originate. Right now a Jupiter
429 and a bug in our own routing code look identical from outside: a 500 and one console
line.

## A5 · Database spans — a gap, and what to do about it

The driver is `postgres` (postgres.js). **No OpenTelemetry instrumentation for it exists.**
The official `@opentelemetry/instrumentation-pg` covers `pg` only; I checked npm for a
postgres.js equivalent and there is none.

Two ways out:

- **A wrapper on the Drizzle client** (recommended, roughly thirty lines): open a span per
  query carrying the statement and its duration. Nothing else changes.
- **Switch the driver to `pg`** to get official instrumentation. Rejected: a driver swap
  across eighteen tables and 837 API tests to gain a span is the wrong trade.

Do the wrapper. Without it, a slow request is a flat 600ms span with nothing inside it, and
"which query" is the question you will actually be asking.

## A6 · Logs

`log.ts` formats errors as one human-readable line on purpose, and that reasoning still
holds for anyone tailing the container. So this adds a second format rather than replacing
the first: when telemetry is configured, log lines are JSON carrying `level`, `msg`,
`request_id`, `trace_id`, `span_id` and `job`, shipped over OTLP by the same SDK. No
Promtail, no Alloy, no log files.

`trace_id` in the log line is the single field that makes the stack worth running — it is
what turns "an error happened" into "here is the request it happened in, and everything
else that request did."

## A7 · What must never leave the process

The standing instruction on this project is that there is no compromise on security, and
telemetry is a classic way to leak a database one attribute at a time. So the rule is
written down rather than remembered:

**Never a span attribute, metric label, or log field:**

- email, Privy DID, wallet address, any public key
- `Authorization` or `X-Privy-Identity-Token` headers, or any other header by default
  (`@hono/otel`'s header capture is opt-in — leave it off, or allowlist non-sensitive
  headers explicitly)
- balances, portfolio totals, position sizes, P&L figures
- transaction signatures tied to a user

**`user_id`** — our own UUID — may go on a **span**, because LGTM runs on our own
infrastructure and a trace without it cannot answer "whose request was this". It must not
go in a **metric label**: that is unbounded cardinality and it will take Prometheus down
before it tells you anything.

This gets a test, in the same spirit as the copy guards in `copy-guards.test.ts`: a unit
test over the attribute builder that fails if a banned key appears. A rule enforced by
remembering it is a rule the next call site breaks.

## A8 · LGTM on Coolify

`grafana/otel-lgtm`, one container. Bundles the OTel Collector, Prometheus, Tempo, Loki,
Pyroscope and Grafana.

- **Persistence:** every component writes to `/data`. A volume mounted there is what makes
  the data survive a redeploy; without it a Coolify restart is a full history loss.
- **Retention:** each backend takes a `*_EXTRA_ARGS` environment variable — e.g.
  `--storage.tsdb.retention.time=90d` for Prometheus, `--limits.retention-period=30d` for
  Loki. Tempo's retention goes in a mounted `tempo-config.yaml`.
- **Shutdown:** the container waits five seconds for its components before forcing a stop.
  That is tight for flushing to disk. Raise `LGTM_SHUTDOWN_TIMEOUT_SECONDS`.
- **Exposure:** Grafana behind Coolify's authentication and TLS. **The OTLP endpoint stays
  private to the Docker network and is never published** — an open OTLP ingest is an open
  invitation to fill your disk.
- **Footprint:** between roughly 0.6 GB and 2 GB idle depending on which components are
  enabled. Check the box's free memory before deploying, not after: the API container, the
  web container and Postgres are already on it.
- **Dashboards live in the repo** as provisioned JSON, not clicked into a running Grafana.
  A dashboard that exists only in a container's volume is a dashboard you rebuild from
  memory after the next redeploy, and it cannot be reviewed in a pull request.

---

# Part B · The admin dashboard

No instrumentation. Every number here comes from a table that is already written.

## B1 · Authorisation

There is no `role` column on `user`, and this does not add one. It follows the pattern the
service already uses for every optional capability.

`readConfig` gains `ADMIN_PRIVY_USER_IDS`, a comma-separated allowlist. Unset means the
admin routes are **not mounted**, which means they 404, which means the web app never shows
the entry point — the same way `read.fund` being undefined makes
`/v1/money/fund/sources` 404 and the interface hide the method.

`requireAdmin` sits **after** `requireAuth` and checks `identity.privyUserId` against the
allowlist. So an admin is an ordinary authenticated session plus membership of a list.
There is no second credential, no admin password, and nothing new to leak.

**Read-only by construction.** Every admin route is a GET, and the admin module is given no
write path — not a repository with writes it chooses not to call, but no writes in scope at
all. That is an API-structure guarantee rather than a convention somebody maintains.

**A non-admin gets 404, not 403.** A 403 confirms the surface exists and is worth
attacking; a 404 says nothing.

Tests: authenticated non-admin → 404; allowlisted admin → 200; config unset → 404 for
everyone including the allowlist; unauthenticated → 401 from the existing middleware.

## B2 · Routes

`services/api/src/admin/` for the queries, `src/routes/admin.ts` for the surface. Each
route takes a Zod-validated date range and a hard row limit.

- `GET /v1/admin/overview` — users total and by signup day, wallets by kind, how many have
  funded, how many have traded, assets under management from the latest
  `portfolio_snapshot` per user
- `GET /v1/admin/orders` — count, volume, fees and realised P&L by day, ticker and side;
  fill rate across `status`; the distribution of `premium_pct`
- `GET /v1/admin/funding` — **the chain trends.** `funding_intent` grouped by
  `origin_chain_name` × day × status, with median settle time (`updated_at - created_at`)
  and a breakdown of `fail_reason`
- `GET /v1/admin/baskets` — `basket_action` by `kind` and `reconciliation_state`, and how
  many are stuck
- `GET /v1/admin/health` — the age of the newest `portfolio_snapshot`, `price_bar` and
  `activity` row. The cheapest possible answer to "are the jobs alive", it needs no
  telemetry at all, and it is the first thing to build because it is useful on its own.

## B3 · Query discipline

These are aggregates over the tables that serve live traffic, which makes them the one part
of this design that can hurt users.

The indexes are wrong for it. `order_user_created_idx` is `(user_id, created_at)` — fine
for "this user's orders", useless for "every order last Tuesday", which has no index at
all. Same shape on `activity_user_occurred_idx` and `funding_intent_user_created_idx`.

So: the admin migration adds the indexes the admin queries need, with `EXPLAIN` output in
the pull request showing what each one changed. And a statement timeout applies to admin
queries, so a mistyped date range cannot take down the API that people are trading on.

A dashboard that locks `order` is worse than no dashboard.

## B4 · The web surface

`apps/web/src/app/admin/`, behind a `lazy()` route like every other route in `App.tsx`.

This is not optional. Every route in that file is already lazy, the main chunk is already
2.5 MB, and a charting library pulled into the eager graph is a cost paid by every user who
never sees this page. Verified the same way the sample-data leak was: build and grep the
chunks.

The entry point in `AccountMenu` renders only once `/v1/admin/overview` has answered
200 — never from a client-side flag, which anyone can flip in a console.

Charts reuse `ValueChart`, `Sparkline` and `DotChart` where they fit, before reaching for a
dependency. Aggregation helpers are pure functions over fixtures, tested like
`fund-reserve.test.ts`.

---

# Part C · Deferred, and why

**Product analytics (funnels, retention).** PostHog self-hosted wants somewhere between 16
and 32 GB of RAM, so in practice this means PostHog Cloud — and it cannot see onchain data,
which is most of what matters here. Meanwhile the funnel questions people actually ask —
signup to first deposit to first buy — are `user.created_at` against the first
`funding_intent` and the first `order`, which Part B already exposes. Revisit when a
question arrives that SQL cannot answer.

**Frontend error reporting.** Worth having, and a separate decision (self-hosted GlitchTip
against Sentry) that is much more useful once A2's request id exists to join a browser
error to a server trace. Its own spec.

**The Vercel serverless deployment.** `src/vercel.ts` describes itself as "HTTP surface
only" and says "the container (`index.ts`) is the real home for all of it". Serverless
changes the telemetry model — a batch span processor loses spans when the function freezes,
so each invocation needs an explicit `forceFlush` — and that is work this spec does not do.
Out of scope unless that deployment is actually serving traffic.

---

# Sequencing

Telemetry leads. Steps 1–4 are one track; 5–7 can run alongside once step 1 has landed.

1. **A1 + A8** — the bootstrap and the LGTM container. Done when one span from a real
   request is visible in Grafana. Nothing else is worth building until that round trip
   works.
2. **A2 + A6** — HTTP spans, the request id, structured logs. This is the step after which
   "API error rates" is a real graph.
3. **A3** — the eight jobs. The biggest blind spot, and one edit to `every()`.
4. **A4 + A5** — outbound spans, then the Drizzle query wrapper.
5. **B1 + the `/v1/admin/health` route** — the smallest admin slice that is useful on its
   own, and it proves the authorisation shape before any queries depend on it.
6. **B2 + B3** — the remaining routes, with their indexes and `EXPLAIN` notes.
7. **B4** — the surface.

A7's deny-list test is written in step 2 and runs from then on, not bolted on at the end.

Each step is its own pull request. Steps 1 and 5 are the two that can invalidate later work
if they are wrong, which is why they come first in their tracks.
