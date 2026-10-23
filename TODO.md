# TODO

Everything still open, in one place. Written 23 October 2026 from the code on `main`, the open pull
requests and the docs. Tick a line when its work lands on `main`, and add new work here, not
somewhere it will be lost.

The detail behind the money items is in [docs/revenue-todo.md](docs/revenue-todo.md), and the order of
the bigger steps in [12 Roadmap to 2028](docs/12-roadmap-2028.md).

## Now

- [ ] **Paid RPC.** The Alchemy key behind `SOLANA_RPC_URL` ran out of its monthly allowance on
      23 October, and every route that reads the chain answered 429 until it had room again. Make sure
      the plan, or another provider, has room for a month at the rate after #106
- [ ] **Old domain.** `thecircleco.xyz` expired on 21 October and Hostinger parked it; the API moved to
      `https://mercury-dev.unitlabs.xyz`. Still pointing at the old one:
  - [ ] the mobile app's API URL
  - [ ] the webhook URL in Relay's dashboard (until then, `funding-poll` settles deposits a minute or
        two late)
  - [ ] renew `thecircleco.xyz` or let it go
- [ ] **`PYTH_API_KEY`** is unset on the dev API, so the reference price is the issuer's alone and stops
      moving at the closing bell
- [ ] **Watch the jobs after #106.** "The node refused this pass" should be rare and only for the job
      that was refused, `wallet-events` should run every 30 seconds rather than every two minutes,
      and the hourly snapshot should read every account

## Pull requests

- [x] [#97 Referral tracking](https://github.com/unitlabs-xyz/mercury/pull/97): `main` merged in and its
      migration renumbered to `0029_referral` on 23 October
- [ ] [#74 Custom baskets](https://github.com/unitlabs-xyz/mercury/pull/74): review
- [ ] [#76 Copy pass](https://github.com/unitlabs-xyz/mercury/pull/76): conflicts with `main` since
      14 October. Rebase or close

## Local branches nobody has pushed

- [ ] `feat/import-stocks`: one docs commit, Part B of importing stocks answered and Part C corrected.
      Push it or drop it
- [ ] `feat/trade-router`: its docs are on `main` now. The branch can go once #97 merges
- [ ] Prune the local branches whose pull requests have merged

## Before a public launch

- [ ] Replace silent signing with Privy signing scoped by policy
      ([ADR 0012](docs/adr/0012-silent-signing.md), Phase 1 step 1)
- [ ] Country check at sign-in, the restricted list, and a reason shown to anyone blocked
      ([revenue TODO §0](docs/revenue-todo.md#0--country-check-at-sign-in-prerequisite))
- [ ] Counsel signs off Earn's risk wording (`EARN_RISK_VERSION` 2026-10-22)
- [ ] Choose the one or two launch markets

## Product

**Earn**

- [ ] One Cash balance earning a variable rate, chosen at sign-up and not pre-checked
- [ ] Take what a buy needs out of Earn inside the buy's own transaction. Today the ticket points
      the person to Earn instead
- [ ] An Earn screen on mobile

**Trading**

- [ ] Fee tiers: 0.5% / 0.35% / 0.25% by trade size, tested at the $2k and $20k edges
- [ ] Alert when a fill comes back without a fee
- [ ] Trigger orders: the poller the design called for. Until it exists, an order that would queue
      is refused instead
- [ ] Charge both signatures in the network cost (`fee.ts` charges one)

**Borrowing**

- [ ] The 0.25% borrow fee, once counsel agrees: in the loan's transaction, on the confirm screen and on
      `loan_event`
- [ ] "Buy more with credit": one tap to borrow and buy, capped at the 80% target, with the
      liquidation price shown

**Baskets**

- [ ] Glider basket fee: tenant `swapBps` to 50 once Glider confirms how it pays out, shown on the
      ticket
- [ ] Charge the network cost on basket deposits

**Referrals, after #97 merges**

- [ ] Turn the friend's discount on (`REFERRAL_DISCOUNT=on`) only where counsel says it is allowed. It is
      off by default
- [ ] The flat reward per qualified friend instead of a fee share, once counsel agrees
      ([revenue TODO §4](docs/revenue-todo.md#4--referral-payouts-once-counsel-approves-the-flat-reward))
- [ ] Rewrite the rewards plan, which still assumes the fee share
- [ ] An Invite screen on mobile

**Card and cash out**

- [ ] Card with Bridge, after confirming its non-US issuing for the launch markets; Rain or Reap if not
- [ ] Cash out to a bank through Bridge

**Fees and the relayer**

- [ ] Move the fees out of the relayer's hot wallet. The trade router is the design
- [ ] Weekly check: SOL the relayer spent against the USDC it collected
- [ ] Decide whether Send keeps absorbing its signature

## Trade router: designed, not to be built until the go-ahead

[ADR 0018](docs/adr/0018-trade-router.md) (proposed),
[spec](docs/superpowers/specs/2026-10-21-trade-router-design.md),
[plan](docs/superpowers/plans/2026-10-21-trade-router.md). It builds on #97.

- [ ] Pick the audit firm, and when
- [ ] Counsel: does routing swaps for a fee make Mercury an order transmitter in the launch markets?

## RPC and infrastructure

- [ ] If the routes still cost too much: serve balances from what `position-sync` already writes, and
      read the chain only after the person's own transactions
- [ ] Push instead of poll: account updates from a provider such as Helius
- [ ] A free keyed endpoint (Helius or QuickNode free tier) in `SOLANA_PUBLIC_RPC_URLS`, for more room
      on the jobs' lane
- [ ] `apps/web/src/api/pending-confirm.ts` keeps its 5-second interval in a hidden tab
- [ ] The jobs run inside the API, so it must run as one instance. Move them to their own process
      before scaling out

## For counsel, in one memo

- [ ] Is a country block at sign-in required, and for which list?
- [ ] Does a 0.25% borrow fee on top of Kamino make Mercury a lender in any launch market?
- [ ] Is a flat, capped, one-off referral reward allowed, with the friend's 90-day discount?
- [ ] Does building and routing swaps for a fee make Mercury an order transmitter?
- [ ] What wording and consent does Earn need in each launch market?
- [ ] California DFAL, if any US users stay

## For the founders

- [ ] Launch markets
- [ ] Fee tiers
- [ ] Perps: ever, or never (ADR 0009 stays as it is if never)
- [ ] Card issuer model: Bridge's pull at purchase, or a credit issuer
- [ ] The trade router's go-ahead and its audit
- [ ] Burn, runway and the raise; the thresholds that open Phase 2

## Partners

- [ ] Glider: how `swapBps` is paid out, and to which account
- [ ] Kamino: whether it will set a referrer share on the xStocks market (0% today)
- [ ] Bridge: our share of card interchange, and non-US issuing

## Docs

- [ ] The revenue and the fees-and-referrals docs the 14 October deck cites. Neither exists, and number
      12 is taken by the 2028 roadmap, so they need other numbers
- [ ] Specs, plans and ADRs written before 23 October describe `position-sync` at two seconds and
      batched RPC calls. They are records of what was decided then and stay as written;
      [03 Architecture](docs/03-architecture.md) has how it runs now
