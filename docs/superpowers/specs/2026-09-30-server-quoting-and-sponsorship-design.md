# Server-side quoting, and paying for gas in USDC

**Status:** proposed, 30 September 2026. Written after a first real buy failed
twice on a funded account — once because Privy had no Solana RPC configured,
and once because the wallet held 5 USDC and no SOL.

A buyer with money cannot buy. The wallet held exactly the cash it needed and
the order still could not be built, because Solana charges the sender and the
sender had nothing to charge. Nothing on screen said so: the ticket enabled
its button, Privy opened its signing sheet, and the failure surfaced as a
blank fee and a generic warning inside someone else's modal.

Two problems sit behind that. The app asks the user for an asset they never
chose to hold, and the number the ticket shows is not the number the server
acts on.

This spec covers both, because they are one change: the fee cannot be shown
until the decision is server-side, and the decision cannot be trusted until
it is the same one that executes.

---

## 1 · Where we actually are

Verified by reading the repo and probing mainnet on 30 September 2026.

**The browser prices, the server decides again.**

- `apps/web/src/market/hooks.ts:34-38` constructs five chain clients in the
  browser: `JupiterRegistry`, `JupiterMarket`, `JupiterLite`, `PythSessions`,
  `KaminoCredit`.
- `useDecision` calls `quotes.quote(...)` per wrapper, in the browser. That is
  what fills the buy ticket.
- `services/api/src/pricing.ts` has `priceOrder`, which gathers the same
  quotes, the reference price and the session, then calls the same `decide`
  from `@mercury/core` under the same `DEFAULT_POLICY`.
- `app.ts:196` builds the swap. `POST /v1/transactions/send` broadcasts it.

So there are two decisions. The one on screen and the one that executes are
computed by different code, in different places, over separately fetched
quotes. `PriceMoved` exists because they disagree — it is a symptom that has
been treated as a feature.

**Gas is not the problem. Rent is.**

| cost                   | lamports      | at SOL $119.39 |
| ---------------------- | ------------- | -------------- |
| signature fee          | 5,000         | $0.0006        |
| **token account rent** | **2,039,280** | **$0.244**     |

The fee is noise. The rent is a refundable deposit that makes a new token
account exempt from collection, charged the first time a wallet receives a
given token. It is 400× the fee and it is what actually blocks a first buy.
It recurs per ticker, not per order.

**$0.244 is 4.9% of the $5 minimum** (`policy.ts:42`, `minOrderUsd: D(5)`).

---

## 2 · The decision

**One decision, computed once, on the server.**

`useDecision` goes. The ticket calls an endpoint that runs `priceOrder` — the
same function the execute path already runs. One `decide`, one policy, one set
of adapters, one answer.

What this buys beyond tidiness:

- **The fee can be quoted at all.** It depends on whether the buyer's token
  account exists, which is a chain read, and on the SOL price. Neither belongs
  in a browser.
- **Policy stops being duplicated.** `slippageBps` already had to be moved out
  of the Jupiter adapter once because two places disagreed about it. Every
  future policy number has the same failure mode while two decisions exist.
- **Drift shrinks to its real size.** Today a quote is fetched twice, seconds
  apart, from two machines. Afterwards the gap is only the time between
  showing and signing.
- **Keys and quota stop shipping to the browser.** The RPC URL is already
  compiled into the bundle for Privy's benefit; the market adapters need not
  add to it.

What does not move yet: `useSession` and `useCreditMarket` read Pyth and
Kamino directly and are not part of the order path. They can follow later.
`usePrices` is a holdings concern, not a quote.

---

## 3 · The fee, and why it is charged in USDC

The buyer is asked for USDC. Requiring a second asset they did not choose,
cannot spend, and must acquire elsewhere is the onboarding cliff this product
exists to remove.

**A relayer pays the SOL. The buyer repays it in USDC, inside the same
transaction.**

Rejected alternative: **sponsor it outright.** Privy's own documentation warns
why — rent refunds from closing a token account go to the account's owner, not
to whoever funded it. A buyer can have the relayer fund an account, close it,
keep the refund, and repeat. The drain is unbounded and every defence is a
patch: rate limits, program allowlists, per-wallet caps.

Charging in USDC closes it structurally. Open-and-close nets the buyer zero and
costs the relayer zero. The scheme is self-financing rather than subsidised,
so it does not need policing.

**Deducted from the amount, not added to it.**

|              | buyer types $5.00, holds $5.00              |
| ------------ | ------------------------------------------- |
| added on top | needs $5.245 — **impossible**               |
| deducted     | $0.245 fee, $4.755 buys stock, $5.00 leaves |

Adding on top makes a buyer's whole balance permanently unspendable, and makes
"Max" fail by construction. Deducting keeps `You pay` literally true.

**The minimum stays on the gross.** `decide.ts:135` checks `input.amount`
against `minOrderUsd`. A buyer should not have to type $5.25 to satisfy a "$5
minimum"; that is the confusion this removes. A $4.755 swap is viable.

**Charged only when the account does not exist.** Rent is once per token
account. A second SPCX buy owes nothing, and the fee line does not appear.

**Absorbed on a buyer's first order.** One order per account, bounded, and the
one where a 5% line item is most likely to end the session. The drain stays
closed because the buyer still never profits from opening and closing.

---

## 4 · The transaction

Verified against Jupiter on 30 September 2026.

`POST /swap/v1/swap` accepts a `payer` distinct from `userPublicKey`. Sending
one moved the fee payer in the built transaction and reserved **two** signature
slots. Jupiter's `payer` covers both the fee and token-account rent.

`POST /swap/v1/swap-instructions` returns the swap instruction, the
compute-budget instructions and the address lookup table separately, so the
USDC transfer can be composed into the same message rather than bolted onto a
finished transaction.

```
build    server: swap-instructions + USDC transfer to relayer
                 → one v0 message, relayer as fee payer
sign     client: buyer signs (unchanged — one signature, one prompt)
send     POST /v1/transactions/send
                 → server validates, co-signs as fee payer, broadcasts
```

The send step already exists and already broadcasts, so the co-sign has a
place to live. No new endpoint, no new client step.

**The relayer never blind-signs.** Before it adds its signature it checks the
programs are the ones expected, the USDC transfer is present, the destination
is the relayer, and the amount matches what was quoted. It holds a hot key;
the validation is the only thing standing between that key and an arbitrary
message.

---

## 5 · What the ticket shows

```
You pay                              $5.00
  Network fee                       −$0.25
  Invested                           $4.75
Price per share                    $149.17
Shares                              0.0319
Route          Backed · Kipseli → Raydium
```

`You pay` is the amount that leaves the wallet. `Shares` is derived from
`Invested`, so the two agree — today they would quietly disagree by the fee.
The two indented lines appear only when a fee is charged.

Quoting a fee means it can move between showing and building. Round up at
quote time and keep the difference rather than adding a second reason for an
order to bounce; a few cents of slack is cheaper than a failed order.

---

## 6 · Risks

| risk                                                | mitigation                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| relayer key is hot                                  | KMS or equivalent; never in the bundle; validate every message before signing  |
| relayer runs out of SOL                             | alert on balance; it is repaid in USDC, so refilling is a swap, not a purchase |
| SOL price moves between quote and build             | round up at quote time; large moves fall through to the existing drift refusal |
| server-side quoting adds latency to every keystroke | debounce as now; the quote already takes a network round trip                  |
| a single decision endpoint becomes a hot path       | it is cacheable per (ticker, rounded amount) for the life of a quote           |

---

## 7 · Not in this spec

- Selling. The server half exists; nothing in the web app reaches it.
- Moving `useSession` and `useCreditMarket` server-side.
- Wallet export, which remains the only way out of a Privy wallet and is still
  not built.
