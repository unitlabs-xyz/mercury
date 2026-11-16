# Auto-earn on idle cash: design

**Status:** draft for review, not built · 16 November 2026 · web first, iOS after

Cash in a Mercury account earns nothing until the person opens Earn and moves it by hand. The
portfolio says so in as many words: "Cash $0.01 · Earning 0.0% a year". Most people never make
that move, and the ones who do have to undo it before they can buy, because a buy only spends cash.

**Auto-earn** keeps idle cash in an Earn vault and takes out exactly what a buy, a send or a
repayment needs, at the moment it needs it. The rest stays earning. The person pays each move's
network cost at cost, in USDC, inside the move itself. Mercury takes **75 bps of the interest** a
withdrawal carries out, and nothing on a deposit. The same two charges apply to every Earn move,
manual or automatic.

## Where we are

Verified by reading the repo and Kamino's API on 16 November 2026.

- **Earn exists and is manual.** `earn/kamino-vault.ts` builds deposits into and withdrawals from
  a Kamino Earn vault (a kVault) through the klend SDK. Shares sit in the wallet's own token
  account; we never hold a key. `earn/catalog.ts` lists Mercury's picks (Steakhouse, Gauntlet,
  Allez, MEV Capital, Squads and others), and `/v1/earn/vaults` offers every eligible USDC vault
  after them. The default is `EARN_VAULT_ADDRESS`, Steakhouse's USDC vault unless set.
- **Earn needs consent.** `0028_earn_consent` records it against `EARN_RISK_VERSION`, and counsel
  signing off that wording is a pre-launch item.
- **Earn moves are free to the person today.** The relayer is fee payer, pays for the share
  account, and tops up a wallet that has never held SOL (`fund()` in `kamino-vault.ts`, the same
  top-up `lending/sponsor.ts` does for loans). Nothing is repaid.
- **Trades repay the relayer in USDC inside the same message.** `relay/fee.ts` prices the network
  (`networkFee`: one signature plus any rent) in USDC, rounded up to the cent, and
  `relay/compose.ts` puts that charge beside the swap.
- **A buy cannot spend Earn.** The ticket points the person to Earn instead. `TODO.md` already
  lists "take what a buy needs out of Earn inside the buy's own transaction".
- **Signing happens only in the page.** ADR 0012 turned off Privy's confirmation sheet, so the app
  signs silently, but only while it is open. Nothing signs for a person who is not there. ADR 0003
  and ADR 0012 both name the replacement: **delegated signing constrained by policy**.

## What the person sees

### Turning it on

Two ways in, both opt-in, both ending at the same consent step:

1. **Profile → "Earn on idle cash"**, a switch in the account menu, off until they turn it on.
2. **The deposit-confirmed card** (below), the moment the money arrives.

Turning it on shows the same risk wording Earn already uses and records consent at
`EARN_RISK_VERSION`. The vault is **preselected** (Mercury's default pick, see "Which vault") with
a "Change" link to every vault Earn lists. Not choosing is choosing the default. Nothing moves
until they confirm.

**Opt-in, never on by default.** Moving someone's money into a lending vault without asking is
the one thing this must not do, whatever the default rate. The default is about which vault, not
about whether. `TODO.md` already says "not pre-checked".

### When a deposit lands

When Relay settles a deposit (the webhook or `funding/poll.ts` moves it to `success`), the Add
cash panel, or a card on Home if the panel is closed, celebrates it and makes the offer once:

```
  🎉  $100.00 arrived

  Not investing right away?
  Put it to work at 3.3% a year.        [ Earn on idle cash ]

  Variable rate, lent through Kamino. Take it out any time.        Not now
```

- **The rate, not a dollar figure.** "3.3% a year" is a fact about the vault today. "$3.30 a year"
  reads as a promise about the future of a variable rate, and is a figure counsel would have to
  word.
- **"Variable" and "Kamino" stay on the card.** It is lending, not a bank account, and someone new
  to this should be told so before they press, not after.
- **Once per deposit, and never again after "Not now" twice.** Shown only when auto-earn is off.
- The button opens the consent step above, not a deposit: nothing moves from the card itself.

### On the portfolio and on Money

The portfolio's **Income** figure is for what holdings pay (dividends now, a stock's lending
interest later), so Earn interest does not go there. Cash gets **its own card**:

```
  Cash                                   Earning 3.3% a year
  $1,250.40
  ─────────────────────────────────────────────────────────
  Interest earned          + $4.12       since you turned it on
  Spendable                $1,250.40     cash and Earn together
```

- **Cash** is the wallet's USDC plus the auto-earn vault's value, which already includes the
  interest. That is what the person can spend, so it is the one figure.
- **Interest earned** is lifetime: what the vault is worth, plus everything taken out, less
  everything put in. **Kamino's API already computes it.**
  `GET /kvaults/{vault}/users/{wallet}/pnl` returns `totalCostBasis` and `totalPnl` per wallet,
  and `/pnl/history` the same over time. Checked on 16 November against a real Steakhouse
  depositor: cost basis 210,824.55 USDC, P&L 10,410.26 USDC, 455 history rows. The figure shown is
  the `token` (USDC) one, not `usd`, so a wobble in USDC's own price is not reported as interest.
  Our own `earnedOn` over `earn_event` (what `/v1/earn` does today) is the fallback when Kamino's
  API is down or limiting us, as it did on 18 October, and the record that outlives a full
  withdrawal if Kamino's figure does not.
- **The balance needs no maths of ours either.** A share only gains value, and the SDK's
  `getExchangeRate()` gives it; `kamino-vault.ts` already values a position as shares times that
  rate. $100 at 3.4% reads about $103.40 a year later because the share price says so.
- `/money` already has this card's shape for manual Earn (Cash, "In Earn", "Earned so far",
  Spendable in `Money.tsx`), so the work is to show it on the portfolio too and to count the
  auto-earn balance as cash.

**There is nothing to claim, so "earned" never resets.** A Kamino vault pays interest by raising
the value of each share. It is never paid out separately, so the balance already contains it and
"claiming" it would be a withdrawal like any other. Resetting the figure to zero when money comes
out would make it look like the interest was lost, and with auto-earn money comes out on every
buy, so the figure would reset constantly. It counts up for as long as auto-earn has been used.
Today a full withdrawal drops the vault from `/v1/earn`'s holdings and its earned figure with it;
auto-earn keeps the lifetime figure from `earn_event`, so it outlives a vault being emptied.

### Everywhere else

| Where            | What changes                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Buy, Send, Repay | "Available" includes the auto-earn balance. The ticket says "$50 from Earn" when it has to take some |
| Activity         | "Moved $100 to Earn", "Took $50 from Earn", each with its network cost and any fee                   |
| Earn screen      | The auto-earn vault shows as an ordinary position, marked "Auto"                                     |

## Which vault

The person picks any vault Earn lists. Every one of them is a Kamino vault; what differs is the
curator deciding what the USDC is lent against. If they don't pick, the default is
`AUTO_EARN_DEFAULT_VAULT`, a setting separate from `EARN_VAULT_ADDRESS` so the two can differ.

**Proposed: Steakhouse's USDC vault** (`HDsayq…RS5E`), the Earn default today. On 16 November it
paid 3.3% on $15.4M from 3,307 depositors, lending against SOL, Bitcoin and JLP on Kamino's
largest markets. Kamino curates two USDC vaults of its own, and neither suits idle cash as a
default:

| Vault                                | Rate | Size   | Depositors | Why not the default                               |
| ------------------------------------ | ---- | ------ | ---------- | ------------------------------------------------- |
| Kamino Private Credit USDC           | 7.5% | $7.3M  | 65         | Private credit: loans off-chain, repaid off-chain |
| Kamino Institutional Commodity Yield | 7.5% | $50.3M | 1,218      | Commodity financing, the same kind of risk        |

The extra rate is pay for credit risk, and someone who never chose a vault has not chosen that.
Both stay available to anyone who picks them.

One auto-earn vault per person. A person can still hold other Earn positions by hand; auto-earn
moves money only in and out of the one it was given.

## Money in: the sweep

Cash becomes idle when it arrives and nothing spends it: a deposit settles, a sell lands, a loan
pays out, a send comes in.

**A sweep moves idle cash above a floor into the vault**, when all of these hold:

- at least `AUTO_EARN_MIN_SWEEP_USD` is idle (proposed **$10**);
- it has been idle for `AUTO_EARN_IDLE_MINUTES` (proposed **10**), so cash that is about to be
  spent is not moved twice;
- the vault is not at its deposit cap and its minimum deposit is met.

Everything idle goes, less that move's network cost. There is no cash buffer: the buy path takes
out what it needs, so a buffer would only be money not earning.

**Why a floor.** Every move costs the relayer about $0.0015 (below), and a sweep earns Mercury
nothing. Below $10, sweeping $0.40 of change would be paying to move money for the sake of it.

### Who signs a sweep

The person's wallet has to sign every move into the vault. That decides when sweeps can happen.

**Phase 1, while the app is open.** The app checks on load and whenever cash changes (the
`wallet-events` push already tells it), asks `GET /v1/earn/auto/pending` whether a sweep is due,
and if so builds, signs silently and sends it, as ADR 0012 already allows for anything else.
Money that arrives while the app is closed is swept the next time it opens. Simple, with no new
key, but "auto" only while somebody is looking.

**Phase 2, while the app is closed.** A **Privy session signer**: the person grants Mercury's
server a signer on their embedded wallet, bound by a Privy **policy** that allows exactly:

- deposit into their chosen auto-earn vault, from their own USDC account;
- withdraw from that vault, to their own USDC account;
- the USDC transfer that repays the relayer, to the relayer's USDC account, at most the network
  cost plus, on a withdrawal, `EARN_INTEREST_FEE_BPS` of what comes out.

Nothing else: no other program, no other destination, no transfer out. A background job sweeps on
its own schedule. This is the "delegated signing constrained by policy" ADR 0003 and ADR 0012
already name as the way out of silent signing in the page, so the policy built here is the start
of that work rather than a second one. It needs its own ADR, and it waits on Privy confirming its
policy engine can express "this vault, this owner's accounts" for Solana.

Phase 1 ships first and is useful on its own. Phase 2 makes the name true.

## Money out: exactly what is needed

A buy of $50 with $0 cash and $100 in auto-earn takes **$50 plus the move's network cost and the
interest fee on it** out of the vault (well under a cent). The other $50 stays earning.

```
need     = amount + Mercury's charges on the action (trading fee, network) + this move's cost
withdraw = (need − cash on hand) ÷ (1 − fee on each dollar out)   (nothing when cash covers it)
shares   = ceil(withdraw ÷ share price)                           (never more than are held)
```

"Fee on each dollar out" is below; it is 0.75% of only the interest share, so the division adds
well under a cent.

Shares are rounded up, so what comes out is never a fraction of a cent short. The leftover
fraction stays as cash and goes back at the next sweep.

**Same transaction where it fits, two where it doesn't.** A withdrawal and a Jupiter swap in one
message is what `TODO.md` asks for, and it is atomic: no withdrawal without the buy. It may not
fit. A kVault withdrawal refreshes every reserve the vault lends to (`COMPUTE_UNITS = 600_000`
in `kamino-vault.ts`), and a swap route needs lookup tables of its own to fit in 1,232 bytes. So:

1. Compose withdraw, charge and swap together, with the vault's lookup table beside the route's.
   If it compiles under 1,232 bytes and simulates under 1.4M compute units, send that.
2. Otherwise two transactions, signed together: the withdrawal, then the swap built once it has
   landed. If the swap then fails, the money is in cash, not lost, and the next sweep returns it.

The same arithmetic serves a send (including a Relay withdrawal to another chain, if that ships),
and a loan repayment. Anything that spends USDC asks the auto-earn balance before it says "not
enough cash".

**When the vault can't pay out.** A kVault holds some USDC idle and the rest lent out. When its
reserves are heavily borrowed, a large withdrawal may not be available at once. The ticket checks
the vault's withdrawable amount first and says so ("$40 can come out of Earn right now") rather
than failing at the chain.

## Network costs and the fee: one USDC charge, in the same transaction

**One rule for all of Earn.** Everything in this section applies to every Earn move: the sweep, a
withdrawal for a buy, a send or a repayment, and a deposit or withdrawal the person makes by hand
on the Earn screen, in any vault. A move costs the same whoever starts it. Today manual Earn moves
are free and the relayer absorbs them; that ends with this piece.

The person's account is a Privy embedded wallet holding USDC, not SOL. That doesn't stop them paying
for a move: **the relayer is the fee payer, and the person repays it in USDC inside the same
transaction**, the way trades already repay it (`relay/fee.ts`, `relay/compose.ts`). A deposit (a
sweep, or manual) is one transaction that charges the cost and lends the rest. A withdrawal is one
transaction that takes shares out, then charges the cost and Mercury's fee. The repayment can't be
skipped, and nothing is owed afterwards.

### The network cost, at cost

| Part                                                          | Lamports               | When                                                         |
| ------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------ |
| Signatures, the relayer's and the person's                    | 10,000                 | Every move                                                   |
| The vault share account's rent                                | ≈ 2,039,280            | The first deposit into a vault, once                         |
| A wallet that has never held SOL being brought into existence | the node's wallet rent | The first move ever, once; it is the person's SOL afterwards |

Priced in USDC at the SOL price of the moment, as `networkFee` does today. Both signatures are
counted, which `TODO.md` already asks of `fee.ts` ("charges one").

**Rounded to the USDC unit, not up to the cent.** `networkFee` rounds up to the cent because a
trade can afford a cent of slack. Here 10,000 lamports is about $0.0015, and rounding it to $0.01
would charge six times the cost on every move. So Earn moves round up to **0.000001 USDC** and
add a fixed margin for SOL moving between quote and send (`EARN_PRICE_MARGIN_BPS`, proposed
200, so 2%). A move costs the person about **$0.002**, and their first deposit about **$0.30** more
for the share account, once. "Withdraw all" leaves the share account open, so coming back later
doesn't pay its rent again.

### Mercury's fee: 75 bps of the interest, only when money comes out

A deposit carries no fee, only its network cost. A withdrawal, whether for a buy, a send, a
repayment, a manual withdrawal or "Withdraw all", gives Mercury `EARN_INTEREST_FEE_BPS` (proposed
**75**, `0` turns it off, changeable without a release) of the interest inside the amount withdrawn. Principal is
never charged.

**How much of a withdrawal is interest.** Kamino doesn't separate them, so we keep a cost basis:
what the person put into each vault position and hasn't yet taken out, from our own ledger. One
basis per person per vault, so a manual position and the auto-earn one are counted apart.

```
value             = shares held × share price
gain              = max(0, value − basis)
interest out      = withdraw × gain ÷ value          (the same share of every dollar)
fee               = interest out × EARN_INTEREST_FEE_BPS ÷ 10,000, rounded down to 0.000001 USDC
basis afterwards  = basis × (1 − withdraw ÷ value)
```

A deposit adds what was lent (after its network cost) to the basis. At or below cost (a vault that
lost money) there is no gain and no fee. Worked example: $1,000 in, now worth $1,050, $500 comes
out. Interest out = 500 × 50 ÷ 1,050 = $23.81. Fee = $0.18. Basis becomes $523.81.

The basis is computed from our records at build time, not from Kamino's `/pnl` API. It has to be
exact and available whenever a buy is built, and it only counts money moved through Mercury.

**Positions that exist before this ships** start with their basis at what they are worth on the
day the fee turns on. `earn_event` records USDC in and out but not shares, so their past can't be
split exactly, and interest earned before the fee existed is never charged.

### How the charge is made

Network cost and fee go out together as **one USDC transfer to the relayer's USDC account**, the
account `tradingFee` already pays into:

- **Deposit** (sweep or manual): charge, then deposit `idle − cost` (or what was typed, less the
  cost).
- **Withdrawal on its own:** withdraw, then charge `cost + fee` from what came out.
- **Withdrawal folded into a buy:** the withdrawal's cost and fee are added to the buy's own single
  charge, so the buy still has one transfer.

**What it earns.** $1,000 earning 5% makes $50 of interest a year; 75 bps of it is about $0.38,
taken as money comes out. The person also covers every move's network cost, so the relayer is
never out of pocket on Earn.

**Shown, not hidden.** The consent step, the auto-earn settings and the Earn deposit and withdraw
sheets say it ("Each move costs a fraction of a cent
in network fees, paid from your cash. When money comes out, we keep 0.75% of the interest it
earned"), each confirm sheet shows the two figures for that move, and each activity row shows its
network cost and, on a withdrawal, the fee.

**Manual Earn changes too.** `fund()` in `kamino-vault.ts` keeps topping up a wallet that has never
held SOL, but the person now repays it, the share account and the signatures in USDC, as above.
The Earn screen's "Earned so far" stays what it was: gross interest, before the fee, with the fees
paid listed under it.

## The record

```
auto_earn: user_id (primary key), enabled, vault, consented_at, risk_version,
           min_sweep_usd (null: the setting), created_at, updated_at

earn_basis: user_id, vault (primary key together), basis_usdc, updated_at
```

`earn_basis` serves manual and automatic positions alike. `basis_usdc` is updated when a move confirms, never when it is built, so a move that never lands
leaves it alone.

Each move, manual or automatic, is an `earn_event` row as today, gaining `shares`, `trigger` (`auto`, `buy`, `send`, `repay`,
`manual`) and `network_cost_usdc`, and on a withdrawal `interest_usdc`, `fee_bps` and `fee_usdc`, so
the Activity row can say why money moved and what it cost, and the books can tell repaid gas from
Mercury's fee.

Turning auto-earn **off** stops sweeps and leaves the money where it is, as an ordinary Earn
position with a "Withdraw all" button. It does not move it back on its own, which would cost a
move nobody asked for.

## Endpoints

| Route                       | Does                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /v1/earn/auto`         | Settings, the vault, the auto-earn balance, the rate                                            |
| `PUT /v1/earn/auto`         | Turn on or off, choose the vault. Turning on records consent at the current `EARN_RISK_VERSION` |
| `GET /v1/earn/auto/pending` | Whether a sweep is due now, and how much                                                        |
| `POST /v1/earn/auto/sweep`  | Build the sweep (charge, then deposit), remembered for the relayer                              |

Withdrawals have no route of their own. `/v1/orders/:id/execute`, `/v1/money/send/prepare` and
`/v1/borrow/transactions` gain the withdrawal when cash falls short, so the person never sees a
separate step.

## Not in this piece

- **iOS.** The mobile app gets the setting and the "from Earn" line after web, on the same
  endpoints.
- **Several vaults at once,** or splitting idle cash between them.
- **Rewards from a vault's farm.** Shares aren't staked, as today.
- **Phase 2's session signer.** Designed above; built after its own ADR.

## Build order

1. `auto_earn` and `earn_basis` tables (basis seeded from each position's value), the new
   `earn_event` columns, the settings and consent routes.
2. One USDC charge inside every Earn deposit and withdrawal (`kamino-vault.ts` `build`, so manual
   Earn gets it first): network cost at the USDC unit with both signatures counted, plus the
   interest fee on withdrawals, with the basis kept on confirm and `EARN_INTEREST_FEE_BPS`. The
   Earn sheets show both figures.
3. Sweep: `pending` and `sweep` routes, and the web app sweeping on load and on cash changes.
4. Withdraw-what's-needed in the buy: the single-transaction attempt, the two-transaction fallback,
   the withdrawable check.
5. The same in send and repay.
6. The profile switch, the deposit-confirmed card, the portfolio Cash card with lifetime
   interest, "$50 from Earn" on tickets, activity rows.

## Still open

- **Default vault.** Proposed Steakhouse's, not one of Kamino's own (see "Which vault").
- **Sweep floor and wait.** Proposed $10 and 10 minutes. Both are settings.
- **The fee's rate.** Proposed 75 bps of interest. It's a setting, so it can change without a
  release.
- **Counsel.** Whether a share of interest earned changes how Earn is described in each launch
  market. Earn's risk wording is already waiting on counsel. Moving money automatically into
  a lending vault, even opted in, belongs in the same memo, as does whether showing cash and Earn
  as one "Cash" figure is acceptable in each launch market.
- **Kamino's P&L after a full withdrawal.** Whether `totalPnl` keeps interest already taken out,
  or drops it with the position. Test with a wallet that has emptied a vault before relying on it
  for the lifetime figure.
- **Privy session signers on Solana.** Whether the policy engine can bind a signer to one vault
  and the owner's own accounts. Phase 2 depends on it; phase 1 does not.
