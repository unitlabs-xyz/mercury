# ADR 0003 · Privy embedded wallets only

**Status:** accepted · 19 September 2026 · supersedes the provisional version

## Context
The product has to move money on a schedule, and it has to onboard people who have never held a
wallet. Two candidates: connect an existing wallet like Phantom, or create an embedded wallet.

## Decision
**Privy embedded wallets, and nothing else, in version one.** No Phantom, no wallet-connect, no
external wallet import. A user signs in with email or a social account and a Solana wallet is
created for them.

Recurring investing and basket rebalancing use **Privy delegated actions**. The user explicitly
delegates their wallet for server-side signing, scoped by policy, revocable at any time.

## How the keys actually work
Privy splits the private key with Shamir's Secret Sharing across trusted parties and uses a
Trusted Execution Environment to reconstitute it only for an authenticated request. Our server
never possesses a key share that is useful on its own.

## Precision about what the server can do
The earlier draft of this record said "the server never signs". That is now too blunt to be
useful. The accurate statement is:

- The server **never holds a private key**.
- For ordinary buys and sells, the **client** requests the signature. The server only builds the
  unsigned transaction.
- For delegated actions the user has explicitly granted, the server asks Privy to sign, within a
  policy that names the programs and mints it may touch, a per-run value cap and an expiry.
- Delegation is opt-in per feature, visible in settings, and revocable in one tap.

## Consequences
**Good.** A person with no crypto can be holding shares in two minutes. Recurring investing,
basket rebalancing and in-kind vault flows all become possible unattended. One wallet path means
one set of edge cases.

**Bad.** Someone who already has Phantom cannot use their own wallet, which will annoy a share of
crypto-native judges. Reversible later: Privy supports external wallets and adding them is
additive.

**New problem this creates.** A fresh embedded wallet is empty, and we have no fiat on-ramp. See
the funding question in [09 Open questions](../09-open-questions.md).

## Confirmed against Privy's documentation, 20 September 2026
The design bundle's connect screen offered Phantom, Solflare and Backpack beneath the email
field, which contradicted this record. Before removing them we checked what Privy actually
supports, because the answer changes the architecture rather than the markup.

- **An external wallet can be the identity.** Privy supports Solana sign-in, so Phantom could log
  someone in without an email.
- **Both can coexist.** `createOnLogin: 'all-users'` creates an embedded wallet even for a user
  who arrived with one of their own.
- **But the embedded wallet is a separate address.** Privy never sees the external private key, so
  nothing is derived from it. The result is one account with two wallets, not one wallet made
  portable.
- **Offline actions are an embedded-wallet capability.** Limit orders, subscriptions and recurring
  transactions all sit under Privy's user-wallet signers. A connected Phantom cannot sign while
  its owner is away.
- **Two smaller traps.** Automatic wallet creation does not fire for whitelabel login interfaces,
  which ours is, so wallets are created explicitly. And `connectOrCreateWallet` is EVM-only today,
  so it is unavailable to us regardless.

The deciding point is the third and fourth together. Supporting both would make recurring
investing conditional on how somebody signed up, and split one portfolio across two addresses at
exactly the moment we claim to add holdings up correctly. The buttons are gone from the modal.

The friction this leaves — a Phantom owner funding a new address — is answered by **funding from
a connected wallet**, not by wallet login: connect Phantom only to prefill a transfer, so nobody
copies an address by hand. One signing path, one portfolio. That is additive and not scheduled
for version one.
