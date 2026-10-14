# ADR 0014 · Relay for funding, and a connector that is not Privy's

**Status:** proposed · 13 October 2026

## Context

[ADR 0007](0007-wallet-funding.md) decided to turn on every funding path Privy
offers and build none of them. Its decision 1 — a universal deposit address
that accepts any asset from any chain — was called _"the important one"_, and it
is the one that was never built. What shipped instead was decision 3's second
half: a connected Solana wallet pushing USDC in, with the transaction built in
the browser and no server leg at all.

So today a person can fund a Mercury account with USDC on Solana, which is the
asset they are least likely to be holding when they arrive.

ADR 0007's own 12 October amendment then undermined its decision 1. Privy takes
up to 0.25% of any swap, the underlying DEX fee sits on top of that, and crypto
deposits _require app-pays gas sponsorship charged to our gas credits_ — so the
destination gas for every deposit would be ours. The hook involved has been
renamed three times and both current spellings are `@experimental`.

Separately, we want a server-side record of every deposit from the moment it is
quoted. The browser-built transfer cannot provide one, and the existing relay
stack cannot route a transaction from a wallet that is not the account:
`POST /v1/transactions/send` refuses any fee payer that is neither the embedded
wallet nor the relayer, which a funding wallet never is.

## Decision

**Relay is the funding provider. Reown AppKit is the wallet connector. Our
server mints every quote.**

1. **A Relay deposit address per origin route**, with the user's Privy wallet as
   `recipient`. No wallet connection; works from an exchange, a hardware wallet,
   or Bitcoin. This replaces decision 1 of ADR 0007.
2. **A connected wallet for the VMs we have wired**, through `@reown/appkit` for
   connection and `@relayprotocol/*` wallet adapters for execution — not
   Privy's connector. Solana first, then EVM.
3. **Every quote is minted server-side** and stored as a `funding_intent` row
   before anything is shown to the user. The client executes the quote we
   minted; it never asks Relay for its own.
4. **Nobody's gas is sponsored.** The funder pays on every path.

Settled with it, on 13 October: every chain Relay supports is offered rather
than a curated few, so the picker searches rather than lists. `appFees` is zero.
The minimum deposit is $10, which keeps the destination account rent on a first
deposit — $0.188, measured — under 2% of it. Refund and recovery addresses are
**derived from private keys held by a separate service**, one pair per VM
family, rather than configured as addresses — see
[ADR 0015](0015-treasury-service.md). The loop that returns a failed deposit to
its user is deferred.

Design: [`docs/superpowers/specs/2026-10-13-any-token-funding-design.md`](../superpowers/specs/2026-10-13-any-token-funding-design.md).

## Reasoning

**Relay rather than Privy, on measured numbers.** A live quote on 13 October —
0.01 ETH on Base to USDC on Solana — came back at $25.27 in, $25.19 out: 0.34%
all-in, with a one-second estimate across 61 chains. Comparable to Privy for the
user and strictly cheaper for us, because none of it is charged to us. Relay also
hands back a `requestId` and a signed webhook, which is the record we wanted and
the thing Privy's path does not offer.

**Server-minted quotes are a correctness requirement, not tidiness.**
`recipient` decides whose account the money lands in, `appFees` decides whether
we are paid, and the origin pair decides what the user spends. A client-minted
quote puts all three under the control of the page, and the server would be
recording a deposit it did not define. It is also where the API key belongs —
`/quote/v2` requires one as of 2 October 2026.

**The deposit address goes first because Bitcoin forces it.** Privy's
`extended-chains` entrypoint exports only `useCreateWallet`, `useExportWallet`
and `useSignRawHash`: embedded wallets, with no external Bitcoin connection at
any version we hold. A connected-wallet Bitcoin path means a PSBT and a wallet
stack of its own, and it would still miss the BTC held on exchanges and hardware
devices — which is most of it. A deposit address needs no connector for any
chain, so it is both the Bitcoin answer and the floor under every chain we have
not wired yet.

**Not Privy's connector, for a reason that predates Relay.** Privy's
`useWallets()` returns one list holding both the embedded account wallet and
every connected funding wallet, so `apps/web/src/auth/embedded.ts` has to tell
them apart by sniffing `isPrivyWallet` off a prototype. Its own docstring
concedes the check is _"proportionate, not airtight"_, and `embeddedOf` fails
closed when more than one wallet claims it — so an unexpected extension can take
the account's signing offline. With funding wallets arriving from a separate
connector the two sets are disjoint by construction, and that whole file is
deleted. Privy's EVM connectors also initialise at provider construction, which
is why they are stubbed out of the bundle in `vite.config.ts` today.

**No sponsorship, because this is the one case that never needed it.** A wallet
holding arbitrary tokens is a funded on-chain account. The no-SOL cliff that
`relay/transfer.ts` exists to solve is specific to a Privy wallet that has only
ever held USDC, and it does not apply to anyone funding from outside.

## Does this contradict ADR 0003?

No. [ADR 0003](0003-custody.md) removed the external wallet as _the account_.
The embedded wallet is still the account, `recipient` on every Relay quote is
that wallet, and a connected wallet signs one deposit and leaves. We hold no
key, and no key is held for us.

The rule ADR 0007's amendment wrote down — that any future decision letting a
wallet connect inherits the requirement to name the signing wallet rather than
index for it — is satisfied more strongly here than before: the funding
connector and the account are different systems, so there is no list to index
into.

## Does this contradict ADR 0001?

No. No fiat rail, no fiat balance, no money licensing. Relay is a crypto-to-crypto
router and the user's funds pass through its depository, never ours. ADR 0007
decision 2's card onramp is untouched and stays Privy's.

## Consequences

**Good.** Someone holding anything, anywhere, can fund an account — including
from an exchange, which is where most people's money actually sits. Every
deposit has a server-side row from the moment it is quoted, so the activity
feed can say what the money came from instead of "Received cash". `embedded.ts`
and its prototype sniff are deleted. Nothing is charged to our gas credits.

**Bad, and this is the real cost.** `refundTo` cannot be the user's address —
a deposit withdrawn from an exchange has the exchange's hot wallet as its
sender, so an automatic refund aimed at the depositor is gone. We therefore hold
a refund address per VM family, plus a `recoveryAddress`, and somebody has to
return failed deposits to the right user.

The addresses are derived rather than configured, which removes the worst
version of this — a `refundTo` we cannot spend from — by construction rather
than by care. ADR 0015 covers that. What stays deferred, knowingly, is
settling: `funding_intent` captures what a refund needs to be attributed to a
user — origin, amount, failure reason — so the debt is recorded rather than
lost, but it still has to be paid before this reaches people who are not us. A
refund sitting in a company wallet with nobody responsible for it is somebody's
money that we have and they do not, and no amount of captured data fixes that.

**Also bad.** Two wallet systems in one app, which needs a rule stated and
enforced: Privy is the account, AppKit is never the account. A bundle cost for
AppKit, mitigated by loading it behind the Add cash route and not in the entry
bundle. Pinned exact versions, because the Relay adapters sit at majors 21, 22
and 33 against an SDK at 8 and move independently. And a webhook endpoint whose
enablement is a request to Relay rather than a setting we flip.

**Work required.** Four phases, roughly nine and a half days, each shippable on
its own; phase 1 alone delivers any token from any chain with no signing code.
Details in the spec.

---

## Amendment · 14 October 2026

Three decisions, taken together, which is why they are one amendment: each
makes the next cheap.

### Connected wallets only. No deposit addresses.

Decision 1 above is withdrawn. A deposit comes from a wallet somebody
connects, signs with, and leaves; there is no address to send to.

**What this gives up** is real and worth stating plainly: money on an exchange
or in a hardware wallet can no longer come in, because neither can connect to a
web page. For Bitcoin that is most of it, and Bitcoin is therefore not offered
at all — Relay would answer a connected-wallet BTC deposit with a PSBT, which
nothing here signs, so `/v1/money/fund/sources` filters it out rather than
showing a row that cannot be taken.

**What it buys** is the whole of [ADR 0015](0015-treasury-service.md).
`refundTo` becomes the wallet that just signed: an address the user
demonstrably holds the key for, correct by construction, in its own chain's
format because that is the chain they connected on. No treasury, no three
keys, no refund address per VM family, and nobody holding somebody else's
money waiting for a person to return it. The card and bank rails remain the
answer for people with no wallet, and they are still announced rather than
built.

### One connector, and it is not Privy's.

Funding wallets come from Reown AppKit — EVM, Solana, and a phone browser over
WalletConnect. Privy remains the account and nothing else.

The reason is in `apps/web/src/auth/embedded.ts`: Privy's `useWallets()`
returned the account wallet and every connected funding wallet in one list, so
telling them apart meant sniffing `isPrivyWallet` off a prototype — a check
whose own docstring conceded it was _"proportionate, not airtight"_, and which
failed closed by taking account signing offline when two wallets claimed it.
Two connectors make the sets disjoint, and that file now does one thing.

It costs a duplicate Solana stack: AppKit's Solana adapter brings
`@solana/web3.js`, which this app had replaced with `@solana/kit`. Measured on
14 October, wired at the app root, AppKit took first-load JS from 2,524 kB to
3,774 kB — a 50% increase for every visitor before the sign-in screen, which
is worse than the Privy EVM connectors that `no-evm-connectors.ts` stubbed out
of the bundle for being _"about a fifth of the first download"_. Behind
`React.lazy` it costs **5 kB** on first load and 1,246 kB to somebody who opens
the deposit panel. That split is load-bearing and fragile: a single static
import of `wallet/appkit` from the eager graph silently puts it all back, and
only a bundle measurement would notice.

### Relay settles every deposit. The browser only reports.

`POST /v1/money/fund/submitted` records what the browser executed and moves a
deposit `waiting → submitted`. It cannot write a terminal status.

This replaced an endpoint that could, and the reason is a flaw worth recording
rather than quietly fixing. The old `/fund/confirm` verified that a Solana
signature had landed — but never that the signature had anything to do with
the intent: not the amount, not the recipient, not the mint. Any landed
signature marked any of the caller's deposits successful. No money was at risk,
because balances and the feed come from `wallet-events` reading the chain. The
record was, and the record is what this feature exists for. A deposit table a
client can write `success` into is not tracking.

Only Relay's HMAC-signed webhook settles now, matched on a request id — which
is safe precisely because deposit addresses are gone: Relay reissues a quote on
over- or underpayment, and with the amount fixed by a signature there is
nothing to reissue. `funding/poll.ts` asks Relay directly for anything
untouched for ninety seconds, so the same authority is reachable over a second
transport and a webhook that was never enabled cannot leave a deposit reading
`submitted` for ever with the money already spent.

Everything in the quote path is one shape for every chain: the server composes
nothing, `execute()` runs whatever steps the quote holds, and
`funding/compose.ts` is deleted.
