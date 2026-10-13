# Custom baskets

**Status:** accepted · 13 October 2026

## Why

Twenty-three baskets ship, every one of them written by us. Somebody who wants NVDA and TSLA in
one automated, daily-rebalanced position, in weights they chose, cannot have it — they can only
pick the closest thing off a shelf we stocked.

The machinery to give them one is already here and already hardened. `BasketProvider` has
`validate` and `create`; `sync()` calls them with readback verification and recovery from a POST
that the provider accepted before the connection died. Enrollment, funding, rebalancing and exit
all key off a `strategyId` and care nothing about who authored the strategy behind it.

What is missing is a definition a user wrote, somewhere to keep it, and a way to resolve it.

## The shape

A custom basket is **private**. Only its author sees it, enrolls in it, funds it. It is
**fully editable** — weights and assets, at any time. There is **no cap** on how many a person
may have.

Private is not a placeholder for social. It is what makes the rest cheap: no global slug
namespace to police, no moderation, no discovery surface, and — importantly — Glider's warning
that publishing a new allocation version _"affects every enrolled portfolio"_ describes an
audience of exactly one.

## What Glider actually allows

Measured against the live API on 13 October 2026, not read off a page.

| Rule                 | Value                                                             |
| -------------------- | ----------------------------------------------------------------- |
| Assets per strategy  | 1–50 (`51` → `expected array to have <=50 items`)                 |
| Weights              | must sum to **exactly** 100.00 (90.00 is rejected)                |
| Smallest weight      | 0.01 accepted                                                     |
| Allocation changes   | `POST /strategies/{id}/versions` — publishes a new active version |
| Name, description    | `PATCH /strategies/{id}` — allocation is explicitly excluded      |
| Deleting a strategy  | **not possible** — the verb table is `get, patch`                 |
| Concurrent publishes | serialize per strategy, sequential version numbers                |

Two findings matter more than the rest.

**`validate` is not an asset gate.** It accepted a strategy holding BONK. It checks name, weights
and count — nothing about whether Glider can trade what you named. Any pre-flight check on assets
has to come from somewhere else.

**Glider classifies xStocks as crypto.** The Ondo NVDA mint resolves as an equity with a sector
and a SIC code; the xStocks mint for the same company comes back
`unsupported_asset_class:crypto`. This is why every mint in `catalog.json` is Ondo. It is a
requirement, not a preference, and it has a product consequence: a user can buy a stock on the
Invest page and still not be able to put it in a basket.

## Where the asset list comes from

The documented v2 REST API has no asset-listing endpoint — the full docs index was read, and the
nearest relations (`/assets/allocation-breakdown`, `/portfolios/{id}/sector-exposure`) classify
assets you already hold. A `assetTaxonomy.*` tRPC namespace appears in search results; the page
404s and every plausible procedure name returns `No procedure found`.

The catalogue comes instead from the endpoint Glider's own front end uses:

```
GET https://api.glider.fi/v1/trpc/assets.browseStocksForSelection
    ?input={"json":{"exposureCategory":"equity","issuerSlug":"ondo",
                    "chainId":"1399811149","search":null,
                    "limit":24,"direction":"forward"},
            "meta":{"values":{"search":["undefined"]},"v":1}}
```

Public — no API key. `1399811149` is Solana. `limit` caps at 24; `nextCursor` is an integer
offset. Each item carries `metadata.address` (the mint), `decimals`, `name`, `symbol`, a logo URL,
and `taxonomy.primaryExposure.reference` — the plain ticker.

It returns **452 tokens across 450 tickers**. Our hand-written map holds 143. Every one of our 143
appears in Glider's list, with **byte-identical mints and no disagreements**, which is as strong a
validation of a new source as one gets. The catalogue is roughly three times what we expose.

`issuerSlug` of `xstocks`, `backed`, `swarm` and `dinari` all return zero on Solana. Ondo is the
only issuer, confirming the classification finding above from a second direction.

This endpoint is undocumented, unversioned, and backs somebody else's UI. It can change without
notice. It is used **nightly, never from a browser**, its response is parsed strictly, and a sync
returning materially fewer rows than the last good one leaves the existing catalogue in place
rather than truncating the picker. The 143 in `catalog.json` remain as a floor.

## What changes

### 1 · One new table

```sql
custom_basket
  id                 uuid primary key
  user_id            uuid not null references users(id) on delete cascade
  slug               text not null unique      -- kebab(name) + short suffix
  name, description  text not null
  assets             jsonb not null            -- [{ assetId, ticker, weightBps }]
  glider_strategy_id text                      -- null while it is still a draft
  created_at, updated_at, deleted_at timestamptz
```

Slugs are globally unique by construction. Every basket route is `/v1/baskets/:slug/…` and
resolves through one lookup; if a custom slug could collide with a curated one, naming yours
`magnificent-seven` would silently address somebody else's basket. A suffix removes the ambiguity
and keeps a single namespace, so no existing route changes.

`glider_strategy_id` is nullable because creation is not transactional. The row is written before
Glider is called, so a half-finished create is visible and retryable instead of lost.

There is no `version` column. Whether our row agrees with Glider is answered by `provider.get(id)`
and the existing `matches()`; Glider owns the numbering. A counter nothing reads can only go stale.

### 2 · A second table for the asset catalogue

```sql
basket_asset
  mint        text primary key
  ticker      text not null
  name, symbol text not null
  decimals    integer not null
  logo_url    text
  synced_at   timestamptz not null
```

Separate from `token`, which is the universe this product trades. This is the narrower set Glider
will accept inside a strategy, and conflating them would make a basket silently offer a stock it
cannot hold.

### 3 · The resolution seam

Every operation reaches a basket through one private method:

```ts
private async templateForRead(slug: string) {
  const template = (await this.deps.store.load()).find(t => t.slug === slug);
  …
}
```

It gains an owner and consults the custom store when the curated catalogue has no answer. Because
every call site already holds `ownerAccountId`, this is a parameter, not a refactor.

What it returns changes too. `BasketTemplate` carries three fields that exist only for the curated
catalogue — `sourceStrategyId` (which Glider strategy we mirrored), `status` (an operator
kill-switch) and `tags` (shelf merchandising). Counting what the service reads off a resolved
template: `providerId` 26 times, `name` 9, `assets` 3, `slug` 2 — and the catalogue-only fields
once each, all inside `listTemplates`/`getTemplate`. So the operational path gets its own contract:

```ts
/** What enrolling, funding, rebalancing or exiting needs of a basket,
    whoever authored it. Resolution has already proved it is enrollable. */
export interface EnrollableBasket {
  readonly slug: string;
  readonly name: string;
  readonly providerId: string;
  readonly assets: readonly { assetId: string; ticker: string; weightBps: number }[];
}
```

`BasketTemplate` is untouched, no wire type changes, custom baskets carry no meaningless filler,
and twenty-six `providerId!` assertions disappear because resolution guarantees it. The `disabled`
check moves to the resolution site: curated baskets can be switched off, a custom basket cannot —
its owner simply deletes it.

### 4 · Create, edit, delete

```
create  ① validate: 1–50 assets · weights total exactly 10000 bps · no duplicate
           assetId · every asset present in basket_asset
        ② INSERT row, glider_strategy_id = NULL
        ③ provider.validate(def)
        ④ provider.create(def)
             on network failure → list(), adopt iff exactly one namesake matches
        ⑤ provider.get(id) → matches(def) or throw
        ⑥ UPDATE row with the strategy id
```

Steps ③–⑤ are `sync()`'s, unchanged, including its recovery.

Editing splits by what changed: name and description through `PATCH /strategies/{id}`, anything
touching the allocation through `POST /strategies/{id}/versions`. Recovery is the same trick — on
a failed publish, `provider.get(id)` and `matches()` say which side of the fence we landed on.

A new allocation takes effect at the **next daily rebalance**. We do not trigger one; the detail
page already offers _Rebalance now_ for anyone impatient, and firing trades every time somebody
nudges a weight would cost them money they did not ask to spend. No trade preview.

Deleting removes a draft outright and soft-deletes a created basket. Glider has no
`DELETE /strategies`, so the strategy is orphaned on the tenant — see Risks.

### 5 · Routes

|          |                      |                                                       |
| -------- | -------------------- | ----------------------------------------------------- |
| `GET`    | `/v1/baskets`        | the curated shelf plus the caller's own, each `source` |
| `POST`   | `/v1/baskets`        | create one of mine                                     |
| `PATCH`  | `/v1/baskets/:slug`  | rename or re-weight mine; `403` on a curated slug      |
| `DELETE` | `/v1/baskets/:slug`  | refused while funded                                   |
| `GET`    | `/v1/basket-assets`  | the picker's universe, from `basket_asset`             |

Custom baskets share the curated routes rather than getting their own prefix: one slug namespace,
one resolver, and `source` on the wire for the clients that render the difference. A basket
somebody wrote is never returned to anybody else, so nothing private reaches a public shelf —
every shelf filters on `source === "curated"`.

### 6 · The authoring panel

A `SidePanel`, like Add cash and Send. Name, an asset search over `basket_asset`, and a weight
list. Adding an asset equal-weights everything using the rounding the curated catalogue already
uses — `floor(10000/n)` with the remainder on the first, which is how Magnificent Seven stores
`1428 × 6 + 1432`. A live _Remaining_ readout, a _Distribute evenly_ button, and a create button
disabled until the total is exactly 100.00%, because Glider rejects anything else and a form is a
better place to refuse than a 400.

After creating, the user lands on `/baskets/:slug` — the existing detail page, which already
enrolls and funds through the existing `Ticket`. No new funding UI.

## Tasks

1. `basket_asset` table, migration, and the nightly Glider catalogue sync
2. `GET /v1/basket-assets`
3. `custom_basket` table and migration
4. `EnrollableBasket`, and `templateForRead` resolving custom slugs
5. The custom-basket store and service: create, with readback and recovery
6. Edit (metadata vs allocation version) and delete
7. The five routes
8. The authoring panel, and the Baskets-page entry point
9. Edit and delete affordances on the detail page

Each task is reviewed and committed before the next begins.

## Out of scope, and why

**Publishing or sharing.** Chosen deliberately. It is the difference between a feature and a
marketplace, and everything cheap about this design comes from the audience being one person.

**A trade preview before an edit.** We can compute it from `provider.positions` and the new
weights. It is real UI work for a confirmation nobody asked for, and the change does not move
money until the next rebalance anyway.

**Any cap on baskets per user.** Asked and declined. See Risks.

**Issuers other than Ondo.** Not a decision — Glider accepts no others on Solana.

## Risks

**The tenant accumulates strategies forever.** Unlimited baskets, and no `DELETE /strategies`.
Every creation and every deletion leaves one behind, and the count grows with signups. Nothing
breaks; there is simply no lever if Glider ever bills or rate-limits on strategy count.

**Tradability cannot be checked before creating.** `validate` does not look at assets, and
`allocation-breakdown` reports classification rather than tradability. `basket_asset` is drawn
from Glider's own registry, which is the strongest available signal — but an asset could pass
every check we have and still fail at rebalance.

**The catalogue depends on an undocumented endpoint.** Mitigated by syncing nightly rather than
per request, parsing strictly, refusing to shrink the catalogue on a bad sync, and keeping the
143 known-good mints as a floor. Worth asking Glider to expose it in the v2 API; a tenant asking
for a contract is a reasonable ask.

**Users will ask why a stock they own cannot go in a basket.** The xStocks/Ondo split is invisible
on the Invest page and decisive here. This is copy and expectation-setting, not code, and it needs
an answer before launch rather than after the first support message.

## Testing

Table-driven, on the parts that can regress:

- weight arithmetic — does `floor(10000/n)` plus remainder total exactly 10000 for n of 1, 3, 7,
  50?
- validation — asset count bounds, duplicate assetId, weights off by one bp
- slug generation — collision resistance, and that a generated slug never matches a curated one
- resolution order — curated wins, custom second, a stranger's basket resolves to nothing
- `matches()` against a custom definition, which is what makes create and edit recoverable
- the catalogue sync's shrink guard — a short response must leave the previous rows in place

No tests for route registration, zod schemas or the panel's rendering, per the standing rule that
a test earns its place by catching a regression.
