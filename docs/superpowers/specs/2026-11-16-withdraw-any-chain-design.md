# Withdraw to any chain: design

**Status:** draft for review, not built · 16 November 2026 · web first, iOS after ·
amends [ADR 0014](../../adr/0014-relay-funding.md) for the outbound direction

Send moves USDC from the Mercury wallet to a Solana address, and nothing else. Someone who wants
their money on Base, Ethereum or an exchange that only takes another chain has to send it to a
Solana wallet of their own and bridge it themselves. Deposits already come in from nine chains
through Relay; this is the same thing in the other direction.

The Send sheet gains a **chain and token picker**, defaulting to "Solana · USDC". The default is
today's transfer, unchanged. Anything else is a Relay withdrawal: the Mercury wallet signs one
Solana transaction, **our relayer pays the network fee**, Relay delivers the chosen token on the
chosen chain, and **Relay keeps Mercury's fee (10 bps) for us to claim later**, exactly as it
already does for deposits.

## Where we are

Verified by reading the repo and quoting `api.relay.link` on 16 November 2026.

- **Send is Solana only.** `/v1/money/send/prepare` (`services/api/src/routes/send.ts`) parses the
  recipient with `address()` and builds a USDC transfer. The web sheet says "Solana network only."
  (`apps/web/src/app/Send.tsx`).
- **Sends are sponsored.** With a relayer configured, `buildSponsoredTransfer`
  (`relay/transfer.ts`) makes the relayer the fee payer and the rent payer for the recipient's
  account, and the sender repays the rent in USDC in the same message. A Mercury wallet that has
  only held USDC has no SOL, so without this nothing could leave.
- **The relayer co-signs only what the server built.** `relay/builds.ts` remembers the hash of
  every message the server composed; `/v1/transactions/send` refuses to sign anything else. No
  program allowlist is needed, because the guard is the bytes.
- **The server already composes a provider's instructions under our fee payer.**
  `relay/compose.ts` (`composeSponsored`) takes Jupiter's swap instructions and lookup tables, sets
  the relayer as fee payer, and puts a USDC charge in the same message. Stock trades use it today,
  and the trading fee rides in that charge to the relayer's USDC account.
- **Relay is integrated for deposits.** `funding/relay.ts` mints quotes server-side, `funding_intent`
  records them, Relay's signed webhook and `funding/poll.ts` settle them. Deposit fees go through
  Relay's `appFees`, credited to an EVM address and claimed later.

### What a Relay withdrawal quote looks like

One `POST /quote` for 20 USDC on Solana to USDC on Base, with a placeholder sender:

| Field         | Value                                                                                 |
| ------------- | ------------------------------------------------------------------------------------- |
| Steps         | One, `deposit`, kind `transaction`                                                    |
| Instructions  | **One**, to Relay's depository program `99vQwtBwYtrqqD9YSXbdum3KBdxPAVxYTaQ3cfnJSrN2` |
| Signers       | **The sender only**                                                                   |
| Lookup tables | One (`Hm9fUgcn7qwDaiNTFiGh6pNtVATgnaRcmK6Bbx6EMZfP`)                                  |
| In / out      | 20.00 USDC / 19.974742 USDC on Base, estimated 1 second                               |
| Relay's fees  | $0.025 (gas $0.0002, relayer $0.0253)                                                 |

The same quote for 100 USDC with `appFees: [{ recipient, fee: "10" }]` came back with
`fees.app.amountUsd` = **$0.0999**, 99.86 USDC out, and still one instruction with the sender as the
only signer. So `appFees` works with a Solana origin and changes nothing about how the transaction
is built.

The instruction's accounts are the sender (signer, writable), the sender's USDC account, Relay's
vault and **the vault's USDC account, which already exists on mainnet**, plus the token, associated
token and system programs. It is a deposit into a vault that is already open, so in the ordinary
case **it creates no account and nobody pays rent.** The system and associated token programs are
there so the instruction can open the vault's account for a token it has never held. If it ever
did, the sender is the payer it names, not our relayer.

The fee payer is not part of the instruction. Composing it under our relayer changes the message
around it and not a byte of it, so Relay still matches the deposit to the request id inside the
instruction's data.

## The decision

**A withdrawal to another chain is a Relay quote the server mints and composes into a sponsored
transaction, the same way a stock trade composes a Jupiter swap.**

This is the opposite of what ADR 0014's amendment chose for deposits, where "the server composes
nothing" and the browser runs Relay's steps. The difference is who pays. A deposit is signed and
paid for by a wallet somebody connected, so there is nothing for us to add. A withdrawal is signed
by the Mercury wallet, which has no SOL, so the server has to set the fee payer, and setting it
means building the message. The safety the deposit design relied on (the destination is in bytes
Relay produced) still holds: we never touch Relay's instruction, only the envelope.

## The transaction

`composeSponsored` with:

1. **Compute budget,** ours, as for trades.
2. **Relay's instruction,** unmodified. It already carries Mercury's fee, because the fee is in
   the quote.
3. Relay's **lookup table** resolved through `relay/lookups.ts`.
4. **No charge.** There is nothing to repay the relayer (below), so `charge` is null.

The fee payer is the relayer. The sender signs in the browser with Privy, as for every send, and
`/v1/transactions/send` adds the relayer's signature once `builds.recognises` the message.

### Mercury's fee: through Relay's `appFees`

**10 basis points of what is withdrawn, on every cross-chain withdrawal**, Circle's USDC included.
A $100 withdrawal pays $0.10 to Mercury inside Relay's fill; Relay delivers about $99.86 after its
own fee.

The fee goes on the quote as `appFees: [{ recipient, fee: bps }]`, the same field deposits use.
Relay takes it from what is deposited and credits it to `recipient` as a balance Mercury claims
later. Compared with a USDC transfer to our relayer inside the message, it is the simpler backend:

- **No fee arithmetic in the transaction.** The server passes a number to Relay and composes
  Relay's instruction as it came. There is no charge instruction, no rounding, and nothing to keep
  the quoted and deposited amounts in step.
- **One place for both directions.** Deposit and withdrawal fees build up in the same Relay
  balance, to the same recipient, claimed the same way.
- **A refund is Relay's to settle.** The fee is part of the fill, so a withdrawal that is refunded
  never paid it to us (to confirm with Relay, see "Still open"). With our own transfer, the fee
  would have landed even when the bridge failed, and we would have had to send it back.

What it costs: the money arrives when we claim it, not with each withdrawal, and Relay holds it
until then. The record keeps `fees.app.amountUsd` per withdrawal, because Relay's balance is one
total and this is the only place that says where each part of it came from, as `funding_intent`
already does with `mercury_fee_usd`.

**The rate is a setting, not a constant,** so it can change without touching code:

| Setting                 | Default | Meaning                                                                                                         |
| ----------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| `WITHDRAW_FEE_BPS`      | `10`    | Mercury's fee on a cross-chain withdrawal. Read into config at boot and passed on every quote. `0` turns it off |
| `DEPOSIT_FEE_RECIPIENT` | (unset) | The existing setting. The address Relay credits, now for both directions. Unset, no fee is asked for either     |

`withdrawFeeFor(policy)` mirrors `depositFeeFor`: no recipient or a rate of zero means no
`appFees` at all. The rate shown on the Send sheet comes from `/v1/money/send/destinations`, so the
browser never holds its own copy. Changing it is an environment change and a restart. If it ever has
to change without one, the same value can move to a database setting read per quote; nothing else
in this design depends on where it lives.

### Rent: none for the relayer to front

The relayer pays only the network fee, about $0.001, as it does for today's sends, which are not
charged for it. It cannot be made to pay rent on this path: rent is paid by whichever account an
instruction names as payer, and Relay's instruction names the sender. So the case where the vault
has no account for the token falls on a Mercury wallet with no SOL, and **fails in simulation**
before anyone signs. The answer is "This withdrawal can't be sent right now", which is right for a
route we haven't designed for.

One cheap guard stays: simulate with the relayer's account returned, and refuse if it spends more
than the transaction fee. That should never happen, and if it does it shows up as a refusal, not a
loss.

### What the person types and sees

The amount typed is **what leaves the Mercury wallet**, sent as Relay's `amount` with
`EXACT_INPUT`, so "Max" means the whole balance. Relay subtracts its fee and ours from what
arrives.

```
You send          $100.00 USDC · Solana
Mercury fee         $0.10
Relay fee           $0.04
Network fee         Paid by Mercury
Arrives          ≈ $99.86 USDC · Base · about a minute
To               0x83a…91f2 on Base
```

The confirm step names the destination chain beside the address, in words, because the mistake
that loses money here is a right address on the wrong chain.

## Where it can go

**The chains deposits take, to begin with** (`funding/chains.ts`): Solana, Base, Ethereum,
Arbitrum, Optimism, Polygon, BNB Chain, Avalanche, Unichain. The deposit list's second rule ("the
web app must be able to sign on it") does not apply to a destination, so this is a separate
list, `WITHDRAW_CHAIN_IDS`, that starts as a copy.

**Tokens:** Relay's verified tokens on the chosen chain, through the same `currencies()` call and
the same `verified === true` filter, which is what stops an impostor USDC being offered.

**Addresses are checked per VM,** on the server, before a quote is asked:

| VM     | Check                                                                        |
| ------ | ---------------------------------------------------------------------------- |
| EVM    | 20-byte hex. Mixed case must pass its EIP-55 checksum; all one case is taken |
| Solana | Base58 that decodes to 32 bytes, as `address()` does today                   |

Bitcoin and other VMs are out of the first release; see "Still open".

**Solana and USDC never goes through Relay.** Picking the default keeps today's direct transfer:
cheaper (no bridge fee, no Mercury fee), and the one that already works.

## Endpoints

| Route                                 | Does                                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `GET /v1/money/send/destinations`     | Chains for the picker, `minimumUsd` and `feeBps`. Cached like `/fund/sources`                                   |
| `GET /v1/money/send/tokens?chainId&q` | Verified tokens on a destination chain. Same shape as `/fund/tokens`                                            |
| `POST /v1/money/send/bridge/quote`    | `{ amount, chainId, currency, to }` → what leaves, Mercury's fee, what arrives, time. No transaction            |
| `POST /v1/money/send/bridge/prepare`  | Same body. Mints the Relay quote, records it, composes, simulates, remembers. → `{ transaction, withdrawalId }` |

Signing and broadcasting reuse `/v1/transactions/send` unchanged. `prepare` mints a fresh quote
rather than reusing the one shown, because a Relay quote expires in under a minute and the
blockhash with it; the screen re-reads `quote` while it is open.

## The record

A `withdrawal` table, a sibling of `funding_intent` rather than a `direction` column on it. The
deposit table's columns are named for an origin chain and a Mercury recipient, and every comment
on it is about money coming in; turning half of them nullable to fit the other direction would
make both harder to read.

```
withdrawal: id, user_id, relay_request_id (unique),
            destination_chain_id, destination_chain_name, destination_currency,
            destination_currency_symbol, recipient_address,
            amount_raw, fee_bps, mercury_fee_usd, quoted_out_raw,
            status, in_tx_hash, out_tx_hash, fail_reason, created_at, updated_at
```

`fee_bps` is the rate the quote was minted at, so a row still says what it was charged after
`WITHDRAW_FEE_BPS` changes. `mercury_fee_usd` is Relay's `fees.app.amountUsd`, null when no fee was
asked for.

Chain and token names are stored as they were shown, for the reason `funding_intent` stores them.

**Settlement is the deposit's, pointed at both tables.** The webhook (`routes/relay-webhook.ts`)
currently answers `ignored: "unknown request id"` for anything not in `funding_intent`; it looks
in `withdrawal` too. `funding/poll.ts` polls both. The browser can move a row to `submitted` and
never further.

**Refunds go to the Mercury wallet.** `refundTo` is the sender, an address it holds the key for on
the chain the money left from, so a failed fill returns to where it came from with nobody at
Mercury holding it. Mercury's fee is inside Relay's fill, so there is no separate transfer of ours
to send back.

**The feed** says "Sent to Base" rather than a transfer to Relay's vault: `funding/enrich.ts`
already matches a deposit's signature to its intent, and does the same for a withdrawal's.

## Not in this piece

- **iOS.** `apps/mobile/app/send.tsx` gets the picker in a follow-up, against these endpoints.
- **Sending stocks or other tokens across chains.** The source is the Mercury wallet's USDC.
- **Bitcoin and non-EVM destinations** (below).

## Build order

1. `WITHDRAW_FEE_BPS` (default 10), `WITHDRAW_CHAIN_IDS`, `withdrawal` table and migration.
2. `RelayClient.withdrawQuote` beside `fundQuote`: origin fixed to Solana USDC, destination from
   the caller, `refundTo` the sender, `appFees` from `withdrawFeeFor`.
3. Relay instruction → kit `Instruction` (`keys`/`isSigner`/`isWritable`, data in hex, where
   Jupiter's is base64), composed with no charge, simulated with the relayer-spend guard. Tests
   from a recorded quote in `__fixtures__`.
4. The four routes, address checks per VM, and the minimum.
5. Webhook, poll and feed enrichment for `withdrawal`.
6. Send sheet: chain and token picker (the deposit picker's components), the breakdown above,
   chain named at confirm.

## Still open

- **Minimum.** Proposed **$5**. Relay's fixed fee is about $0.025, half a percent at $5. The relayer
  spends about $0.001 of SOL per withdrawal that is not repaid, while 10 bps of $5 ($0.005) builds
  up in the Relay balance, so each withdrawal at the minimum still pays for itself, just not in
  the same account.
- **Bitcoin as a destination.** Relay supports it and nothing has to sign on Bitcoin, because the
  money leaves from Solana, so unlike deposits it is possible. It needs address checks for each
  Bitcoin format and a look at Relay's minimum for BTC fills. Worth a second release.
- **The app fee on a refund, and claiming.** Confirm with Relay that an app fee is not credited
  for a request that ends in `refund`, and how the balance is claimed when it builds up from Solana
  origins as well as EVM ones (the recipient is an EVM address today). Nothing in the build waits
  on this.
- **Sanctions screening.** Sending to any Solana address already carries this risk, so it is not new,
  but this widens where money can go. The linked-wallets review lists screening as work nobody
  has started; it applies here too.
- **Relay's keyless `/quote`** answered this probe; the server uses `/quote/v2` with `RELAY_API_KEY`
  as deposits do. A Solana origin through `/quote/v2` should be checked once with the real key
  before step 2.
