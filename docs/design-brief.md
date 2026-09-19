# Harbor — Design Brief

Hand this whole file to a designer. It is self-contained: what the app is, every screen,
the real data to put in the mockups, and where to look for reference.

---

## 1. What the app is

An investment account that lives inside a crypto wallet.

You arrive holding stablecoins. You buy shares of Nvidia, Apple or the S&P 500. You put money
into ready-made baskets of stocks. You set a fixed amount to invest every month. You watch one
portfolio that holds your stocks and your crypto together.

It is not a trading terminal. It is closer to a brokerage account, and the person using it
should never need to know which blockchain it runs on.

**Positioning line:** *Your investment account, in your own wallet, open every hour of the week.*

### Why it can exist

Real US shares sit with regulated custodians and are mirrored as tokens on Solana. Two issuers
do this at scale — **Backed** (tickers end in `x`, e.g. `NVDAx`) and **Ondo Global Markets**
(tickers end in `on`, e.g. `NVDAon`). Between them there are 590 US stocks and funds. They trade
around the clock, the minimum is a few dollars, and no brokerage account is required anywhere in
the world.

That last point is the whole opportunity. Someone in Lagos, Jakarta or São Paulo cannot open a
US brokerage account. They can hold a stablecoin today.

### Who it is for

People who already hold crypto. No bank transfers, no card top-ups, no identity checks, no
fiat. The wallet is the account.

### What it should feel like

Calm and trustworthy. Built for investors, not traders. Every screen should make **doing nothing
feel fine** and **doing something feel considered**. No streaks pushing trades, no leaderboards,
no confetti, no green flashing numbers.

---

## 2. Platform and constraints

- **Mobile-first.** Design at 390×844 (iPhone). The web app is a mobile-width column centred on
  desktop — it is not a dashboard and it is not responsive-to-wide.
- **Dark.** There is no light mode.
- **Stack:** Vite + React + Tailwind v4 for web; Expo + React Native later. Anything designed
  has to be buildable in both, so: no CSS the RN side cannot mirror, no blend modes, no filters
  on scrolling content.
- **Four tabs, bottom bar:** Home, Invest, Money, Activity.
- **Numbers must be tabular** so columns line up. Money is the content of this app.

---

## 3. The screens

### 3.1 Home — portfolio

Top to bottom: **total value → change since opening → line chart → holdings list → exposure callout**.

One number at the top: stocks + baskets + cash. Beneath it the change, absolute and percentage.

Each holding row: ticker, company name, share count, value, day change. A basket row shows the
basket name and how many stocks are inside. A small badge appears on a row when that position is
spread across more than one issuer.

**The one unusual thing on Home:** a dividend appears as *shares gained*, not cash. When a
token's multiplier rises the user owns more shares without spending money. Home surfaces it as
an event: *"Dividend reinvested. You now own 2.401 shares of Nvidia, up from 2.398."*

### 3.2 Exposure sheet — the screen no broker has

Tap a company from Home. You can hold two different Nvidia tokens at once; this adds them up
correctly and warns you if too much sits with one issuer.

```
Nvidia                        $533.28    2.398 shares
  NVDAx   Backed              $400.00       75%    multiplier 1.001701
  NVDAon  Ondo                $133.28       25%    multiplier 1.001715
```

A warning when one issuer holds more than 80% of a position. A short plain-English explanation
at the bottom, because most users do not know two tokens for the same stock are different things.

### 3.3 Invest — discovery

A search box and three shelves. Nothing more.

- **Popular** — about twenty names people actually search for
- **Biggest movers** — largest absolute moves today, up and down in one list
- **Sectors** — technology, semiconductors, healthcare, energy, financials, consumer

### 3.4 Stock page — the signature screen

**price → change → line chart → timeframe pills (1D/1W/1M/1Y/All) → about → issuer comparison → Buy / Sell**

The issuer comparison is the part nobody else has and the part most worth designing well. Same
stock, two wrappers, wildly different cost:

```
WE CHECKED BOTH ISSUERS                       for $1,000

  Backed · NVDAx       $222.33 per share      0.02% impact      BEST
  Ondo   · NVDAon    $1,523.66 per share     85.27% impact      AVOIDED
```

It regenerates whenever the amount changes, because the answer depends on size. It needs three
visual states, not two: **Best**, **Tradable but dearer** (a real option, just worse), and
**Refused** (no usable route).

### 3.5 Buy sheet

One input: a dollar amount, with quick chips at $25 / $100 / $500. Then estimated shares, price
per share, which issuer was chosen, the premium against the real share price, and the fee. One
primary button.

**Three terminal states, all of which must be designed:**

| Outcome | When | What it says |
| --- | --- | --- |
| **Filled** | Best wrapper is within tolerance | Share count, issuer used, link to the transaction |
| **Queued** | Price is above tolerance, usually because the market is shut | Why we waited, the trigger price, when the market reopens, and a note that it fills on chain without the app open. Offers "buy anyway" |
| **Refused** | No wrapper has a usable route at this size | Which issuers were tried, what was wrong with each, suggestion to try a smaller amount |

### 3.6 Baskets

A named set of stocks with fixed weights, bought in one action.

```
Semiconductors                         +18.4% past 12 months
  Nvidia 30% · Broadcom 22% · AMD 18% · TSMC 14% · ASML 10% · Micron 6%
  Fee 0.5% a year · minimum $25
```

Basket page: name, performance, fee, minimum, constituents with weight bars, one amount input.
A line under the button reading *"Buys all six. Held afterwards as one position."*

### 3.7 Recurring

A fixed amount weekly or monthly, split across stocks and baskets by percentage.

```
$200 monthly, next on 1 October
  60% Semiconductors basket
  40% S&P 500
```

### 3.8 Money

- **Balance** — stablecoins available to invest, the rate they earn, interest earned this year
- **Receive** — wallet address and QR code
- **Send** — move stablecoins out
- **Borrowing** — visible but switched off, showing what the current portfolio would support

No bank transfers, no card top-ups, no cash withdrawals.

### 3.9 Activity

Reverse-chronological, grouped by day. Buys, sells, basket investments, recurring runs,
dividends recognised, sends, receives. Each row: icon, title, subtitle, amount. Expanding shows
the detail and the transaction signature. Settings live behind a button in the corner.

### 3.10 Market-closed banner

Persistent across Invest while the US market is shut. Shows the session, when it reopens, and a
line saying prices can drift while it is closed. **Amber, not red — it is a fact, not an error.**

---

## 4. Every state that has to exist

Empty, loading, error and offline for every list. Plus these, which are specific to this app:

| State | Where |
| --- | --- |
| Market closed | Invest, stock page, buy sheet |
| Instrument halted for a corporate action | Stock page, buy sheet |
| Only one issuer routable | Stock page comparison |
| No issuer routable at this size | Buy sheet |
| Reference price stale | Buy sheet — blocks the order |
| Queued order waiting | Home, Activity, stock page |
| Dividend recognised | Home, Activity |
| Estimated cost basis on a transferred-in position | Holding row, exposure sheet |

---

## 5. Real data for the mockups

These are measured, not invented — Jupiter quotes on Solana, $1,000 buy, 19 September 2026.
Use them so the screens read as real.

| Stock | Backed token | price/share | impact | Ondo token | price/share | impact |
| --- | --- | --- | --- | --- | --- | --- |
| Nvidia | NVDAx | $222.33 | 0.02% | NVDAon | $1,523.66 | 85.27% |
| S&P 500 | SPYx | $664.21 | 0.00% | SPYon | $664.88 | 0.10% |
| Nasdaq 100 | QQQx | $598.42 | 0.11% | QQQon | $1,050.12 | 75.64% |
| Tesla | TSLAx | $426.07 | 0.02% | TSLAon | $2,178.43 | 97.41% |
| Apple | AAPLx | $245.50 | 0.27% | AAPLon | $281.14 | 13.18% |
| MicroStrategy | MSTRx | $162.47 | 0.19% | MSTRon | — | no route |

Sample portfolio: total **$12,480.62**, up **$1,204.18 (+10.68%)**. Holdings — Nvidia $533.28
(2.398 shares, two issuers), S&P 500 $3,984.00, Semiconductors basket $2,150.40, Tesla $1,278.21,
cash $4,534.73 earning 4.1%.

Market status for the banner: **closed — weekend**, reopens **Monday 21 September, 9:30 AM New
York time**.

---

## 6. Do not design any of this

Named so nobody wastes a day on it: perpetuals, margin, options, order books, depth charts,
candlesticks, bank deposits and withdrawals, identity verification, news / earnings / analyst
data / screeners, a tax centre, savings goals, user-created baskets, an AI chat assistant.

The chart is **a single line with a soft fill**. No axes, no grid, no crosshair.

---

## 7. Reference — apps to pull from

All links verified working.

**The two that matter most**

| App | Why | Link |
| --- | --- | --- |
| **Phantom** | The reference for what an on-chain money app looks like. Token rows as filled cards with circular icons, true-black ground | https://phantom.com · https://apps.apple.com/us/app/phantom-trading-wallet/id1598432977 |
| **Robinhood** | The reference for the stock page and discovery. Price, change, line chart, timeframe pills, nothing above the fold | https://robinhood.com · https://apps.apple.com/us/app/robinhood-trading-investing/id938003185 |

**Also worth taking from**

| App | What to take | Link |
| --- | --- | --- |
| **M1** | Portfolio home — one value, then holdings. Also the cash screen and the borrowing screen | https://m1.com · https://apps.apple.com/us/app/m1-invest-bank-smarter/id1071915644 |
| **smallcase** | Baskets: publisher, past return, minimum, risk badge. And the recurring-plan screen | https://www.smallcase.com · https://apps.apple.com/us/app/smallcase-save-invest/id1345309437 |
| **Backpack** | The closest live competitor — stocks and crypto in one portfolio on Solana | https://backpack.exchange · https://apps.apple.com/us/app/backpack-trade-invest-earn/id6445964121 |
| **Public** | Clean investing UI, good empty and education states | https://public.com · https://apps.apple.com/us/app/public-invest-trade/id1204112719 |
| **Jupiter** | Swap/quote UI on Solana — what a route and a price impact look like | https://jup.ag |
| **Kamino** | Borrowing against holdings — version two | https://app.kamino.finance |

**Where the tokens come from** (useful for issuer branding and how they describe themselves)

- Backed / xStocks — https://xstocks.com
- Ondo Global Markets — https://ondo.finance

**Design reference libraries**

| Site | What it is | Link |
| --- | --- | --- |
| **Mobbin** | Real screenshots of real apps, flow by flow. Has Robinhood, Phantom, Public. The single most useful one here | https://mobbin.com |
| **Page Flows** | Recorded user flows — good for onboarding and the buy flow | https://pageflows.com |
| **Refero** | UI reference library, searchable by screen type | https://refero.design |
| **Dribbble** | Concepts — treat as inspiration, not as a target | https://dribbble.com |
| **Godly** | Web design gallery, useful for the landing page | https://godly.website |
| **Land-book** | Landing page gallery | https://land-book.com |

**Screenshots already collected**, cropped and ready, in this repo:

```
docs/refs/           home_m1.jpg  disc_robinhood.jpg  detail_robinhood.jpg
                     baskets_smallcase.jpg  sip_smallcase.jpg  cash_m1.jpg
                     hours_robinhood.jpg  risk_m1.jpg  weights_smallcase.jpg
                     networth_smallcase.jpg  credit_smallcase.jpg
docs/refs/crypto/    phantom.jpg  backpack.jpg  jupiter.jpg  kraken.jpg
                     bitgetwallet.jpg  etoro.jpg  trading212.jpg
```

---

## 8. Open — pick a direction

The visual language is **not decided**. Previous attempts copied Phantom and Robinhood closely
and were rejected. What is worth deciding deliberately:

- **Ground colour** — true black, or a tinted near-black, or something warmer
- **Type** — the app is almost entirely numbers, so the figure face is the main typographic
  decision. A neutral grotesque, or something with more character
- **One accent or two** — Robinhood uses one green for both brand and gains; the alternative is
  a distinct brand colour with green and red reserved strictly for performance
- **Row treatment** — filled rounded cards with a gap, Phantom-style, or a flat list on dividers
- **How much atmosphere** — flat surfaces, or gradient and grain

The name `Harbor` is a placeholder and is also open.
