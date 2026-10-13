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
sender, so an automatic refund aimed at the depositor is gone. We therefore have
to hold a refund address per VM family, plus a `recoveryAddress`, and run a
human process for returning failed deposits to the right user. That is an
operational commitment and it should be written down before launch rather than
discovered by the first failure.

**Also bad.** Two wallet systems in one app, which needs a rule stated and
enforced: Privy is the account, AppKit is never the account. A bundle cost for
AppKit, mitigated by loading it behind the Add cash route and not in the entry
bundle. Pinned exact versions, because the Relay adapters sit at majors 21, 22
and 33 against an SDK at 8 and move independently. And a webhook endpoint whose
enablement is a request to Relay rather than a setting we flip.

**Work required.** Four phases, roughly nine and a half days, each shippable on
its own; phase 1 alone delivers any token from any chain with no signing code.
Details in the spec.
