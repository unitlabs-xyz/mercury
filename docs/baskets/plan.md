# Baskets phase — plan

The [phase spec](spec.md) holds shared decisions. For each next task, present the HLD/LLD and file changes inline for approval, then append only a short outcome here. No per-task plan files.

- [x] Curate 22 Solana candidates and record confirmed Glider IDs, allocations, and mints in the [catalog](../../services/api/catalog.json). They are not yet enabled for funding.
- [x] Reconcile the catalog on API startup through [BasketService](../../services/api/src/baskets/core/service.ts), [Glider adapter](../../services/api/src/baskets/glider/client.ts), and [JSON store](../../services/api/src/baskets/glider/store.ts); keep focused tests in their `tests/` directories.
- [x] Backend discovery/detail: public typed `/v1/basket-templates` list/detail, candidate/disabled states, and Glider's **modeled Solana strategy TWR** on detail. Existing pooled-basket routes stay separate.
- [x] Backend discovery tags: validate one primary theme or pros grouping per catalog entry and expose optional editorial featured tags through list/detail.
- [ ] Backend lifecycle: authenticated Glider enrollment, USDC deposit preparation, positions, rebalance/operation status, and in-kind or USDC exit. Define exact contracts and any persistence inline before implementation.
- [x] Web discovery and strategy detail: tag-driven shelves, local artwork, Glider allocations, modeled-performance labels, and honest preview states. No funding CTA while candidates are unverified.
- [x] Invest-style web detail: overlapping holding icons, percentage-scaled modeled history, target composition, read-only Glider allocation/fee insights, and explicit lifecycle placeholders. No synthetic NAV, basket units, or portfolio activity.
- [x] Refine detail: shared Invest table with labeled underlying-company prices, cap and 1D/1W moves; combine sector context, adaptive allocation mosaic, and facts into one responsive card.
- [ ] Web onboarding/funding, live portfolio, and withdrawal. Reuse the stock [buy flow's](../../packages/view/src/order.ts) sequencing conventions where appropriate; do not route Glider actions through stock orders. No mobile work.
- [ ] Validate every candidate with real-funded entry, rebalance, position readback, and exit; enable only those that pass. Verify API fields and wallet balances with the corresponding UI flow.
