# 08 · Roadmap

## To 12 October

Twenty-three days from 19 September. Scope is fixed; anything not listed waits.

### Week 1 · 19 to 25 September · the engine
- [ ] Scaffold the workspaces, shared tsconfig, lint, CI on push
- [ ] `packages/types`: Zod schemas for instruments, tokens, quotes, decisions
- [ ] `packages/market`: reference price, session state, per-token multipliers, with a cache
- [ ] `packages/chain`: token registry for both issuers, Jupiter quote and swap build
- [ ] `packages/core`: `decide()` complete, with the fixture test table from [04](04-execution-engine.md)
- [ ] `services/api`: instruments, quote, and the create/execute/confirm order path
- [ ] **Gate: a real buy of NVDAx on mainnet, signed by a test wallet, recorded as a lot**

### Week 2 · 26 September to 2 October · the app
- [ ] Postgres schema and migrations, positions maintained on write
- [ ] Privy wallet connect, on web first
- [ ] Web app: Home, Invest, stock page with the issuer comparison, buy sheet
- [ ] All three buy outcomes rendered, including refuse and queue
- [ ] Jupiter trigger orders for the queued path, worker polling their status
- [ ] Market-closed banner and the stale-reference block
- [ ] **Gate: a stranger can open the web app, connect, and buy a share end to end**

### Week 3 · 3 to 9 October · everything that makes it a product
- [ ] Three curated baskets, preview with per-leg decisions, all-or-nothing invest
- [ ] Recurring plans and the worker that runs them
- [ ] Exposure sheet with the multiplier breakdown and concentration warnings
- [ ] Money tab, idle balance earning, interest shown
- [ ] Activity feed and CSV export
- [ ] Dividend detection from multiplier changes, surfaced on Home
- [ ] iOS app in Expo, sharing `sdk` and `types`, running on a device
- [ ] **Gate: feature complete. No new features after this date.**

### Week 4 · 10 to 12 October · ship
- [ ] Landing page
- [ ] Demo video, four minutes, real money, real fills
- [ ] README, architecture notes, open-source licence
- [ ] Business plan section of the submission
- [ ] Deploy web and API, confirm both stay up through judging on 23 October
- [ ] **Submit by 11 October, a day early.** Do not use the last day.

## Cut list if we are behind

In this order. Cutting from the top costs the least.

1. The iOS app. Web carries the submission; the video can show the web build on a phone.
2. Recurring plans.
3. The Money tab's yield, leaving a plain balance.
4. Two of the three baskets.
5. CSV export.

Never cut: the issuer comparison, the premium gate, the exposure sheet. Those are the submission.

## After the hackathon

**Version 1.1, October to December.** Fiat on-ramp research. More baskets. Gifting a holding by
link. Round-ups. The auto-invest-from-gains feature, which is the acquisition engine described in
the earlier work and which fits Solana better than the chain it was designed for.

**Version 2, Q1.** Borrowing against holdings through Kamino. A risk screen with both the
present fall and the Monday gap. Then a card, which needs a partner who converts to real money
and carries identity.

**Version 3.** Creator baskets with an automatic fee split and a track record that is a chain of
timestamped transactions rather than a number you are asked to believe. That is the business.
