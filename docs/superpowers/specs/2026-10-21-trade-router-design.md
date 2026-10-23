# Trade router: design

**Status:** agreed and planned, not built · 22 October 2026 · first on-chain program Mercury would
own. Built on top of the referral-tracking branch (#97). Decision record:
[ADR 0018](../../adr/0018-trade-router.md) (proposed). Build:
[the plan](../plans/2026-10-21-trade-router.md).

One Anchor program, `mercury_router`, with two jobs:

1. **Wrap every stock trade.** `open_trade` and `close_trade` sit around the Jupiter swap in the
   same transaction. They take the fees, record exactly what moved, and emit a `TradeFilled` event.
2. **Hold Mercury's fees in a vault** that only a timelocked multisig can withdraw from, and only to
   a treasury account it sets, instead of the relayer's hot wallet.

Referral rewards are paid off-chain, from the monthly withdrawal (see Referral payouts).

The program never holds a user's funds. Tokens move from the user's wallet through Jupiter and back
to the user's wallet. The program checks the result and moves only fees. That is what keeps it to
one audit.

It is Phase 1 work in [12 Roadmap to 2028](../../12-roadmap-2028.md) (no program holding user
money), and it becomes the trade module of the Mercury Account later.

## Why

Five things today that the router fixes:

- **A fill exists only if the app confirms it.** `POST /v1/orders/:id/confirm` reads the fill off the
  wallet's token balances. If the app never calls it (the tab closed, the phone lost signal), the
  order stays `executing` for ten minutes. After that, position-sync reads the change in the chain
  as a transfer (`EXECUTING_WINDOW_MS` in `portfolio/apply.ts`), and the lot has no cost basis. With
  the router, the fill is an on-chain event the server can pick up by itself.
- **Fills are inferred, not stated.** `orders/fill.ts` works the fill out from balances before and
  after, and has to separate the relayer's USDC leg from the user's (`netFor`, `sponsorCharge`).
  An event stated by the program removes that guessing.
- **Fees sit in a hot wallet.** The network repayment and Mercury's fee travel as one USDC transfer
  to the relayer (`relay/compose.ts`, `TradeCharge` in `relay/fee.ts`). "Sweep the fees to a
  treasury" is an open item in [revenue-todo](../../revenue-todo.md).
- **No on-chain footprint.** Mercury's volume and fees are invisible to DefiLlama, Dune and
  ecosystem dashboards. The router makes them attributable.

## Decisions already made

- **Around the swap, not on top of it.** The router does not call Jupiter. It puts its own
  instructions before and after Jupiter's, as top-level instructions in one transaction. A program
  calling Jupiter would run into Solana's limit of four nested program calls: Mercury, then
  Jupiter, then a pool, then the token program.
- **Pool routes only.** Mercury stays on Jupiter's `/swap/v1`, not Ultra. Ultra's market-maker
  quotes are signed by the maker, and adding instructions breaks that signature.
- **Rules off-chain, money on-chain.** Fee tiers, referral tiers, the 7-day hold and clawbacks live
  in the server. The program enforces hard caps and pays out.
- **Anchor 1.2.x,** the stable release used in the spike.

## Spike evidence

A throwaway spike on 21 October 2026. It was run against real Jupiter routes, and on a local
Surfpool copy of mainnet with 81 mainnet accounts loaded into it. The code was not kept.

| Question                    | Result                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does it fit in 1,232 bytes? | The two instructions add about 150–180 bytes, with a Mercury lookup table for the router's fixed accounts. $100 trades fit (845–1,068). Three of six $10k trades on Jupiter's default 2–4 pool routes did not (up to 1,325). With `maxAccounts=40`, every route fitted (1,006–1,105). That cap moved price impact by at most about 1 bp. |
| Accounts loaded             | At most 57 with default routes and 44 capped, under the 64 limit.                                                                                                                                                                                                                                                                        |
| Compute                     | Router about 22–25k units per trade (`open_trade` about 10k, `close_trade` 11.6k on a buy, 15.2k on a sell). Whole trades used 83k–186k.                                                                                                                                                                                                 |
| Accounting                  | On four landed SPYx trades (a $100 buy on 1 pool, a $5,000 buy on 2 pools, a sell of everything on 2 pools, and a $100 buy again), the event equalled the on-chain balance changes exactly, and the fee in the vault equalled the fee charged.                                                                                           |
| Attacks refused             | Swap with no open; open with no close; a false pre-balance; a fee above the cap; a close from another order; a token transfer slipped between swap and close. Each failed with its own error.                                                                                                                                            |
| Events                      | `emit_cpi!` events decode from `getTransaction` (checked on Jupiter's own events, 4 of 4). Over a public websocket, notifications arrived 0.8–1.8 s after the block, and the transaction was readable about 0.34 s after that (2 s at worst).                                                                                            |
| Multiplier                  | SPYx stores 1.003909, but a scheduled 1.005715 took effect on 18 Jun 2026. The program must apply the effective one. Mercury's reader already does (`packages/chain/src/solana/rpc.ts`).                                                                                                                                                 |
| Not covered                 | TSLAx routes through Manifest and a market-maker pool did not fill on copied state. That needs a mainnet canary.                                                                                                                                                                                                                         |

## Design

### Accounts

| Account          | Seeds                        | Holds                                                                                                                                   | Written by                                                                                                      |
| ---------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `Config`         | `["config"]`                 | Admin and guardian keys; the relayer's USDC account; the treasury and a proposed one; the fee vault's address; a paused flag; the bumps | Admin (timelocked); the treasury's owner accepts a proposed treasury; the guardian can only set the paused flag |
| `VaultAuthority` | `["vault"]`                  | Nothing. A PDA that owns the fee vault                                                                                                  | –                                                                                                               |
| Fee vault        | USDC ATA of `VaultAuthority` | Mercury's fees                                                                                                                          | Trades, withdrawals                                                                                             |
| Event authority  | `["__event_authority"]`      | Anchor's self-CPI signer                                                                                                                | –                                                                                                               |

`Config` is only read during trades, never written. A global account written on every trade would
force every Mercury trade to run one after another. The fee vault and the relayer's USDC account are
written on every trade, as the relayer's account is today. That allows roughly 12M compute units per
block per account: about 80 trades a block at about 150k each. When that matters, the vault can be
split into several accounts by user.

### `open_trade`

Arguments, Borsh after the 8-byte discriminator (85 bytes with it):

```
order_id      [u8; 16]   Mercury's order UUID, so the event joins the order row
side          u8         0 buy, 1 sell
fee_rate      u32        Mercury's rate in hundredths of a basis point, ≤ MAX_FEE_RATE (10,000 = 1%), a constant in the code
buy_fee       u64        buy: Mercury's fee as the server computed it, ≤ floor(gross_in × fee_rate / 1,000,000); 0 on a sell
network_fee   u64        USDC repaid to the relayer, set by the relayer's server; no cap in the program
gross_in      u64        buy: the USDC the user agreed to; sell: the tokens sold
min_out       u64        buy: least tokens; sell: least net USDC after fees
pre_in        u64        the user's input balance now, checked against the chain
pre_out       u64        the user's output balance now (0 if the account is not created yet)
affiliate     u64        referral code, 0 for none; echoed in the event, moves no money
```

Accounts, in this order. `close_trade` uses the same first six, which is how pairing compares them:

```
0 user            signer
1 config          read
2 fee_vault       write
3 relayer_usdc    write   must equal Config.relayer_usdc
4 user_in         write   the user's token account for the input mint
5 user_out        read    the user's token account for the output mint; may not exist yet
6 usdc_mint       read
7 stock_mint      read
8 usdc_token_program
9 instructions sysvar
```

Checks, in order:

1. The program is not paused for trades, `fee_rate` is within its cap, and on a buy `buy_fee` is
   within `fee_rate` of `gross_in` (on a sell it must be zero).
2. `user_in` and `user_out` are token accounts owned by `user`. They hold the mints the side says
   (USDC and `stock_mint`) and belong to the right token program (Token for USDC, Token-2022 for
   xStocks). An output account that does not exist yet counts as zero.
3. `pre_in` and `pre_out` equal the real balances.
4. **Pairing.** Read the instructions sysvar forward from here:
   - The next router instruction must be `close_trade` for this `order_id`, on the same first six
     accounts.
   - Everything between must be Jupiter v6, the ATA program (creating the output account) or the
     compute-budget program. Anything else fails with `Forbidden`.
   - No router instruction may come before this one, so there is one trade per transaction.
5. **On a buy, take the fees now:**
   - `network_fee` goes to `relayer_usdc`.
   - `buy_fee` goes to the fee vault. It is passed rather than worked out here because the server
     rounds the fee to the cent and has already taken it out of the swap amount; the program only
     checks it is no more than the rate allows.
   - Both come from `user_in`, signed by `user`.

### `close_trade`

Takes only `order_id`. Accounts are the same as open, then `event_authority` and the program, for
`emit_cpi!`.

1. Find the nearest router instruction before this one. It must be `open_trade` for this `order_id`
   on the same first six accounts. Read its arguments from the sysvar.
2. Read the balances after the swap. `spent = pre_in − post_in`, `got = post_out − pre_out`.
3. **On a buy:**
   - `spent ≤ gross_in`. The buyer is never debited more than they agreed to, fees included.
   - `got ≥ min_out`.
4. **On a sell:**
   - `fee = floor(got × fee_rate / 1,000,000)`.
   - Move `network_fee` to `relayer_usdc` and `fee` to the vault, both from `user_out`.
   - `got − network_fee − fee ≥ min_out`.
   - `spent ≤ gross_in`.
5. Read the stock's effective multiplier from the Token-2022 ScaledUiAmount extension (type 25):
   `new_multiplier` once its timestamp has passed, otherwise `multiplier`.
6. Emit `TradeFilled`.

On a sell, the fee is charged on what actually arrived. Today it is a dollar figure fixed from the
quote. The ticket says "Mercury fee (0.5% of proceeds) ≈ $X", with the expected amount beside it.

### The event

```
TradeFilled {
  version      u8          1
  order_id     [u8; 16]
  user         Pubkey
  side         u8
  input_mint   Pubkey
  output_mint  Pubkey
  spent        u64          tokens out of the user's input account, fees included on a buy
  got          u64          gross into the output account, before a sell's fees
  network_fee  u64
  mercury_fee  u64
  multiplier   u64          effective multiplier × 10^12, no floats in the event
  affiliate    u64
}
```

Emitted with `emit_cpi!`, so it lives in the transaction's instruction data and cannot be lost to
log truncation. A reader trusts only an inner instruction whose program is `mercury_router` and
whose signer is its event authority. A log line can be printed by anyone.

### Fee vault and withdrawals

- `withdraw(amount)`: admin only, so each withdrawal waits out the timelock. It pays only to
  `Config.treasury`, a USDC token account; anything else is refused.
- **Changing the treasury takes two steps.**
  - `set_treasury(account)`: the admin proposes it, so through the timelock. A thief with an admin
    key, or a mistake, shows up as a pending Squads proposal two days before it could redirect
    anything. The current treasury stays live meanwhile.
  - `accept_treasury()`: signed by the key that owns the proposed USDC account. It must be a USDC
    token account, and only then does it become the treasury.
  - Why: [ADR 0015](../../adr/0015-treasury-service.md) found that a configured address can be one
    nobody holds the key for, and nothing notices until money lands there for good. A signature
    from the owner proves somebody does. For a hot wallet the accept is one signature; for the
    Squads vault it is one more proposal.
  - `initialize` takes the first treasury as a proposal too, so nothing can be withdrawn until its
    owner has accepted it.
- The treasury can be a hot payout wallet's USDC account, so the month's money lands where it is
  spent with no second hop. The admin chooses each withdrawal's amount, so a hot treasury only ever
  holds what was sent to it; the rest stays in the vault. To keep fees cold, point the treasury at the
  Squads vault's own USDC account instead.
- Every trade adds to the vault. Nothing else adds to it except a direct transfer, which counts as a
  donation and is harmless.
- The admin withdraws once a month. That withdrawal also funds the month's referral payouts.

### Referral payouts

Off-chain, by design. The server owns the rules.

**What is paid changed after the [referral research](../../research/2026-10-21-referral-fee-sharing.md) (21 October 2026).** A share of trading fees paid
to users is the riskiest design in nearly every target market. EU inducement rules apply, and Poland
prohibits referral payments tied to fees outright. Brazil reserves finding clients to registered
agents. Singapore and Turkey ban referral incentives. No exchange or broker shares fees on stock or
stock-token trades. The recommended program, pending counsel:

- the invited friend keeps the discount #97 already builds;
- the inviter gets a **flat, one-off reward per qualified friend**, never tied to how much the
  friend trades. A friend qualifies under #97's "funded friend" rule ($50 funded and one trade)
  and must keep the account 30 days. The starting figures are $10 per friend, capped at 20 a year;
- the inviter passes KYC and sanctions checks;
- the program is off in countries where referral incentives are banned or reserved to licensed
  agents.

Putting the payout on-chain would add Merkle trees, claim records and a claim screen to the program,
and to its audit, for little gain. Each month instead:

1. The server works out which rewards came due and publishes the total.
2. The admin withdraws from the vault to the treasury (timelocked, as above). With the treasury set
   to the **payout wallet**, that is exactly the month's total; with it set to the Squads vault, the
   multisig then sends that total on to the payout wallet.
3. The server's payout job pays each referrer, records a `referral_payout` ledger, and leaves the
   payout wallet at zero.

The payout wallet is the only server key that ever holds money. It is kept apart from the
relayer's key. It holds what the admin withdrew to it, normally one month's referral total, and
only until the end of the run. An alert fires on any outflow that isn't a payout. Every payout is
an ordinary on-chain transfer. The `affiliate` code in each `TradeFilled` event makes it public
which trades earned referral credit.

**Payouts start** once counsel approves the flat reward in the launch markets, and referral tracking
(#97) has merged. #97's unbuilt rewards plan (`2026-10-17-referral-rewards.md`) assumes the fee
share, so it needs rewriting first.

### Roles, upgrades and pausing

| Role     | Who                                                                                                                     | Can                                                                                                                          | Cannot                                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin    | One Squads multisig: 2 of 3 signers, each a different person on a hardware key, with a 48-hour timelock on every action | Upgrade the program; change the relayer account and the guardian; propose a treasury; withdraw fees to the treasury; unpause | Act without the timelock; make a treasury live without its owner's signature; send fees anywhere but the treasury; go past the limits in the code |
| Guardian | A 1-of-N Squads multisig of on-call engineers                                                                           | Pause trades                                                                                                                 | Anything else: unpause, change a setting, move funds                                                                                              |

No server key has any power over the program or its vault. The only server key that ever holds
money is the payout wallet, and only what the admin withdrew to it (see Referral payouts).

- **Hard limits in code, not config:**
  - `MAX_FEE_RATE = 10_000` (1%), in hundredths of a basis point so a friend's 37.5 bps is exact;
  - the allowlist of programs between open and close;
  - the trade-instruction layout.

  Changing any of them is an upgrade, so it goes through the timelock.

- **Pausing affects new trades only.** It never touches users' funds, because the program
  holds none.
  - While the router is paused, the API builds trades on the legacy path (today's `composeSponsored`),
    so users keep trading. That path therefore stays in the code for good, as the emergency fallback.
  - Only the admin unpauses, so a stolen guardian key cannot undo a pause made during an incident.
    An unpause takes 48 hours, and trading carries on through the fallback meanwhile.
- **Jupiter changing its program ID** means an upgrade. That is fine with 48 hours' notice, since
  Jupiter announces migrations.
- **Signer rules** (lessons from Drift, April 2026, and Radiant, October 2024):
  - hardware keys on dedicated devices, and each signer a different person;
  - every proposal decoded on a second device before signing;
  - never sign a transaction that uses a durable nonce, and alert when any signer creates one;
  - rotate a signer when they leave.

### Sizes and limits

- **Instruction data grows** by about 45 bytes over the size test, because of `network_fee`,
  `gross_in` and `affiliate`, plus one more account index for `stock_mint`. Expect about 200–230
  bytes of overhead. The largest capped $10k route in the test (1,105 bytes) would come to about
  1,150, still under the limit.
- **Route size:**
  - When the router is configured, every quote asks Jupiter for `maxAccounts=40`. In the size test
    that kept every route under the limit for at most about 1 bp of price, and it avoids a second
    quote while the user waits.
  - If a routed transaction still does not fit, build the legacy path.
- **Lookup table:** one Mercury table holds `Config`, the fee vault, the relayer's USDC account, the
  event authority, the instructions sysvar, USDC, both token programs and the ATA program. Program
  IDs that are invoked cannot come from a lookup table, so `mercury_router` and Jupiter stay as
  full keys.
- **Version-1 transactions:** any reader must request `maxSupportedTransactionVersion` high enough
  to read them. Mercury's reader uses 255.

## Off-chain changes

| Where                                           | Change                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `programs/router/` (new)                        | The Anchor program, built with `cargo build-sbf` in CI, with verifiable builds for the audit                                                                                                                                                                                                                                   |
| `services/api/src/router/` (new)                | Instruction builders, the `TradeFilled` decoder, the PDAs, the routed fields for an order, and the router's deps from config. In the API, not `packages/chain`, which has no `@solana/kit` dependency                                                                                                                          |
| `packages/chain/src/solana/rpc.ts`              | `TransactionDetail.innerInstructions`: the unparsed inner instructions, where `emit_cpi!` events live                                                                                                                                                                                                                          |
| `packages/chain/src/jupiter/lite.ts`            | `maxAccounts` on the quote                                                                                                                                                                                                                                                                                                     |
| `services/api/src/relay/build.ts`               | The routed path: compute budget, `open_trade`, Jupiter's setup, swap and cleanup, then `close_trade`, through the existing `composeSponsored` with no charge instruction. Over 1,232 bytes, or with the router unset, the legacy path                                                                                          |
| `services/api/src/relay/validate.ts`            | No change. The relayer co-signs only a message it remembered building, which already binds the router pair and its fees                                                                                                                                                                                                        |
| `services/api/src/orders/fill.ts`, `confirm.ts` | A fill read from `TradeFilled`, which the route and the job share. Balance-diff reading stays for legacy orders                                                                                                                                                                                                                |
| New job `router-fills`                          | Every five seconds, read the program's newest 50 signatures, fetch each transaction, and settle any order still open by `order_id`. Settling is a conditional claim, so racing the app's confirm writes nothing twice. Confirm becomes a fast path, no longer the only path. A websocket or webhook can replace the poll later |
| `order.mercury_fee_usd`, `fee_usd`              | Written from the event                                                                                                                                                                                                                                                                                                         |
| Referral payouts                                | A monthly job: work out what each referrer is owed from #97's tables, publish the total for the multisig, pay each referrer from the payout wallet, and record a `referral_payout` ledger                                                                                                                                      |
| Treasury                                        | Monthly withdrawals go through Squads by hand, to `Config.treasury`, which the admin sets: the payout wallet, or the Squads vault to keep fees cold. No server key can withdraw from the router or change where withdrawals go                                                                                                 |
| Docs                                            | An ADR: "Trades go through Mercury's router"                                                                                                                                                                                                                                                                                   |

## Security

| Threat                                                                                 | Answer                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A user trades around the router to skip the fee                                        | Allowed. Then it isn't a Mercury order. The relayer only sponsors router-paired builds it made itself                                                                                                                                                                            |
| A server bug charges too much                                                          | The hard cap on Mercury's fee in code, and `spent ≤ gross_in` on buys. The network fee has no cap in the program: the server sets it, the user sees it on the ticket before signing, and the relayer co-signs only builds the server made                                        |
| An instruction slipped between open and close (to shrink a sell's fee, or move tokens) | Allowlist: only Jupiter, ATA creation and compute budget may run between them                                                                                                                                                                                                    |
| A forged or replayed pairing                                                           | Pairing by `order_id` and the same accounts; one pair per transaction; the fill's signature is unique in the database                                                                                                                                                            |
| Spoofed token accounts                                                                 | Owner, mint and token-program checks on every account                                                                                                                                                                                                                            |
| Fake events                                                                            | Trust only inner instructions from `mercury_router` signed by its event authority                                                                                                                                                                                                |
| A stolen payout-wallet key                                                             | It holds only what the admin withdrew to it, normally one month's referral total, and only until the run ends; the run leaves it at zero; an alert fires on any outflow that isn't a payout. Withdrawals are admin-only, so the thief cannot pull more from the vault            |
| A treasury nobody can spend from (a typo, a copied address, a lost key)                | A proposed treasury goes live only when its owner signs `accept_treasury`                                                                                                                                                                                                        |
| A compromised admin                                                                    | Squads threshold; a 48-hour timelock on every action; an alert on durable nonces; a guardian that can pause trades at once                                                                                                                                                       |
| A stolen guardian key                                                                  | It can only pause. Trades carry on through the legacy path, and only the admin can unpause                                                                                                                                                                                       |
| Token-2022 extensions on xStocks                                                       | The mints carry a transfer-hook slot with no program today. If Backed sets one, Jupiter calls it inside its own instruction, so the allowlist is unaffected, but compute rises. A transfer-fee extension would make `got` net of that fee, which is still what the user received |
| Rounding                                                                               | Fees round down. Every limit compares integers                                                                                                                                                                                                                                   |

**Audit scope.** About 500–700 lines of Rust: the router and the vault. Plan:

- one audit on a frozen commit;
- invariant fuzzing (Trident) for pairing and the fee caps;
- a bug bounty live at launch.

## Testing

- **Rust unit tests:** fee arithmetic at the caps, the multiplier timestamp rule, token-account
  parsing.
- **Program tests on LiteSVM, with a mock swap at Jupiter's address:** the router never calls
  Jupiter, so the tests need a program there that moves tokens by amounts they choose, not
  Jupiter's own. The mints and token accounts are built in the test with mainnet's layouts (SPYx's
  real multiplier change included). CI needs no network. Real Jupiter routes are covered by the
  size test already run and by the mainnet canary.
  - The spike's happy paths and its six attacks.
  - Plus: two pairs in one transaction; an open after a close; the wrong mint on `user_out`; another
    user's token account; the wrong `relayer_usdc`; paused; a withdrawal
    to anywhere but the treasury; a treasury proposed by anyone but the admin; a treasury accepted by
    anyone but its owner; a treasury that is not a USDC account; a withdrawal to a proposed treasury
    before it is accepted; the guardian trying anything but a pause; an unpause by
    anyone but the admin.
- **API tests:**
  - routed compose stays within 1,232 bytes, with the fallback;
  - validation;
  - event decoding against recorded transactions;
  - fills from events;
  - `router-fills` is idempotent with confirm.
- **Mainnet canary:** small trades from internal wallets on SPYx, NVDAx and TSLAx. This covers the
  order-book and market-maker routes the fork could not.

## Rollout

1. Audit, bounty, verifiable build.
2. Deploy to mainnet paused. Set up the Squads admin with its timelock, the guardian and the lookup
   table.
3. Unpause for internal wallets only (a server flag) and run the canary.
4. Ten percent of users, then everyone. The legacy path stays for good: as the fallback while the
   router is paused, and for any route that does not fit.
5. Start the monthly referral payouts once counsel and #97 allow.

**Rough effort:** the program, two to three weeks for one engineer; the off-chain changes and the
`router-fills` job, one to two weeks; plus the audit's lead time. The program is about 141 KB in the
spike, with about 0.72 SOL of rent today. Expect a little more with the vault and room to upgrade.

## Later, not in this design

- **Integrator fees**, so another app can route through Mercury and add its own fee to its own token
  account. The `affiliate` field and the event version leave room for it.
- **Splitting the vault by user,** if a single vault's write lock ever limits throughput.
- **Ultra and market-maker fills,** recorded by reading the transaction, if Mercury moves to Ultra.
- **Recurring buys and limit orders** built on the router (the next programs on the list).
- **On-chain referral claims,** if payouts ever need to be publicly checkable, or partners need to
  pull their own share.

## Considered and not chosen

- **Calling Jupiter from the program.** Solana allows four nested calls: Mercury, Jupiter, a pool,
  the token program. There is no room.
- **Wrapping Jupiter Ultra.** Ultra's market-maker quotes are signed by the maker, and added
  instructions break the signature.
- **Withdrawing only to the admin's own vault,** the first design. It left no treasury setting to
  attack, but every payout took two transfers. Replaced by the two-step treasury.
- **A sweep anyone can call,** vault to treasury. It would spare the multisig a monthly signature,
  but with a hot treasury, a stolen key for that wallet could pull the whole vault into it, not one
  month's amount.
- **A distributor role and on-chain referral claims** (Merkle roots, claim records, a claim screen).
  More program and more audit for little gain; payouts are off-chain.
- **A cap on the network fee in the program.** Left to the relayer's server; the ticket shows it.
- **A share of trading fees to inviters.** Dropped after the referral research; see Referral
  payouts.

## Decided

- **Set while planning:** the fee is a `u32` rate in hundredths of a basis point plus an explicit
  `buy_fee`; `initialize` is signed by the upgrade authority and leaves the router paused; quotes
  always use `maxAccounts=40` with the router on; `router-fills` polls; the client lives in the API.
- **Treasury:** a setting, not hard-wired to the admin's own vault, so fees can go straight to a hot
  payout wallet (22 October 2026). The admin proposes it and its owner accepts it. Withdrawals stay
  admin-only.
- **Admin:** a 2-of-3 Squads multisig, each signer a different person on a hardware key. Losing two
  keys would freeze upgrades and the vault, so keep a recovery plan for signers.
- **Network fee:** no cap in the program. The relayer's server sets it and the ticket shows it.
- **Sell fee wording:** "Mercury fee (0.5% of proceeds) ≈ $X".

## Open questions

1. Counsel: is a flat, capped, one-off reward per qualified friend allowed in the launch markets, and
   is the friend's 90-day discount acceptable? This gates referral payouts. The fee share was
   dropped after the research.
2. Which audit firm, and on what timeline? Being looked into while the program is built.
