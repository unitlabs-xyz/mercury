# Linked wallets: design

**Status:** built, steps 1–11, on `feat/linked-wallets` (step 10 differs from the first draft: see
"A Glider basket, moved by Mercury") · 13 November 2026, amended 25 November 2026 · web and iOS ·
[ADR 0017](../../adr/0017-linked-wallets.md)

Someone signed in to Mercury can link Solana wallets they already hold, such as Phantom. Mercury
then shows what those wallets hold and owe, on web and iOS, warns before their loans are
liquidated, and on web lets the person trade, borrow, repay, invest in baskets, use Earn and move
funds into the Mercury wallet, with the linked wallet signing each action.

## Goal

Let someone who uses Mercury **link Solana wallets they already hold** (Phantom and the like, up
to 5) and see in Mercury what those wallets hold and owe, **with the same positions, P&L and loan
health the Mercury wallet gets**:

- tokenised shares Mercury lists (xStocks and Ondo wrappers), USDC and SOL;
- loans in Kamino's xStocks market, with liquidation warnings;
- the Kamino Earn vault, and Glider baskets.

**Done for the first release** (build steps 1–7) when a linked wallet, within minutes of linking,
shows on web and iOS every holding and loan above with its value, its real P&L from what the shares
cost (exact or marked `~`), and its loan health with warnings, and stops being tracked the moment
it is unlinked. Acting for a linked wallet and moving its funds into the Mercury wallet follow in
steps 8–11.

## Decisions already made

- **Every wallet is shown everywhere,** web and iOS, the Mercury wallet first and then linked
  wallets in the order they were linked.
- **Actions on linked wallets are web only.** On iOS a linked wallet is read-only, with "Manage on
  web". On web, the person is reminded (gently, dismissibly) that moving funds into the Mercury
  wallet makes every action one tap.
- **An unlinked wallet is hidden and untracked.** Nothing about it shows on web or iOS, no job
  reads it, and it gets no alerts or portfolio updates until it is linked again.
- **At most 5 linked wallets at a time,** beside the Mercury wallet. Only active links count: a
  person can own any number of addresses and swap which 5 are linked, but the rest aren't tracked.
- **A summary at the top of Home,** once anything is linked: net worth, P&L, income and loan
  interest across every wallet.
- **A linked wallet's past is rebuilt from its token accounts' history,** by a reader inside the
  API, so purchase prices, loan deposits and Earn interest are shown with dates and prices.
  Figures that are estimated rather than read are marked `~`.
- **Positions show at once, P&L when it is real.** A linked wallet's holdings, value and loan
  health appear within seconds of linking. Its P&L says "Calculating…" until the history reader has
  read the wallet's past; it is never worked out from the day it was linked.
- **The first release includes the cost half of the history reader,** so P&L for a linked wallet
  is real within minutes of linking, not months later. Loan and Earn history come after.

## Two kinds of wallet

|                     | Mercury wallet                       | Linked wallet                                    |
| ------------------- | ------------------------------------ | ------------------------------------------------ |
| Created by          | Privy, at sign-in                    | The person, who already holds it                 |
| `wallet.kind`       | `privy_embedded`                     | `external`                                       |
| `wallet.is_primary` | `true`, exactly one per user         | `false`                                          |
| Signs with          | Privy, no pop-up (ADR 0012)          | Its own wallet, a pop-up per action              |
| Shown on            | Web and iOS, first                   | Web and iOS, after the Mercury wallet            |
| Acted on from       | Web and iOS                          | Web only                                         |
| Fees                | As set (`TRADING_FEE_BPS` and so on) | The same                                         |
| Basket rebalancing  | Glider, daily                        | Glider, daily (authorized by one signed message) |
| First-loan setup    | Paid by Mercury (#86)                | Paid by the wallet itself                        |
| Polled              | As today                             | By how recently it was looked at. See jobs       |

## Scope

**In**

- Link, list, rename and unlink Solana wallets from Settings on web, up to 5 linked at a time.
- Every wallet's positions, loans and activity on web and iOS, the Mercury wallet first.
- A summary across all wallets at the top of Home on both.
- Track xStocks, USDC and SOL, loans in Kamino's xStocks market, Glider baskets and the Earn vault
  for each linked wallet.
- Full loan health from the moment of linking: collateral, debt, LTV, liquidation price, health
  state, and warnings in the inbox and by email.
- The loan's history, rebuilt from the chain after linking: when it was opened, each collateral
  deposit with its date, shares and the share price then, each borrow and repay, interest paid,
  past liquidations.
- What each stock held cost: exact where the wallet swapped USDC for it, `~` estimated from the
  market price at the time it arrived otherwise. P&L from that.
- Interest earned in Earn, from the wallet's own deposits and withdrawals.
- A history reader inside the API that does all of this on a strict RPC budget of its own, so a
  long walk through someone's past never takes reads from the app.
- Every action the web app offers for the Mercury wallet, from a linked wallet: buy, sell, borrow,
  repay, pledge and withdraw collateral, baskets, Earn, send.
- Move tokens (stocks, USDC) from a linked wallet into the Mercury wallet in one click, with their
  cost basis.
- Move a linked wallet's Glider baskets to the Mercury wallet, run by Mercury step by step.

**Out**

- Sign-in with a wallet. Sign-in stays email → Privy.
- EVM wallets. MetaMask's EVM accounts keep funding through Relay only. A MetaMask Solana account
  links like any other Solana wallet if AppKit offers it.
- AMM and LP positions, Kamino markets other than xStocks, Kamino Multiply, and other lending
  protocols.
- Acting for a linked wallet on iOS, and linking or unlinking from iOS.
- Automation Mercury would sign itself (recurring buys). Not built for anyone yet.
- Sanctions screening of linked wallets. It is needed before linking opens to the public (ADR 0017,
  "Consequences") and is designed separately, so nothing in this design waits for it.

## Linking

### Flow

1. **Settings → Linked wallets → Link a wallet.** AppKit opens with Solana only (the EVM adapter is
   not offered here).
2. The browser asks the server for a challenge, then the wallet signs the challenge message.
3. The server checks the signature and saves the wallet. The first sync starts at once, so the
   dashboard fills within seconds.

### Endpoints

All behind `requireAuth`, in a new `routes/wallets.ts`.

| Route                             | Does                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /v1/wallets`                 | The caller's wallets: `{ id, address, kind, isPrimary, label, linkedAt }`, primary first |
| `POST /v1/wallets/link/challenge` | Body `{ address }`. Returns `{ challengeId, message }`. Expires in 10 minutes            |
| `POST /v1/wallets/link`           | Body `{ challengeId, signature }`. Verifies, saves, returns the wallet. `409` if refused |
| `PATCH /v1/wallets/:id`           | Body `{ label }`. A name like "Phantom main"                                             |
| `DELETE /v1/wallets/:id`          | Unlinks. `?history=delete` also deletes its history. `400` on the primary wallet. `204`  |

### The message

Sign-In-With-Solana's plain-text form, so wallets that know it show it nicely:

```
beta.trymercury.xyz wants you to link this wallet to your Mercury account:
<address>

Linking lets Mercury show this wallet's positions and build transactions for you to sign.
It does not let Mercury move funds without your signature.

URI: https://beta.trymercury.xyz
Version: 1
Chain ID: mainnet
Nonce: <random, 16 bytes, base58>
Issued At: <ISO time>
Expiration Time: <issued + 10 minutes>
```

### What the server checks

- The challenge exists, belongs to the caller, has not expired and has not been used. It is marked
  used in the same transaction that saves the wallet, so it can never link twice.
- The signature is a valid ed25519 signature by `address` over the exact message stored with the
  challenge (the message is never taken from the client).
- The address is a valid Solana public key and is **not already in `wallet`** under anyone,
  including as someone's Mercury wallet. `wallet_address_idx` already enforces this; the route
  turns the conflict into a `409` that says the wallet is linked elsewhere, without saying to whom.
- **The exception is the caller's own unlinked row.** Linking that address again reactivates the
  same row (`unlinked_at` cleared, `linked_at` set to now) rather than inserting a second one; see
  "Linking again".
- **A plain Unlink keeps the address with the account.** The row stays, so the address cannot be
  linked to another Mercury account until it is removed with "Unlink and delete history". That is
  deliberate: whoever holds the key can sign in to the first account and free it, and nobody else
  should be able to take over a wallet's kept history. The `409` says so: "This wallet is linked to
  another Mercury account. Its owner can free it there with Unlink and delete history."
- The caller has **fewer than 5 active linked wallets** (`kind = 'external'`, `unlinked_at is
null`). The Mercury wallet doesn't count, and nor do unlinked ones. The count and the insert run
  in one transaction under a per-user lock (`pg_advisory_xact_lock` on the user id), so two links
  sent at once can't make 6.
- The insert sets `kind: "external"` and **`is_primary: false` explicitly**. The column defaults
  to `true` (`db/schema.ts`), so a forgotten flag would try to make a second primary wallet;
  `wallet_one_primary_idx` would refuse it, but the route shouldn't rely on that.

### The limit of 5

- **Only active links count.** Someone with 10 addresses links any 5. The other 5 are not tracked:
  no balances, no activity, no loan warnings, nothing in the summary.
- **Swapping is unlink one, link another.** Settings shows "5 of 5 linked" and, at the limit, the
  Link button is replaced by "Unlink a wallet to link another".
- **Linking an unlinked wallet again counts like a new link,** brings its kept history back, and
  fills in what happened while it was unlinked. See "Linking again".
- At the limit, `POST /v1/wallets/link/challenge` answers `409 link_limit` before any signature is
  asked for, so nobody signs a message only to be refused.
- The 5 is one setting, `LINKED_WALLET_LIMIT`, defaulting to 5.
- A person can open at most 20 challenges in a challenge's ten minutes; past that the route
  answers `429 too_many_challenges`. Linking takes one; the ceiling only stops a flood of rows.

### Unlinking

**Linked is not the same as connected.** A linked wallet is tracked from its address alone.
Phantom only needs to be connected in the browser to sign an action. Disconnecting Phantom, or
never opening it, changes nothing about tracking or warnings.

Settings offers two ways to stop following a wallet:

| Option                        | What happens                                                                                                                      | Undo                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Unlink** (the default)      | Sets `wallet.unlinked_at`. Jobs skip it from the next pass, routes refuse to act for it, and nothing about it shows on web or iOS | Link the same address again, with a new signature. Its history comes back |
| **Unlink and delete history** | Deletes the wallet row and everything about it (listed below). The address is free to link to any account                         | None. The confirm screen says so                                          |

Under **Unlink**, the wallet stops being followed at all:

- **No updates.** `position-sync`, `wallet-events`, `portfolio-snapshot` and the history reader skip
  it from the next pass. Its positions and chart freeze where they were, out of sight.
- **No alerts.** `loan-watch` skips it, so no liquidation warning by inbox or email, however close
  its loan gets. Its `loan_alert` row is cleared, so if it is linked again, a loan already in
  trouble is warned about straight away.
- **Nothing shown.** Every read (portfolio, activity, loans, chart, the summary, the inbox) filters
  on `unlinked_at is null`, so an unlinked wallet's rows are invisible, not just its card. Inbox
  items about it are hidden with it.

**Kept history can be deleted later, without linking again.** Settings → Linked wallets lists the
wallets unlinked with their history kept ("Kept history", from `GET /v1/wallets`'s `kept`), each
with "Delete history" behind its own confirmation, which does what Unlink and delete history does.
The history is the account's, not the address's, so the person's own session is the proof: the
Mercury wallet is the account's own wallet, made at sign-in, and nothing has to be signed by the
unlinked wallet, which may be long gone.

**When the wallet has an open loan,** the unlink confirmation says so plainly: "This wallet has a
loan. After unlinking, Mercury won't warn you if it gets close to liquidation." Unlinking still
goes ahead if confirmed.

Under **Unlink and delete history**, these are deleted with the wallet row, in one transaction:
positions, lots, disposals, activity, snapshots, loan events, the loan alert, Earn events,
inbox notifications about the wallet, and the history reader's `history_job`
and `history_event` rows. Two things are kept:

- `order` rows, with `wallet_id` set to null. They record the Mercury fee charged, which the books
  need, and nothing reads them back to the person once the wallet is gone.
- `history_tx` rows. They are raw public transactions keyed by signature, one transaction can
  belong to several wallets' histories, and nothing in them says which account read them.

Deleting an account deletes all its wallets and their rows, as today.

### Linking again

An unlinked wallet that is linked again (same account, new signature) has a gap: whatever happened
between `unlinked_at` and the new `linked_at` was seen by no job. Its kept rows are frozen at the
moment it was unlinked, so the gap must be filled before anything is shown as current:

- **The same row comes back.** `unlinked_at` is cleared and `linked_at` set to now. Its positions,
  lots, activity, snapshots and loan and Earn events are visible again.
- **A `history_job` is queued from the wallet's kept cursors,** so the reader reads only the gap,
  not the whole past again. Until it finishes, the wallet's P&L says "Calculating…", exactly as for
  a first link.
- **`wallet-events` starts again from the new link**, as for a new address: its stream is reset,
  because walking months of gap from its old cursor stalls it at its page cap. The gap's cash
  transfers are written to the feed by the cost pass instead, from what the reader read, worded as
  the live job words them and marked "Found in history". They never reach the inbox as news.
- **`position-sync` runs as on any pass:** balances come from the chain at once. Shares that
  arrived during the gap have no cost until the reader has priced them, as for a new link.
- **`loan_alert` starts empty** (it was cleared at unlink), so a loan already in trouble is warned
  about on the first `loan-watch` pass.

## Data

Migration `0030_linked_wallets.sql`.

### `wallet`

```ts
label: text("label"),
linkedAt: timestamp("linked_at", { withTimezone: true }),   // null for Mercury wallets
unlinkedAt: timestamp("unlinked_at", { withTimezone: true }),
lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }), // sets polling speed
```

Plus a partial unique index so a user can only ever have one primary wallet:
`uniqueIndex("wallet_one_primary_idx").on(t.userId).where(sql\`${t.isPrimary}\`)`.

### `wallet_link_challenge`

```ts
id: uuid().primaryKey().defaultRandom(),
userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
address: text().notNull(),
message: text().notNull(),
expiresAt: timestamp({ withTimezone: true }).notNull(),
usedAt: timestamp({ withTimezone: true }),
```

The daily retention job deletes rows older than a day.

### A wallet on every per-wallet row

Today these tables are keyed by user, because a user had one wallet. Each gains
`wallet_id uuid not null references wallet(id)`, backfilled from the user's primary wallet in the
same migration:

| Table                | Key or index that changes                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `position`           | Primary key `(user_id, instrument_id)` → `(wallet_id, instrument_id)`                                                                                                                                                                                                                                                                                                                                                                                                      |
| `lot`                | `lot_wallet_token_idx` `(wallet_id, token_id)` beside `lot_user_token_idx`, which is kept for the reads across every wallet ("All wallets", the summary); `disposal` likewise. `source` gains `chain`, `declared` and `basket_exit` beside `buy`, `transfer_in`, `dividend`, `basket`. Whether a cost is exact or inferred stays in the `is_estimated` column that already exists ("True when we inferred the cost. The UI has to say so."), so the two can never disagree |
| `disposal`           | Gains the column. Index alongside `lot`'s                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `order`              | Gains the column, **nullable**, `on delete set null`, so fee records outlive a deleted wallet                                                                                                                                                                                                                                                                                                                                                                              |
| `activity`           | `activity_signature_mint_idx` `(user_id, tx_signature, mint)` → `(wallet_id, tx_signature, mint)`                                                                                                                                                                                                                                                                                                                                                                          |
| `portfolio_snapshot` | Its key gains `wallet_id`                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `loan_event`         | `loan_event_signature_kind_idx` → `(wallet_id, tx_signature, kind)`. Gains `origin_source` (`mercury` or `chain`) and `price_usd`, the collateral's share price at the time                                                                                                                                                                                                                                                                                                |
| `loan_alert`         | Primary key `user_id` → `wallet_id`: one remembered health per loan, not per person                                                                                                                                                                                                                                                                                                                                                                                        |
| `earn_event`         | Gains the column and `origin_source` (`mercury` or `chain`)                                                                                                                                                                                                                                                                                                                                                                                                                |

`origin_source` says who wrote the row: `mercury` when Mercury recorded it at confirm time, `chain`
when the history reader found it afterwards. It is not `lot.source`, which already exists and says
how the shares were acquired. `lot.source` is a plain `text` column whose values live only in the
Drizzle schema (no database check), so its four new values need no SQL.

The history reader's own tables (`history_job`, `history_tx`, `history_event`) are in the same
migration; see "The history reader".

The `activity` index change matters on its own: a move between the Mercury wallet and a linked
wallet is **one signature and one mint seen by two wallets of the same user**. Under the current
index the second row would be dropped as a duplicate.

`user_id` stays on every table, so every existing "all of this user's rows" query keeps working.
That is also what the "All wallets" view reads.

`funding_intent` doesn't change: deposits always go to the Mercury wallet. `basket_account`
doesn't change: it is already keyed by the smart account's own address, and the owner it belongs to
is read from Glider.

## Which wallet a request acts for

One header, `X-Mercury-Wallet: <wallet id>`, read by a new middleware mounted after `requireAuth`:

- Absent: the primary wallet. Every iOS action omits it, so iOS acts only for the Mercury wallet.
  It can't do otherwise anyway: it has no way to get a linked wallet's signature.
- Present: it must be one of the caller's wallets, not unlinked, or the request is a `403`.
- The result is set on the context as `wallet: { id, address, kind }`.

`identity.walletAddress` is read in 47 places across `app.ts` and `routes/`. Each one that means
"the wallet this action is for" changes to `c.get("wallet").address`. Each one that means "the
Mercury wallet" (deposits, funding, the first-loan setup) stays. That split, route by route, is
most of the work in the build plan.

Read routes (`/v1/portfolio`, `/v1/activity`, loans, the chart) also accept
`X-Mercury-Wallet: all`, which sums across every active wallet. One header picks the wallet for
every route, so there is no query parameter to keep in step with it. Write routes answer `400` to
`all`.

## Signing and the relayer

Nothing about how transactions are built changes. The owner passed to every builder is the acting
wallet's address instead of the identity's:

- **Buy and sell:** quote, review, build, sign, confirm, as today. The Mercury fee transfer is in
  the transaction whoever signs it.
- **The relayer** stays fee payer. `relay/validate.ts` checks the transaction needs "this
  account's signature". "This account" becomes the acting wallet, so a linked wallet's transaction
  is sponsored and a transaction for someone else's wallet still isn't.
- **The web client** signs with Privy for the Mercury wallet and with the AppKit Solana provider
  for a linked wallet. The AppKit path already exists for funding (`api/fund-swap.ts` handles the
  differences between Phantom's API and the wallet-standard one); it moves into a shared signer the
  trade, loan, basket, Earn and send flows choose from by wallet kind.
- **Glider baskets:** enrollment and manual rebalances are authorized by `signMessage`
  (`api/baskets.ts`). The same message, signed by the linked wallet, makes it the smart account's
  owner, and Glider's daily rebalancing then runs as it does for the Mercury wallet.

## Background jobs

Every query that reads `wallets.isPrimary = true` today reads **active wallets**
(`unlinked_at is null`) instead. There are six, four jobs and the two lists that decide what is
subscribed to (#112):

- `portfolio/sync.ts:56`, `wallet-events/sync.ts:293`, `portfolio/snapshot.ts:59` and
  `lending/watch-loans.ts:54`: the jobs. Each carries the wallet id through to what it writes.
- `portfolio/accounts.ts:32`: the wallets whose token accounts are found and watched.
- `wallet-events/streams.ts:25`: the wallets whose streams `logsSubscribe` watches.

Missing either of the last two would not break anything visibly: a linked wallet would still be
read, but only by the sweep, 10 to 15 minutes behind.

Since #112 the per-wallet jobs are told what changed rather than asking. A linked wallet is
subscribed to exactly like the Mercury wallet:

| Job                     | Mercury wallet and linked wallet, stream healthy                                      |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `position-sync`         | `accountSubscribe` on each token account, acted on within 10s; every wallet swept 15m |
| `wallet-events`         | `logsSubscribe` on `wallet_stream`, acted on within 30s; every wallet swept 10m       |
| Token-account discovery | `getTokenAccountsByOwner` every 10m, the only steady-state read                       |
| `portfolio-snapshot`    | Hourly                                                                                |
| `loan-watch`            | 5m, a chain read per borrower. A loan Mercury can't act for gets no slower a check    |

When the stream can't be trusted (no socket, a socket down, a subscription never acknowledged),
`position-sync` and `wallet-events` fall back to polling. That fallback is where how recently a
wallet was viewed matters:

| Job, falling back | Mercury wallet                      | Linked wallet                                                     |
| ----------------- | ----------------------------------- | ----------------------------------------------------------------- |
| `position-sync`   | 10s with the app open, 1m otherwise | 10s while open, 5m if viewed in the last 7 days, **1h** otherwise |
| `wallet-events`   | 30s                                 | 5m if viewed in the last 7 days, **1h** otherwise                 |

The history of a linked wallet is not one of these jobs. It runs inside the API under its own
budget; see "The history reader".

Presence (`jobs/presence.ts`) is keyed by address already. When web or iOS shows a linked
wallet's positions (its own page, or Home, where every wallet is listed), it reports that wallet's
address as present, and `position-sync` treats it like an open Mercury wallet. "Viewed" is the last
time that happened, kept on `wallet.last_viewed_at`. Presence is reported every few seconds, so the
column is written **only when it is more than an hour old** (`where last_viewed_at < now() - interval
'1 hour'`): the tiers it feeds are measured in days, and a write per ping would be a database write
per viewer every few seconds for nothing.

`loan-watch` ignores how recently a wallet was viewed. Every loan is checked every 5 minutes,
because a missed liquidation warning is the one failure the slower polling must never cause.

**A new link is baselined, not backfilled**, as `wallet-events` already does for a wallet's first
pass. Years of transfers would otherwise land in the activity feed and the inbox as if they were
new.

### Who costs a linked wallet's shares

`position-sync` writes no lot for shares that arrive where Mercury did not see them bought. It
counts them in the holding (`position.shares`) and not in the shares it can prove a cost for
(`shares_with_basis`), so profit is only ever measured against what was paid. That is true of the
Mercury wallet today, and it is what a linked wallet needs:

- **On linking, every share is held at no known cost.** Value and the day's change show at once,
  from prices. P&L says "Calculating…" until the history reader has read the wallet.
- **The history reader writes the cost.** It prices each arrival from the wallet's own history
  and writes `chain` lots, exact or `~`; every share ends with a cost (see "Prices at a past
  moment"). `shares_with_basis` rises to meet `shares`, and P&L appears.
- **It keeps doing so after the first read.** Shares bought later, from Phantom through Jupiter
  say, arrive with no cost exactly as before linking, so the reader keeps reading a linked
  wallet's token accounts and prices each new arrival as it is found (see "After the first read").
- **`position-sync` still writes what it always has:** dividends from the multiplier, and the
  shares that leave. Nothing else writes those, so the reader and `position-sync` never write the
  same thing.

## What the person sees, and when

| When                                            | What                                                                                                                                                                                              | From                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Seconds after linking**                       | Every holding with its value and day's change. The Kamino loan: collateral, debt with interest, LTV, liquidation price per stock, health, warnings. P&L says "Calculating…"                       | The chain's current state, by the usual jobs |
| **Minutes after linking**, once history is read | What each stock cost and its P&L. When the loan was opened, each collateral deposit (date, shares, share price then), each borrow and repay, interest paid, liquidations. Interest earned in Earn | The history reader                           |

Until the history reader finishes a wallet, its P&L shows "Calculating…" and the summary counts
that wallet as "calculating". Positions, value and loan health never wait for it. Loan history and
Earn interest show "Reading history…" until step 11 is built and has read them.

## The history reader

A reader that runs inside the API, beside the other jobs. It is written so it could be lifted
into its own process later — its queue is a table and its budget is explicit — but it does not
start as one. `services/` holds only `api`: PR #24 (`a81385b`) deleted `services/worker` and folded the
jobs into the API, and the backend design spec states "The API as one process, jobs included"
([2026-09-23 backend design](2026-09-23-backend-design.md)). A second
long-lived process means a second image, a second Coolify resource and a second set of memory and
CPU limits, and nothing here needs it yet.

- **The same paid RPC as the API** (`SOLANA_RPC_URL`). It must serve full history
  (`getSignaturesForAddress` back to an account's creation); check the plan does before step 6.
  It shares one allowance with everything else, so the reader **stays out of the app's way**:
  - a fixed budget of its own, `HISTORY_RPC_RPS` (default 2 requests a second), well under the
    plan's limit
  - on any 429 it stops for a minute, then resumes at half the rate, so the app's reads and
    trades always win
  - it reads nothing while the jobs' own lane is being refused ("the node refused this pass").
    Running inside the API is what makes this one possible: that state is held in memory, in one
    process (`jobs/presence.ts`: "Memory, and one process"), so a reader in a second process
    could not see it at all without first moving the signal into Postgres.

  On 23 October the paid allowance ran out and every route that reads the chain answered 429
  until it had room again. The API stayed up; the reads behind it did not. The budget is a hard
  ceiling, not a target.

- **Its own queue,** a `history_job` table: one row per wallet to read, with its status, cursor
  and attempts. Linking a wallet inserts one. The reader takes jobs with
  `for update skip locked`, so a second reader could share the queue if it is ever split out.
- **Its own tables for what it reads** (below), kept apart from Mercury's records. Only its last
  step writes into `lot`, `loan_event` and `earn_event`, each row marked with where it came from,
  so the portfolio, loan and Earn screens have one code path and can still say "found in history".
- **Mercury's own transactions never go through it.** A trade, borrow or Earn deposit made in
  Mercury is recorded at confirm time as today. The reader skips any signature already recorded.

### It reads token accounts, not the wallet

A wallet can have thousands of transactions; most are irrelevant. Each **token account** holds one
token, so its history is only the transactions that moved that token, usually tens of them. The
reader reads:

1. **The wallet's token accounts:** `getTokenAccountsByOwner`, for both the token program and
   Token-2022 (xStocks are Token-2022). Kept: every account whose mint Mercury lists (xStocks,
   USDC, and the Earn vault's share token).
2. **The wallet's Kamino loan account** in the xStocks market, which `kamino.ts` already finds by
   owner.
3. For each, **`getSignaturesForAddress`** (a thousand a call), then **`getTransaction`** for each
   signature. Each transaction gives its time (`blockTime`) and every account's token balance
   before and after it, which is all the amounts the reader needs. It doesn't decode swap routes.

**It reads newest first, and stops at the last time the account was empty.** One call per
transaction is the cost, so a trader's token account with thousands of them is the expensive case.
But each transaction says the account's balance before it, and once the walk back reaches one whose
balance before was zero, nothing older can change today's cost or unrealised P&L: everything bought
before it had already left. So a position bought once and held is a few calls, and one emptied and
refilled many times is only the stretch since it was last empty. The replay then runs forward from
that point.

**Shares pledged to Kamino are still held.** Pledging moves them out of the wallet's token account
into Kamino's reserve, so the account alone reads as empty when they are all pledged. The reader
asks Kamino what is pledged today, reads an account that is empty only because of a pledge, and
works the pledged amount back through each pledge and withdrawal it passes: it stops only where
the wallet held none in its account **and** none in the loan. If Kamino can't be read, the pass
waits a minute, uncounted, rather than read a pledged holding as sold.

What this gives up is realised P&L on positions closed before that point, outside Mercury and
before linking. Realised P&L on anything sold through Mercury, or after linking, is kept.

**What the walk never mistakes.** A transaction the node keeps without its details (no balances)
doesn't stop the walk: "no balances" is not "held none". One the node lists but won't return (not
indexed yet, or pruned) fails the pass, retried further out each time, rather than being skipped
with a purchase in it. Events are replayed in slot order, not block time, which is whole seconds: a
buy and a sale in one second never swap places. SOL is an arrival's price only beyond the rent of
accounts its transaction opened, and only from 0.01 SOL up; less is a tip, and the arrival is priced
as one from outside. Shares out of one of the person's own Mercury baskets are left to the basket's
reconciler, which records them with their share of the basket's cost.

**There is no cap.** An account is read back until it was empty, however many transactions that
is: a cost guessed where a walk stopped short would be wrong for good, and a longer "Calculating…"
is the better trade. At the reader's two calls a second, 5,000 transactions is about forty
minutes. It needn't be one unbroken window: each transaction is kept in `history_tx` the moment it
is read and read back from there before the node is asked, and each account's cursor is kept as
soon as it is done, so a pass the node refuses part way loses nothing, and the next asks the node
only for what it never got (re-listing signatures is one call a thousand). On a shared or free RPC
allowance, a long first read finishes across several short windows. Later passes have no cap
either: everything newer than the cursor is read. (A cap can still be set, for tests; where a walk
stops at one, the shares held at the oldest point reached, in the wallet and in the loan, are
priced at the price then and marked `~`.)

What it reads is kept raw, so a better rule later can re-derive without reading the chain again:

```ts
history_tx:    signature (pk), slot, block_time, fetched_at, raw jsonb
history_event: id, wallet_id, account, signature, block_time,
               kind ("in" | "out" | "loan_open" | "loan_deposit" | "loan_withdraw" | "loan_borrow"
                     | "loan_repay" | "loan_liquidated" | "earn_deposit" | "earn_withdraw"),
               mint, amount_raw, counter_mint, counter_amount_raw, -- what left the wallet in the same tx
               source_owner                                       -- for transfers in: who sent it
```

### What each stock cost

For each token account, the reader walks its events oldest first.

**Each arrival gets a cost:**

| What the transaction shows                                 | Cost per share                                      | Marked    |
| ---------------------------------------------------------- | --------------------------------------------------- | --------- |
| Swap: USDC or USDT left the wallet in the same transaction | Dollars paid ÷ shares received                      | Exact     |
| Swap: SOL or another token left the wallet                 | That token's price at that moment × amount ÷ shares | `~`       |
| (another token Mercury doesn't list, which it can't price) | The share price at that moment, as a transfer in    | `~`       |
| Plain transfer in (an exchange, a person, another wallet)  | The share price at that moment                      | `~`       |
| Sent from another of the person's **own** wallets          | The cost it had there just before it left           | As it was |

What a swap was paid with is dollars wherever dollars left in it, else the largest other token out:
raw amounts of different tokens are not values, so dollars are never passed over.

**Each departure** takes its share of the cost by Mercury's own rule, average cost
(`packages/core/src/portfolio/cost-basis.ts`): the average cost per share of what remains doesn't
change. Replaying a token account's whole history is cheap because it is short, and it gives the
same answer the Mercury wallet's positions would.

**Collateral is neither.** A transaction Kamino's lending program made (and no Earn vault) that
moved the stock is a pledge (`loan_deposit`) or a withdrawal (`loan_withdraw`), not a departure or an
arrival: the shares keep the lots and the cost they had, as position-sync keeps them
(`withPledged`). What was pledged or taken back is read from the xStocks market's own reserve
account (its authority, `2Z7zhqp1eddmHNmEqexftST6DFPWmoL4QqfgiG5uJMJx`, derived from the market
and checked on mainnet), not from the wallet's balance: a buy and a pledge in one transaction
leave the wallet's balance where it was, and are a pledge and an arrival at what was paid; a
withdrawal sold in the same transaction is a withdrawal and a sale. Only a liquidation sells them. It doesn't touch the wallet's account, so it is read
from the loan's history, and is booked as a sale: Kamino's price for the shares, less their
average cost just before, is realised P&L (`loan_event.realised_pnl_usd`), counted with the sells'.
Until a linked wallet's past is costed, it waits rather than count the whole sale as profit.

**Dividends, told before they land:** the issuer writes the next multiplier to the mint ahead of
its date (`newMultiplier`, `newMultiplierEffectiveTimestamp`). The hourly `dividend-notices` job
reads every listed mint for a change still ahead and tells each followed wallet holding that token,
once (`multiplier_announcement`): "TSLA dividend coming · On Dec 3, paid as shares: about 0.0085
more on your 10", in the feed (`dividend_notice`, no amount) and the inbox. A multiplier more than
doubling is told as a split. The dividend itself is still recorded when it takes effect, as below.

**Dividends:** xStocks pay by raising a multiplier, so one token later stands for more stock. Each
arrival is converted to shares with the multiplier in force at its time (`multiplier_event`), and
each multiplier change after it is a dividend, at no cost, as `position-sync` already treats them. A multiplier more than doubling is a **split**, not a dividend
(the stocks job's rule): its shares come at no cost all the same, so the cost per share falls by the
split, but nothing was earned. It is a `split` lot and a "TSLA stock split" row with no amount, and
never in dividend income.

What's left after the replay is written as lots for that wallet, in one transaction: `source: "chain"`, with
`is_estimated` false where the wallet swapped USDC for the stock and true where the cost was
inferred from the market price at arrival, and the time and price of each arrival.

**Precedence:** a cost the person entered ("Set cost", `source: "declared"`) always wins. An
estimate never replaces an exact figure. A purchase made in Mercury is always exact.

### Prices at a past moment

Mercury keeps minute bars for only 30 days (`price-bar-prune`). For anything older, the reader
asks a historical source for the price at the arrival's time: **an hourly or daily price is enough
for an estimate**, and the screen says it is one.

Every share ends with a cost. In order, the first that answers:

1. exact, from the swap (USDC or USDT left the wallet in the same transaction);
2. the market price at the arrival's time, from the historical source below;
3. the earliest price Mercury itself has for the stock (`price_bar`);
4. the price on the day the wallet was linked.

Everything after the first is marked `~`, with a line saying where the estimate came from ("from
the price when you linked this wallet"), and every one of them offers "Set cost". A price source
that fails is not a missing price: the reader backs off and tries again, and the wallet stays
"Calculating…" until it answers, giving up to the next rule only after repeated failures. An empty
answer for a past moment is believed for fifteen minutes and then asked again: Yahoo sometimes
answers that way for a while, and kept for good it priced a whole hour by a worse rule.

**The source is the Yahoo client Mercury already has** (`packages/market/src/yahoo.ts`), which
reaches the same chart endpoint. It asks today by preset `range`, so reading one past moment adds
`period1`/`period2` (epoch seconds) beside the presets; the response shape is unchanged, so this
is a parameter, not an adapter. Measured 14 November 2026 against `AAPL`: an hourly series comes
back for a window six months old (36 points over five days) and for one two years old, and at
three years hourly is refused ("1h data not available") while daily still answers. So **hourly
within about 730 days, daily beyond it** — within what an estimate needs, and xStocks are younger
than that bound.

Pyth is not the source, and this is already settled in the file that would have used it: Pyth
Benchmarks "returns 403 for equity feeds on our entitlement and has no range endpoint at all,
measured 28 September 2026". `PYTH_API_KEY` being a setting does not change that; it is the
live reference feed, not a historical one.

### The loan, deposit by deposit

**Kamino's API serves this directly, so there is no decoding to do.** Verified live on
14 November 2026, all answering 200 on `https://api.kamino.finance`:

| Route                                                                 | Gives                              |
| --------------------------------------------------------------------- | ---------------------------------- |
| `/v2/kamino-market/{market}/obligations/{obligation}/transactions`    | every transaction against the loan |
| `/v2/kamino-market/{market}/obligations/{obligation}/metrics/history` | its state over time                |
| `/v2/kamino-market/{market}/users/{wallet}/transactions`              | the wallet's activity in a market  |

`earn/kamino-api.ts` already calls this host, so this is a method on an existing client. Falling
back to decoding each lending instruction with the klend SDK stays the second path, for a loan
the API does not return. Either way each becomes a `loan_event` with `origin_source: "chain"`, its
time and its amounts:

| Event                   | Shown                                                                        |
| ----------------------- | ---------------------------------------------------------------------------- |
| The account's creation  | "Loan opened 3 March 2026"                                                   |
| Each collateral deposit | "Pledged 10 TSLAx at $240.10 · 3 March", and what those shares are worth now |
| Each borrow / repay     | Date and amount                                                              |
| Withdrawals             | Date and shares                                                              |
| Liquidations            | Date, shares taken, debt cleared                                             |

The share price "at the time" of a deposit is the market price at that moment, from the same
historical source. From these rows, two figures: **interest owed now = current debt − (total
borrowed − total repaid)**, and **interest paid = what repayments took beyond what was borrowed**
(a repay comes off the principal first, so this is the repay that closes a loan, and a debt a
liquidation cleared counts the same way). Home's "Loan interest" is what borrowing has cost, the
two added up, with "$12.00 paid · $3.50 owing" beneath, so a loan repaid in full still shows what it
cost rather than $0.

The loan account is read rather than the wallet because liquidations are sent by bots: they always
touch the loan account and not always the owner's wallet.

### Interest earned in Earn

The Earn vault's share token is a token account like any other. Its arrivals and departures, with
the USDC that moved in the same transactions, give the net USDC put in. **Interest earned = the
shares' value now − net USDC put in.** Exact, written as `earn_event` rows with `origin_source: "chain"`.

**Shares that move without USDC are money in or out, not interest.** Vault shares sent to the
wallet by hand (from an exchange, a person, or the person's own other wallet) would otherwise count
whole as earned, and shares sent away would take what they had earned with them. Each such move is
a deposit or a withdrawal at what the shares were worth that day: the vault's share price from
Kamino's daily history (`/kvaults/{vault}/metrics/history`), the last reading at or before the
move. Marked `estimated`, since a daily price can be up to a day's interest off; what was earned
then starts with `~` on the Earn page and in Home's income, as an estimated cost does on P&L. A
move whose day has no price waits, as a stock with no price does. Shares sent between two of the
person's own wallets are both: a withdrawal from one and a deposit into the other, so the interest
stays where it was earned (the ledger is unique per wallet and signature for that reason).

The Mercury wallet has the same gap, so it is read too: its Earn share accounts only, never its
stocks or cash, which are Mercury's own records. Every Mercury wallet gets a history job for this;
its P&L never waits for it.

### After the first read

The reader keeps each account's cursor and reads only newer signatures, every 5 minutes for wallets
viewed in the last week and hourly otherwise. That prices shares bought outside Mercury after
linking, and finds loan and Earn actions taken outside it. New token accounts (a stock bought
elsewhere for the first time) are found on the next pass. The cursors are also what let a wallet
linked again be read from where it stopped.

After the first read nothing is replayed again: each account's cursor is the newest signature read,
and a pass asks only for signatures newer than it, which is usually none. New arrivals are priced
and added to the lots already written.

**Departures are the reader's too, from then on.** Position-sync sees balances, and a sale and a
buy back between two of its looks are a balance that didn't move; when the gap showed up later it
took the sale out at the average of the old shares and the new (10 at $100, sold, 10 bought back
at $200, read as 10 at $150). So once a linked wallet's past is costed, position-sync only shows a
balance below the records (the position scaled to the chain), and each later costing writes every
sale and buy in the order it happened, each recorded a moment after the last, as a `chain`
departure dated when it happened. A sale swapped for USDC or USDT realises what it was swapped for,
less the shares' average cost then (`disposal.realised_pnl_usd`), counted with Mercury's own on
Home. A sale for anything else, or a send, claims no realised figure. Between a sale and the next
pass the position keeps its old cost, and is then exact. The Mercury wallet is unchanged: every
trade in it is Mercury's, recorded as it settles.

## P&L on a linked wallet

- **Value and the day's change:** always, for everything held. These need only prices.
- **Unrealised P&L:** value minus cost. If any of the cost is estimated, the figure starts with `~`:

  ```
  TSLAx · 15 shares · $6,450
  P&L  ~+$420 (+6.9%)
       Exact for 5 · estimated for 10 from the price when they arrived
  ```

  Every share has a cost, exact or estimated (see "Prices at a past moment"), so P&L always covers
  the whole position; the line under it says how much of it is estimated.

- **The position page** lists each arrival: date, shares, price, and whether it is exact,
  estimated or entered. Each has "Set cost".
- **Realised P&L:** for sells made through Mercury, as today.
- **Sells made elsewhere** (on Jupiter straight from Phantom) take their cost away with them, and
  their proceeds are counted only if USDC came back in the same transaction, which the token
  account's history shows. A sale for SOL or another token is valued at that token's price then,
  marked `~`.

## Moving holdings into the Mercury wallet

### What moves, and what doesn't

| Holding                                   | Moves                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| xStocks, USDC, other tokens Mercury lists | **One click.** See below                                                  |
| A Glider basket                           | **Run by Mercury, in steps.** See below                                   |
| Earn                                      | Withdraw from Earn, then move the USDC                                    |
| Collateral in a Kamino loan               | **Not in this piece.** Stays with the loan in the linked wallet           |
| SOL                                       | Not offered: the relayer pays fees, so the Mercury wallet doesn't need it |

### Tokens, in one click

1. On the linked wallet's page, **Move to Mercury wallet**. Every movable token is selected, with
   amounts editable. Each line says what its cost basis is: "TSLAx 15 · cost known for 12".
   Pledged collateral is listed separately as "In a loan, stays here".
2. The server builds the transfers to the person's own Mercury wallet, creating any token accounts
   the Mercury wallet lacks. The relayer is fee payer.
3. **Phantom asks once.** Several tokens are split into small transactions (about four tokens each)
   and sent to the wallet together through `signAllTransactions`, so the person still approves
   once. A single transaction that empties a wallet is what drainers send, and wallet security
   scanners may flag it. Wallets without `signAllTransactions` fall back to one prompt per
   transaction.
4. When they land, **the lots move with the shares**: between two wallets of the same user, the
   Mercury wallet inherits whatever cost the linked wallet had, exact or estimated, by #99's rule.

**A send made by hand counts too.** If the person copies their Mercury address from Money →
Receive and sends from Phantom themselves, `wallet-events` sees one signature leave one of their
wallets and arrive in another. It records that as a move, not a transfer out and a transfer in,
and the lots move the same way.

No Mercury fee on a move between a person's own wallets. The network cost applies.

This overlaps `feat/import-stocks` and its spec
([2026-10-18 import stocks](2026-10-18-import-stocks-design.md)). Linking supersedes that spec:
its parts that assume the wallet isn't known to Mercury no longer apply, and its transfer and
basis rules are reused here. It is marked superseded so the two are not both left proposed for
the same job.

### A Glider basket, moved by Mercury

A basket's assets sit in a Glider smart account the linked wallet owns. The first draft assumed
Glider pays an exit only to the owner, so a move would be two approvals with a wait between them
(exit to the linked wallet, then move the assets on), tracked by a resumable `wallet_move` row.
Glider's exit takes a recipient, and the owner's signature authorizes paying it to the person's
own Mercury wallet. So what was built is **one approval**, and nothing has to be resumed:

| Step | Who signs                  | What happens                                                                                                           |
| ---- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1    | **Linked wallet** (prompt) | Exit the basket straight into the Mercury wallet: in kind, or sold for USDC (`?to=mercury`)                            |
| 2    | —                          | Glider settles. The exit's `basket_action` row is reconciled as for any exit, into the feed of the wallet it landed in |
| 3    | Mercury wallet, no prompt  | Only for "Keep it as a basket": invest the USDC in the same basket from the Mercury wallet                             |

The recipient can only be the owner or the person's own Mercury wallet: the server refuses any
other, before the authorization is prepared and again when the signed one comes back, and the web
checks what Glider returned before the wallet signs (`paysOutTo`).

The person chooses at the start:

- **Hold as shares** (the default, and available: Ondo wrappers already count as holdings outside
  a basket — see "Answered" below): exit in kind into the Mercury wallet. The shares arrive as
  ordinary stocks there. Nothing is sold.
- **Keep it as a basket:** exit to USDC into the Mercury wallet, then invest it in the same basket
  from there. Glider only takes USDC to fund a basket, so this sells and buys again: spreads are
  paid twice, and the money is **out of the market until Glider's next daily rebalance**. The
  confirm screen says both, and the screen after it offers "Invest in … from your Mercury wallet".

**One exit from a basket at a time.** An exit's cost share is the basket's net funding less what
earlier exits took, and an earlier exit counts only once it has landed and been recorded. A new
exit is refused (`409 exit_settling`) while one from the same basket is submitted and unresolved.

What the first draft's resumable flow was for (an approval left to give, "Finish moving … one
approval left" on Home and in the inbox) has nothing to resume with one approval: the
`basket_action` row survives a reload, and the operation is tracked under the basket's position.

**The Mercury wallet's token accounts are opened first.** Glider pays an exit to "any address
that the owner authorizes" and its paymaster "sponsors the fee", but its documentation
([docs.glider.fi/llms-full.txt](https://docs.glider.fi/llms-full.txt), read 25 November 2026) says
nothing about opening the recipient's token account for an asset it has never held. So before the
authorization is prepared, the relayer opens every account the payout needs in the Mercury wallet
(each stock's for in kind, USDC's for "Keep it as a basket"), with the idempotent instruction that
needs only the payer's signature. Mercury pays that rent, as it does for every account the Mercury
wallet opens: only what Mercury builds can close them. If they can't be opened, nothing is asked
to be signed (`503 accounts_unavailable`).

**Baskets made outside Mercury.** A linked wallet's Glider baskets made somewhere else (Glider's own
app, or another app built on Glider) are found on the chain (accounts it funded that the Swig
program runs) and shown with their value. Mercury can't exit them: Glider's API is scoped to the
app that enrolled a portfolio, and answers `404` for a portfolio "your API key does not have access
to". The API could pay such an exit out in kind or to USDC, but which of those the other app
offers can't be checked from here. So the card sends the person back to the app they deposited
with, to withdraw the basket to their wallet, and promises none of that app's screens. Whatever
arrives, Mercury follows from the chain: shares, moved here in one approval; USDC, moved here and
then invested in the closest Mercury basket. Each next step is read from what has arrived, so the
card needs no stored state.

**Cost basis:** the basket's assets have no per-share lots today (Mercury records the basket's
fundings, not Glider's buys). Shares exited in kind get a cost by splitting the basket's net
funding across them by their value at exit, marked `source: "basket_exit"`. Under "Keep it as a
basket", the new basket's funding is its cost, as for any basket.

## Loans

### Health, at once

`kamino.ts` already finds a loan by owner address (`getObligationByWallet`), and `capacity.ts`
already computes everything from the loan's current state: collateral, debt with interest accrued,
LTV, the liquidation threshold, liquidation price per stock and the health state. None of that
needs history. A linked wallet's loan is fully visible on the first sync.

`loan-watch` warns per wallet, and says each level once in the feed and the inbox; the email is
tried again each pass until it gets through, without writing the warning into the app again. The email and inbox entry name the wallet by its label (or a
shortened address), because the person may have two loans and needs to know which to repay, and
for a linked wallet they add: "Mercury can't act for this wallet. Repay or add collateral from it
to avoid liquidation."

### History

Read by the history reader: see "The loan, deposit by deposit" above. Until it finishes, the loan
screen shows the current numbers and "Reading history…".

### Liquidations, in any wallet

A liquidation is sent by a bot, not built by Mercury, so nothing Mercury records sees it, in the
Mercury wallet or a linked one. The live loan does. `loan-watch` reads Kamino's record of a loan
when its collateral or debt fell since the last pass, when it was last warned it was close to
liquidation (a bot can sell between two passes and leave it healthy by the next), and at least
hourly. A liquidation found there is:

- **A sale.** Its debt leg and collateral leg are one row, "Sold by Kamino · 4 TSLAx at $150.00 ·
  repaid $570.00 of the loan". What it repaid, less the shares' average cost just before, is
  realised P&L (see "What each stock cost").
- **A repayment.** What it repaid comes off what was borrowed, so the interest stays the interest.
- **News**, when it happened in the last day and since Mercury followed the wallet: an inbox entry
  (opening its receipt) and an email, "Kamino sold collateral to repay your loan", naming a linked
  wallet. Older ones, from a wallet's past, are in the feed and stay quiet.

## Fees

A linked wallet pays exactly what the Mercury wallet pays for the same action. That is not a fee
on every action, because Mercury doesn't charge one on every action today:

| Action                           | Mercury's fee today                                    | Planned (`TODO.md`, `docs/revenue-todo.md`)             |
| -------------------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| Buy or sell a stock              | **Yes**, `TRADING_FEE_BPS` (0.5%)                      | Tiers by trade size                                     |
| Add cash that Relay swaps        | **Yes**, `DEPOSIT_FEE_BPS` (0.3%). Mercury wallet only | —                                                       |
| Invest in a basket, rebalance    | **No**. `feeBps: 0` (`baskets.ts`)                     | Glider `swapBps` to 50, once Glider confirms the payout |
| Borrow on Kamino                 | **No**                                                 | 0.25% borrow fee, once counsel agrees                   |
| Repay, pledge, withdraw          | No                                                     | —                                                       |
| Deposit to or withdraw from Earn | **No**. Kamino's vault fees are the vault's own        | —                                                       |
| Send                             | No                                                     | —                                                       |
| Move between own wallets         | No                                                     | —                                                       |

**Network fee and rent: the Mercury wallet is sponsored, a linked wallet pays its own.** For the
Mercury wallet, Mercury's relayer pays the SOL (the network fee, and the rent of any account a
transaction opens) and is repaid in USDC where the transaction says, as today. A linked wallet is
the fee payer of every transaction Mercury builds for it (trades, sends, loans, Earn, basket
funding, moves) and pays the network fee and any rent itself, in SOL; it is charged Mercury's own
fee alone. Its keys are its own, so SOL or rent Mercury put up in it could be taken straight back
out (a USDC account opened with Mercury's SOL, closed by its owner, opened again on the next
borrow); the Mercury wallet's accounts can only be closed by what Mercury builds, which never
closes one. A linked wallet's first loan needs about 0.03 SOL for Kamino's account setup, and is
refused with that figure (`needs_sol`) before anything is signed when the wallet holds less. An
Earn move it can't pay the network fee for, with the rent of any token account the move opens, is
refused the same way. Its confirm screens say the fee and the setup are paid in SOL by the wallet. A
move's rent, for the Mercury wallet's new accounts, is the linked wallet's too, and nothing is
taken from the USDC moving.

Rent is owed only for an account that doesn't exist: an emptied account still exists, so a stock
sold to nothing and bought again, or a sale into a USDC account spent to nothing, owes no rent
again. Balance reads leave emptied accounts out, so the fee is worked out from the account list.

When a planned fee ships, it applies to linked wallets in the same release, because it lives in the
transaction Mercury builds, not in the wallet that signs it. Nothing in this design needs changing
for that.

`order.mercury_fee_usd` records the fee per order as today, and with `wallet_id` on `order`,
revenue can be split by wallet kind.

## Summary across wallets

Shown at the top of Home, on web and iOS, whenever at least one wallet is linked. With only the
Mercury wallet, Home looks as it does today.

```
┌──────────────────────────────────────────────┐
│ All wallets                                   │
│ Net worth            $20,652.40               │
│ P&L         ~+$1,240.10 (+7.4%)               │
│              $9,100 of cost estimated         │
│ Income       +$86.20   Earn $71.05 · Div $15.15│
│ Loan interest −$42.10  (1 wallet calculating) │
└──────────────────────────────────────────────┘
```

| Line              | How it's worked out                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Net worth**     | Every active wallet's holdings (stocks, cash, baskets, Earn) **minus loan debt**. A large loan never inflates it                                             |
| **P&L**           | Unrealised and realised, on shares with a cost. Starts with `~` if any of that cost is estimated, and says how much                                          |
| **Income**        | Earn interest plus dividends. For linked wallets, from the history reader, so it covers the time before linking too                                          |
| **Loan interest** | Interest paid across all loans: current debt − (borrowed − repaid), from `loan_event`. A linked wallet whose history is still being read shows "calculating" |

Dividends before Mercury began recording multipliers (`multiplier_event`, from September 2026)
can't be told apart from the shares themselves; the summary counts those shares at their arrival
cost and nothing as income.

Served by `GET /v1/portfolio/summary`, which reads the database only (no RPC), so it is cheap to
poll. Tapping it opens the combined "All wallets" view.

## Web

- **Home:** the summary, then each wallet's card, the Mercury wallet first and then linked
  wallets by `linked_at`. Each card shows its value, its day's change and a loan health badge
  if it has a loan.
- **Settings → Linked wallets:** "N of 5 linked", the list, link, rename, **Unlink** and **Unlink
  and delete history**.
- **A wallet switcher** in the header: "Mercury", each linked wallet by label, and "All wallets".
  It sets `X-Mercury-Wallet` on every request. The choice is kept for the browser session and
  cleared on sign-out: a reload keeps it, and a new visit starts on the Mercury wallet, so a linked
  wallet is shown and asked to sign only when somebody chooses it, never because it was left
  chosen days ago.
- **"All wallets"** is a read-only view: summed portfolio, combined activity, every loan. Actions
  are disabled with "Choose a wallet to trade from".
- **On a linked wallet,** each confirm screen says "You'll approve this in Phantom" (the connected
  wallet's name) above the button, and the button reads "Continue in Phantom".
- **The move-to-Mercury reminder** is kept light:
  - a banner at the top of each linked wallet's page: "Managing funds here means approving each
    step in Phantom. Move them to your Mercury wallet for one-tap trading." with **Move funds** and
    **Dismiss**. Dismissed, it stays hidden for that wallet for 30 days.
  - one quiet line on each confirm screen: "Tip: this would be one tap from your Mercury wallet."
    Never a pop-up, and never in the way of the button.
- If the linked wallet isn't connected in the browser when an action needs it, AppKit opens to
  connect it, and refuses to continue with a different address.

## iOS

Every wallet is **shown**. Only the Mercury wallet is **acted on**.

- **Home:** the summary, then the Mercury wallet as today (fully interactive), then a **Linked
  wallets** section with each wallet's card.
- **A linked wallet's page:** positions, loan health with liquidation price, Earn and baskets,
  activity. No buy, sell, borrow, repay or send buttons. In their place, one row:
  "Manage on web" (opens the web app on that wallet) and, beside it, "Move to Mercury wallet to
  trade here" (also on web, since the move needs the linked wallet's signature).
- **Stock pages** show "You also hold 2.1 in Phantom main" under the Mercury position, read-only.
- **Settings** lists linked wallets with their labels; linking and unlinking say "On web".
- Reads use the same routes as web, with `X-Mercury-Wallet` (a wallet id, or `all`). Every action omits
  the header, so it acts for the Mercury wallet as today.

Loan warnings for linked wallets reach iOS users by email now, and through the inbox once the inbox
comes to mobile (`TODO.md`, Notifications).

## RPC budget

**What the newer reads cost, and where they run.** All of it is on the jobs' lane, none on the
paid request path: the history reader's Kamino reads (what is pledged, and a linked wallet's loan
history), the hourly `dividend-notices` read of every listed mint (one call per hundred), and
loan-watch's read of a loan's history from Kamino's API when its collateral or debt fell, when it
was last warned it was close, and at least hourly. Each Mercury wallet's Earn shares are read once a
day, after every linked wallet's reads (two calls for its token accounts, and one per Earn account
it has), and that job asks Kamino nothing.

The risk is load. On 23 October and again on 13 November the paid allowance ran out, and the
user-facing reads (`/v1/money`, `/v1/portfolio`, `/v1/borrow`) failed until it recovered, at
today's traffic with no linked wallets at all. At the 18 wallets the jobs read then, polling came
to roughly **2.5 million requests a month**, about 1.55M of it `wallet-events`. There is no budget
for a bigger plan.

**Most of that is fixed on `main` (#112), and linked wallets ride on it.** The per-wallet jobs
subscribe instead of polling, on the public lane (`SOLANA_PUBLIC_RPC_URLS`), because the paid
Alchemy endpoint answers `Method 'accountSubscribe' not found`:

- `position-sync` watches each token account with `accountSubscribe`. The accounts are found with
  `getTokenAccountsByOwner` every 10 minutes, the only read left in the steady state.
- `wallet-events` watches `wallet_stream` with `logsSubscribe`.
- Both still sweep every wallet (10 and 15 minutes) as the safety net for a dropped notification,
  and fall back to their old cadence whenever the stream can't be trusted.
- Per connection, measured 14 November: 398 subscriptions on Solana Vibe Station, 55 on
  `api.mainnet-beta.solana.com` before a 1013 close. The adapter opens another connection rather
  than going past that.

So a linked wallet costs about 10 subscriptions (one per token account), a discovery read every
10 minutes and a sweep read every 10 to 15. Subscriptions scale with accounts watched: 1,000
people with two linked wallets each is about 20,000 subscriptions, some 50 connections to a
public endpoint with no SLA. Watch that before linking opens widely.

**What is left:**

- **`loan-watch` stays on the klend SDK.** It reads every followed wallet's loan through
  `@kamino-finance/klend-sdk` (`lending/kamino.ts`), which batches them into one
  `getMultipleAccounts` per hundred wallets on the public lane, and then two balance reads for each
  wallet that owes something. That cost grows with borrowers, not with wallets, and a linked
  wallet with no loan adds nothing to it. Kamino's REST API stays the source for a loan's
  _history_ (step 11), not its current health.
- **Keep the paid allowance for the request path only**: the reads a person waits on and the
  transactions they sign, which is what `deps.ts` already says it is for.

Steps 1–7 can be built and tested against a handful of internal wallets meanwhile.

Reading history shares the paid RPC with the app, inside the reader's own budget, and it is mostly
paid once per wallet. A typical linked wallet: ~10 token accounts × ~30 transactions, plus the loan account,
is a few hundred calls when linked and a handful per pass after that. The reader paces itself to
what its plan allows, so a wallet with a long past takes longer rather than taking from anyone
else.

## Build order

**First release: steps 1–7.** Link, track, see on web and iOS, with real P&L.

1. **Data.** Migration `0030`: the `wallet` columns, the challenge table, `wallet_id` on every
   per-wallet table with the backfill, `origin_source` on `loan_event` and `earn_event`, and the
   history reader's tables. Nothing behaves differently yet.
2. **Linking.** The challenge, link, list, rename, unlink and delete routes; linking again
   reactivates the row; Settings on web.
3. **Tracking.** The six `isPrimary` reads list active wallets and write `wallet_id`, including
   the two subscription lists; per-wallet positions, snapshots and loan warnings (naming a linked
   wallet); `last_viewed_at`; the fallback tiers. `loan-watch` stays on the klend SDK.
4. **Reading on web.** The acting-wallet middleware, read routes per wallet and `X-Mercury-Wallet: all`, the
   summary route, Home with the summary and wallet cards, the switcher. P&L says "Calculating…".
5. **Reading on iOS.** The summary, the Linked wallets section, read-only wallet pages, "Manage on
   web".
6. **The history reader.** The reader inside the API with its own RPC budget, the `history_job`,
   `history_tx` and `history_event` tables, reading token accounts; a job on every link and every
   link again, and passes after the first read for later arrivals.
7. **Cost and P&L from history.** Classifying arrivals, historical prices, the average-cost
   replay, `chain` lots for linked wallets, `~` on web and iOS, "Set cost". "Calculating…"
   gives way to real P&L.

**After the first release:**

8. **Acting.** Routes switch to the acting wallet; the shared signer on web; buy, sell, loans,
   baskets, Earn and send from a linked wallet; the move-to-Mercury reminder.
9. **Moving tokens.** One-click move with lots carried across; hand-made sends between own wallets
   recognised as moves.
10. **Moving baskets.** One approval, paid straight into the Mercury wallet, "Hold as shares" or
    "Keep it as a basket", one exit at a time; baskets made outside Mercury found and walked
    through. See "A Glider basket, moved by Mercury".
11. **Loan and Earn history.** The reader reads the loan account and the Earn share token;
    Kamino's API for the loan (the klend decoder only as a fallback), `loan_event` and `earn_event`
    with `origin_source: "chain"`, deposit-by-deposit loan detail, interest paid and earned.

Until 11 lands, loan history and Earn interest for linked wallets say "Reading history…"; loan
health and warnings are there from step 3.

## Open questions

Nine were open when this was written. Six are answered below, with what answered them. One,
sanctions screening, has moved out of this design (see "Scope"). Two need a decision or a test that
cannot be made from the code.

### Answered

- **Historical prices.** The Yahoo client Mercury already has, with `period1`/`period2` added:
  hourly within about 730 days, daily beyond. Pyth was already ruled out in `yahoo.ts` — 403 for
  equity feeds on this entitlement, and no range endpoint. See "Prices at a past moment".
- **Kamino's API.** Yes. `/v2/kamino-market/{market}/obligations/{obligation}/transactions` and
  `.../metrics/history` both answer, so step 11 reads the loan rather than decoding it. The klend
  decoder stays as a fallback. See "The loan, deposit by deposit".
- **Ondo tokens.** Yes, they already count as holdings outside a basket, so "Hold as shares" can
  be the default. `loadHeldTokens` (`portfolio/apply.ts:49`) joins `tokens` to `instruments` with
  no issuer filter — "tokens we do not list are skipped", and every verified wrapper of both
  issuers is listed (`jupiter/registry.ts`, tags `xstocks` and `ondo`; `stocks/sync.ts:69` writes
  the issuer through). Nothing to build.
- **Raw RPC or a provider's history API.** Raw RPC, because there is no budget for a provider:
  there are no Helius credits and the plan is Alchemy's free tier. A parsed-history API would cost
  fewer calls per wallet, and is worth revisiting the day there is a budget, but it cannot be
  designed in now. What makes raw RPC affordable here is that history is **paid once per wallet**
  — a few hundred calls when it is linked, then a handful per pass — so it is the standing poll,
  not the walk, that has to come down. See "RPC budget".
- **The polling tiers.** Settled by #112: token accounts and wallet streams push, so the tiers by
  how recently a wallet was viewed apply only when the jobs fall back to polling because the
  stream can't be trusted. Tune them from telemetry, not these guesses. See "Background jobs".
- **Moving a loan.** Not an open question: it is out of this piece, and worth revisiting only
  after step 11, when a loan's history is already read.

### Still open

- **Phantom's scanner.** Untestable from here: it needs a real multi-token move on mainnet. It is
  a task inside step 9, not a question holding anything up — the design already mitigates it by
  splitting a move into transactions of about four tokens through `signAllTransactions` rather
  than one sweeping transaction. Domain verification with Phantom's security provider should be
  started before launch, because it has a lead time nobody controls.
- **Retention of unlinked history.** Proposed: keep it until the person deletes it or deletes
  their account, with no automatic expiry. "Unlink and delete history" already gives them the
  explicit choice. An automatic one-year delete would surprise exactly the person it claims to
  serve — someone who re-links in month thirteen and finds their cost basis gone — and the data
  is their own public chain history, not something Mercury collected about them. Worth confirming
  against whatever retention line the privacy policy ends up taking.
