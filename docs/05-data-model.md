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

### `user` and `wallet`

```
user:   id, created_at, display_currency, notification_prefs
wallet: id, user_id, address, kind ('privy_embedded'|'external'), is_primary
```

No name, no email stored by us beyond whatever the wallet provider holds. No identity documents.

### `lot`

The unit of cost basis. One row per acquisition.

```
id, user_id, token_id, instrument_id,
token_qty bigint,              -- smallest unit, as acquired
shares numeric(38,18),         -- token_qty × multiplier AT ACQUISITION
unit_cost_usd numeric(38,18),  -- cost per share, not per token
acquired_at, source ('buy'|'transfer_in'|'dividend'|'basket'),
is_estimated boolean,          -- true when we inferred the cost
order_id nullable
```

`shares` is frozen at acquisition. If the multiplier later rises, a **new lot** is written with
`source = 'dividend'` and `unit_cost_usd = 0`.

### `position`

A derived rollup per user per instrument, maintained on write.

```
user_id, instrument_id, shares, cost_basis_usd, avg_unit_cost_usd, updated_at
```

Rebuildable from lots at any time. A reconciliation job asserts it matches.

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
realised_pnl = proceeds_usd − (shares_sold × avg_unit_cost)
cost_basis  −= shares_sold × avg_unit_cost
shares      −= shares_sold
```

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

## Exposure

```sql
-- true exposure to one instrument
select sum(shares)         as shares,
       sum(shares * price) as value
from lot where user_id = $1 and instrument_id = $2;
```

Never `sum(token_qty)` across tokens. Different wrappers, different multipliers, different
things.

## What is not stored

No private keys. No seed phrases. No identity documents. No bank details. No card numbers. If a
future feature needs any of these, it belongs behind a partner, not in this schema.
