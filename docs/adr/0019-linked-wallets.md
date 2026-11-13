# ADR 0019 · Linked wallets beside the Mercury wallet

**Status:** proposed · 13 November 2026 · amends [ADR 0003](0003-custody.md)

## Context

[ADR 0003](0003-custody.md) put one wallet behind every account: Privy's embedded wallet, "and
nothing else, in version one. No Phantom, no wallet-connect, no external wallet import."

That kept the first product simple, and it still suits the people Mercury is mainly for. It
doesn't suit people who already hold xStocks, USDC or a Kamino loan in Phantom. Today they have to
sign up with email, get a second wallet, and move everything across before Mercury can show them
anything. Most won't, and those who don't never see the product.

Since ADR 0003, two things have made a second wallet cheaper than it was:

- [ADR 0014](0014-relay-funding.md) brought in Reown AppKit as a separate connector for wallets
  people already hold. It is kept apart from Privy's wallet list on purpose, and it already signs
  transactions Mercury builds.
- Every background job and every chain read is keyed by a wallet address, not a user. The `wallet`
  table already has `kind: "external"` and `is_primary`; nothing has used them yet.

## Decision

**The Mercury wallet stays the account. Someone can link up to 7 existing Solana wallets to it at
a time. Mercury shows them on web and iOS, and on web acts for them as it does for its own, with the
wallet's own signature on each action.**

1. **Sign-in does not change.** Email → Privy → the Mercury wallet is created. That wallet is
   primary, is listed first everywhere, is the only wallet iOS acts for, and is where recovery,
   notifications and compliance hang.
2. **Linking happens after sign-in, in Settings on web.** The wallet connects through AppKit and
   signs a one-time message proving the person controls it. Linked wallets are never added to
   Privy's wallet list.
3. **Linked wallets are shown on web and iOS, and acted for on web only.** iOS shows them
   read-only, with "Manage on web". An unlinked wallet is not tracked, alerted on or shown anywhere;
   a separate option also deletes its history.
4. **A linked wallet signs for itself.** Mercury builds the transaction, the linked wallet signs it
   in its own pop-up, and the relayer co-signs as fee payer, exactly as for the Mercury wallet. No
   server holds or uses a linked wallet's key.
5. **The same fees apply** to anything Mercury builds, whichever wallet signs it.
6. **A linked wallet's past is read by a separate worker,** `services/history`, with its own RPC
   key, from the history of its token accounts and its Kamino loan account. It gives purchase
   prices (exact from USDC swaps, otherwise estimated from the market price at arrival and marked
   `~`), each loan deposit with its date and price, and Earn interest. Reading history never shares
   the API's process or RPC allowance.
7. **Only what Mercury already understands is tracked:** xStocks, USDC and SOL, loans in Kamino's
   xStocks market, Glider baskets and the Earn vault. AMM and LP positions, other lending markets
   and other protocols are out until each has its own adapter.

## Why

1. **It meets existing users where their money already is.** Showing a Phantom user their own
   positions and loan health in under a minute is a better first impression than "send your funds
   to this new address".
2. **It leads to the Mercury wallet.** Moving holdings across is one action from the same screen,
   and once moved they get one-tap trading.
3. **It barely touches custody.** Mercury still never holds a key. The signing model in
   [03 Architecture](../03-architecture.md) already names "Privy or Phantom" as the client that
   signs.

## What we give up

- **One wallet per account.** Positions, lots, orders, activity, loan records and snapshots gain a
  wallet dimension, and every route has to know which wallet it is acting for. That is the bulk of
  the work.
- **One-tap everywhere.** Every action from a linked wallet opens that wallet's confirmation. Users
  of these wallets expect that.
- **Automation Mercury signs itself.** Anything that would need Mercury to sign for the user
  (recurring buys through Privy delegated actions, once built) cannot run on a linked wallet.
  Glider's daily basket rebalancing still works, because the owner authorizes it once with a signed
  message and Glider runs it.
- **RPC budget.** Each linked wallet is another address every job polls. Linking is capped at 7
  active wallets per person, and linked wallets are polled by how recently they were viewed (hourly once nobody has
  looked for a week), except their loans, which are always checked every 5 minutes.
- **Fee capture.** A linked wallet can trade the same tokens elsewhere at any time. Mercury only
  earns on what it builds.

## Consequences

**Good.** Existing Solana users can try Mercury without moving funds first, and see loan health and
liquidation warnings for positions they already have.

**Bad.** Wallets Mercury doesn't control come with obligations Mercury doesn't yet meet: sanctions
screening at link time, and a country check that covers them. Both are pre-launch items already
(`TODO.md`, "Before a public launch"), and this widens them.

The design is in
[2026-11-13 linked wallets](../superpowers/specs/2026-11-13-linked-wallets-design.md).
