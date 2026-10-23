# 05 · Data model

Postgres with Drizzle. Types generated from the schema, shared through `packages/types`.

## Money, first

Two rules, no exceptions.

1. **Never a float.** On-chain amounts are `bigint` in the token's smallest unit. Prices and USD
   values are `numeric(38, 18)` in Postgres and a decimal library in TypeScript. A JavaScript
   number cannot represent 0.1 and will silently lose money.
2. **Store both sides of a quantity.** A holding has a token quantity _and_ a share count. They
   differ by the multiplier and the multiplier moves. Deriving one from the other at read time
   using today's multiplier would rewrite history.

## Entities

### `instrument`

The real company or fund. One row per ticker.

```
id, ticker, name, sector, description, logo_url, is_tradable
```

### `token`

A wrapper. Several per instrument.

```
id, instrument_id, mint, issuer ('backed'|'ondo'), symbol, decimals,
multiplier numeric(38,18), multiplier_updated_at, is_routable, first_seen_at
```

`multiplier` is cached from the issuer feed and refreshed by the `stocks` job. Every change is written
to `multiplier_event` as well, because it is a dividend and the user should see it.

### `multiplier_event`

```
id, token_id, old_multiplier, new_multiplier, observed_at, kind ('dividend'|'split'|'unknown')
```

### `price_bar`

What a token traded at across one bucket of time. The only record of a price in the system; see
[ADR 0016](adr/0016-price-history.md).

```
token_id, width ('1m'|'1h'|'1d'), bucket_start,
market_open, market_high, market_low, market_close,
reference_open, reference_high, reference_low, reference_close,
multiplier, liquidity_usd, samples, first_at, last_at
primary key (token_id, width, bucket_start)
```

Both prices are **per share**. `market_*` is what one share of the wrapper fetches in the pool
(`usdPricePerToken ÷ multiplier`), the price holdings are valued at. `reference_*` is the issuer's
quote for the underlying, the price "did the stock move" is measured against, and is null across a
bar that never had one.

The `prices` job writes every 20 seconds, at all three widths at once, so no width is a rollup that
can fall behind. Covers the warm set: every mint anyone has held, plus the featured shelf. Minute
bars are deleted after thirty days; hours and days are kept.

### `user` and `wallet`

```
user:   id, privy_user_id, email, created_at, display_currency,
        earn_vault, earn_risk_accepted_at, earn_risk_version
wallet: id, user_id, address, kind ('privy_embedded'|'external'), is_primary
```

`earn_vault` only preselects a vault; nothing moves on its own. `earn_risk_version` is the wording
of Earn's risks this person accepted, and deposits need the current one.

No name, no identity documents.

**Amended 30 September 2026: we store the email.** This said we stored none, and that stopped
being tenable the moment the product could liquidate somebody's shares. A margin call has to
reach a person who is not looking at the page, and a background job has no request, no identity
token and therefore no other way to find them.

Privy signs the address into the identity token on every authenticated request, so `user.email`
is a copy kept in step rather than something we collect: it is written only when it differs from
what we hold, and it corrects itself if somebody changes it at Privy. It is nullable and stays
nullable — a login must never fail over a contact detail.

What this costs is honest: a breach of this database now leaks contact details, where before it
leaked Privy DIDs and public wallet addresses. That is the price of being able to warn somebody
before their collateral is sold, and it is worth it. Nothing else about the rule changes — no
name, no identity documents, and the address is used for account mail, not marketing.

### `lot`

The unit of cost basis. One row per acquisition.

```
id, user_id, token_id, instrument_id,
token_qty bigint,              -- smallest unit, as acquired
shares numeric(38,18),         -- token_qty × multiplier AT ACQUISITION
unit_cost_usd numeric(38,18),  -- cost per share, not per token
acquired_at,                   -- when it was bought
recorded_at,                   -- when it entered Mercury
source ('buy'|'transfer_in'|'dividend'|'basket'),
is_estimated boolean,          -- true when we inferred the cost
order_id nullable
```

`shares` is frozen at acquisition. If the multiplier later rises, a **new lot** is written with
`source = 'dividend'` and `unit_cost_usd = 0`.

`acquired_at` and `recorded_at` are the same moment for a buy. They differ for an imported lot:
bought in March, recorded today. A position replays in `recorded_at` order, so last month's sell is
never applied to shares that were not here yet.

### `disposal`

The other half of `lot`. One row per time tokens left.

```
id, user_id, token_id, instrument_id,
token_qty bigint,              -- smallest unit, as it left
shares numeric(38,18),         -- token_qty × multiplier when it left, for reading
kind ('sell'|'transfer_out'),
order_id nullable unique,      -- the sell that wrote it, so a sell settled twice counts once
occurred_at, recorded_at
```

A sell writes one when it settles. Position-sync writes a `transfer_out` when the chain holds fewer
tokens than the records say. A transfer out is provisional for its first two minutes: if the
chain reads above the records in that time, the row is deleted, because the drop was a lagging
read and not a send.

### `position`

A derived rollup per user per instrument, maintained on write.

```
user_id, instrument_id, shares, cost_basis_usd, avg_unit_cost_usd, updated_at
```

Rebuildable from lots and disposals at any time: a replay of both, in the order they were recorded,
at average cost. A reconciliation job asserts it matches.

### `order`

```
id, user_id, instrument_id, side, usd_amount,
decision jsonb,                -- the full Decision object from core, kept verbatim
chosen_token_id, reference_price, premium_pct,
status ('pending'|'executing'|'filled'|'queued'|'partially_filled'|'expired'|'cancelled'|'refused'),
tx_signature, trigger_order_account, filled_at, created_at
```

Keeping the `decision` blob verbatim is deliberate. When a user asks why they were sold one
wrapper and not the other, the answer is a row.

### `basket`, `basket_constituent`, `basket_investment`

```
basket:             id, slug, name, description, fee_bps, curator, is_active
basket_constituent: basket_id, instrument_id, weight_bps    -- must sum to 10000
basket_investment:  id, user_id, basket_id, usd_amount, status, created_at
                    (legs join back to `order`)
```

### `plan` and `plan_allocation`

```
plan:            id, user_id, usd_amount, cadence ('weekly'|'monthly'), next_run_at,
                 status ('active'|'paused'), created_at
plan_allocation: plan_id, target_kind ('instrument'|'basket'), target_id, weight_bps
```

### `activity`

An append-only feed. Denormalised on purpose, because it is read constantly and never joined.

```
id, user_id, kind, occurred_at, title, subtitle, amount_usd, ref_table, ref_id, tx_signature
```

Earn's moves are `earn_deposit` and `earn_withdraw`, written beside their `earn_event` in one
transaction. They are cash moving within the account, so they carry no sign and are not flows.

### `earn_event`

One row per move into or out of an Earn vault.

```
id, user_id, kind ('deposit'|'withdraw'), usdc_amount, vault, tx_signature, occurred_at, recorded_at
```

The vault reports only what the shares are worth now, so "earned so far" is that, less what went
in, plus what came out. The amount is read off the chain, as the change in the wallet's USDC.
Unique on the signature, so the confirm route and the send path never write a move twice.
It is also what decides who is read for Earn at all: an account with no row here is not asked
about, so the portfolio, money and snapshot reads of everyone else never touch Kamino.

`portfolio_snapshot.earn_usd` keeps the Earn balance of each hourly reading apart from the total
that counts it. When Kamino cannot be read, the portfolio serves that figure and flags it, as it
does for debt.

## Cost basis

Average cost, per instrument, **per share**, in USD.

### A buy

```
shares_acquired = tokens_received × multiplier_at_fill
unit_cost       = usd_spent / shares_acquired
```

Writes one lot. Position shares and cost basis both increase.

### A sell

Proportional reduction. Average unit cost does not change.

```
fraction_left = tokens_left / tokens_held
realised_pnl  = proceeds_usd − cost_basis × (1 − fraction_left)
cost_basis   ×= fraction_left
shares       ×= fraction_left
```

The fraction is taken in tokens, not shares. Tokens are exact. A token's shares move with the
multiplier, and a dividend not yet written would make the two disagree. Writes one disposal.

We do not offer lot selection in version one. If tax reporting ever matters this becomes a real
decision, which is one reason the tax centre is out of scope.

### A dividend, and this is the subtle one

The multiplier rises. The user now holds more shares without spending anything.

```
new_shares  = token_qty × (new_multiplier − old_multiplier)
```

Write a lot with `unit_cost_usd = 0` and `source = 'dividend'`.

**The average cost per share therefore falls.** That is correct: the same money now buys more
shares. A system that recomputed shares from the current multiplier without writing the lot would
show a phantom gain and an overstated cost basis at the same time. This is the specific mistake
we expect other integrations to make, and it is worth a test.

### A transfer in

We cannot know what it cost. Mark the lot at the reference price on the block it arrived,
`is_estimated = true`, and let the user correct it. Surface estimated lots in the UI so profit
and loss is not quietly wrong.

### A transfer out

The same reduction as a sell, with no proceeds. The cost of the shares that left goes with them.
Leaving it behind would mix it into the next purchase and overstate that one's cost.

## Exposure

```sql
-- true exposure to one instrument
select shares,
       shares * $3 as value        -- $3: the instrument's price now
from position where user_id = $1 and instrument_id = $2;
```

Never `sum(shares)` over `lot`. It counts every share ever acquired, the ones since sold or sent
included.

Never `sum(token_qty)` across tokens. Different wrappers, different multipliers, different
things.

## What is not stored

No private keys. No seed phrases. No identity documents. No bank details. No card numbers. If a
future feature needs any of these, it belongs behind a partner, not in this schema.
