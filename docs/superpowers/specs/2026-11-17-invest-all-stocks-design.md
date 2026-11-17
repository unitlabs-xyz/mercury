# Invest shows every stock: design

**Status:** proposed, not built · 17 November 2026 · web first, mobile after.

/invest opens on "All Stocks · 1–20 of 21". Mercury can trade 468 priced tickers, so the page
undersells the product by more than twenty times. A basket bought healthcare names that /invest never
listed, and they appeared only after a 1:1 redeem put them in the wallet.

The change: list every buyable stock, deepest pool first, and let the order ticket deal with thin
pools. A warning shows only when a specific order would move the price by more than 1.5%, not just
because a stock is thin.

## What happens today

| Piece                                    | Behaviour                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/instruments` (no params)        | Only tickers whose deepest wrapper pool is at least `FEATURED_LIQUIDITY_USD` ($70k). 21 today (`services/api/src/routes/instruments.ts`)     |
| `GET /v1/instruments?scope=all`          | Every tradable, priced ticker. Exists, unused by web                                                                                        |
| `?q=`                                    | Searches all of them, 50 results at most                                                                                                    |
| Screener (`apps/web/src/app/invest/Screener.tsx`) | Pages of 20, sorted by 24h volume by default. Thin rows carry an "Up to $X" chip from `maxOrderUsd`                               |
| Price warming (`services/api/src/prices/warm.ts`) | Warms the featured set and held mints only. The other ~447 are priced when someone asks for them                                  |
| Ticket (`apps/web/src/app/stock/Ticket.tsx`) | Under 1.5% impact: nothing shown. Over 1.5%: the quote is refused with `impact_too_high`, a warning names the cost in dollars, and one press accepts it. The re-quote then runs with a 10% ceiling (`ACCEPTED_IMPACT`, `services/api/src/pricing.ts`) |

The ticket already behaves as wanted. **Most of the work is the list.**

## Decisions

- **The default list is everything.** /invest calls `scope=all`. The header counts what is actually
  shown, e.g. "1–20 of 468".
- **Deepest pool first.** The default sort is liquidity, descending: page one looks like today's
  featured shelf, and the thin tail sits further down. The other column sorts (name, price, change,
  volume) stay as they are.
- **No alert for picking a thin stock.** Selecting or opening one shows nothing extra. The list keeps
  the existing "Up to $X" chip, which is information, not a warning.
- **The alert follows the order size.** Below 1.5% impact, no alert. Above 1.5%, the existing
  `impact_too_high` warning with its cost in dollars and an accept press. No new ticket logic.
- **"Liquid only" filter.** A toggle next to the sector filter restores today's shortlist
  (`featured === true`). Off by default.
- **The rail stays on liquid stocks.** Movers, Most bought and Sectors use the featured rows only, so
  a 40% move on a $3k pool doesn't top "Top movers". The watchlist shows whatever was saved, thin or
  not.
- **Index row unchanged.** SPY, QQQ, GLD as today.

## Changes

### API (`services/api/src/routes/instruments.ts`)

1. `scope=all` orders by deepest wrapper liquidity, descending, when no `shelf` is given (today it
   sorts by name).
2. The response gains `total`: the number of tickers in the answer. Clients that ignore it are
   unaffected.
3. Pricing: see [Where prices come from](#where-prices-come-from). No request from a person ever
   reaches Jupiter for a display price.
4. No change to `FEATURED_LIQUIDITY_USD`, `maxOrderUsd` or the execution policy.

### Where prices come from

Prices are per token, not per stock, and most stocks have two tokens (Backed and Ondo): roughly 900
mints, about 19 `price/v3` requests of 50. The keyless allowance is about 30 requests a minute and is
shared with order quotes and swap builds, so pricing the whole list through `price/v3` on a timer
would starve trading.

Measured 17 November 2026:

|                                  | `tokens/v2/tag?query=verified`          | `price/v3?ids=…`                          |
| -------------------------------- | --------------------------------------- | ----------------------------------------- |
| Covers                           | Every verified token, 3,771, in one call | Up to 50 chosen mints                     |
| Size                             | 4.9 MB                                  | Small                                     |
| Jupiter's CDN cache              | 30 s (`max-age=30`)                     | 5 s (`max-age=5`)                         |
| `usdPrice`                       | Yes, identical to `price/v3` (50 of 50 compared) | Yes                              |
| Liquidity, holders, 24h stats    | Yes (`stats24h.priceChange` included)   | Liquidity only                            |
| Multiplier (`scaledUiConfig`)    | No                                      | Yes. Mostly 1.000–1.007; one seen at 0.51 |
| Issuer reference (`stockData`)   | No                                      | Yes                                       |

So each source does one job:

| What                                   | Source                                         | Who calls it      | How often        |
| -------------------------------------- | ---------------------------------------------- | ----------------- | ---------------- |
| /invest list (all ~470 stocks)         | `tokens/v2/tag?query=verified`                 | Server job        | Every 30 s, 1 call |
| Portfolio values and holdings          | The same list prices                           | Server job        | Every 30 s       |
| Multipliers (token → share)            | `price/v3` for every listed mint, in batches spread across the hour | Server job | Hourly, about 19 calls |
| A stock's own page                     | `price/v3` for that stock's mints, filled to 50 (below), through `CachedPriceBoard` | The server, when the page asks and the price has expired | Cached 7 s |
| What an order fills at                 | Jupiter swap quote                             | The server, per order | Per quote, as today |

- **Share price** = list `usdPrice` ÷ the hourly multiplier, the same arithmetic `price/v3` prices go
  through today. A mint with no multiplier yet is not shown rather than shown at 1.
- **The browser only calls our API.** `/v1/instruments` and the portfolio are answered from server
  memory. A thousand open tabs cost Jupiter the same 2 list calls a minute as one tab.
- **Budget:** about 2 list calls + 1–3 stock-page calls + about 1 multiplier call a minute, well inside
  the keyless 30, with the rest left for quotes. `JUPITER_API_KEYS` still raises the ceiling if we want
  faster than 30 s later.
- **Every `price/v3` call is filled to 50 mints.** A call costs the same for one mint as for fifty
  (`packages/market/src/cached.ts`). When a stock page needs a fresh price:
  1. that stock's own mints go in first;
  2. the remaining slots go to the most liquid mints whose cached price has expired, in the
     liquidity order the list already uses.

  The board is shared by every user, so with traffic the most liquid stocks stay fresh and most
  stock-page opens are answered from cache without a call.
- **The cache is 7 s.** Jupiter caches `price/v3` for 5 s, so a shorter window wouldn't get fresher
  prices, only more calls.
- **Held mints leave `warmPrices`.** The portfolio reads list prices, so warming held mints through
  `price/v3` stops. Update the comment in `warm.ts` to match.
- **Two prices for a moment.** The portfolio and list can be up to 30 s behind a stock page. Accepted:
  the stock page is where a decision is made, and the ticket's quote is what's actually charged.
- **Memory and traffic:** each pass replaces the previous one in memory. Only the ~470 stocks are
  kept, a few hundred KB, and the 4.9 MB response is dropped once parsed. Nothing piles up. The
  download itself is about 14 GB a day of inbound traffic, because Jupiter has no stocks-only tag
  (`tag?query=xstocks` is empty). Hosts usually charge for outbound traffic, not inbound, so this
  should cost nothing, but confirm on the API's host.
- **The job runs inside the API**, like the other jobs, so this assumes one instance. See "Move them to
  their own process" in `TODO.md`.

### Web

1. `useUniverse` (`apps/web/src/market/hooks.ts`) fetches `?scope=all`. Rename it, or change its
   comment, which describes the featured shelf.
2. The Screener gets a `liquidity` sort key, set as the default (`desc: true`), and the "Liquid only"
   toggle.
3. Sparklines: `useHistories` is called for every listed ticker. With ~470 rows, request history only
   for the rows on the visible page (and the featured rows for the rail).
4. `Invest.tsx` filters to featured rows before passing `today` to `Movers`, `MostBought` and
   `Sectors`.
5. The "In basket" and "Owned" chips work as before. With every stock listed, a basket's holdings now
   always have a row to land on.

### Mobile

The same `scope=all` and liquidity order on the Invest tab (`apps/mobile/src/api/hooks.ts`), in a
follow-up. Out of scope for the first change.

## Testing

- API: `scope=all` returns tickers below the featured line, ordered by liquidity, with `total`.
- Screener: default order is liquidity, descending. "Liquid only" shows exactly the featured rows.
  Paging and the count reflect the full list.
- Rail: a thin ticker with the biggest move doesn't appear in Movers.
- Ticket, by hand on a thin stock: a small order shows no warning. Raising the amount past the
  `maxOrderUsd` chip brings up the impact warning, and accepting it re-quotes and builds.
- Load: many tabs open on /invest and the portfolio for 5 minutes, keyless, cause no Jupiter 429s,
  and orders still quote during that time.
- A stock with a multiplier well away from 1 (one is at 0.51) shows the same share price on the list
  as on its stock page, within 30 s of movement.

## Decided 17 November

- **The accepted-impact ceiling drops from 10% to 5%.** `ACCEPTED_IMPACT` in
  `services/api/src/pricing.ts`. Above 1.5% the warning and accept press stay as they are. Above 5%
  the order is refused even after accepting, and the ticket says to use a smaller amount. The
  `acceptedImpact` check in `services/api/src/app.ts` reads off the stored decision, so the build
  re-prices against the same ceiling with no other change. Update the tests that assume 10%.
- **The very thin tail stays listed.** A row whose `maxOrderUsd` is below the minimum order is still
  shown, with its "Up to $X" chip. The ticket handles the rest.

## Open questions

- **Inbound traffic.** About 14 GB a day downloaded for the list call. Confirm the API's host doesn't
  charge for inbound traffic.
