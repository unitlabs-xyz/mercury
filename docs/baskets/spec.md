# Baskets phase — spec

## Product

Web users discover a Solana strategy template, enroll in their own Glider portfolio, deposit USDC, inspect holdings and operations, rebalance, and withdraw assets in kind or liquidate to USDC. These are **user-owned smart-account portfolios**, not pooled basket tokens. Mobile is out of scope.

The [catalog](../../services/api/catalog.json) is the versioned source for 22 candidate templates, their Glider and source IDs, weights, and Solana Ondo mints. All 22 were created and read back, but none of these exact allocations has completed a funded lifecycle test. Keep them `candidate` until each template passes enrollment, funding, rebalance, positions, and exit. A failed template stays disabled; do not silently replace holdings.

The templates derive from 21 BNB and one Base public Glider strategies; none of those sources is a Solana portfolio. The Base strategy is a separately named same-theme variant, not a Bitwise product. Four investor trackers are explicitly labeled **Daily Variant** because this Glider tenant rejects cron schedules; all 22 candidates rebalance daily. Some assets are tokenized ETFs or commodities, so describe the catalog as tokenized assets, not stocks only. Glider can compute a target-allocation TWR curve for each newly created Solana strategy using historical asset prices; label this **modeled strategy performance**, never realized user or funded-portfolio performance. Do not substitute source-chain returns or promotional yields. Ondo's `IBITon` mint still needs first-party confirmation or a funded pilot. Provider validation proves asset recognition, not executable liquidity.

## Boundaries

- [Core types and ports](../../services/api/src/baskets/core/deps.ts), [BasketService](../../services/api/src/baskets/core/service.ts), [OpenAPI-typed Glider client](../../services/api/src/baskets/glider/client.ts), and [catalog store](../../services/api/src/baskets/glider/store.ts) own template sync and discovery. Startup composition is in [deps.ts](../../services/api/src/deps.ts). Keep provider I/O out of core.
- Existing [Symmetry baskets](../../services/api/src/baskets.ts), [basket types](../../packages/types/src/baskets.ts), and [web basket model](../../apps/web/src/app/baskets/model.ts) assume a pooled token. Separate that kind from Glider-managed portfolios; do not reuse synthetic NAV as portfolio performance.
- The [buy/order API](../../services/api/src/app.ts), [typed order contracts](../../packages/types/src/orders.ts), [client sequence](../../packages/view/src/order.ts), and [web signing wrapper](../../apps/web/src/api/orders.ts) are references for request boundaries and wallet-signing UX, not Glider execution semantics. Glider enrollment and portfolio operations require their own typed contracts and status handling.
- Use authenticated owner identity, Glider smart-account IDs, and operation state as the authority for portfolio actions. Add persistence only for data Glider cannot supply or for an explicit audit requirement; avoid duplicating provider positions or catalog allocations in Postgres.

## Release gate

Run focused tests for each boundary and a small real-funded round trip for **each** candidate before enabling it. Verify owner balances and operation completion, not only a successful prepare response. Solana USDC is `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`; SOL may be needed for fees/rent. A prior NVDAx/TSLAx pilot proves the general Glider flow, not these 22 templates. Withdrawal can leave dust, so expose both in-kind and liquidation paths.

Future tasks are designed and approved inline; add only durable decisions to this phase spec. Do not create dated task-level specs.
