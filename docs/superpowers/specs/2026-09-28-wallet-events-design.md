# Wallet events design

**Status:** accepted, 28 September 2026. Revised twice the same day: once
after the walk was verified against mainnet and the first version's central
mechanism was found not to work (§4), and again after a token stream
discovered mid-pass turned out to need backfilling rather than baselining
(§8).

Cash arrives silently. The Money screen reads the USDC balance from chain on
every request, so the number is always right — but nothing is ever written
down, and the Activity feed never mentions it. A deposit is the most important
thing a new account does, and today it leaves no trace.

This spec covers how money moving in and out of a wallet becomes a record.

---

## 1 · Where we actually are

Verified by reading the repo on 28 September 2026.

- `position-sync` runs every 2 seconds. It reads token balances, diffs them
  against recorded lots, and writes `lot`, `position` and `activity` rows.
- It only sees tokens in the `token` table, which holds wrappers of listed
  instruments. **USDC is not one**, so cash is invisible to it.
- **Native SOL is invisible to everything.** It is not a token account, so it
  is not in `tokenBalances` at all.
- Nothing reads transaction history. `SolanaRpc` has `tokenBalances` and
  `mintConfig`, and no third method.

So the system knows _what stock is held_, and has no idea what happened or
where the money is.

---

## 2 · The decision

**Split by question. Two sources, because they answer different things.**

| question        | source              | job             | cadence |
| --------------- | ------------------- | --------------- | ------- |
| What do I hold? | token balances      | `position-sync` | 2s      |
| What happened?  | transaction history | `wallet-events` | 30s     |

Balances are cheap, current and complete — the right answer for state. They
are also the wrong answer for events: a balance cannot tell you when it moved,
under which signature, or whether two movements netted out between two reads.

Transaction history is the opposite. It carries the signature, the block time
and the exact delta, and it cannot tell you what is held now without replaying
everything. So it owns events and nothing else.

### Scope: cash only

`wallet-events` follows **native SOL and USDC**. Not the stock wrappers.

Stock arriving already updates the _holding_: `position-sync` sees the
balance in the `token` table, and `shares` on the position reflects it within
two seconds. It does not update the _feed_. `planReconciliation` writes a lot,
and the one activity row that goes with a lot, only for a dividend — an
incoming transfer it cannot price gets neither, since 61de2af removed the lot
priced at today's reference (a guess wearing the clothes of a record) along
with the activity row that went with it. So a stock deposit shows up as owned
and does not show up in Activity at all, which is a real gap and not merely a
poorer row than history would produce. §13 records it.

Cash was worse before this spec: USDC is not in the `token` table, so a
deposit updated nothing at all — not the feed, not a position, nothing to
look at. That total silence, not stock's partial one, is the gap worth
closing here.

Following stock as well would mean a signature stream per token account per
wallet. §10 shows what that costs on a public RPC, and it buys a better
timestamp on an event that is already on screen.

**Rejected: transaction history as the single source** — deriving positions
from a full replay. It is the more correct system and it is how a real ledger
works, but every position would then depend on a complete, gap-free history
walk, and a free RPC that throttles one call in ten is not a foundation for
that. Recorded as the upgrade path once there is a paid RPC or an indexer.

---

## 3 · What each job writes, after this

`position-sync` is **unchanged**. It keeps `lot`, `position`, and the one
activity row it writes — for a dividend, not for stock arriving; see §2's
correction. A dividend is a change in the mint's multiplier, not a
transaction on the holder's wallet, so there is no signature to find and
history could not see it even if it looked.

`wallet-events` writes **transfer activity for SOL and USDC only**. It never
writes a lot and never touches a position. The two jobs do not overlap, because
they do not cover the same assets.

---

## 4 · What we follow

**This is where the first version of this spec was wrong.**

It said to walk `getSignaturesForAddress(walletAddress)`. That does not find
incoming token transfers. The RPC indexes a transaction under its account
keys, and a plain SPL transfer's accounts are the source account, the mint, the
destination account and the authority — **the recipient's wallet pubkey is not
among them**. Verified on mainnet against a real transfer that moved tokens
owned by `FMVHP1xw…`:

| address queried           | transfer in the result |
| ------------------------- | ---------------------- |
| the owner's wallet        | **no**                 |
| the owner's token account | **yes**                |

The failure would have been worse than a uniform one. A _first_ deposit creates
the associated token account, and that instruction does take the owner as an
account key — so the first deposit would have been found and every one after it
would have vanished.

So a wallet has **two signature streams**, and they are followed separately:

| stream                 | finds                                                         |
| ---------------------- | ------------------------------------------------------------- |
| the wallet address     | native SOL, and the transaction that creates the USDC account |
| the USDC token account | every USDC transfer                                           |

Native SOL needs no second stream: a lamport transfer's recipient is a writable
account key, so it is indexed under the wallet. Verified against a real mainnet
transfer of 1.2 SOL, present in the recipient's own signature list.

The USDC account address is found once with
`getTokenAccountsByOwner(owner, { mint: USDC })` and stored. Until USDC first
arrives there is no account to follow, and the transfer that creates it is
caught by the wallet stream.

Discovery rather than deriving the associated-token-account address: it is one
call, once per wallet, it needs no program-derived-address arithmetic, and it
finds a non-associated USDC account too, which derivation would miss.

---

## 5 · The history walk

Per stream, every 30 seconds:

```
collect = []
before = null
loop:
  page = getSignaturesForAddress(address, { until: cursor, before, limit: 100 })
       → newest-first: { signature, slot, blockTime, err }
  collect += page
  if page.length < 100: break        # reached the cursor, or the end
  before = oldest signature in page  # a full page may not have reached it yet

for each signature across both streams, deduplicated, OLDEST first:
  skip if err !== null               # a failed transaction moved nothing
  getTransaction(signature, { encoding: "jsonParsed",
                              maxSupportedTransactionVersion: 255 })
  write its movements

cursor := newest signature in that stream's collect, after the writes commit
```

**The paging loop is not optional.** `getSignaturesForAddress` returns at most
`limit` signatures, newest first. If more than a page has happened since the
cursor, one call returns the newest hundred and the older ones are simply
absent — advancing the cursor to the newest of that page would step over them
and lose them permanently. Paging back with `before` until a short page arrives
is what makes the walk gap-free, which is the property the whole design rests
on.

Processing oldest-first means a crash part way through leaves the cursor where
it was and replays a little, rather than leaving a hole.

**`maxSupportedTransactionVersion: 255`, not 0.** The parameter is a ceiling
the node compares the transaction against, not an assertion about what exists,
and a transaction above it returns an _error_ rather than a result. In one
mainnet block sampled on 28 September 2026, **163 of 1,195 transactions were
version 1**. Under §11's stop-don't-skip rule, a value of 0 would park a
cursor forever on the first version-1 transaction it met. 255 is accepted by
the node and covers every version a one-byte version tag can express.

---

## 6 · Reading the delta

No instruction parsing. One `getTransaction` yields both assets.

**USDC.** `meta.preTokenBalances` and `meta.postTokenBalances` each carry
`{ accountIndex, mint, owner, programId, uiTokenAmount: { amount, decimals } }`,
verified against mainnet. Sum `amount` over the entries where
`owner === walletAddress && mint === USDC`, on each side, and subtract:

```
delta = sum(post) − sum(pre)          // raw base units, as bigint
```

Summing rather than matching entries pairwise is what makes the two hard cases
free. **An account created inside the transaction has no `pre` entry at all** —
18 of the 1,195 transactions in the sampled block had a post entry with no pre
counterpart — and that is exactly the first-deposit case. It contributes zero
to the pre sum, which is the right answer. A wallet with two accounts for the
same mint is handled by the same sum.

Read `amount` and never `uiAmount`: `uiAmount` comes back `null` on a zero
balance, as the same block shows.

**Native SOL.** `meta.preBalances` and `meta.postBalances` are flat lamport
arrays indexed against `transaction.message.accountKeys`. Under `jsonParsed`
those keys already include lookup-table addresses, marked
`source: "lookupTable"` — in all 1,195 transactions sampled,
`accountKeys.length === preBalances.length`, so the index needs no separate
merge. Find the wallet's index and subtract.

**The fee is added back.** The fee payer's lamport delta includes it, so a
wallet that merely paid for a transaction shows a negative balance change that
is not a transfer:

```
lamportDelta = post[i] − pre[i]
transferred  = walletIsFeePayer ? lamportDelta + meta.fee : lamportDelta
if transferred === 0: nothing happened to report
```

Without this, every swap would put "Sent 0.000005 SOL" in the feed.

**A SOL change is not reported when the same transaction moved USDC.** Rent for
a new token account and the fee for a deposit are plumbing for the cash event,
not a second event. A SOL row is written only when a SOL change is the whole of
what happened to the wallet.

---

## 7 · Classifying

| asset | delta | kind           | title          | amountUsd |
| ----- | ----- | -------------- | -------------- | --------- |
| USDC  | `> 0` | `transfer_in`  | "Added cash"   | the delta |
| USDC  | `< 0` | `transfer_out` | "Sent cash"    | the delta |
| SOL   | `> 0` | `transfer_in`  | "Received SOL" | null      |
| SOL   | `< 0` | `transfer_out` | "Sent SOL"     | null      |

USDC is a dollar, so its `amountUsd` is the delta and needs no price. SOL is
not priced: the transaction has a real block time, often hours old, and pricing
it at today's price would put a wrong number on a past event. The quantity goes
in `subtitle`, which is a fact that does not decay.

**Cash and SOL share the two kinds rather than getting their own.** They are
the same event — something arrived, something left — and the asset is already
on the row as `mint`.

This is not only tidiness. `activity-map.ts` resolves an unrecognised kind with
`KIND[i.kind] ?? "receive"`, so a new `withdrawal` kind would render as money
arriving — a silent wrong direction on a screen about money. Reusing the two
kinds the map already knows removes the possibility rather than relying on
somebody remembering to add them. **No frontend change is needed.**

---

## 8 · First sight

**No backfill, with one exception.** A stream with no cursor normally records
its newest signature and emits nothing; everything after that is captured.
Both of a wallet's streams start this way the first time we ever see that
wallet: a token account discovered on that very first pass could be freshly
funded or years old, and there is no way to tell which, so it is baselined
exactly like the wallet's own address.

A token account discovered on a _later_ pass, once the wallet is already
known, is different — it is walked in full instead of baselined. It did not
exist at the wallet's last check and does now, so its entire history is
bounded and minutes old, and baselining it would discard the very deposits
that created it.

Privy creates the wallet during sign-up, so the window in which a deposit could
be missed is the gap between account creation and the first pass on a wallet
that has never held anything. External wallets, which could arrive with years
of history, are out of scope in v1 per ADR 0003 — and are the thing that would
make baselining the wallet's own address wrong, so it is written here rather
than left to be rediscovered.

---

## 9 · Data model

```
wallet_stream   wallet_id  uuid    → wallet(id) on delete cascade
                address    text     -- whose signatures this row follows
                cursor     text     -- newest signature processed; null on first sight
                checked_at timestamptz
                primary key (wallet_id, address)

activity      + mint text           -- which asset moved; null for rows with no asset
                unique (user_id, tx_signature, mint)
```

A row per stream rather than a column per stream: a wallet follows its own
address and its USDC account today, and following a stock account later is a
row rather than a migration.

Native SOL is recorded under the wrapped-SOL mint
`So11111111111111111111111111111111111111112`. The column is a mint and native
SOL has none; this is the identifier every Solana tool already uses for it, and
the unique index needs a non-null value or two passes could write the same SOL
movement twice.

The unique index is the idempotency guarantee. A movement seen twice — a crash
between writing and advancing the cursor, a transaction that appears in both
streams, or two API instances running the job — is written once.
`ON CONFLICT DO NOTHING` makes a repeated pass a no-op rather than an error,
which is what lets the cursor advance only after the write succeeds.

`mint` is nullable because a dividend row has no transaction and no single mint
movement; a unique index does not constrain rows where a column is null.

---

## 10 · Cadence and what it costs

Two streams per wallet, one `getSignaturesForAddress` each on a quiet pass,
both returning empty. At 30 seconds that is **4 calls a minute per wallet**.
Fifty wallets is 200 a minute.

That is not 200 a minute spread evenly over the minute. `syncAllWalletEvents`
walks wallets serially, and each wallet's streams serially, and every
transaction inside a stream serially — there is never more than one request
in flight. So the question is not a rate against the public RPC's ceiling; it
is how long that many sequential round trips take. At the public RPC's
roughly 300ms round trip, fifty wallets' worth of quiet-pass calls already
comes to about 30 seconds — the whole interval — before a single wallet has
had any activity worth an extra `getTransaction`.

**The binding constraint is latency, not the RPC's rate ceiling.** The
arithmetic that gets to "a little over 3 a second" describes a rate the code
never produces, sequential as it is. Nothing piles up behind that, though:
`every()` in `services/api/src/index.ts` schedules the next run only after
the current one finishes, so a slow pass does not queue a second one behind
it. What happens instead is that the cadence slips — a pass that should start
every 30 seconds starts every "30 seconds plus however long the last one
took," silently, with no error and nothing to notice it by. Fifty wallets
already spends the whole budget on empty streams alone; more wallets, or a
slower RPC, push the real interval past 30 seconds with no signal that it
happened.

An active wallet costs one additional `getTransaction` per new signature,
serial with everything else, bounded by how much the account actually does.
One fetch serves both assets.

This is still the arithmetic that rules out following stock as well: a stream
per token account would turn a wallet holding four wrappers into 10
sequential calls a minute instead of 4, and the latency problem above would
arrive at proportionally fewer wallets rather than being a separate concern.

`position-sync` stays at 2 seconds, so the **balance** a user sees updates
almost immediately; only the **row in the feed** waits at least 30 seconds,
and more once enough wallets exist to push the pass past its own interval.
That asymmetry is deliberate: the number is what people check, and it is the
cheap one to keep fresh.

---

## 11 · Failure

One wallet failing increments a counter and the loop continues, as
`position-sync` already does. Its cursors are not advanced, so the next pass
retries from the same point.

A transaction that cannot be fetched stops that wallet's pass at that signature
rather than skipping it. Skipping would advance a cursor past a movement and
lose it permanently; stopping costs a retry.

A cursor advances only after the activity rows for its stream are committed.

---

## 12 · Testing

- **Delta arithmetic, pure.** A transaction and a wallet address in, classified
  movements out. Table-driven over: a first USDC deposit with no `pre` entry, a
  USDC withdrawal, a wallet holding two accounts for the same mint, a
  transaction touching another owner's accounts and not ours, a fee-only
  transaction that must emit nothing, an incoming SOL transfer, and a
  transaction moving both SOL and USDC where the SOL leg must be suppressed.
- **The paging loop.** A stream with more than 100 new signatures walks back
  with `before` and returns all of them, oldest-first. The test that matters:
  a single full page must not advance the cursor past what it did not see.
- **Idempotency, against a real Postgres.** The same page processed twice
  writes one row per movement. The unique index is the mechanism and this test
  is what proves the mechanism is wired, so it runs against PGlite rather than
  a fake — a fake would assert our own belief about the index back to us.
- **One live check, by hand.** Send USDC to a real Privy wallet twice, and
  confirm two activity rows with real signatures and block times — twice,
  because one deposit would pass even under the bug this revision fixes.

---

## 13 · Explicitly cut

Written down as cut so nobody rediscovers them as gaps:

- **Stock transfers**, per §2. `position-sync` updates the holding, not the
  feed: an incoming transfer gets no lot, and therefore no activity row at
  all — not merely one that is missing a signature and an honest timestamp.
  A stock deposit is invisible in Activity today. Closing that is more
  `position-sync`'s shape of problem than `wallet-events`'s: it already sees
  the balance, and would need either a lot it can honestly price or a rule
  for writing an activity row with none behind it.
- **Counterparty attribution.** "From whom" needs instruction parsing and
  address labelling. The signature links to an explorer that already does it.
- **Memos.**
- **Backfill** before first sight, per §8.
- **A lock between instances.** Two API processes would both run the job; the
  unique index makes that wasteful rather than wrong. docs/03 specifies a lock
  and it remains unbuilt for `position-sync` too.

---

## 14 · Open questions

| Question                                                                | Closes by                                                                                                                               |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Does the public RPC sustain two streams a wallet at demo wallet counts? | Measuring once more than a handful of accounts exist. The fallback is a longer interval, which costs latency and nothing else.          |
| Is a SOL row worth showing at all?                                      | Watching a real feed. §6 suppresses gas and rent, so what is left is someone deliberately sending SOL — rare, and real when it happens. |
| Should a deposit notify the user rather than only appear in the feed?   | A product decision, not a technical one. The rows this spec writes are what any notification would be built on.                         |

**A known mislabel, surfaced here rather than fixed here.** `movementsIn`
classifies purely on the sign of the wallet's USDC delta: positive is "Added
cash", negative is "Sent cash". `services/api/src/routes/borrow.ts` moves
USDC into and out of the wallet for `borrow`, `repay`, `deposit`, and
`withdraw` against Kamino, and every one of those is, at the RPC level,
indistinguishable from an ordinary transfer: a Kamino borrow pays USDC into
the wallet's own token account, which is exactly the `preTokenBalances` /
`postTokenBalances` shape of someone sending the wallet money. Borrowing $500
against stock writes "Added cash · $500" into the feed today — debt presented
as a deposit. The blindness runs the other way too: once subsystem 3's
execution lands, a buy pulls USDC out of the wallet to pay for the fill, and
`movementsIn` will write "Sent cash" beside the fill's own row — one purchase
described as two events, one of them mislabelled. The sign of a balance
change cannot tell a deposit from a drawdown, or a purchase from a
withdrawal, because nothing in the token-balance diff says which program
moved the money or why. Closing it needs a signal `movementsIn` does not have
today: the other program the transaction touched (Kamino's, Jupiter's), or a
same-signature marker that `routes/borrow.ts` and the execution path write
themselves, that `wallet-events` could use to relabel or suppress its own
row. Left open on purpose — which label is correct, and whether the
history-derived row should be replaced or only tagged, is a product decision
being raised separately from this fix, not one this spec makes for it.
