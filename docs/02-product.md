# 02 · Product

Four tabs. Everything else is a screen inside one of them.

| Tab | Contains |
| --- | --- |
| **Home** | Portfolio value, holdings, profit and loss, true exposure per company |
| **Invest** | Search and browse, stock pages, buy and sell, baskets, recurring plans |
| **Money** | Stablecoin balance earning interest, send and receive. Later: borrowing and a card |
| **Activity** | Every action taken, with the on-chain record one tap away. Settings live here |

---

## Home

### Portfolio
One number at the top: total value of stocks plus baskets plus cash. Beneath it the change,
absolute and percentage, since the account opened. Then holdings sorted by value.

Each holding row shows the ticker, the company, the share count, the value and the day's change.
A basket row shows the basket name and how many stocks are inside.

### True exposure
The screen no traditional broker needs. Tap a company and see every wrapper you hold of it.

```
Nvidia                $533.28    2.398 shares
  NVDAx   Backed      $400.00      75%   multiplier 1.001701
  NVDAon  Ondo        $133.28      25%   multiplier 1.001715
```

Shares are summed as `Σ (token quantity × that token's multiplier)`, never by adding token
counts. A concentration warning appears when one issuer holds more than 80% of a position, and a
second when one issuer holds more than 60% of the whole portfolio.

### Dividends as shares gained
When a token's multiplier rises, the user gains shares without spending money. Home surfaces it
as an event: *"Dividend reinvested. You now own 2.401 shares of Nvidia, up from 2.398."* No cash
appears, because none does on chain.

---

## Invest

### Discovery
Three shelves and a search box. Nothing more in version one.

- **Popular** — a hand-picked list of roughly twenty names people actually search for
- **Biggest movers** — largest absolute percentage moves today, up and down in one list
- **Sectors** — technology, semiconductors, healthcare, energy, financials, consumer

Search matches ticker and company name. Results show only instruments we can actually route.

### Stock page
Price, change, chart with 1D/1W/1M/1Y/All, then the company description. Below that, the part
nobody else has:

```
WE CHECKED BOTH ISSUERS
  Backed · NVDAx     $222.33 per share · 0.02% impact     BEST
  Ondo  · NVDAon   $1,523.66 per share · 85% impact       AVOIDED
```

Then Buy and Sell. The comparison is generated live for the amount the user is about to spend,
because the answer changes with size.

### Buying and selling
One input: a dollar amount. The confirmation shows estimated shares, the price per share, which
issuer we chose and why, the premium against the real share price, and the fee. The full
decision procedure is in [04 Execution engine](04-execution-engine.md).

Three outcomes are possible and all three must be designed, not just the happy one:

| Outcome | When | What the user sees |
| --- | --- | --- |
| Executed | Best wrapper is within tolerance of the reference price | Fill confirmation with the share count |
| Offered a queue | Premium above tolerance, usually while the market is shut | An explanation and a choice: wait for the real price, or buy now anyway |
| Refused | No wrapper has a usable route at this size | Which issuers were tried, what was wrong, and a suggestion to try a smaller amount |

### Baskets
A named set of stocks with fixed weights, bought in one action.

```
Semiconductors                    +18.4% past 12 months
  Nvidia 30% · Broadcom 22% · AMD 18% · TSMC 14% · ASML 10% · Micron 6%
  Fee 0.5% a year · minimum $25
```

Version one ships three or four curated baskets. Investing a single amount buys every
constituent in proportion, running the wrapper check on each leg. If any leg cannot be routed,
the whole basket purchase is refused rather than silently rebalanced.

The user's basket holding is displayed as one line. Whether it is genuinely a single token on
chain or a tracked set of positions is an open decision; see
[09 Open questions](09-open-questions.md).

### Recurring
A fixed amount on a weekly or monthly cadence, split across stocks and baskets by percentage.
It draws from the stablecoin balance, so there is no bank connection to fail.

```
$200 monthly, next on 1 October
  60% Semiconductors basket
  40% S&P 500
```

Each run is an ordinary purchase and obeys the same execution rules. A run that cannot execute
is skipped with a reason, never forced.

---

## Money

- **Balance.** Stablecoins available to invest, with the rate they are currently earning and the
  interest earned so far this year.
- **Receive.** The wallet address and a QR code.
- **Send.** Move stablecoins out. No confirmation theatre beyond the usual.
- **Borrowing.** Visible from day one, switched off. It shows the borrowing power the current
  portfolio would support so the roadmap is legible, with the mechanism explained.

There are no bank transfers, no card top-ups and no cash withdrawals. That is the crypto-native
decision, recorded in [ADR 0001](adr/0001-crypto-native.md).

---

## Activity

One reverse-chronological list: buys, sells, basket investments, recurring runs, dividends
recognised, sends and receives. Each row expands to the amounts, the issuer chosen and the
transaction signature. Settings sit behind a button in the corner: wallet, notifications,
currency display, and a data export.

---

## Deliberately not in version one

| Cut | Why |
| --- | --- |
| Bank deposits and withdrawals | Payment rails and money licensing are the two hardest problems in consumer finance and our user already holds stablecoins |
| Identity checks | Not required to hold or trade these tokens. The wallet is the account. This changes when a card arrives, and the card partner carries that burden |
| News, earnings, screener, analyst data | All licensed, all expensive, and Tickertape and TradingView do it better. We link out |
| Tax centre | A different answer in every country. We export a spreadsheet |
| Savings goals | Demonstrates well, goes unused before people have a reason to return |
| A full web application | Mobile is the product. Web is the demo build plus a shareable portfolio page |
| User-created baskets | Curated first. Tools to build your own come once people use the ones we made |
| An AI chat assistant | Everyone ships one. It adds nothing until there is a portfolio worth discussing |
| Perpetuals, options, leverage | Not an investing product |

## Version two

Borrowing against holdings through Kamino, with a risk screen that shows both how far the
portfolio can fall today and how far it could gap on a Monday morning. Then a card that spends
against that limit, which requires a partner who converts to real money and handles identity.
Then creator baskets, where anyone publishes a basket, earns a share of the fee automatically,
and their record is a chain of timestamped transactions rather than a number you are asked to
believe. The third one is the actual business.
