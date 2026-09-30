# Debt in the books — implementation plan

**Spec:** [2026-09-30-debt-in-the-books-design.md](../specs/2026-09-30-debt-in-the-books-design.md)

**Goal:** the Portfolio headline and the performance chart report net worth, and the cushion a
loan leaves is visible on the page.

**Architecture:** debt is read from Kamino through the same dependency `pledged` already uses,
threaded into `valuePortfolio`, persisted per hour beside the other snapshot figures, and
subtracted from the total everywhere that total is produced.

## Global constraints

- `pnpm check` after every task — `lint && format:check && typecheck && test`. Not the parts.
- `exactOptionalPropertyTypes`: conditional spread, never `undefined`.
- Money over the wire is a decimal string through `toWire`; DB money is `numeric(38,18)`.
- Every test is mutation-tested before its task is called done.
- Conventional commits, one per task.

---

## Task 1 · `debt_usd` on the snapshot

**Files:** `services/api/src/db/schema.ts`, `services/api/drizzle/0007_*.sql` (generated),
`services/api/src/portfolio/queries.ts`, `services/api/src/portfolio/history.ts`

Add `debtUsd: usd("debt_usd").notNull().default("0")` to `portfolioSnapshots`. The default is what
lets the column land on a table that already has rows; the spec records why those rows stay gross.

`readSnapshots` returns it. `Reading` in `history.ts` gains `debtUsd`.

- [ ] Test: a snapshot round-trips `debt_usd` through `numeric(38,18)` to the cent (PGlite).
- [ ] `pnpm exec drizzle-kit generate --name debt_usd`, check the SQL by eye.
- [ ] Mutate: drop the column from the select — test fails.

## Task 2 · `valuePortfolio` nets debt

**Files:** `services/api/src/portfolio/value.ts`, `value.test.ts`

`valuePortfolio(holdings, board, cashUsd, debtUsd)` returns `debtUsd` and
`totalUsd = stocks + cash − debt`.

- [ ] Tests: debt subtracts from the total; zero debt leaves it unchanged; debt larger than
      assets gives a negative net worth rather than clamping at zero (it is real, and hiding it
      is the bug this whole change exists to fix).
- [ ] Mutate: drop the subtraction — tests fail.

## Task 3 · Reading debt, and what unknown means

**Files:** `services/api/src/lending/debt.ts` (new), `debt.test.ts` (new),
`services/api/src/deps.ts`

`debtFrom(lending, wallet): Promise<Decimal | null>` — `position()`'s `debtUsd`, `ZERO` when there
is no obligation, `null` when the call throws.

- [ ] Tests: obligation → its debt; no obligation → zero, not null; throw → null, not zero.
- [ ] Mutate: turn the catch into `ZERO` — the third test fails.

## Task 4 · The route, and the stale fallback

**Files:** `services/api/src/routes/portfolio.ts`, `portfolio.test.ts`,
`packages/types/src/portfolio.ts`

`PortfolioDeps.debt`. When it answers `null`, fall back to the newest snapshot's `debtUsd` and set
`debtIsStale: true`; with no snapshot, zero and stale. Response gains `debtUsd` and `debtIsStale`.

- [ ] Tests: live debt nets the total and is not stale; Kamino down with a snapshot serves the
      snapshot's figure, stale; Kamino down with no snapshot serves zero, stale; a wallet-less
      session is unaffected.
- [ ] Mutate: make the fallback return zero regardless — the second test fails.

## Task 5 · The job records it

**Files:** `services/api/src/portfolio/snapshot.ts`, `snapshot.test.ts`,
`services/api/src/index.ts`

`SnapshotDeps` gains `debt`. The row written carries it, and `totalUsd` is net.

- [ ] Tests: a borrowed account's row is net and carries the debt; an unreadable Kamino costs that
      one account its reading rather than writing a gross one.
- [ ] Mutate: write gross — the first test fails.

## Task 6 · Round trip, over a real database

**Files:** `services/api/src/portfolio/history.roundtrip.test.ts`

- [ ] One test: an account borrows mid-series; the chart is flat across the borrow and moves only
      with price. This is the defect in one assertion.

## Task 7 · The page

**Files:** `apps/web/src/api/hooks.ts`, `apps/web/src/app/portfolio/model.ts`,
`apps/web/src/app/portfolio/Summary.tsx`, `apps/web/src/dev/sample.ts`

Net headline. A **Borrowed −$X** line under Cash when debt is non-zero. When debt is non-zero, one
header line from `safeUntilDrop`: "Safe unless your stocks fall 22%". A stale note when
`debtIsStale`.

- [ ] Test the formatter, not the markup: the cushion sentence, and that zero debt renders no
      borrowed line.
- [ ] Look at it in the browser in sample mode.

## Task 8 · ADR 0009

**Files:** `docs/adr/0009-investing-not-trading.md`, `docs/02-product.md`

Dated amendment: the borrowed-funds restriction removed, why, and what replaced it. The rest
stands.
