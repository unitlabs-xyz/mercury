# 08 · Roadmap

Twenty-three days from 19 September to the deadline on 12 October. Four engineers. Web only;
the iOS app follows the hackathon.

## Who does what

| | Owns | First task |
| --- | --- | --- |
| **A · Programs** | The basket vault, or the Symmetry integration. Anchor, mainnet deploys | The Symmetry spike, day one |
| **B · Chain and market** | Token registry, Jupiter quotes and triggers, Chainlink feeds, session state, the worker | A quote from both issuers for one ticker |
| **C · Core and API** | The execution engine, orders, Postgres, lots, positions, exposure | `decide()` against the fixture table |
| **D · Web** | The Vite app, Privy onboarding, every screen | Privy sign-in to a funded wallet |

B, C and D can start immediately. A's week is gated by a one-day spike.

## Week 1 · 19 to 25 September · prove the mechanism

**A** Spike Symmetry against the xStocks mints and decide build or integrate by day two. Then
either integrate the SDK or write `initialize_basket`, `deposit` and `redeem` and get them
passing on devnet with mock tokens.

**B** Token registry for both issuers with multipliers. Jupiter quotes at a given size. Chainlink
reference prices and session state, with staleness detection.

**C** `packages/core` complete: `decide()`, the policy defaults, and the full fixture table from
[04](04-execution-engine.md). API skeleton with instruments, quote, and create/execute/confirm.

**D** Vite app scaffolded. Privy sign-in creating a Solana wallet. App shell with four tabs,
design tokens, the Home and Invest skeletons.

> **Gate, 25 September.** A real buy of NVDAx on mainnet, signed by a Privy embedded wallet,
> recorded as a lot with correct cost basis. Nothing else counts as progress until this works.

## Week 2 · 26 September to 2 October · make it a product

**A** Vault on mainnet with a hard size cap. Deposit and redeem exercised with real tokens at
small size. Fee accrual. Pause that never blocks redemption.

**B** The worker: price cache, multiplier watch writing dividend events, Jupiter trigger order
polling. Corporate-action state feeding the halt rule.

**C** Postgres schema and migrations. Lots, positions, exposure queries. Basket preview running
the decision on every leg. Order history.

**D** Stock page with the issuer comparison. Buy sheet with all three outcomes rendered: filled,
queued, refused. Market-closed banner. Portfolio and holdings.

> **Gate, 2 October.** A stranger opens the web app, signs in with an email, funds the wallet,
> and buys a share end to end without help.

## Week 3 · 3 to 9 October · everything that makes it worth judging

**A** Basket invest and redeem wired end to end. Program frozen by 7 October. Upgrade authority
revoked.

**B** Recurring runs through Privy delegated actions, with the policy scope and caps.

**C** Recurring plans, activity feed, CSV export, dividend recognition from multiplier changes.

**D** Baskets, exposure sheet with the multiplier breakdown and concentration warnings, Money
tab, Activity.

> **Gate, 9 October. Feature complete.** No new features after this date, by anyone, for any
> reason.

## Week 4 · 10 to 12 October · ship

Landing page. Four-minute demo video with real money and real fills. README, architecture notes,
open-source licence. The business plan section. Deploy web and API and confirm both stay up
through judging on 23 October.

> **Submit 11 October.** A full day early. Do not use the last day.

## Cut list, in order

1. Recurring investing.
2. The Money tab's yield, leaving a plain balance.
3. Two of the three baskets, shipping one.
4. CSV export.
5. Baskets as real tokens, falling back to a tracked set. **Only if the program is not safe by
   7 October.** This is a product retreat, not a schedule adjustment, and it gets announced
   rather than hidden.

Never cut: the issuer comparison, the premium gate, the exposure sheet. Those three are the
submission.

## After the hackathon

**1.1, October to December.** The iOS app in Expo, sharing `sdk` and `types`. Basket rebalancing,
which needs its own decision record because it puts swaps back inside the vault. Gifting a
holding by link. More baskets. The auto-invest-from-gains hook.

**2.0, Q1.** Borrowing against holdings through Kamino, with a risk screen showing both the fall
the portfolio can take today and the gap it could take on a Monday. Then a card, which needs a
partner who converts to real money and carries identity.

**3.0.** Creator baskets with an automatic fee split and a track record that is a chain of
timestamped transactions rather than a number you are asked to believe. That is the business.
