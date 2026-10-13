# 10 · Baskets

Baskets are **user-owned portfolios on Glider**, a managed smart account per user, per strategy.
Decision and reasoning in [ADR 0013](adr/0013-baskets-on-glider.md), which replaces the Symmetry
design in [ADR 0005](adr/0005-basket-vaults.md). The working spec is
[baskets/spec.md](baskets/spec.md).

## What the user experiences

> Bullish on Big Tech? Pick the Magnificent Seven strategy, sign once to create your own portfolio, send USDC. Glider buys
> the target weights and rebalances them every day. You can see every holding, rebalance by hand,
> and withdraw the assets themselves or cash out to USDC whenever you want.

There is **no basket token**. Each strategy a user joins is its own Glider smart account that they
own, holding the actual tokenized assets. Nothing is pooled with anyone else.

## The model

```
                Privy wallet (owner)
                       │  signs enrollment, funding, exits
                       ▼
 USDC ──► Glider smart account (Swig sub-account, one per strategy) ──► rebalanced daily by Glider's agent
            NVDAon  AAPLon  MSFTon  GOOGLon  …  at target weights (Magnificent Seven: 7 × ~14.3%)
                       │
                       └── exit: assets in kind to the owner, or liquidated to USDC
```

- **Owner.** The user's Privy wallet. Every read and write checks that Glider's
  `ownerAccountId` and `strategyId` match the signed-in wallet, and withdrawals always go to it.
- **Smart account.** Glider creates (or reuses) a deterministic Swig account for the wallet and
  adds a sub-account per portfolio. On Solana the fundable address is the smart account itself
  (`depositAccountId` equals `accountId`).
- **Agent.** Glider's automation agent operates the account for rebalancing, within the session
  key the user signs at enrollment. Mercury never holds user assets or keys; it holds a Glider API
  key on the server.
- **Assets.** Tokenized stocks, ETFs and commodities on Solana, currently all Ondo mints (143
  tickers in the catalog). Describe them as tokenized assets, not stocks only.

## The catalog

`services/api/catalog.json` is the source of truth: **22 strategies**, all enabled, all rebalanced
**daily** (this Glider tenant does not accept cron schedules).

| Shelf                    | What it holds                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| Themes (18)              | Technology, Energy, Defense, Consumer and others, e.g. Magnificent Seven, Hard Money, Quantum   |
| Invest like the pros (4) | Investor-inspired "Daily Variant" trackers. Adaptations, never copies of anyone's real holdings |
| Featured                 | An editorial tag, not a popularity claim                                                        |

Weights total 10,000 bps per strategy and every ticker must map to a mint, checked on load. Users
cannot create their own strategies yet; at startup, any catalog entry without a Glider strategy
id is created on Glider (private) and read back.

Performance shown is **modeled strategy performance**, a target-allocation time-weighted return
from historical prices. It is never presented as realized or user performance.

## The lifecycle

| Step      | Route                                                                   | What happens                                                                                                                                     |
| --------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Discover  | `GET /v1/baskets`, `/:slug`, `/:slug/insights`                          | The curated shelf plus the caller's own baskets, each marked `source`. Weights, modeled performance, sector breakdown, Glider's swap fee          |
| Enroll    | `POST /:slug/enrollment/prepare`, then `/:slug/enrollment/submit`       | Glider issues a challenge; the user signs a message (or a transaction on the sub-account path). Creates the portfolio. No USDC moves             |
| Fund      | `POST /:slug/funding/prepare`, then `/:slug/funding/confirm`            | Server builds an owner-paid USDC transfer to the smart account and simulates it; the user signs; the server verifies the debit equals the credit |
| Invest    | Glider                                                                  | Glider's agent buys toward the target weights at the next rebalance. Until then, USDC can sit uninvested, and the product says so                |
| Rebalance | `POST /:slug/rebalance`                                                 | Manual trigger on top of the daily schedule. Glider enforces a cooldown, surfaced as `rebalance_cooldown`                                        |
| Exit      | `POST /:slug/exit/:mode/prepare`, then `/:slug/exit/:mode/submit`       | `in_kind` returns the assets themselves; `liquidate_usdc` sells to USDC. The user signs; the recipient is always the owner. Dust can remain      |
| Track     | `GET /:slug/portfolio`, `/:slug/portfolio/positions`, `/:slug/activity` | Whether this wallet is in; then the live snapshot from Glider; then Mercury's own record of enrollments, fundings, rebalances and exits          |

All routes are under `/v1/baskets` unless shown, and all of them need a signed-in wallet.
`GET /v1/basket-portfolios` lists every basket portfolio the wallet owns, and
`GET /v1/basket-assets` is the universe a basket may be written from. Every two-phase write is
`prepare` then a named second step, never a bare `POST` to the noun. Without `GLIDER_API_KEY`,
discovery still works and provider-backed routes return `provider_unavailable`.

## What Mercury stores

- `basket_action`: enrollments, manual rebalances and exits, with Glider's ids and operation ids.
- `activity` rows of kind `basket_funding`, tagged with the basket and portfolio.

Positions, balances and allocations stay at Glider and are read live. Glider's automatic daily
rebalances are not written into Mercury's activity feed.

## Fees

Glider reports a per-strategy or tenant **integrator swap fee** (`swapBps`), charged on the output
of each swap, and the basket page shows it. Mercury adds no fee of its own to baskets today. Users
pay Solana network fees and account rent for enrollment and funding.

## Not done yet

- Count basket value in the portfolio's net worth, with basket holdings grouped separately from
  wallet holdings, and settle exits back into wallet holdings without double counting.
- Real-funded round trips for every strategy. Availability is based on Glider support, and a
  pilot proved the flow end to end, not execution quality for each allocation.
- Baskets on mobile. The iOS app still points at the retired Symmetry screens.
- Borrowing against a basket. A basket is not a token and its assets sit in the smart account, so
  it cannot be pledged on Kamino directly; a user can exit in kind and pledge eligible assets.
