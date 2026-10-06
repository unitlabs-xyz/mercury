# Baskets phase — plan

The [phase spec](spec.md) holds shared decisions. For each next task, present the HLD/LLD and file changes inline for approval, then append only a short outcome here. No per-task plan files.

- [x] Curate 22 Solana strategies and record confirmed Glider IDs, allocations, and mints in the [catalog](../../services/api/catalog.json). All are enabled based on confirmed Glider support; individual funded checks are not an availability gate.
- [x] Reconcile the catalog on API startup through [BasketService](../../services/api/src/baskets/core/service.ts), [Glider adapter](../../services/api/src/baskets/glider/client.ts), and [JSON store](../../services/api/src/baskets/glider/store.ts); keep focused tests in their `tests/` directories.
- [x] Backend discovery/detail: public typed `/v1/basket-templates` list/detail, candidate/disabled states, and Glider's **modeled Solana strategy TWR** on detail. Existing pooled-basket routes stay separate.
- [x] Backend discovery tags: validate one primary theme or pros grouping per catalog entry and expose optional editorial featured tags through list/detail.
- [ ] Backend lifecycle: enrollment, owner-paid USDC funding, authenticated live positions/schedule, manual rebalance, and operation-by-ID read are implemented. Both signed exits are wired; real-funded verification and global accounting remain.
- [x] Web discovery and strategy detail: tag-driven shelves, local artwork, Glider allocations, modeled-performance labels, and availability states.
- [x] Invest-style web detail: overlapping holding icons, percentage-scaled modeled history, target composition, read-only Glider allocation/fee insights, and explicit lifecycle placeholders. No synthetic NAV, basket units, or portfolio activity.
- [x] Refine detail: shared Invest table with labeled underlying-company prices, cap and 1D/1W moves; combine sector context, adaptive allocation mosaic, and facts into one responsive card.
- [ ] Web onboarding, reviewed USDC transfer, live holdings, schedule, reviewed manual rebalance, and operation-status polling are implemented. A shared review sheet now covers both exits; visual and funded verification remain. No mobile work.
- [x] Refresh live balances, company context, and modeled strategy history while the basket page is visible; show a compact scheduled-run timer.
- [x] Replace the basket detail's single-operation Recent activity stub with the existing activity-card pattern and verifiable basket events.
- [x] Audit owner-wallet ↔ Glider strategy/portfolio identity and expose owner-scoped portfolio aggregation. The verified wallet scopes Glider's owner list; completed local enrollment actions supply stable ordering.
- [x] Replace the baskets landing page's "Your baskets" placeholder with the owner's curated Glider portfolios and live value/USDC balances. Unavailable balances remain unknown, never zero.
- [x] Align basket-page loading, refresh, and reload states with the other app pages: stable skeletons, retained last readings on refresh errors, explicit retry, and owner-scoped session states. Visual confirmation remains with the user.
- [ ] Include active Glider smart-account value in main Portfolio net worth and show grouped basket holdings. Reconcile settled in-kind assets or USDC back into wallet holdings and neutral Activity without double counting or invented basis; keep hourly history consistent.
- [ ] Follow up with real-funded entry, rebalance, position readback, and exit checks across the enabled catalog. These checks assess execution quality and are not required for availability.
