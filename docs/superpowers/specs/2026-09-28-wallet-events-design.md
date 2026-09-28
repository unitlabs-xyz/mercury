# Wallet events design

**Status:** accepted, 28 September 2026

Cash arrives silently. The Money screen reads the USDC balance from chain on
every request, so the number is always right — but nothing is ever written
down, and the Activity feed never mentions it. A deposit is the most important
thing a new account does, and today it leaves no trace.

This spec covers how movements in and out of a wallet become records.

---

## 1 · Where we actually are

Verified by reading the repo on 28 September 2026.

- `position-sync` runs every 2 seconds. It reads token balances, diffs them
  against recorded lots, and writes `lot`, `position` and `activity` rows.
- It only sees tokens in the `token` table, which holds wrappers of listed
  instruments. **USDC is not one**, so cash is invisible to it.
- The `activity` rows it writes for a stock arriving carry no transaction
  signature and an invented `occurred_at` — the moment we noticed, not the
  moment it happened.
- Nothing reads transaction history. `SolanaRpc` has `tokenBalances` and
  `mintConfig`, and no third method.

So the system knows _what is held_ and has no idea _what happened_.

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

**Rejected: transaction history as the single source** — deriving positions
from a full replay. It is the more correct system and it is how a real ledger
works, but it means every position depends on a complete, gap-free history
walk, and a free RPC that throttles one call in ten is not a foundation for
that. Recorded as the upgrade path once there is a paid RPC or an indexer.

**Rejected: history for cash only** — leaving stock deposits on the balance
diff. It closes the reported gap and leaves a seam: cash events would carry
signatures and stock events would not, for no reason a user could see.

---

## 3 · What each job writes, after this

`position-sync` **stops writing transfer activity**. It keeps `lot` and
`position`, and it keeps writing **dividend** activity — a dividend is a change
in the mint's multiplier, not a transaction on the holder's wallet, so there is
no signature to find and history cannot see it. That is the whole of the
overlap, and it is a real distinction rather than a split of convenience.

`wallet-events` writes **transfer activity only**. It never writes a lot and
never touches a position. Cost basis belongs to the thing that can see the
whole holding.

---

## 4 · The history walk

Per wallet, every 30 seconds:

```
collect = []
before = null
loop:
  page = getSignaturesForAddress(address, { until: cursor, before, limit: 100 })
       → newest-first: { signature, slot, blockTime, err }
  collect += page
  if page.length < 100: break        # reached the cursor, or the end
  before = oldest signature in page  # a full page may not have reached it yet

for each signature in collect, OLDEST first:
  skip if err !== null               # a failed transaction moved nothing
  getTransaction(signature, { encoding: "jsonParsed",
                              maxSupportedTransactionVersion: 0 })
    → meta.preTokenBalances / meta.postTokenBalances
  write its movements

cursor := newest signature in collect   # only after the writes commit
```

**The loop is not optional.** `getSignaturesForAddress` returns at most `limit`
signatures, newest first. If more than a page has happened since the cursor,
one call returns the newest hundred and the older ones are simply absent —
advancing the cursor to the newest of that page would step over them and lose
them permanently. Paging back with `before` until a short page arrives is what
guarantees the walk is gap-free, which is the property the whole design rests
on.

Processing oldest-first means a crash part way through leaves the cursor where
it was and replays a little, rather than leaving a hole.

`maxSupportedTransactionVersion: 0` is required, or versioned transactions
return an error rather than a result.

### Reading the delta

No instruction parsing. Both balance arrays carry
`{ accountIndex, mint, owner, programId, uiTokenAmount: { amount, decimals } }`,
verified against mainnet on 28 September 2026. For the wallet's own address:

```
delta(mint) = post.amount − pre.amount        // raw base units, as bigint
```

**An account created inside the transaction has no `pre` entry at all.** That
is exactly the first-deposit case — the associated token account is created by
the same transaction that funds it — so a missing `pre` is read as zero rather
than skipped. Getting this wrong makes every first deposit invisible, which is
the bug this spec exists to fix.

### Classifying

| mint                   | delta | kind           |
| ---------------------- | ----- | -------------- |
| USDC or a listed token | `> 0` | `transfer_in`  |
| USDC or a listed token | `< 0` | `transfer_out` |
| anything else          | —     | ignored        |

A mint we do not list is not a position in this product, and an activity row
for it would be a row nobody can act on.

**Cash and stock share the two kinds rather than getting their own.** They are
the same event — something arrived, something left — and the asset is already
on the row as `mint`. What differs is the wording, which the server writes into
`title` and `subtitle`: "Added cash" against "Received NVDAx".

This is not only tidiness. `activity-map.ts` resolves an unrecognised kind with
`KIND[i.kind] ?? "receive"`, so a new `withdrawal` kind would render as money
arriving — a silent wrong direction on a screen about money. Reusing the two
kinds the map already knows removes the possibility rather than relying on
somebody remembering to add them.

### First sight

**No backfill.** A wallet with no cursor records its newest signature and emits
nothing. Everything after that is captured.

Privy creates the wallet during sign-up and `position-sync` sees it within
seconds, so the window where a deposit could be missed is the gap between
account creation and the first pass. External wallets, which could arrive with
years of history, are out of scope in v1 per ADR 0003.

---

## 5 · Data model

Two changes, both additive.

```
wallet        + events_cursor text            -- newest signature processed, null on first sight
              + events_checked_at timestamptz -- when the walk last completed

activity      + mint text                     -- which asset moved; null for rows with no asset
              unique (user_id, tx_signature, mint)
```

The unique index is the idempotency guarantee. A wallet processed twice — a
crash between writing and advancing the cursor, or two API instances running
the job — writes each movement once. `ON CONFLICT DO NOTHING` makes a repeated
pass a no-op rather than an error, which is what lets the cursor advance only
after the write succeeds.

`mint` is nullable because a dividend row has no transaction and no single
mint movement; the unique index does not constrain rows where it is null.

---

## 6 · Cadence and what it costs

A quiet wallet costs **one `getSignaturesForAddress` per pass**, returning an
empty list. At 30 seconds that is 2 calls a minute per wallet. Fifty wallets is
100 calls a minute, under 2 a second — inside what the public RPC tolerates,
measured at one error in ten on a burst.

An active wallet costs one extra `getTransaction` per new signature, which is
bounded by how much the account actually does.

`position-sync` stays at 2 seconds, so the **balance** a user sees updates
almost immediately; only the **row in the feed** waits up to 30 seconds. That
asymmetry is deliberate: the number is what people check, and it is the cheap
one to keep fresh.

---

## 7 · Failure

One wallet failing increments a counter and the loop continues, as
`position-sync` already does. Its cursor is not advanced, so the next pass
retries from the same point.

A transaction that cannot be fetched stops that wallet's pass at that
signature rather than skipping it. Skipping would advance the cursor past a
movement and lose it permanently; stopping costs a retry.

The cursor advances only after the activity rows for that page are committed.

---

## 8 · Testing

- **Delta arithmetic, pure.** Pre/post pairs in, classified movements out.
  Table-driven over: a first deposit with no `pre` entry, a withdrawal, a
  partial withdrawal, an unlisted mint, a failed transaction, a transaction
  that touches another owner's accounts and not ours.
- **Idempotency.** The same page processed twice writes one row per movement.
  This is the test that matters; the unique index is the mechanism and the
  test is what proves the mechanism is wired.
- **Ordering.** A page processed oldest-first leaves the cursor at the newest
  signature, and a crash after processing half a page loses nothing.
- **One live check, by hand.** Send USDC to a real Privy wallet and confirm one
  activity row appears with the real signature and block time, and that a
  second pass adds nothing.

---

## 9 · Explicitly cut

Written down as cut so nobody rediscovers them as gaps:

- **Native SOL movements.** They live in `meta.preBalances`/`postBalances` as
  lamports indexed by account key, not in the token arrays. Mercury holds no
  SOL position, and gas is not a thing a user acts on.
- **Counterparty attribution.** "From whom" needs instruction parsing and
  address labelling. The signature links to an explorer that already does it.
- **Memos.**
- **Backfill** before first sight, per §4.
- **A lock between instances.** Two API processes would both run the job; the
  unique index makes that wasteful rather than wrong. docs/03 specifies a lock
  and it remains unbuilt for `position-sync` too.

---

## 10 · Open questions

| Question                                                              | Closes by                                                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Does the public RPC sustain a 30s walk at demo wallet counts?         | Measuring once more than a handful of accounts exist. The fallback is a longer interval, which costs latency and nothing else. |
| Should a deposit notify the user rather than only appear in the feed? | A product decision, not a technical one. The rows this spec writes are what any notification would be built on.                |
