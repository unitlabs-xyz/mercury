# Funding from any chain, routed through us

**Status:** proposed, 13 October 2026. Written after shipping the Solana-native
connected-wallet deposit (PR #63) and finding that the path beside it — ADR
0007's "universal deposit address", the one that ADR called _the important one_
— was never actually built, and that the provider it named charges us for the
privilege.

Someone holding ETH on Base, USDT on Tron, or BTC in Xverse cannot fund a
Mercury account. They can fund it with USDC on Solana, which is the asset
they are least likely to be holding when they arrive.

This spec covers getting money in from anywhere, with a server-side record of
every deposit from the moment it is quoted. Those are one change, not two: the
record is only possible if the quote is ours, and the quote is only ours if the
server mints it.

---

## 1 · Where we actually are

Verified by reading the repo and probing `api.relay.link` on 13 October 2026.

**The deposit we have is Solana-native and has no server leg.**

PR #63 builds a USDC transfer in the browser (`apps/web/src/app/money/fund-transfer.ts`),
the connected wallet signs **and broadcasts** it, and the server learns about
it afterwards or not at all. `apps/web/src/api/fund.ts` says so plainly: _"No
server leg at all, which is the whole shape of this feature."_ That was the
right call for one asset on one chain. It does not extend.

**The relay stack cannot route a transaction from a wallet that is not the
account.** `POST /v1/transactions/send` (`services/api/src/routes/send.ts`) has
exactly three branches:

| fee payer                | outcome                            |
| ------------------------ | ---------------------------------- |
| `identity.walletAddress` | accepted, self-paid                |
| `relay.signer.address`   | accepted after `validateSponsored` |
| anything else            | `403 forbidden`                    |

A funding wallet is none of those, and `validateSponsored` would refuse it
again under `extra_signer`. This is about identity, not gas: a self-paying
external wallet still lands in the third row.

**`wallet-events` already watches the right account.** `wallet-events/sync.ts`
walks the embedded wallet's own address plus its USDC token accounts, and writes
`transfer_in` rows that `portfolio/queries.ts:118` gives a flow sign of `+1`. A
deposit that lands as USDC on the Privy wallet is therefore **already seen**,
with no new stream and no migration. What is missing is everything before it
lands, and any record of what it came from.

**ADR 0007 decision 1 chose Privy for universal deposits, and its own
amendment undermined that choice.** The 12 October amendment records that Privy
takes up to 0.25% of any swap, and that crypto deposits _require app-pays gas
sponsorship, charged to our gas credits_. So the "important one" costs us a
percentage and our gas, and routes through a hook that has been renamed three
times and is currently `@experimental`.

**What Relay does, measured.**

| probe                                               | result                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| Solana in `GET /chains`                             | id `792703809`, `vmType: svm`, `depositEnabled: true`               |
| Solana USDC                                         | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, a `solverCurrency`  |
| chains available                                    | 61                                                                  |
| `POST /quote/v2`, 0.01 ETH on Base → USDC on Solana | $25.27 in, $25.19 out, `totalImpact −0.34%`, `timeEstimate: 1`      |
| fee split on that quote                             | solver service $0.0426, destination gas $0.0041, origin gas $0.0005 |
| `appFees`                                           | present, basis points, currently zero                               |
| Solana-origin step payload                          | `{ instructions, addressLookupTableAddresses }`                     |
| EVM-origin step payload                             | `{ to, data, value, chainId, maxFeePerGas, maxPriorityFeePerGas }`  |
| Bitcoin-origin step payload                         | a PSBT; chainId `8253038`                                           |
| status endpoint                                     | `GET /intents/status/v3?requestId=` → `{ status, quoteCreatedAt }`  |

Two of those lines decide the architecture. The Solana-origin payload is the
**same shape `relay/compose.ts` already consumes** — `toInstruction()` takes
`{ programId, accounts: [{ pubkey, isSigner, isWritable }], data }`. And the
EVM and Bitcoin payloads are shapes our backend cannot compose, co-sign or
submit at all.

---

## 2 · The decision

**Relay is the funding provider. Two entry paths. Every quote is minted by our
server.**

- **Deposit address** (§3) — no wallet connection. Covers every chain Relay
  supports, including Bitcoin and money sitting on an exchange.
- **Connected wallet** (§4) — one signature, no address to copy. Covers the
  VMs we have wired, starting with Solana.

They are not alternatives. The deposit address is the floor under every chain;
the connected wallet is an upgrade on the subset where we have an execution
path. Both write to the same table and produce the same activity row.

This supersedes decision 1 of [ADR 0007](../../adr/0007-wallet-funding.md) and
is recorded as [ADR 0014](../../adr/0014-relay-funding.md).

---

## 3 · The deposit-address path

```
1. FE   GET  /v1/money/fund/sources
        API  proxies Relay GET /chains, cached, filtered to solverCurrencies

2. User picks an origin: "USDT on Tron", "ETH on Base", "BTC"

3. FE   POST /v1/money/fund/address  { chainId, currency }
        API  POST api.relay.link/quote/v2
               recipient:           <the user's Privy wallet>
               destinationChainId:  792703809
               destinationCurrency: EPjFWdd5…TDt1v
               originChainId / originCurrency: from the picker
               tradeType:           EXACT_INPUT
               useDepositAddress:   true
               refundTo:            <Mercury-controlled, per VM — see §8>
               recoveryAddress:     <Mercury-controlled EOA>
             → { depositAddress, requestId }

4. API  INSERT funding_intent (…, status 'waiting')

5. FE   shows the address and a QR. The user sends from a wallet, a hardware
        device, or an exchange withdrawal. No connection, no calldata, no
        signature anywhere in our app.

6. Relay sweeps the deposit; a solver fills USDC on Solana to the Privy wallet.

7. Relay → POST /webhooks/relay   (§6)

8. wallet-events sees the USDC arrive on the stream it already walks and writes
   transfer_in. The webhook enriches that row.
```

**Every chain Relay supports is offered**, decided on 13 October — all 61
rather than a curated eight. That is a picker decision, not a backend one:
sixty-one rows is a worse list than eight, so `/v1/money/fund/sources` returns
the whole set and the interface leads with the handful somebody is likely to
want, then searches the rest by chain and token name. The alternative — a short
hardcoded list — means a user holding the sixty-first thing is told Mercury
cannot take their money when it can.

**Why this path is built first.** Bitcoin forces it — see §4 — and once it
exists it covers all 61 chains with no signing code written. It is also the only
path that reaches the BTC on Coinbase and in hardware wallets, which no
connector can touch. If everything after §3 slips, what ships is still
"deposit any token from any chain".

It is also the one path that is indifferent to how we deploy. There is no
composed transaction, so `relay/builds.ts`'s in-memory digest — single-process
by construction, and the reason `vercel.ts` configures no relayer — is not
involved.

---

## 4 · The connected-wallet path

### 4.1 · Not through Privy's connector

Funding wallets stop coming from Privy. The reason is in
`apps/web/src/auth/embedded.ts`: Privy's `useWallets()` returns **one list**
holding both the embedded account wallet and every connected funding wallet, so
that file has to tell them apart by sniffing `isPrivyWallet` off a prototype,
and its own docstring concedes _"This is proportionate, not airtight."_
`embeddedOf` fails closed when more than one wallet claims to be Privy's, which
means an unexpected extension can take the account's signing offline.

With funding wallets arriving from a separate connector, the two sets are
disjoint by construction. `claimsPrivy`, `embeddedOf`, `fundingOf`,
`useFundingWallets` and `useFundingWalletAvailable` are all deleted, and the
rule they approximate — _Privy is the account; a connected wallet is never the
account_ — becomes a type boundary.

Privy also cannot serve two of the three VMs. Its `./extended-chains`
entrypoint exports `useCreateWallet`, `useExportWallet` and `useSignRawHash`
only: embedded wallets, no external Bitcoin connection at any version we hold.
And its EVM connectors initialise at provider construction, which is why
`apps/web/src/auth/no-evm-connectors.ts` stubs Coinbase Wallet and both
WalletConnect providers out at the bundler — _"about a fifth of the first
download"_, paid by every visitor before the sign-in screen.

### 4.2 · Two layers, two packages

| layer      | package                                                 | version checked 13 Oct 2026   |
| ---------- | ------------------------------------------------------- | ----------------------------- |
| connection | `@reown/appkit` + `-adapter-solana`, `-adapter-bitcoin` | 1.8.24, published 16 Sep 2026 |
| execution  | `@relayprotocol/relay-sdk`                              | 8.0.4, published 6 Oct 2026   |
| execution  | `@relayprotocol/relay-svm-wallet-adapter`               | 22.0.4                        |
| execution  | `@relayprotocol/relay-ethers-wallet-adapter`            | 33.0.4                        |
| execution  | `@relayprotocol/relay-bitcoin-wallet-adapter`           | 21.0.4                        |

AppKit discovers and connects — EVM across Viem's chain list, Solana over the
Wallet Standard, Bitcoin over WBIPs, and 600+ wallets through the WalletConnect
network, which is what makes a phone browser work at all. Relay's adapters take
an already-connected wallet and execute a quote's steps in that VM's own idiom:
instructions for SVM, calldata for EVM, a PSBT for Bitcoin.

Neither does the other's job. Use both.

**Not `@relayprotocol/relay-kit-ui`.** It is a prebuilt widget; the interface is
ours and the intent lives on our server.

**The old npm scope is dead.** `@reservoir0x/relay-sdk` was last published
12 August 2025 while the API moved to `/quote/v2`, `/intents/status/v3` and a
required API key. Use `@relayprotocol/*` and pin exact versions — the adapters
sit at majors 21, 22 and 33 against an SDK at 8, so they move independently.

### 4.3 · Per-VM notes

**Solana.** Relay returns `{ instructions, addressLookupTableAddresses }`,
which `relay/compose.ts` and `relay/lookups.ts` already handle. The funder pays
their own SOL: a wallet holding arbitrary SPL tokens is a funded on-chain
account, so the no-SOL cliff that `relay/transfer.ts` exists to solve does not
apply. No sponsorship, and nothing added to the relayer's exposure.

**EVM.** Requires deleting the three aliases in `apps/web/vite.config.ts:13-15`
and installing the packages — they are **not currently in the tree at all**, so
this is a dependency add, not an un-alias. Steps arrive as a **sequence**:
`approve` then `deposit` for ERC-20 origins, executed in order. The connected
wallet may be on the wrong chain, so `wallet.switchChain(chainId)` is part of
the flow, and every chain offered must be declared in config or
`sendTransaction` throws.

**Bitcoin.** The quote returns a PSBT and the adapter handles finalisation and
broadcast. The timing is different in kind: a request reaches `pending` on
mempool but `success` waits for 1 confirmation, 2 above a per-currency
high-value threshold. Minutes to an hour, not the second a Base fill takes. A
deposit that outlives the page makes `funding_intent` and the webhook mandatory
rather than nice — this is the case that proves §3 has to exist.

Bitcoin's connected-wallet path reaches Xverse, OKX, Leather and Phantom. It
does not reach a hardware wallet or an exchange, which is where most
depositable BTC is. §3 is the real Bitcoin story; this is a convenience on top.

---

## 5 · Only the server mints a quote

**Non-negotiable.** The client never calls Relay's quote endpoint. It asks us,
we call Relay, we store the result, and the client executes **that** quote.

Three fields make this a correctness requirement rather than tidiness.
`recipient` decides whose account the money lands in. `appFees` decides whether
we are paid. The origin pair decides what the user is actually spending. A
client-minted quote puts all three under the control of the page, and the
server would be recording a deposit it did not define.

It is also where the credential belongs: `POST /quote/v2` requires an
`x-api-key` header as of 2 October 2026 (Relay's Bitcoin guide). Probes on
13 October still succeeded without one, so enforcement is incomplete — that is
not something to build on.

**The SDK supports this directly.** Read from
`@relayprotocol/relay-sdk` 8.0.4 on 13 October: `execute()` takes
`{ quote: Execute, wallet, onProgress }` with the quote as a **required**
parameter, so nothing obliges the client to have fetched it. And `getQuote()`
takes a third `headers` argument, which is where `x-api-key` goes — so the same
typed client mints quotes on our server and executes them in the browser,
rather than us hand-rolling one half of it.

**`AdaptedWallet` is the seam, and it is small.** Seven methods — `vmType`,
`getChainId`, `address`, `switchChain`, `handleSignMessageStep`,
`handleSendTransactionStep`, `handleConfirmTransactionStep` — over a plain
object. `ChainVM` spans `evm`, `svm`, `bvm`, `tvm`, `hypevm`, `lvm`, `tonvm`,
`xrpvm` and `hederavm`.

That makes Relay's prebuilt adapters in §4.2 a convenience rather than a
requirement: an AppKit-connected wallet of any VM can be adapted in one small
file per VM, which is also the honest place to put per-wallet quirks. Take the
prebuilt ones where they fit — Bitcoin especially, where PSBT finalisation is
the fiddly part — and write our own where they do not.

`onProgress` reports `currentStep`, `currentStepItem` and `txHashes`, which is
what the per-chain status UI in phase 4 renders.

---

## 6 · The record

### 6.1 · One table

```
funding_intent
  id                  uuid pk
  user_id             uuid → user, cascade
  relay_request_id    text         -- at mint; see 6.3, it can change
  deposit_address     text null    -- null on the connected-wallet path
  origin_chain_id     integer
  origin_currency     text
  recipient_address   text         -- the Privy wallet, as quoted
  quoted_out_raw      text         -- USDC base units, what we showed
  status              text         -- see 6.2
  in_tx_hash          text null
  out_tx_hash         text null
  fail_reason         text null
  created_at          timestamptz not null default now()
  updated_at          timestamptz not null default now()

  index       (user_id, created_at)
  index       (deposit_address)
  unique      (deposit_address, in_tx_hash)
```

The unique index is the webhook's idempotency guarantee, and it is deliberately
on the pair rather than on `relay_request_id`: an open deposit address is
reusable for its route, so one address legitimately has many deposits, each with
its own origin transaction.

### 6.2 · Status

Relay's own vocabulary, stored verbatim rather than mapped, so a support
question is answerable against their dashboard without a translation table:

`waiting` → `depositing` → `pending` → `submitted` → `success`, plus `failure`
and `refund` as terminal states.

### 6.3 · The webhook

`POST /webhooks/relay`, public and unauthenticated by route, authenticated by
signature. Relay sends `request.status.updated` with two headers:
`X-Signature-Timestamp` and `X-Signature-SHA256`, the latter an HMAC-SHA256 of
`timestamp.body` keyed by the API key, hex-encoded.

Requirements:

- Constant-time comparison. Reject with a non-2xx on failure.
- A freshness window on `X-Signature-Timestamp`, so a captured body cannot be
  replayed later.
- Idempotent. The unique index above absorbs a redelivery; the handler must not
  treat a conflict as an error.
- **Match on `data.depositAddress.address`, never on the quote-time
  `requestId`.** Relay regenerates the quote on over- or underpayment, and the
  fill then lands under a _new_ `requestId` while the original stays `waiting`
  forever. A tracker keyed on the minted id reports a successful deposit as
  pending for all time. On the connected-wallet path there is no deposit
  address, so those rows match on `relay_request_id` — the regeneration case
  does not arise when the amount is fixed by a signed transaction.

One endpoint per API key, configured in Relay's dashboard, and enablement is a
request to Relay rather than a setting we flip. Until it is live, poll
`GET /requests/v3?depositAddress=`.

### 6.4 · The activity row

Nothing new writes the money-in event. `wallet-events` sees the USDC land and
writes `transfer_in`, which is correct and already feeds the performance line.
The webhook **enriches** that row — "Deposited 0.01 ETH from Base" in place of
"Received cash" — which is exactly what `baskets/glider/reconcile.ts:216`
already does to a generic `transfer_in` after a basket funding confirms. Same
pattern, same `onConflictDoUpdate` shape, no new idempotency story.

A deposit whose USDC has landed but whose webhook has not arrived therefore
shows as a plain receive, not as nothing. Degrading to the truth-minus-detail is
the right direction.

---

## 7 · What it costs the user

From the measured quote in §1, on $25.27 of ETH from Base:

| component                            | amount    |
| ------------------------------------ | --------- |
| solver service                       | $0.0426   |
| destination gas                      | $0.0041   |
| origin gas (paid by the user in ETH) | $0.0005   |
| swap impact                          | $0.0392   |
| **all-in**                           | **0.34%** |

Against Privy's path as ADR 0007's amendment describes it — up to 0.25% plus
the DEX fee plus a bridge relayer fee, _plus_ destination gas charged to our gas
credits — this is comparable to the user and strictly cheaper to us, because
none of it is ours.

**A first deposit costs more, and the difference is visible.** Quoting the
same route to a Solana address that has never held USDC — so with no token
account to receive into — was accepted, and `relayerGas` rose from $0.0041 to
$0.1919. That $0.188 is the token-account rent, which Relay pays and prices in.
All-in went **0.34% to 1.01%** on a $25 deposit.

Two things follow. Every quote must be minted against the user's real Privy
wallet and never a reference address, or we would under-quote exactly the
deposit most likely to be someone's first. And on the $10 floor that rent is
1.9% of the deposit, so the fee breakdown is shown rather than summarised — a
first deposit is the worst moment to look like we are skimming.

`appFees` is zero at launch, by decision on 13 October. It exists, it is basis
points, and it is where a funding revenue line would go; that is a separate
decision and not this spec's.

---

## 8 · Refunds, and the obligation nobody wants

**`refundTo` must be an address we control, per VM family.** Relay's docs are
explicit: a deposit arriving from an exchange withdrawal has the exchange's hot
wallet as its sender, so an automatic refund aimed at "the depositor" is gone.
Setting `refundTo` to the user's address is therefore wrong for precisely the
users §3 exists to serve.

So we need a refund address for EVM, one for Solana and one for Bitcoin, plus
`recoveryAddress` for withdrawing from the depository when Relay can neither
fill nor refund.

**Decided on 13 October: no address is configuration. A separate service holds
the keys and derives them.** See [ADR 0015](../../adr/0015-treasury-service.md).

The first draft of this section put six addresses in the API's environment. That
was wrong in a way worth recording, because nothing would have checked it: a
configured address can be an address we do not hold the key for — a typo, a
value copied from the wrong wallet, a rotated key whose address was never
updated — and Relay will honour every one of them. The failure is silent at
configuration time and surfaces when somebody else's refund lands somewhere
nobody can spend from.

**And three keys do not cover 61 chains.** Running the client against the live
`GET /chains` on 13 October: 61 deposit-enabled chains across **eight** VM
families — `evm` (52), `svm` (2), `lvm` (2), and one each of `bvm`, `hypevm`,
`tvm`, `tonvm`, `xrpvm`. An address is only meaningful inside its own family.
Hyperliquid's EVM takes an `0x` address, so three keys reach 55 chains; Tron,
XRP, TON and the two `lvm` chains are not reachable by any of them.

For those six, `refundTo` is **omitted** rather than guessed — Relay permits
that on an open deposit address, at the cost of automatic refunds, and a
failure then goes to their support. The route reports `autoRefund: false` so the
interface can say so before somebody sends. The alternative, handing Tron an
`0x` address, has Relay refund into nothing and tell nobody.

Tron is the one worth closing: USDT on Tron is a major route and Tron derives
from the same secp256k1 key as EVM — keccak, last twenty bytes, `0x41` prefix,
base58check. That is one more function in `packages/keys`, not another key to
hold. It is not in phase 1.

So `services/treasury` reads a private key per VM family and derives the
address. The API asks it for addresses over an internal endpoint and never sees
a key. Derivation is a public key and a hash; it costs nothing and it makes the
mismatch impossible rather than unlikely — the same argument `relay/builds.ts`
makes about remembering a message instead of parsing one back.

Recovery and refund stay separate values so the roles can diverge later, and
Relay's one constraint still applies: `recoveryAddress` must not be the
native-currency sentinel address, which a derived address never is.

What is deferred is **settling** — the loop that returns those funds to the
right user. Receiving needs nothing running: an address receives whether or not
a service is up, which is why the treasury's v1 is only keys, derivation and one
route. Sending is where the hard parts live, Bitcoin UTXO selection and fee
estimation most of all, and it gets its own design.

`funding_intent` is what will make settling answerable — the row names the user,
the origin, the amount and the failure — so the data is captured from day one
even though nobody is yet on the hook for acting on it. That is a deliberate
debt and it should be paid before this is in front of people who are not us: a
refund sitting in a company wallet with no process attached is somebody's money
that we have and they do not.

**Amount edge cases on an open deposit address.** An exact match reuses the
quote. An overpayment regenerates the quote for the larger amount under a new
id. An underpayment regenerates if the remainder still covers fees, and
otherwise refunds to `refundTo`. All three are handled by §6.3's matching rule
and need no logic of ours.

**Tokens we must never offer.** Non-solver tokens and NFTs sent to a deposit
address are, per Relay, unrecoverable. The picker is therefore driven entirely
by `solverCurrencies` from `GET /chains` and never accepts free text. Relay also
does not sweep deposits worth $0.05 or less; **our floor is $10**, decided on
13 October, which keeps the first-deposit rent in §7 under 2%.

---

## 9 · Answered, and still open

Three of the four questions this spec opened were closed the same day.

**Answered · `execute()` takes a pre-fetched quote.** Required parameter. The
server mints, the client executes. §5 has the detail, including the
`AdaptedWallet` seam it exposed, which shrinks §4.2's dependency on Relay's
prebuilt adapters.

**Answered · Relay pays the destination account rent and prices it in.** A
quote to an address that has never held USDC is accepted, with `relayerGas`
carrying the $0.188. See §7 — this one changed the product, not just the
estimate.

**Answered · `x-api-key` is not yet enforced.** Probes on 13 October succeeded
without it, against a requirement dated 2 October. We hold a key and send it
regardless; building on the gap would be building on someone else's rollout
schedule.

**Still open · what AppKit costs the bundle.** The 20% figure in
`no-evm-connectors.ts` measures Privy's connectors, not AppKit's. Measure after
install, and confirm the chunk sits behind the Add cash route rather than in the
entry bundle. This gates nothing in phase 1 and is the first task of phase 2.

---

## 10 · Phases

Each phase is shippable and leaves the product better than it found it.

| #   | phase                                                                                                                                                         | delivers                                                        | days |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---- |
| 1   | Backbone — server Relay client, `funding_intent`, `/sources` + `/address` + `/intents`, webhook with verification, activity enrichment, and a plain interface | any token, any chain, including BTC. No signing paths.          | 4    |
| 2   | AppKit connection layer — provider, three adapters, Mercury-styled connect UI, lazy chunk, retire `embedded.ts`                                               | wallets connect across all three VMs                            | 3    |
| 3   | Relay execution — adapters wired to server-minted quotes, step sequencing, per-VM error taxonomy                                                              | sign-and-go deposits                                            | 2    |
| 4   | Designing the picker and the per-chain status properly                                                                                                        | a 40-minute BTC pending state that does not look like a failure | 2    |

Phase 1 stands alone, and that is a requirement rather than an observation. An
earlier draft of this table put the whole interface in phase 4, which would have
made phase 1 an API nobody could reach — and the claim that a slip still leaves
"deposit any token from any chain" would have been false. So phase 1 carries
`/intents` and an interface plain enough to ship: a searchable picker, an
address, a QR, and a list of what is in flight. Phase 4 designs that properly
rather than building it for the first time.

With that, phases 2–4 are each an upgrade on a flow that already works, which is
the property worth protecting: at no point between here and the end is the
feature broken, and at no point does a slip take funding with it. Roughly eleven
days in total, of which the first four are the ones that matter.

Each phase gets its own implementation plan, written when the one before it
lands. Planning all four now would be planning phases 3 and 4 against what
phase 2 is guessed to have produced.

**This work stacks on PR #63** rather than waiting for it to merge, by decision
on 13 October: `feat/relay-funding` is cut from `feat/fund-from-wallet`, and
phase 2 replaces that PR's connector layer while keeping its amount field, its
balance handling and its transfer builder. The USDC-on-Solana path it shipped
stays as the fast lane — a same-asset, same-chain transfer is not a swap and
has no business being quoted as one.

---

## 11 · What this does not do

- **No fiat.** ADR 0001 and ADR 0007 decision 2 are untouched; the card onramp
  stays Privy's and stays last in the interface.
- **No sponsorship.** The funder pays their own gas on every path. The relayer's
  exposure does not grow.
- **No change to custody.** ADR 0003 stands: the embedded wallet is the account,
  a connected wallet signs once and leaves, and `recipient` on every quote is
  the Privy wallet.
- **No EVM or Bitcoin embedded wallets.** Connection is for funding only.
