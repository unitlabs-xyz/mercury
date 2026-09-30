# Selling

**Status:** proposed, 30 September 2026. Written after shipping the sponsored
buy, against a codebase where every server-side layer already takes a `side`
and no user-facing path has ever passed it `"sell"`.

You can put money into Mercury and you cannot take it out. That is the whole
of the gap, and it is a worse gap than it looks: a self-custodial brokerage
whose users cannot sell is asking people to trust it with an exit it has
never once performed.

The surprise on reading the code is how little of it is missing. `decide`
ranks sells by proceeds, inverts the premium test and already writes the copy
for a sell trading under fair value. `planFill` checks that tokens left and
dollars arrived. `settle` computes realised P&L through `applySell` and
deliberately writes no lot. The activity feed renders sell rows with icons.
The relay validator never cared which way a swap pointed.

What is missing is the money plumbing around the swap — which was written for
a buyer, and inverts — and every pixel of the interface.

---

## 1 · Where we actually are

Verified by reading the repo on 30 September 2026.

**Already side-aware, already tested:**

| Layer             | Evidence                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Decision engine   | `decide.ts:107` ranks by most proceeds; `:175` inverts the premium sign; `:204` writes the sell warning |
| Quote adapter     | `jupiter/lite.ts:69-73` flips input and output mint on `side`                                           |
| Order routes      | `app.ts` reads `side` off the request and passes it through untouched                                   |
| Fill verification | `fill.ts:72-80` requires tokens out and dollars in for a sell                                           |
| Settlement        | `settle.ts:61` computes realised P&L; `:78` explains why a sell writes no lot                           |
| Drift gate        | `gate.ts:36` — "a buy that got cheaper and a sell that got dearer both pass"                            |
| Schema            | `db/schema.ts:206` — `side: text({ enum: ["buy", "sell"] })`                                            |
| Activity          | `activity-data.ts:39` maps `sell` to a label; `activity-look.tsx:8` to an icon                          |
| Relay validation  | `validate.ts` judges fee payer and signers, never direction                                             |

**Broken for a sell, all of it downstream of the sponsorship work:**

1. **The USDC charge is composed before the swap.** `compose.ts:62-76` says so
   on purpose — "the buyer's USDC is spent by the swap", so taking the fee
   first keeps the quoted amount and the swapped amount equal. A seller may
   hold **zero USDC** until the swap delivers it. Charge-first fails the
   transaction.

2. **`quoteFee` asks the wrong question.** `quote.ts:53` tests whether the
   owner holds the _stock_ mint. On a sell they always do; it is the USDC
   account that might not exist. The fee comes out wrong in both directions —
   rent charged when none is owed, or owed when none is charged.

3. **The fee cannot come out of the input.** A buy is quoted net: $5 becomes a
   $4.75 swap. A sell's input is shares, and no quantity of USDC can be
   subtracted from a share count. It comes out of the proceeds instead.

4. **The $5 floor traps positions permanently.** `decide.ts:134` computes
   `notionalUsd = amount × fair` for a sell and refuses below
   `policy.minOrderUsd`. A $3 position can never be closed — and dividends
   keep adding to it, so it is a hole that fills rather than drains.

**A latent unit bug, which would ship silently:**

`pricing.ts:7` and `types.ts:90` both document a sell's `amount` as **shares**.
`decide.ts:134` reads it as shares. But `pricing.ts` hands it to
`deps.quotes.quote({ amount })`, and `jupiter/lite.ts:78` does
`toBase(req.amount, inDecimals)` with the _token's_ decimals — reading it as
**tokens**.

Shares and tokens are the same number only when the multiplier is exactly 1.
On a rebased wrapper the sell is wrong by the multiplier, in whichever
direction it happens to fall. Nothing catches it today because nothing has
ever priced a sell.

**Pledged shares are counted as held.** `pledged.ts:30` merges Kamino
collateral into balances so that pledging does not read as selling — correct
for the books, and it means the portfolio's share count is not the sellable
share count. `portfolio.ts:13-14` already says so: _"Still owned; not sellable
until withdrawn."_

---

## 2 · What the user types

**Dollars, on both sides, plus a real Sell all.**

`docs/02-product.md:74` already promises this — "one input: a dollar amount" —
and the buy ticket delivers it. A sell ticket denominated in four-decimal
share counts would make the two halves of one page disagree about what a
quantity is.

- `CreateOrderRequest.amount` stays dollars. The wire contract does not change.
- `CreateOrderRequest` gains one field: `max?: boolean`.
- The server converts dollars to shares at the reference price before calling
  `decide`, so `decide`'s documented contract holds rather than being bent.
- The dollar figure is an intent, not a promise. The ticket says `~$249.75`
  and the fill lands within slippage of it, exactly as a buy's share count does.

**`max: true` is not "the dollar value of everything".** It quotes the wallet's
exact raw token balance, read at **build** time rather than quote time. A
dividend landing between the two would otherwise leave dust the user asked to
be rid of, or move the balance under the quoted amount and fail the swap.

---

## 3 · Which wrapper gets sold

`decide` ranks every wrapper registered for a ticker. On a buy that is the
point. On a sell it can return a wrapper the seller does not own, and
`Holdings.tsx:71` already renders a **"2 issuers"** chip, so holding one stock
through two wrappers is a modelled, reachable state.

**Candidates are filtered to wrappers actually held**, then each is quoted for

    min(sharesRequested ÷ multiplier, heldBalance)

which is the multiplier fix and the per-wrapper cap in one expression. This
requires `Candidate` to carry the token amount it was quoted at, because that
amount now differs per candidate. When every multiplier is 1 and the ask fits,
it is the same number for everyone and nothing observable changes.

**One issuer per sell.** The best-priced held wrapper wins and the sell is
capped at its balance. Asking for $250 when the best wrapper holds $100 sells
$100 and says so on the ticket. `decide` reports the shares actually filled so
the ticket can explain the gap rather than silently under-fill.

**`max: true` under two issuers is where this rule bites hardest.** "Sell all"
that leaves the user still holding the stock is the interface lying to them.
So the chip is labelled for what it does: with one wrapper it reads **Sell
all** and empties the position; with two it reads **Sell all xStocks** and the
ticket states what remains and in which issuer. The user presses it twice and
is out, having been told so before the first press rather than after it.

Splitting across issuers is out of scope — see §7.

---

## 4 · Paying for a sell

|                    | Buy               | Sell                 |
| ------------------ | ----------------- | -------------------- |
| Charge position    | before the swap   | **after** it         |
| Rent owed on       | the stock account | the **USDC** account |
| Fee comes out of   | the input         | the **proceeds**     |
| Re-quote after fee | required          | **not required**     |
| `minOrderUsd`      | applies           | does not apply       |

**Charge after the swap.** `composeSponsored` takes a charge position rather
than hardcoding one. The existing comment stays and gains its mirror: a buy
charges first so the quoted and swapped amounts agree; a sell charges last
because the USDC does not exist until the swap creates it. Both halves remain
in one message, so atomicity — the reason the comment gives for the whole
design — is untouched.

**`quoteFee` takes the mint whose account might need opening**, rather than
assuming it is the stock. Buy passes the stock mint; sell passes USDC. The
body of the function does not change.

**The sell path prices once.** The buy prices twice because the swap must be
quoted for what is left after the charge, and which token wins decides whether
rent is owed. A sell's share count is unaffected by the fee, and the account
that might need rent is USDC regardless of which wrapper wins — so the fee can
be quoted **in parallel** with the pricing. The sell path is strictly simpler
than the buy path, not harder.

**The floor becomes a buy-side rule**, in `decide`, where the rest of the
policy is tested. The minimum exists so that an order is worth its own network
fee. That reasoning holds for committing new money and collapses for
retrieving it: the remedy for "too small to sell" is to sell more, which is
the opposite of what the user asked, and a position below the floor is stuck
forever rather than briefly.

**One refusal survives on the sell side, and it is physics.** If quoted
proceeds do not cover the network fee, the transfer fails and takes the
transaction with it. A position worth less than roughly $0.30 genuinely cannot
be sold. It gets its own message — _"This is worth less than the network fee
to sell it"_ — not the below-minimum one, because the remedies differ and this
one has none.

---

## 5 · Refusing a sell

Refusing a buy costs someone a purchase. Refusing a sell tells someone they
cannot have their own money back. The guards mirror mechanically and do not
mirror morally.

**Refused, because no other outcome exists:** no route, no shares, paused
mint, stale reference, proceeds below the network fee.

**Refused, because the remedy is immediate:** price impact too high. "Sell
less" is something the user can act on in the next five seconds.

**Warned and allowed:** everything whose remedy is _wait_.

`decide`'s `ExecuteDecision` already carries a `warning`, and `decide.ts:204`
already writes the sell copy — _"This is 1.10% below the real share price."_
The change is one branch: **a sell never returns `offer_queue`.** Out of
tolerance with the market shut returns `execute` with the warning plus the
market-shut context, and the confirm screen puts it in front of the user with
a button that works.

Someone selling at 2am may be selling at 2am because they need to.

---

## 6 · The interface

**`Ticket` gains a Buy / Sell segmented control**, rendered only when the user
holds the stock. A visitor browsing a stock they do not own is not offered a
control that cannot do anything.

Sell mode:

- Presets are **25% · 50% · 75% · Sell all**. A `$50` chip is dead furniture
  on a $30 position, and it is dead exactly when the position is small, which
  is most of them.
- Header meta flips from `$1,204 cash` to `0.041 shares · $30.47`.
- `You get` shows proceeds **net of the fee**, so the figure on the confirm
  screen is the figure that lands.
- A fully pledged position shows the Sell tab with the button disabled, the
  reason stated, and a link to withdraw. Hiding it would leave someone who can
  see their shares unable to find out why they cannot sell them.
- The multi-issuer cap is explained on the ticket, not discovered at confirm.

**`placeBuy` becomes `placeOrder`**, carrying the side. The five-call sequence
— create, execute, sign, send, confirm — is unchanged, because it never cared.
`useBuyAction` becomes `useOrderAction`. `BuyStep` and its labels are already
side-neutral except in name.

**The success screen shows the realised gain.** `settle` returns
`realisedPnlUsd` and nothing currently reads it. A sale is the only moment in
this product where a number becomes real, and it is worth saying.

---

## 7 · Not in this spec

- **Splitting one sell across issuers.** Two quotes, two swaps, two signatures
  or one transaction that will not fit, a fill that is two fills, and a P&L
  spanning both. The cap plus an honest explanation costs a second order in a
  case most users will never reach.
- **Queued or trigger sells.** `ADR 0009` rules them out, and the buy ticket
  already declines to offer a dialog whose only button is dead.
- **Tax-lot selection.** `cost-basis.ts` is average-cost by construction.
  Choosing lots is a different product.
- **Closing the emptied token account.** Leaving it costs nothing and makes a
  later rebuy of that stock rent-free, because `quoteFee` will find the account
  already exists. Closing it refunds about $0.35 as **SOL**, to the owner
  rather than the relayer who fronted it — into a wallet built specifically so
  its owner never needs SOL.
- **Selling from the portfolio's holdings rows.** The stock page is the one
  surface for now.

---

## 8 · Risks

**The charge position is the sharp edge.** Getting it backwards on either side
produces a transaction that fails at the relayer with nothing readable. It
wants a test per side asserting instruction order, and a mutation to prove the
test bites.

**`Candidate` gaining a per-candidate amount touches the core engine**, which
every buy also flows through. The buy path must be provably unchanged: same
amount for every candidate, same ranking, same output.

**Selling what is pledged.** If the cap is computed from the portfolio's share
count rather than the wallet's balance, the swap fails on chain after the user
has signed it. The subtraction happens server-side, from balances, not from
the number on screen.

**Proceeds land as cash and nothing announces it.** The money page reads USDC
and will show it. Worth confirming after the first real sell rather than
assuming.
