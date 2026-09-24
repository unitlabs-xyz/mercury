# Mercury — app screens design brief

The landing page and the signed-in **Portfolio** screen are built. This covers everything still
to be designed. Hand the whole file over; it is self-contained.

Existing work to match: `docs/design/Mercury.dc.html` holds the approved Portfolio screen and the
connect flow. Build on that language rather than starting fresh.

---

## 1. The system already decided

Match these exactly. They are in code and should not drift.

**Ground and surfaces.** App shell `#EFEDE8`. Cards white on hairlines. Card border `#E4E0D7`,
inner hairline `#F0EDE6`, nav divider `#DFDBD2`. Card radius 16, inner panels 14, buttons 9–10,
pills 999.

**Type.** Instrument Sans for everything; JetBrains Mono **only** for market data — tickers,
prices, share counts, percentages, multipliers, addresses. Never for labels or headings. Figures
are tabular so columns line up.

**Colour.** One brand teal `#0F7480` (deep `#0B5C66`, tint `#E8F4F5`). Green and red are reserved
strictly for performance, amber strictly for facts like a shut market.

| Role | Mark | Text on its own tint | Tint |
| --- | --- | --- | --- |
| Up | `#1A7F4B` | `#177544` | `#E7F3EC` |
| Down | `#C0442F` | `#B33D29` | `#FAEBE8` |
| Market closed | — | `#8A5E10` | `#FBF3E0` |

Every tinted badge needs the deeper text value to clear 4.5:1. This caught us three times.

**Ink.** `#1B1A17`, soft `#3A372F`, muted `#6B665C`, faint `#736D63`.

**Layout.** 236px sidebar, nav items 14px with a 17px icon, active item is white with a 1px
shadow. Main column has 32px gutters.

**Company marks** are lettered tokens on a coloured circle — `N` on near-black for Nvidia, `S&P`
on navy, `T` on ink. Real logos drop in later.

**Rules.** Built for investors, not traders. No candlesticks, no order books, no depth charts.
Charts are a single line with a soft fill. Every list needs empty, loading and error states.

---

## 2. Screens to design

### 2.1 Invest — browse and search
**Purpose:** find something to buy. **Priority: highest.** This is where the product's argument
lives.

A search field at the top, then three shelves and nothing else:

- **Popular** — about twenty names people actually search for
- **Biggest movers** — largest absolute moves today, up and down in one list
- **Sectors** — technology, semiconductors, healthcare, energy, financials, consumer

Search matches ticker and company name, and shows only instruments we can actually route. A row
carries the lettered mark, company name, ticker, price and today's move.

**States:** no results; a stock that exists but has no usable route at any size; loading.

---

### 2.2 Stock detail
**Purpose:** decide. The signature screen.

Top to bottom: **price → today's change → line chart → timeframe pills (1D / 1W / 1M / 1Y / All)
→ about the company → issuer comparison → Buy and Sell.**

The issuer comparison is the part nobody else has, and it must be designed for three states, not
two:

```
WE CHECKED BOTH ISSUERS                         for $1,000

  Backed · NVDAx        $222.33 per share      0.02% impact      BEST
  Ondo   · NVDAon     $1,523.66 per share     85.27% impact      AVOIDED
```

| State | When | Treatment |
| --- | --- | --- |
| **Best** | cheapest per share, deep enough at this size | green, chosen |
| **Tradable but dearer** | a real option, just worse | neutral, with how much dearer per share |
| **Refused** | no usable route at this size | red, with the reason |

It regenerates whenever the amount changes, because the answer depends on size. Show that it is
live.

Also needs: a **halted** state when the instrument is in a corporate action, and a **stale
reference price** state that blocks buying.

Real numbers: Nvidia `$222.33` vs `$1,523.66` (85.27%), Tesla `$426.07` vs `$2,178.43` (97.41%),
Apple `$245.50` vs `$281.14` (13.18%), S&P 500 `$664.21` vs `$664.88` (0.10% — the case where
both issuers are fine).

---

### 2.3 Buy sheet
**Purpose:** commit. One input, three possible endings.

Amount field with quick chips at **$25 / $100 / $500**. Then: estimated shares, price per share,
which issuer was chosen, the premium against the real share price, and the fee. One primary
button.

**All three endings must be designed. The happy one is the least interesting.**

| Ending | When | Content |
| --- | --- | --- |
| **Filled** | best wrapper within tolerance | share count, issuer used, link to the transaction |
| **Queued** | premium above tolerance, usually while the market is shut | why we waited, the trigger price, when the market reopens, and that it fills on chain without the app open. Offers "buy anyway" |
| **Refused** | no wrapper has a usable route at this size | which issuers were tried, what was wrong with each, suggestion to try a smaller amount |

Sell is the same shape in reverse.

---

### 2.4 Exposure sheet
**Purpose:** the screen no traditional broker can build. Opens from a holding that spans issuers.

```
Nvidia                          $533.28      2.401 shares
  NVDAx    Backed   ×1.001701   $400.00          75%
  NVDAon   Ondo     ×1.001715   $133.28          25%
```

Shares are summed as `Σ (token quantity × that token's multiplier)`, never by adding token
counts. Needs a **concentration warning** when one issuer holds more than 80% of a position, and
a second when one issuer holds more than 60% of the whole portfolio. Ends with a plain sentence
explaining why the screen exists, because most people do not know two tokens for the same stock
are different things.

---

### 2.5 Baskets — list and detail
**List:** each basket shows name, what is in it, past twelve months, fee and minimum.

**Detail:** name, performance, fee, minimum, then constituents with their weights, then one
amount input. Under the button: *"Buys all six. Held afterwards as one position."*

The thing to make visible: a basket here is **one real token**, not a rule in a database. It can
be sent to somebody and later pledged as a single piece of collateral. Say so.

If any leg cannot be routed, the whole purchase is refused rather than quietly rebalanced —
design that refusal.

Ships with three or four curated baskets. Semiconductors is the example: Nvidia 30, Broadcom 22,
AMD 18, TSMC 14, ASML 10, Micron 6.

---

### 2.6 Recurring — list and create
**List:** each plan shows the amount, the cadence, the next date, and the split.

```
$200 monthly, next on 1 October
  60% Semiconductors basket
  40% S&P 500
```

**Create:** amount, cadence (weekly or monthly), then a split across stocks and baskets by
percentage that must total 100. It draws from the stablecoin balance, so there is no bank
connection to fail.

**States:** a run that was skipped and why; a run that queued because the market was shut; not
enough cash for the next run; paused.

---

### 2.7 Money
Four things:

- **Balance** — stablecoins available to invest, the rate they are earning, interest earned this
  year
- **Receive** — the Solana address and a QR code, with the warning that it is Solana only
- **Send** — move stablecoins out
- **Borrowing** — visible from day one and **switched off**, showing what the current portfolio
  would support and explaining the mechanism

No bank transfers, no card top-ups, no cash withdrawals. That is a decision, not a gap.

---

### 2.8 Activity
One reverse-chronological list grouped by day: buys, sells, basket investments, recurring runs,
dividends recognised, sends, receives. Each row has an icon, a title, a subtitle and an amount.

Expanding a row shows the amounts, the issuer chosen, and the transaction signature with a link
to the explorer.

**States:** empty (a new account), and a pending row.

---

### 2.9 Settings
Wallet — including **export your wallet**, which matters because leaving is trivial and we say
so. Notifications. Currency display. Data export as a spreadsheet. Delegation controls:
recurring investing asks the user to delegate, scoped and revocable in one tap, and this is where
they revoke it.

---

## 3. States every screen needs

Empty, loading, error and offline for every list. Plus these, specific to this product:

| State | Where |
| --- | --- |
| Market closed | Invest, stock detail, buy sheet |
| Instrument halted for a corporate action | Stock detail, buy sheet |
| Only one issuer routable | Stock detail comparison |
| No issuer routable at this size | Buy sheet |
| Reference price stale | Buy sheet — blocks the order |
| Queued order waiting | Portfolio, Activity, stock detail |
| Dividend recognised as shares gained | Portfolio, Activity |
| Estimated cost basis on a transferred-in lot | Holding row, exposure sheet |

---

## 4. Do not design

Perpetuals, margin, options, order books, depth charts, candlesticks. Bank deposits and
withdrawals. Identity verification. News, earnings, analyst data, screeners. A tax centre.
Savings goals. User-created baskets. An AI chat assistant.

---

## 5. Priority

If only some get designed, this order:

1. **Stock detail with the issuer comparison** — the argument the whole product rests on
2. **Buy sheet, all three endings** — the queued and refused states are the product's character
3. **Invest browse** — nothing else is reachable without it
4. **Exposure sheet** — the screen no competitor can build
5. Baskets, Recurring, Money, Activity, Settings

---

## 6. Reference

Real measured numbers, Jupiter quotes at $1,000 on 19 September 2026, for filling mockups:

| Stock | Backed | impact | Ondo | impact |
| --- | --- | --- | --- | --- |
| Nvidia | NVDAx $222.33 | 0.02% | NVDAon $1,523.66 | 85.27% |
| S&P 500 | SPYx $664.21 | 0.00% | SPYon $664.88 | 0.10% |
| Nasdaq 100 | QQQx $598.42 | 0.11% | QQQon $1,050.12 | 75.64% |
| Tesla | TSLAx $426.07 | 0.02% | TSLAon $2,178.43 | 97.41% |
| Apple | AAPLx $245.50 | 0.27% | AAPLon $281.14 | 13.18% |
| MicroStrategy | MSTRx $162.47 | 0.19% | MSTRon — | no route |

Portfolio: **$12,480.62**, up **$1,204.18 (+10.68%)**. Stocks $5,795.49 · Baskets $2,150.40 ·
Cash $4,534.73 earning 4.1%. Market status: **closed, weekend**, reopens **Monday 21 September,
9:30 AM New York**.
