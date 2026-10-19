# Import stocks · design

**Status:** proposed · 18 October 2026

## What this is for

Someone who already holds xStocks or Ondo stocks in Phantom, Solflare or Backpack wants them in
Mercury, where they can see them beside everything else, and later borrow against them. Moving the
tokens is the easy half. The hard half is the number every holding screen leads with: what the
shares cost. A stock that arrives with no cost reads as a holding with no return, and one that
arrives at today's price reads as a holding that has never moved.

So this design is about two things. Moving the tokens in with one signature, and arriving with the
cost they actually had: the swap that bought them, read from the wallet's own history, dated to the
day it happened.

It is built in three parts, in this order:

- **Part A · Cost follows shares out.** A fix to how positions are costed today, needed before any
  import can be trusted, and worth having without one.
- **Part B · The check.** An hour of throwaway probing that answers four questions the import
  depends on, before any of it is built.
- **Part C · The import.** The tracer, the move, the records, the screens.

## Where we are starting from

**A stock that arrives from outside has no cost, no row and no flow.** `movementsIn`
(`services/api/src/wallet-events/movements.ts`) writes rows for USDC and SOL only, and the
wallet-events job follows only the wallet and its USDC account. Reconcile counts the shares in
`position.shares` and leaves them out of `sharesWithBasis` (`portfolio/reconcile.ts`), so Holdings
marks the return "partial". The performance chart counts only USDC as money in or out
(`portfolio/queries.ts`, `readFlows`), so stock moved in would read as a gain of its whole value.

**A cost used to be guessed, and was removed on purpose.** `docs/05-data-model.md` still says a
transfer in should be a lot "at the reference price on the block it arrived, `is_estimated =
true`". Commit `61de2af` (28 September, "stop inventing a cost basis") took that out, and a test
pins the absence. The schema kept what the guess needed: `lot.source` allows `"transfer_in"`, and
`lot.is_estimated` exists and is always written false.

**Lots are never closed, and that is wrong after any sell followed by a buy.** Reconcile sums every
lot ever written and scales the cost by `min(recorded, chain) / recorded`
(`portfolio/reconcile.ts`). That equals average cost only until a sell is followed by another
acquisition. Buy 2 at $100, sell 1, buy 1 at $200: the two shares held cost $300, and today's
screen says $266.67. An import is an acquisition, so it inherits the error.

**Connecting a wallet and having it sign already works, for funding.** Reown AppKit with its
Solana adapter (`apps/web/src/wallet/appkit.ts`) connects Phantom, Solflare and Backpack, and
`apps/web/src/api/fund-swap.ts` has the wallet sign and send a Solana transaction, including a
fallback for Phantom's confirmation timeout. Nothing builds a Token-2022 transfer yet. Mobile has no
wallet connection at all.

**Reading another wallet's history already works.** `ChainHistory`
(`packages/chain/src/ports.ts`) gives a token account's signatures and each transaction's token
balances before and after, through the paid RPC in `SOLANA_RPC_URL`. The browser's public RPC
refuses history calls, so any tracing has to happen on the server.

**Prices for past dates are thin.** Yahoo (`packages/market/src/yahoo.ts`) answers fixed ranges,
not dates, and is unofficial. Our own bars (`price_bar`, ADR 0016) start on 14 October 2026. Pyth,
which we already use for current reference prices, can answer for a past timestamp; whether it
covers what we need is the first question in Part B.

## Decisions

Made by the user on 18 October 2026, over the alternatives named.

1. **Connected wallets only**, over also costing any stock that arrives by a plain send, and over
   bridging from other chains. Only the import screen sets a cost. A stock sent in any other way
   stays as it is today.
2. **An estimate counts, labelled.** Shares we cannot trace to a purchase are costed at the price
   on the day they first reached the wallets we can see, marked "Estimated", and counted in the
   return. Over asking the user to confirm each one, and over leaving them without a cost. This
   brings back what `61de2af` removed, with the difference that every lot now says where its cost
   came from and the screens say so too.
3. **"Held since" and the original purchases** are the one extra in v1. Editing a cost, splitting
   out dividends paid elsewhere, and "import, then borrow" are later.
4. **The server traces, the connected wallet signs one transfer** (approach A), over tracing in the
   browser and over linking a wallet and watching for arrivals. The tracer and the lot writer are
   built so that the watching approach can be added on top later.
5. **Part A ships first, as its own PR.**

**On ADR 0003.** It says "no external wallet import". ADR 0007 already read that as removing the
external wallet as _the account_, and allowed one that "signs one transfer and leaves". An import is
exactly that: custody is unchanged, the embedded wallet is still the account, and the connected
wallet holds nothing of ours afterwards. ADR 0003 gets an amendment saying so, in Part C.

---

## Part A · Cost follows shares out

**The idea.** Purchases are already recorded, as lots. Record the shares that leave as well, and
work a position out as a replay of both, in the order they entered and left Mercury, at average
cost. `packages/core/src/portfolio/cost-basis.ts` already has `applyBuy`, `applySell` and
`applyDividend`; today only the sell's realised figure uses them.

### Records

**`disposal`**, new: `id`, `user_id`, `token_id`, `instrument_id`, `token_qty` (raw), `shares` (at
the moment they left), `kind` (`sell` | `transfer_out`), `order_id` (unique where present),
`occurred_at`, `recorded_at`.

**`lot.recorded_at`**, new: when the lot entered Mercury. Existing lots take their `acquired_at`.
Until now the two were the same moment. An imported lot (Part C) is the first where they differ: it
was acquired in March 2025 and recorded today, and replaying it by `acquired_at` would apply a
Mercury sell from last month to shares that were not here yet. The replay orders by `recorded_at`;
`acquired_at` is for display and for "Held since".

### Writers

**A sell** writes a `sell` disposal inside `settleOrder`'s existing database transaction, linked to
its order. A second settle of the same order is already refused by the conditional claim, and the
unique `order_id` refuses a second disposal regardless. Before writing it, the sell takes back any
`transfer_out` of that token recorded since the order was created: that was this sell, seen on the
chain before the client confirmed it. If part of that drop really was a transfer, the next pass
finds the gap again. The sell is recorded at the time of the earliest transfer out it took back, so
it replays where the drop was first seen.

**A transfer out** is noticed by position-sync, which runs every two seconds. When the chain,
counting shares pledged to Kamino as held (`withPledged`, `deps.ts`), holds fewer tokens than the
open records do, it writes a `transfer_out` disposal for the gap.

**A transfer out is provisional for its first two minutes.** A drop in the chain is not always a
send. Kamino is read at confirmed and the wallet at finalized, so on a withdrawal the obligation
empties some seconds before the wallet regains the tokens, and a buy's lot can be written before a
lagging node shows its tokens. While a `transfer_out` is under two minutes old, a chain that then
reads above the open records means the low reading has come back: position-sync deletes the
transfer out and leaves that stock's position to the next pass. Past two minutes it stands, and
tokens that arrive after are unwitnessed arrivals, as below. Only a `transfer_out` is ever taken
back; a sell is a fact. This runs for a stock with a sell in flight as well, which is otherwise held,
because that hold can outlast the two minutes. If it takes back a transfer out that was genuine, the
first pass after the hold records it again from the gap.

**A sell in flight** holds its stock still. The balance position-sync reads can trail the
transaction a sell is settled from, because a node is behind or a confirm raced the pass, so for a
while the two disagree about a sell that is fine. While the user has a sell of a stock `executing`
and created within the last 10 minutes, or `filled` within the last 2, every wrapper of that stock
sits the pass out and its position row stays as it was. Past 10 minutes an unconfirmed order is
taken as abandoned; nothing else ever settles one, so an unbounded wait would hold the stock still
forever.

Shares that arrive unwitnessed are unchanged from today: counted as held, with no cost.

### The replay

A pure function in `packages/core`, `replayPosition`, takes a token's lots and disposals ordered by
`recorded_at` (in microseconds; at the same instant a lot with tokens, then a disposal, then a
dividend lot, then `id`) and returns
open token quantity, open shares, cost, reference basis, fee, `heldSince` and whether any open cost
is estimated. A lot adds its figures. A disposal takes the same fraction of every figure as the
fraction of tokens it took, which is average cost, and keeps the market and premium lines summing.
The fraction is counted in tokens because tokens are exact, and a dividend not yet written would
make shares disagree. When open tokens reach zero the run ends, and `heldSince` is the earliest
`acquired_at` among lots recorded after that.

Reconcile then does what it does now, on open figures rather than lifetime ones: `shares` from the
chain, `sharesWithBasis = min(open, chain)`, and dividend detection on the open token quantity, so a
dividend is no longer credited on tokens already sold.

`realisedOn` in `settle.ts` is unchanged; it reads the position the replay wrote.

### What is already in the database

A migration adds `lot.recorded_at` (backfilled from `acquired_at`), creates `disposal`, and writes a
`sell` disposal for every filled sell order from its stored decision and fill time. A sell is an
exact-in swap, so the chosen candidate's `filledShares` is exactly what left. It is idempotent on
`order_id`. The old reconcile also credited every dividend on all the tokens ever bought, so the same
migration cuts each dividend lot that follows a sell back to the tokens still held when it was
credited (acquired less disposed, over acquired); that statement runs once, with the migration, and
is not idempotent. After deploy, the first position-sync records any remaining gap per token as one
`transfer_out`, dated then. History before deploy is approximate in that one respect; everything
after is exact.

### Tests

- Buy 2 at $100, sell 1, buy 1 at $200 costs $300.
- Sell everything, buy again: the cost starts fresh, and `heldSince` is the new buy.
- Transfer out, then buy.
- A dividend after a partial sell is credited on the open tokens only.
- A sell `executing` while the chain has already dropped writes one disposal, not two.
- A confirm that arrives after the 10 minutes takes back the transfer out it was read as.
- Pledging to Kamino writes no disposal.
- A Kamino withdrawal whose wallet read lags, and a buy read on a lagging node, leave no disposal
  behind once the chain catches up. A transfer out older than two minutes stands.
- The backfill run twice writes each disposal once.
- The replay against a hand-worked table of mixed events, as `packages/core` tests are written.

---

## Part B · The check

An hour, throwaway, before Part C is planned. Each answer is written back into this section.

1. **Pyth history.** Does a price for an exact past time cover SOL/USD and the US equity feeds for
   every ticker we list, back to June 2025? What does it return outside market hours? If it falls
   short, Yahoo's daily close (with a from-date query added) is the fallback for stock prices, and
   we need another source for SOL.
2. **The issuers' token rules.** Which Token-2022 extensions do the xStocks and Ondo mints carry?
   In particular: a transfer hook (extra accounts), pausable, and a default account state of frozen
   (a new token account that cannot receive). Does a plain `transferChecked` into a new associated
   token account land, for each issuer?
3. **Limit orders and recurring buys.** How do Jupiter's Trigger and Recurring programs record the
   payment for a fill, and can we read it from the order account's own history?
4. **How many tokens fit in one transaction**, with and without creating the destination account.
   Expected around five.

Also collected: the hot-wallet addresses Kraken and Bybit send xStocks withdrawals from.

---

## Part C · The import

### C1 · Tracing what they paid

**Input:** a wallet, one verified stock mint, and the raw amount to move.

**What we read.** The signatures on the wallet's associated token account for that mint, oldest
first, through `ChainHistory`. Not the whole wallet. xStocks launched in June 2025, so this is
usually a few dozen transactions. Each transaction is reduced to the wallet's net change per mint
(and in SOL), the way `sumOwned` does for USDC today, so the intermediate hops of a routed swap
cancel out.

**How each transaction is read:**

| The wallet, in that transaction…                                   | Counted as                                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| gained the stock and spent USDC, USDT or another dollar stablecoin | a purchase, at what it spent                                                      |
| gained the stock and spent SOL or another token                    | a purchase, with what it spent priced in dollars at that moment                   |
| gained the stock from a Jupiter limit order or recurring buy       | a purchase, at what was paid into the order, split across its fills by amount     |
| received the stock from another wallet                             | followed back: that wallet's history before that moment, for the amount, ≤ 3 hops |
| received it from an exchange, or from past the hop limit           | estimated, at the price that day                                                  |
| lost the stock (a sale, or a send)                                 | reduces the holding at average cost, the same rule as Part A                      |

**Exchanges** are recognised by a token account with more than 1,000 signatures, or an address on
a short configured list (Part B). Neither is followed; both are estimated.

**What it returns:** the purchases still held, meaning every purchase since the holding was last at
zero, each scaled by later sales: date, tokens, price, cost, how it was found (`swap`,
`limit_order`, `recurring`, `estimated`), and its signature. Then the total cost, the average, the
estimated portion, the value now and the gain. Moving part of a holding scales every purchase by
the same fraction, which leaves the average unchanged. Shares the history does not explain (a
closed non-associated account, say) are estimated at the date we first see them.

**Prices for past moments** come from Pyth at the transaction's block time, falling back to Yahoo's
daily close. A purchase that cannot be priced either way becomes estimated. An estimate uses the
underlying's price per share at that moment, which is also its reference price.

**Dividends paid while elsewhere** are not split out. Each imported lot records shares at today's
multiplier, so those dividends show as a lower cost per share, and reconcile does not see a
multiplier gap and write a "dividend" row dated today.

**Limits.** Only verified xStocks and Ondo mints from the token registry; a lookalike is never
scanned. Each trace has a ten-second budget; one that runs out says so, and trying again resumes
from the cache. Results are cached by wallet, mint and newest signature.

**Shape.** `traceCost` in `packages/core` is pure: normalised events and a price lookup in,
purchases out, tested against hand-built events and against real mainnet transactions saved as
fixtures. A reader in `services/api/src/imports/` turns `ChainHistory` into those events.

### C2 · The move

**Scan.** Two read-only routes, so the panel fills in row by row:

- `GET /v1/imports/wallets/:address`: the wallet's verified stock balances, from both token
  programs.
- `GET /v1/imports/wallets/:address/cost/:mint`: C1 for one token. The browser asks for every
  token at once.

Chain data is public, so scanning proves nothing and needs nothing. Signing the transfer is what
proves the wallet is theirs. The address must not be the user's own Mercury wallet.

**Prepare.** `POST /v1/imports { wallet, walletName, items: [{ mint, rawAmount }] }` re-traces each
item (a cache hit), freezes the result, and builds one transaction: for each item, create the
Mercury wallet's associated token account if it has none, then `transferChecked` from the
connected wallet. The connected wallet is the fee payer and pays any account rent, about 0.002 SOL
each; the response carries the total so the panel can show it, and the route refuses when the
wallet holds less. One import is one transaction. A selection that does not fit (Part B, question 4) is split into several imports, one transaction each, signed in one approval where the wallet can
sign several at once and one after another where it cannot.

**Sign.** The connected wallet signs and sends, through the AppKit path `fund-swap.ts` already
uses. It goes straight to the network, not through `POST /v1/transactions/send`, whose fee-payer
rule (ADR 0014) a connected wallet would fail. The browser reports the signature at once and keeps
it locally, so a closed tab retries on the next visit.

**Confirm.** `POST /v1/imports/:id/confirm { signature }` reads the landed transaction and checks
it succeeded and that, per item, the connected wallet lost exactly `rawAmount` of that mint and the
Mercury wallet gained it. Then, in one database transaction:

1. Claim the import, `prepared` to `confirmed`, as a conditional update. A second confirm finds it
   claimed and writes nothing.
2. Per frozen purchase, a **lot**: `source: "transfer_in"`, `is_estimated` as traced,
   `acquired_at` the purchase's date, `recorded_at` now, `unit_cost_usd` its cost over its shares,
   `reference_price_usd` the underlying's price then (null when unknown, which reads as no premium
   paid), `fee_usd` zero (the swap's fees are inside what was paid), and `token_qty` its share of
   the moved amount, the remainder on the last lot so they sum exactly.
3. Per item, an **activity row**: kind `import`, filed under the stock's mint and the signature.
4. Per item, a **flow** for the chart at the value on arrival.

**Backstop.** An `import-sweep` job, every minute, looks at `prepared` imports whose blockhash has
expired. It searches the connected wallet's token accounts for a transfer into the Mercury wallet
since the import was prepared, and confirms the import with it if found; otherwise it marks the
import `expired`.

### C3 · Records

- **`wallet_import`**: `id`, `user_id`, `source_wallet`, `wallet_name`, `status` (`prepared` |
  `confirmed` | `expired` | `failed`), `tx_signature`, `last_valid_block_height`, `created_at`,
  `confirmed_at`.
- **`wallet_import_item`**: `id`, `import_id`, `token_id`, `raw_amount`, `shares`, `cost_usd`,
  `estimated_cost_usd`, `value_usd` (on arrival), and `purchases` (the frozen trace, JSON).
- **`lot.import_item_id`**, nullable.
- **Chart flows.** `readFlows` counts `import` rows as money in, at their value on arrival, and
  Part A's `transfer_out` disposals as money out, at the market value when they were noticed
  (`disposal.value_usd`, added here).
- **Positions** gain `costEstimated` and `heldSince`, both from the replay, in `@mercury/types`.

### C4 · What the user sees

Web only. Mobile shows the imported holdings and their activity rows through the shared view
mapping, and nothing else, until it can connect a wallet.

**Where it is.** A `?import=stocks` panel in `Panels.tsx`, reached from a "Move stocks from a
wallet" method in the Add cash sheet and an "Import" button on the Holdings header.

**The panel**, built from the order review's pieces (`Dialog`, `SwapPanel`, `TipLine`):

```
Import stocks                                        ✕
Move xStocks and Ondo stocks from a Solana wallet.
We'll find what you paid.
                 [ Connect wallet ]

── after connecting ──────────────────────────────────
Phantom · 7xKX…3fQa                          Change

☑  NVDA   2 shares                         $4,269.00
          Cost $426.80 · since 12 Mar 2025   +$3,842.20
☑  TSLA   5 shares                         $2,155.00
          Cost $2,050.00  [Estimated] ⓘ        +$105.00
☑  SPY    0.4 shares                         $268.40
          Finding cost…  ▒▒▒▒▒▒

Network fee  ~0.004 SOL, paid from Phantom
                 [ Move 3 stocks ]
```

Rows start ticked; opening a row moves fewer than all its shares. The button waits until every
ticked row has a cost, and names the SOL needed when the wallet is short. After it: "Approve in
Phantom", then "Moving…", then "Moved 3 stocks" with "View portfolio".

**The activity row** reads "Imported NVDA", "2 shares from Phantom". Its amount is the value on
arrival, unsigned and not green, because no cash moved. It files under Transfers, and its CSV
direction is "No cash movement".

**The receipt** is a new detail type in #95's modal: the value on arrival at the top; Shares,
From (shortened, copyable) and Held since; the original purchases, one row each, linked to their
transactions, an estimated one carrying the chip and its explanation; Cost, Value at import and
Gain so far; the import transaction's link; and "View NVDA".

**The holding** counts imported shares in its cost and return. When any open lot is estimated the
return carries an "Est." marker, explained as, for example, "Cost includes 5 TSLA shares priced on
the day they arrived from an exchange." The stock page's position panel gains "Held since".

**Copy.**

| Where                | Text                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| Panel title          | Import stocks                                                                |
| Panel intro          | Move xStocks and Ondo stocks from a Solana wallet. We'll find what you paid. |
| Add cash method      | Move stocks from a wallet                                                    |
| Holdings button      | Import                                                                       |
| Estimated chip       | Estimated                                                                    |
| Estimated tip        | These shares arrived from an exchange, so we used that day's price.          |
| Button               | Move 3 stocks · Move 1 stock                                                 |
| Done                 | Moved 3 stocks                                                               |
| Feed title, subtitle | Imported NVDA · 2 shares from Phantom                                        |
| Feed kind label      | Imported stock                                                               |
| Holding marker       | Est.                                                                         |
| Position line        | Held since 12 Mar 2025                                                       |
| Nothing to import    | No xStocks or Ondo stocks in this wallet.                                    |

### C5 · Errors

| What happens                        | What the user sees                            | What is written    |
| ----------------------------------- | --------------------------------------------- | ------------------ |
| The wallet holds no verified stocks | Nothing to import                             | nothing            |
| A trace runs out of time            | That row says so, with Try again              | the cache          |
| The wallet is short of SOL          | The button names the SOL needed               | nothing            |
| The user rejects in the wallet      | Back to the list                              | the import expires |
| The transaction fails on chain      | It didn't go through, nothing moved           | `failed`           |
| An issuer has paused the token      | That row is blocked, with the reason          | nothing            |
| The tab closes after signing        | Next visit confirms it; the sweep does if not | as confirm         |

### C6 · Tests

- `traceCost`: each row of C1's table, hops, the hop limit, an exchange, a partial move, an
  unexplained remainder, and saved mainnet fixtures.
- Prepare builds the right instructions with and without a new destination account, and refuses a
  wallet that is the user's own or is short of SOL.
- Confirm refuses a transaction whose amounts, mints or wallets do not match, and a second confirm
  writes nothing.
- Lots, rows and flows are written together or not at all, and the lots' token quantities sum to
  the moved amount.
- The sweep confirms a transfer that was never reported, and expires one that never landed.
- After an import, the chart shows no gain on the day, and the holding's cost is the traced cost.
- `packages/view`: the row and receipt mappings. Web: the panel in each state above.

---

## Later

- Watching for arrivals from a linked wallet (approach C), which also gives mobile an import.
- Editing a cost, which also fixes today's "partial" holdings.
- Dividends paid elsewhere as their own line.
- "Import, then borrow" for the eight xStocks Kamino lends against.
- Other chains: Ondo on Ethereum and BNB, xStocks on Ethereum, through a bridge.
- Kraken and Bybit trade history by CSV, for exact exchange costs.
- Sending stock out from Mercury.

## Build order

1. Part A, its own PR.
2. Part B, answers written back here.
3. C1, the tracer and the two scan routes, with no screen.
4. C2 and C3, the move and its records.
5. C4, the screens, the sample data, and the ADR 0003 amendment.
