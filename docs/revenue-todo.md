# Revenue, fees and referrals: TODO

Built from _How Mercury makes money_ (internal deck, 14 October 2026) and checked against the code on
`main` at `fb3fc99`. The deck points to `docs/12-revenue.md` and `docs/13-fees-and-referrals.md`.
Neither exists on any branch yet, so this list and the deck are the only written version.

Today Mercury earns $0. The only thing a user pays is the network cost, charged at cost.

---

## Blockers: decisions before code

### Founders

- [ ] Set the trading fee and its tiers (proposed: 0.5% up to $2k, 0.35% for $2k–$20k, 0.25% above $20k)
- [ ] Country check at sign-in: yes or no, and which list (Backed geoblocks the US, UK, Canada and Australia)
- [ ] Perps: in scope ever, or not (keeping them out means ADR 0009 stays as it is)

### Partners

- [ ] Jupiter: its cut on **our** swap path. See note A: we use `/swap/v1`, not Ultra, so the ~20% may not apply
- [ ] Glider: how `swapBps` gets paid out, and to which account
- [ ] Kamino: the real first-loan setup rent, and whether they'll set a referrer share (it is 0% on the xStocks market today)
- [ ] Bridge: our share of card interchange

### Lawyer

- [ ] Do we have to block restricted countries at sign-in?
- [ ] Does adding a borrow fee on top of Kamino make us a lender in any launch market?
- [ ] Can we pay inviters a share of stock-trading fees in our launch markets?
- [ ] California DFAL, if any US users stay

---

## 0 · Country check at sign-in (prerequisite)

The deck puts this first: we can only charge for stocks where we're allowed to offer them.
**Today:** nothing. The app never reads the user's country.

- [ ] Detect country at sign-in (IP header from the edge, maybe plus a self-declared country)
- [ ] Store it on `user`
- [ ] Block or limit restricted countries for xStocks, baskets, borrowing and perps
- [ ] Tell blocked users why, instead of showing a broken shelf

## 1 · Trading fee (flat 0.5% shipped; tiers later)

**Built 15 October 2026.** A flat fee, `TRADING_FEE_BPS` (default 50), added to the USDC transfer that
already repays the relayer for gas, in the same transaction as the swap. Jupiter takes no cut, because
it never sees the fee. Fees collect in the relayer's USDC account, and trades are refused without a
relayer.

- [x] Collect it in our own USDC transfer, not Jupiter's `platformFeeBps` (note A)
- [x] Collect in USDC on both sides, into the relayer's USDC account for now
- [x] Take the fee out of the amount, like the network cost, so "Max" still works
- [x] Return it in `/v1/quote` as `fee.network`, `fee.mercury` and `fee.mercuryBps`; `fee.usdc` stays the total
- [x] Confirm screen: "Mercury fee (0.5%)" above "Network fee" on web, and on mobile
- [x] Record Mercury's share on each order (`order.mercury_fee_usd`), apart from the total in `fee_usd`
- [x] Refuse trades when no relayer is configured (Vercel deployment included)
- [ ] Sweep the fees from the relayer's hot wallet to a treasury
- [ ] Tier function: 0.5% / 0.35% / 0.25% by trade size, with tests at the $2k and $20k edges
- [ ] Alert when a fill comes back without a fee

## 2 · Borrow fee, and the first-loan setup Mercury pays for

**Decided 15 October 2026:** Mercury pays a new borrower's Kamino account setup, about $3, and says so.
The relayer tops up the rent inside the first borrow's own transaction, so an account is only opened for
a loan that lands. The borrow sheet shows the cost struck through as "Paid by Mercury". Kamino pays us
nothing.

**Measured 15 October 2026**, by simulating a first deposit-and-borrow on mainnet: the setup tops a new
wallet up by 29,504,640 lamports, about $3.04 at $103 SOL. That covers the obligation (17,637,760), user
metadata (5,892,800), the farm state (5,323,840) and the wallet's own minimum (650,240). The borrow
transaction then opens a USDC account if there is none. The deck's $5–7 assumed a higher SOL price and
mainnet's old rent rate.

- [x] Stop creating Kamino's per-user lookup table, which nothing uses (`USER_SETUP` in `kamino.ts`):
      934,720 lamports less per new borrower
- [x] Work out the first-loan setup rent from account sizes: measured above, and priced live from the node's
      rate by `services/api/src/lending/setup.ts`
- [x] Open the account only with a loan: the setup rides in the first borrow's transaction, so a borrow that
      fails opens nothing and costs nothing
- [x] Do not charge it: shown on the borrow sheet as "One-time account setup ~~$2.97~~ Paid by Mercury"
- [ ] Add the 0.25% borrow fee in a USDC transfer inside the loan's transaction
- [ ] Show it on the borrow confirm screen
- [ ] Record it on `loan_event`

## 3 · Referral tracking

**Built 17 October 2026.** See docs/superpowers/plans/2026-10-17-referral-tracking.md.

- [x] Give every user a referral code and a share link
- [x] Read `?ref=` on landing and web, keep it through Privy sign-in, then attach it at first sign-in
      A claim that fails with 401, 408 or 429 keeps the code for the next visit; any other refusal drops it.
- [x] Store who invited whom: one inviter, set once, no self-referral
- [x] Count a referral only once the friend funds $50+ and trades once
      Money counts towards the $50 an hour after it lands, so the inviter's own side of a transfer between them has been recorded and is left out.
- [x] Friend discount: 25% off fees for 90 days, applied in the fee function from item 1
- [x] Inviter tiers by funded friends: 0–9 → 25%, 10–49 → 30%, 50+ → 35% (computed; shown with rewards)
- [x] Founding 500 start at 30%: match `waitlist.email` to `user.email`
      A waitlist slug is its holder's code even before they open the Invite panel, so old founding-card links still credit them.
- [x] Keep `?ref=` when `/f/:slug` redirects
- [ ] Invite screen: link, friends invited, friends funded, earned so far (link and counts built; earnings arrive with §4)

Mobile has no Invite screen yet: `apps/mobile/app/settings.tsx` is where its row goes.

## 4 · Referral payouts (after the trade fee has run a few weeks)

- [ ] Accrue 25/30/35% of Mercury's **net** fee (after Jupiter's cut) per friend, for 12 months from sign-up
- [ ] 7-day hold before a reward counts
- [ ] Claw back quick round trips (buy then sell within the hold)
- [ ] Weekly USDC payout job, $1 minimum, with a ledger of what was paid and when
- [ ] Payout history in the app

## 5 · Glider basket fee (once Glider confirms the payout)

**Today:** `baskets.ts` sets `feeBps: 0`. `glider/client.ts` already reads `swapBps` back from
`/tenant/fees` for display.

- [ ] Set tenant `swapBps` to 50 (0.5%) on Glider
- [ ] Show it on the basket ticket before deposit and rebalance (`apps/web/src/app/baskets/Ticket.tsx`)
- [ ] Charge the network cost on basket deposits (today nothing is charged, −$0.002 each)

## 6 · Add-cash fee: 0.3% on non-USDC tokens

**Built 15 October 2026.** `DEPOSIT_FEE_BPS` (default 30), sent to Relay as `appFees` on every deposit
that isn't Circle's own USDC. Relay takes it out of the deposit and holds it as a USDC balance credited
to `DEPOSIT_FEE_RECIPIENT`, which has to be an EVM address even for deposits from Solana. With no
recipient set, no deposit is charged.

- [x] Add `appFees` on quotes for anything but Circle USDC (`services/api/src/funding/fees.ts`)
- [x] Keep Circle USDC free on every chain Circle issues it; BNB Chain has none, so its USDC is charged
- [x] Ask for the same fee in the browser's preview, from a per-token `appFee` the server sends
- [x] Show it in `FundWalletSwap.tsx`'s fee breakdown as "Mercury (0.3%)"
- [x] Record what Relay reported on each deposit (`funding_intent.mercury_fee_usd`)
- [ ] Pick the EVM wallet that receives the fees (a Safe works) and set `DEPOSIT_FEE_RECIPIENT`
- [ ] Claim the balance from that wallet at relay.link/claim-app-fees. Not now: decided 15 October 2026
      to leave the fees held at Relay, and build no payout yet

## 7 · "Buy more with credit" (once 1 and 2 are live)

Fits ADR 0009's 30 September amendment. Both legs exist already, and it earns twice: the borrow fee and
the trade fee.

- [ ] One-tap borrow-then-buy, capped at our 80% safety target, on the 8 xStocks Kamino lends against
- [ ] Show the liquidation price prominently, and warn that xStocks can gap at the Monday open

## 8 · Bridge: card and cash-out (as part of those builds)

**Today:** no Bridge integration in the code at all.

- [ ] Card: our share of interchange, free to the user, 1% FX fee abroad
- [ ] Cash out to a bank: `developer_fee_percent` at 0.5%

---

## Relayer and network cost fixes (deck section 05)

- [ ] Charge both signatures. `fee.ts` adds `SIGNATURE_LAMPORTS` once, and the deck says there are 2 per tx
- [x] Charge rent at mainnet's current rate, by the size of the account opened. The constants assumed
      6,960 lamports a byte and mainnet charges 5,080, so a first buy, a first sell and a transfer to a new
      account were each overcharged $0.05–0.06, and every new borrower's wallet got 240,640 lamports more
      than it needed. Rent is now asked of the node and kept for an hour (`services/api/src/rent.ts`): 179
      bytes for a stock account (xStocks and Ondo alike), 165 for USDC
- [ ] Weekly check: SOL the relayer spent vs USDC it collected
- [ ] Decide whether "Send" keeps absorbing the signature (−$0.002 each, a deliberate choice in `transferFee`)

## After launch

- [ ] Swap the projection assumptions for real numbers after a month of fees (deck section 06)
- [ ] Write `docs/12-revenue.md` and `docs/13-fees-and-referrals.md`, which the deck cites but which don't exist yet

## Out of scope unless founders decide otherwise

- Stock perps (Phoenix, Pacifica). This would reverse ADR 0009 and needs geofencing; the EU caps retail
  equity leverage at 5x. Avoid Velocity (exploited) and Flash Trade (winding down).

---

### Notes

**A. Jupiter's cut may be smaller than the deck assumes.** The deck's "Jupiter keeps ~20%" is the Ultra
integrator fee. ADR 0008 was superseded on 30 September, and trades now go through Jupiter's keyless
`/swap/v1` endpoints. We also already build the trade transaction ourselves and add an atomic USDC
`charge` to it for the network cost. If the trading fee goes into that same charge instead of through
Jupiter's `platformFeeBps`, Jupiter may take nothing, and we keep 0.5% rather than 0.4%. Check this with
Jupiter before building item 1, because it changes the referral maths too (inviters get a share of the
net fee).
