# ADR 0015 · A separate service holds the keys, and derives every address

**Status:** proposed · 13 October 2026

## Context

[ADR 0014](0014-relay-funding.md) accepted an obligation it could not discharge:
`refundTo` must be an address we control, per VM family, because a deposit
withdrawn from an exchange has the exchange's hot wallet as its sender and an
automatic refund aimed at "the depositor" is gone. Somebody then has to return
that money to the right user.

The spec configured those as **addresses** in the API's environment, with the
process deferred. Two problems with that, and the first is the serious one.

**A configured address can be an address we do not hold the key for.** Nothing
checks. A typo, a copied value from the wrong wallet, a rotated key whose
address was never updated — each produces a `refundTo` that Relay will honour
and that nobody can spend from. The failure is silent at configuration time and
discovered only when a refund arrives somewhere unrecoverable, which is the
worst possible moment and involves somebody else's money.

**And settling a user means sending funds.** The API has never done that. It
holds one hot key today — `relay/signer.ts`, which co-signs sponsored
transactions it composed itself and is constrained by `relay/builds.ts` to
signing nothing else. A key that can send arbitrary value to an arbitrary
recipient is a different kind of thing, and putting three of them (EVM, Solana,
Bitcoin) inside the process that also serves public HTTP widens the blast radius
of every bug in that process to include the refund float.

## Decision

**A separate service, `services/treasury`, holds private keys and derives every
address from them. No address is ever configured anywhere.**

1. **Keys in, addresses out.** The service reads a private key per VM family from
   its own environment and derives the address. The API asks it for addresses
   over an internal endpoint and never sees a key.
2. **No address is configuration.** `RELAY_REFUND_ADDRESS_*` and
   `RELAY_RECOVERY_ADDRESS_*` are deleted before they ship. An address that is
   derived cannot disagree with the key that has to spend it.
3. **Receiving is passive; settling is deferred.** An address receives whether
   or not anything is running, so v1 of this service holds keys, derives
   addresses, and reports them. Sending — returning a refund to the user it
   belongs to — is a later decision with its own design.
4. **Not internet-reachable.** No public ingress. The API reaches it on the
   internal network with a shared secret, and no route it will ever have returns
   a key.
5. **Key parsing and derivation live in `packages/keys`**, a node-only package
   that `apps/web` must never import.

## Reasoning

**Derivation is the whole point, and it is cheap.** Deriving an address from a
key is a pure function — a public key and a hash, per curve. It costs almost
nothing and it removes an entire class of failure by construction rather than by
vigilance. This is the same argument `relay/builds.ts` already makes about
remembering a message instead of parsing one back: make the question exact
instead of checking it carefully.

**v1 is small because receiving needs nothing.** No UTXO tracking, no fee
estimation, no transaction building. Three key formats, three derivations, one
authenticated `GET /addresses`. The hard parts — Bitcoin UTXO selection and fee
estimation especially — arrive with settling, and settling is deferred.

**`packages/keys` rather than `packages/chain`.** `packages/chain` is imported by
`apps/web`. Putting secp256k1 and a Bitcoin signer there risks shipping
key-derivation code to a browser, and at minimum pays for it in the bundle.
A node-only package cannot be imported into the web app by accident if nothing
in the web app's dependency graph names it.

**Bitcoin addresses are p2wpkh.** Relay's own native BTC currency identifier in
`GET /chains` is bech32 v0 (`bc1q…`), which is the format their tooling speaks.
Taproot would also work and buys nothing here. Recorded because the address type
is not an implementation detail: Relay's documentation notes Bitcoin addresses
are case-sensitive, and a refund sent to the wrong format is not recoverable.

## What this does not decide

**How a user is settled.** When a refund arrives, who decides which user it
belongs to, who approves the payment back, and whether that is automatic. The
data to answer the first part is captured — `funding_intent` names the user, the
origin, the amount and the failure — but the mechanism is a separate decision
and should be a separate ADR. Until it exists, a refund is money we hold and the
user does not, and that remains a known, written-down debt rather than a solved
problem.

**Whether the existing relayer key moves here.** It should, eventually: one
service that signs is better than two processes that each hold a key. But
`relay/signer.ts` and `relay/builds.ts` are deliberately coupled — the code says
so: _"a key that will pay without a way to know what it is paying for is the one
combination that must not be configurable"_ — and separating them across a
network boundary means the build record has to move too. That is a refactor of
working, shipped sponsorship, and it is not this decision.

## Consequences

**Good.** A `refundTo` we cannot spend from becomes impossible rather than
unlikely. The API holds no key that can move the refund float, so a bug in a
public HTTP handler cannot reach it. Settling, when it arrives, lands behind a
boundary that already exists instead of being bolted onto the API.

**Bad.** Another deployable: build, secrets, health check, monitoring. A boot
dependency for the funding routes — handled the way `routes/send.ts` already
handles a missing relayer, by not mounting the feature rather than failing to
start. And a service whose entire purpose is to hold spendable keys is the
highest-value target in the system; it earns its own review when settling gives
it the ability to send.

**Work required.** `packages/keys` with three derivations and their tests, and a
`services/treasury` with one authenticated route. Roughly a day and a half,
Bitcoin being most of it. It goes in ahead of phase 1's wiring task, which is
the only task that depends on it.
