# ADR 0018 · Trades go through Mercury's router

**Status:** proposed · 22 October 2026. Designed and planned, not built. It becomes accepted when the
program ships.

The design is in [the spec](../superpowers/specs/2026-10-21-trade-router-design.md), and the build
in [the plan](../superpowers/plans/2026-10-21-trade-router.md). 0017 is held by the referral work.

## Context

Four things about how a trade works today:

- **A fill exists only if the app confirms it.** If the app never calls confirm, the order sits in
  `executing` for ten minutes. After that, position-sync reads the change as a transfer, and the lot
  has no cost basis.
- **Fills are inferred.** `orders/fill.ts` works the fill out from balances before and after, and
  has to separate the relayer's USDC leg from the user's.
- **Fees sit in a hot wallet.** The network repayment and Mercury's 0.5% travel as one USDC transfer
  to the relayer's account. "Sweep the fees to a treasury" has been open in
  [revenue-todo](../revenue-todo.md) since the fee shipped.
- **Nothing on chain says a trade was Mercury's,** so volume and fees are invisible to DefiLlama,
  Dune and ecosystem dashboards.

## Decision

**One Anchor program, `mercury_router`, puts `open_trade` and `close_trade` around Jupiter's
instructions in the same transaction.** It never calls Jupiter and never holds a user's funds.

- **The trade.** Open checks the balances the server claims, that this order's close follows, and
  that only Jupiter, ATA creation and compute budget run in between. Close measures what moved,
  takes the fees, and emits `TradeFilled` through a self-CPI. A buy's fees come out at open, a
  sell's out of what arrived at close.
- **The fees.** The network fee goes to the relayer's USDC account; the program sets no cap on it,
  so the relayer's server does. Mercury's fee goes to a vault the program owns, capped in code at
  1%. The rate is in hundredths of a basis point, so a friend's discounted 37.5 bps is exact.
- **The API** builds routed trades when `ROUTER_PROGRAM_ID` is set. It builds today's transaction
  when the router is unset or paused, or when a route would not fit in 1,232 bytes. That path stays
  for good. Quotes ask Jupiter for at most 40 accounts while the router is on.
- **Fills** come from the event. A `router-fills` job reads the program's newest transactions every
  five seconds and settles any order still open, so confirm becomes the fast path rather than the
  only one.

### Roles

| Role     | Who                                                                                                 | Can                                                                                                         | Cannot                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Admin    | A 2-of-3 Squads multisig, each signer a different person on a hardware key, with a 48-hour timelock | Upgrade; change the relayer account and the guardian; propose a treasury; withdraw to the treasury; unpause | Act without the timelock; withdraw anywhere but the treasury; go past the limits in code |
| Guardian | A 1-of-N Squads multisig of on-call engineers                                                       | Pause trades                                                                                                | Anything else                                                                            |

No server key has any power over the program or its vault. Only the program's upgrade authority can
initialise it, and it starts paused.

### The treasury

Fees leave the vault only for **the treasury**, a USDC account named in the program's config.

- **The admin proposes it** (`set_treasury`, so through the timelock). **Its owner accepts it**
  (`accept_treasury`, signed by the key that owns that USDC account). Until then the old treasury
  stays live. [ADR 0015](0015-treasury-service.md) learned that a configured address can be one
  nobody holds the key for, and nothing notices until money lands there. A signature from the
  owner proves somebody does hold it.
- **It can be a hot wallet.** The payout wallet's USDC account works, so a month's money lands where
  it is spent. The admin picks each withdrawal's amount, so a hot treasury only ever holds what was
  sent to it; the rest stays in the vault. To keep fees cold, make the treasury the Squads vault's
  own USDC account.
- **Withdrawals are admin-only,** so each one waits out the timelock.

Referral rewards are paid off-chain from the treasury each month. The program knows nothing about
them beyond echoing an `affiliate` code in the event.

## Alternatives considered

- **Call Jupiter from the program (CPI).** Runs into Solana's limit of four nested calls: Mercury,
  Jupiter, a pool, the token program.
- **Wrap Jupiter Ultra.** Ultra's market-maker quotes are signed by the maker, and adding
  instructions breaks the signature. Mercury stays on `/swap/v1` pool routes.
- **Withdraw only to the admin's own vault.** The first design: no treasury setting to attack. It
  forced every payout through two transfers, Squads vault then payout wallet. Replaced by a
  treasury the admin proposes and its owner accepts.
- **A sweep anyone can call,** vault to treasury, with the destination fixed. It would let a server
  job move fees without the multisig signing each month. Not chosen: with a hot treasury, whoever
  steals that wallet's key could pull the whole vault into it, not just one month's amount.
- **A third role, a distributor, paying referrals on chain** (Merkle roots, claim records, a claim
  screen). More program, more audit, for little gain. Payouts stay off-chain.
- **A cap on the network fee in the program.** The relayer's server sets it, the ticket shows it
  before the user signs, and the relayer co-signs only builds it made.
- **A share of trading fees to inviters.** Dropped after the
  [referral research](../research/2026-10-21-referral-fee-sharing.md): xStocks are securities
  almost everywhere, and paying unlicensed users a share of fees on securities trades is the classic
  sign of unlicensed brokerage. Poland names it as prohibited. Instead, a flat, capped reward per
  qualified friend, pending counsel.

## Consequences

**Good.** Fills are stated, not inferred. A fill whose confirm never arrives is recorded within
seconds. Fees leave the relayer's hot wallet. Mercury's volume is attributable on chain. The
`affiliate` field and the event's version number leave room for integrator fees later.

**Bad.** Mercury's first program: one more thing to audit, monitor and upgrade. Routes are capped at
40 accounts, which cost at most about 1 bp of price in the size test. Moving to Ultra later would
mean reading those fills from the transaction instead of the event. The admin must keep two of three
signers able to sign, or upgrades and the vault freeze.

**Open.** Which audit firm, and when. Whether counsel approves the flat referral reward, which gates
payouts but not the router.

## Deploying

1. `cargo build-sbf` from `programs/`; verify the build (`solana-verify`) for the audit commit.
2. Deploy with the program keypair, a deployer key as upgrade authority.
3. Create the fee vault: the USDC associated token account of the `["vault"]` PDA.
4. `initialize(admin = Squads vault, guardian = guardian multisig, relayer_usdc, treasury)`, signed
   by the deployer. The treasury is the payout wallet's USDC account, or the Squads vault's to start
   cold.
5. The treasury's owner signs `accept_treasury`. Until it does, nothing can be withdrawn.
6. Move the upgrade authority to the Squads vault: `solana program set-upgrade-authority`.
7. Create the lookup table and extend it with config, fee vault, relayer USDC, event authority, the
   instructions sysvar, USDC, Token, Token-2022 and the ATA program: `solana address-lookup-table
create`, then `extend`.
8. Set `ROUTER_PROGRAM_ID` and `ROUTER_LOOKUP_TABLE` on the API. Trades stay on the old path while
   the router is paused.
9. Unpause through Squads (48 hours). Run the canary: small SPYx, NVDAx and TSLAx buys and sells
   from internal wallets, including a TSLAx route through Manifest.
