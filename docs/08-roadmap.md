# 08 · Roadmap

Twenty-three days from 19 September to the deadline on 12 October. Four engineers. Web is the
submission. Integrating Symmetry rather than writing a vault returns roughly a fortnight of one
engineer, which buys back the iOS app.

## Who does what

| | Weeks 1 | Weeks 2 to 3 | Owns |
| --- | --- | --- | --- |
| **A** | Symmetry spike, then the basket integration | **iOS app in Expo** | Baskets, then mobile |
| **B** | Token registry, Jupiter, Chainlink, session state | The worker, recurring, triggers | Chain and market data |
| **C** | `decide()`, orders, the API | Postgres, lots, positions, exposure | The engine and the server |
| **D** | Privy onboarding, app shell, funding screen | Every screen | The web app |

## Week 1 · 19 to 25 September · prove the mechanism

**A** Run the spike on day one and write the answers into [ADR 0005](adr/0005-basket-vaults.md):
are the xStocks mints in Symmetry's token list, do basket tokens route through Jupiter, can
Chainlink be configured per constituent. Then create the three baskets on mainnet and get an
invest and a redeem working at small size.

**B** Token registry for both issuers with multipliers, read from the Token-2022
`ScaledUiAmount` extension rather than an API. Jupiter Ultra quotes. Chainlink reference prices
with the dividend-window correction, and sessions from Pyth's schedule.

Also, days one and two: **the routing sweep**. Every candidate basket constituent quoted at
$1,000 and $10,000, applying the rule in [09 Open questions](09-open-questions.md). This decides
baskets two and three, so it blocks copy and artwork and cannot slip.

**C** `packages/core` complete: `decide()`, policy defaults, the full fixture table from
[04](04-execution-engine.md). API skeleton with instruments, quote, and create, execute, confirm.

**D** Vite app scaffolded. Design tokens taking their real values from the brand work. Privy
sign-in creating a Solana wallet. The funding screen with all three paths from
[ADR 0007](adr/0007-wallet-funding.md). App shell, four tabs.

> **Gate, 25 September.** Three things. A real buy of NVDAx on mainnet, signed by a Privy
> embedded wallet, recorded as a lot with correct cost basis. A real basket invest and redeem
> through Symmetry. And the routing sweep complete, with baskets two and three named. Nothing
> else counts as progress until all three are done.

## Week 2 · 26 September to 2 October · make it a product

**A** Start the Expo app, sharing `sdk` and `types`, using the web app as the reference
implementation. Privy sign-in, portfolio, stock page.

**B** The worker: price cache, multiplier watch writing dividend events, Jupiter trigger polling.
Corporate-action state feeding the halt rule.

**C** Postgres schema and migrations. Lots, positions, exposure queries. Basket preview. Order
history.

**D** Stock page with the issuer comparison. Buy sheet with all three outcomes rendered: filled,
queued, refused. Market-closed banner. Portfolio and holdings.

> **Gate, 2 October.** A stranger opens the web app, signs in with an email, funds the wallet,
> and buys a share end to end without help.

## Week 3 · 3 to 9 October · everything that makes it worth judging

**A** Expo app to parity on the core flows: portfolio, buy, baskets. On a device, not a simulator.

**B** Recurring runs through Privy delegated actions, with policy scope and caps.

**C** Recurring plans, activity feed, CSV export, dividend recognition from multiplier changes.

**D** Baskets, exposure sheet with the multiplier breakdown and concentration warnings, Money
tab, Activity.

> **Gate, 9 October. Feature complete.** No new features after this date, by anyone, for any
> reason.

## Week 4 · 10 to 12 October · ship

Landing page. Four-minute demo video with real money and real fills, shot on the iOS app if it is
ready and on the web build if it is not. README, architecture notes, open-source licence. The
business plan section. Deploy web and API and confirm both stay up through judging on 23 October.

> **Submit 11 October.** A full day early. Do not use the last day.

## Cut list, in order

1. **The iOS app.** It exists because Symmetry freed an engineer. If anything slips, it is the
   first thing to go and the video is shot on the web build. Nobody should feel bad about this.
2. Recurring investing.
3. The Money tab's yield, leaving a plain balance.
4. Two of the three baskets, shipping one.
5. CSV export.

Never cut: the issuer comparison, the premium gate, the exposure sheet. Those three are the
submission.

## After the hackathon

**1.1, October to December.** Basket rebalancing through Symmetry's keepers, which needs its own
record. Gifting a holding by link, which baskets being real tokens now makes trivial. More
baskets. The auto-invest-from-gains hook.

**2.0, Q1.** Borrowing against holdings through Kamino, with a risk screen showing both the fall
the portfolio can take today and the gap it could take on a Monday. Then a card, which needs a
partner who converts to real money and carries identity.

**3.0.** Creator baskets with an automatic fee split and a track record that is a chain of
timestamped transactions rather than a number you are asked to believe. Symmetry already supports
third-party basket creation, so this is closer than it was.
