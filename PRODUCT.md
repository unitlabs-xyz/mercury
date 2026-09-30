# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Version one is for people who already hold crypto.** They arrive holding stablecoins, with a
wallet they already use. No bank transfer, no card, no identity check. That decision removes
payment rails and per-country money licensing, which is why a real product can ship in weeks
rather than quarters.

They are **investors, not traders**. Someone who wants to own Nvidia or the S&P 500 and leave it
alone, not someone who wants leverage, order books or candlesticks.

The wider audience — people with no access to a brokerage account anywhere, in Lagos, Jakarta or
São Paulo — arrives when a fiat on-ramp does. That is deliberately a later problem, and no
current work should assume it.

## Product Purpose

An investment account that lives in a crypto wallet.

You arrive with stablecoins, buy shares of real US companies and funds, put money into ready-made
baskets, and watch one portfolio holding stocks and crypto together. Later you borrow against those holdings instead of selling them.

It is closer to a brokerage account than a trading terminal, and the person using it should never
need to know which blockchain it runs on.

Success is someone with no access to US equities owning some, understanding what they own, and
being able to leave with it.

## Positioning

> Your investment account, in your own wallet, open every hour of the week.

Five things a traditional broker cannot copy, argued in `docs/01-evidence.md`:

1. **True exposure across issuers.** The same company exists as several tokens. Mercury sums them
   with each token's multiplier rather than adding token counts, and warns on concentration. No
   broker has this problem, so no broker has this screen.
2. **Protection from the wrong wrapper.** Same stock, two issuers, measurably different cost for
   the identical share. Checked on every order, at the size being ordered.
3. **A basket that is one real token** — holdable, sendable, pledgeable — backed by a vault
   rather than a rule in a database.
4. **A share count that grows by itself.** Dividends arrive as a rise in the token's multiplier.
   Most integrations ignore the multiplier and their numbers drift wrong.
5. **Leaving is trivial, and the product says so.** Holdings sit in the user's own wallet.

**Investing, not trading**, is a decision rather than a gap (ADR 0009). Version two's borrowing
is a Lombard loan, which produces cash without increasing exposure, and borrowed funds cannot buy
stocks inside the app — enforced in code, not policy.

## Operating Context

Built for **Colosseum's Crypto World's Fair, closing 12 October 2026**. Judging weighs
functionality, impact, novelty, user experience, open-source composability and the business plan.
Four engineers; **web is the submission**.

The market the product sits on top of is open continuously while the exchange it tracks is not.
That gap — a token trading all week against a reference price that stops on Friday — is the
source of most of the product's hard cases: queued orders, the weekend gap in borrowing, and the
off-hours price band.

## Capabilities and Constraints

**Live and working:** browse and search the routable universe; per-issuer comparison priced per
real share; the buy sheet with its three outcomes (fill, queue, refuse); borrowing power against
live collateral factors; funding, send and receive; activity with filters and export.

**Deliberately not built**, so nobody asks twice: perpetuals, margin, options, order books,
candlestick charts, bank deposits and withdrawals, identity checks, news and analyst data, a
screener, a tax centre, savings goals, user-created baskets, an AI assistant.

**Confirmed rules:**

- Minimum order **$5**; orders under it are refused, not rounded.
- Price impact above **1.5%** refuses; a premium above **1%** while the exchange is shut offers
  to queue rather than fill.
- Idle cash earns **4.1%**.
- Prices, routes, multipliers, liquidity and the exchange calendar are **read live**, never typed
  into source. Third-party readings are attributed on screen.
- Only **verified** issuer tokens are routable. Symbol matching alone would route money into a
  lookalike, and the search surface returns those.
- An instrument is listed only where some wrapper has the depth to fill a normal order. Listing
  what cannot be filled is an offer the product cannot honour.

**Terminology:** _wrapper_ (a token representing a share), _multiplier_ (shares per token),
_issuer_ (Backed, whose symbols end `x`; Ondo, whose end `on`), _basket_, _queue_, _reference
price_ (one real share), _collateral factor_.

**Open, and recorded rather than assumed:**

- Whether basket tokens route as a single swap, and whether the xStocks mints are in Symmetry's
  supported list. Both close by testing, not by discussion.
- **Every screen must run on real data by 12 October.** Portfolio, Money and Activity still use
  invented holdings; that is a defect to close, not an accepted state. The known placeholders are
  return figures and 30-day buyer counts in `apps/web/src/market/placeholder.ts`.

## Brand Commitments

The name is **Mercury**, reversible but currently settled; nothing depends on it.

**Voice:** plain, specific, and willing to name what is wrong. The product states its own limits
— what it refuses, what it cannot fill, what could go wrong when borrowing — because a financial
product that only describes good outcomes is the one users should not trust. Numbers on screen
say where they came from.

**Third parties are named, never absorbed.** The basket page names Symmetry, the credit page
names Kamino, prices credit their source. Mercury is not the custodian and will not imply it is.

## Evidence on Hand

- `docs/01-evidence.md` — routing measurements taken on Jupiter, 19 September 2026, at $1,000 and
  $10,000, showing one issuer costing materially more for the identical share.
- Live reads, verified working from the browser with no API key: Jupiter (prices, real-share
  reference, multipliers, routed quotes), Pyth (exchange calendar), Kamino (collateral factors
  and borrow rate, from its dedicated xStocks market).
- `packages/core` — the execution engine, 35 passing tests.
- ADRs 0001–0010 record the decisions and their reasoning, including where a later reading
  corrected an earlier one.

**Absences future work must not fabricate:** no users, no track record, no press, no
testimonials, no revenue, no partnerships beyond the public protocols named above. Price history
does not exist anywhere in the product, so **return figures cannot be computed** — the current
ones are placeholders in `apps/web/src/market/placeholder.ts` and are labelled as such on screen.

## Product Principles

1. **Read it, do not type it.** Any number that exists on chain or behind a public API is read
   live and attributed. A figure written into source is a figure that goes quietly wrong.
2. **Name the bad outcome.** Refusals, queues, liquidation and the weekend gap are product
   surface, not fine print. The product is trustworthy because it says what it will not do.
3. **Correctness before completeness.** A screen that shows fewer things accurately beats one
   that shows everything approximately — the multiplier, the per-share price, the issuer split.
4. **Investing, not trading.** Every feature is tested against whether it helps someone own
   something, or tempts them to churn it.
5. **Leaving must stay trivial.** Self-custody is the product, not a feature of it. Nothing may
   be built that only works while the user stays.

## Accessibility & Inclusion

**WCAG 2.1 AA is a binding commitment.** Contrast, touch targets, focus visibility, labelling and
heading structure are held to it on every screen, and a regression is a defect rather than
polish. Audited 20 September 2026: zero contrast failures across six routes, touch targets at 44px
under coarse pointers, focus ring verified under real keyboard focus.

The audience is global and largely new to equities, so plain language beats finance jargon, and
figures are explained where they are shown.
