# Cost follows shares out · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a position's cost correct after any sell or transfer out, by recording the shares that leave and working positions out as a replay of what entered and what left.

**Architecture:** A new `disposal` table is the other half of `lot`. `settleOrder` writes a `sell` disposal; `position-sync` writes a `transfer_out` disposal for any drop in the chain that no sell explains. `loadHeldTokens` replays each token's lots and disposals, in the order they were recorded, through a pure `replayPosition` in `@mercury/core`, and hands `planReconciliation` the open figures instead of lifetime sums. A data migration backfills a `sell` disposal for every past filled sell.

**Tech Stack:** TypeScript, Drizzle ORM on Postgres (PGlite in tests), drizzle-kit migrations, vitest, decimal.js through `@mercury/core`'s `D`.

**Spec:** `docs/superpowers/specs/2026-10-18-import-stocks-design.md`, Part A.

## Global Constraints

- Work on branch `feat/cost-follows-shares`, created from `feat/import-stocks` (which carries the spec and this plan). It ships as its own PR.
- TDD: every behaviour change starts with a failing test that is watched failing.
- Comments and commit messages are narrative prose, in the voice of the surrounding code. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Money and share columns are `numeric(38,18)` (`usd()` in `schema.ts`) and are written through `fixed()` (`v.toFixed(18)`).
- Migrations are generated with drizzle-kit, never hand-written DDL, and the generated snapshot is never edited by hand. Data statements go in a `--custom` migration, split on `--> statement-breakpoint`.
- Migration numbers: today the next is `0025`. PR #97 also adds a `0025`; if it merges first, drizzle-kit will number these `0026`/`0027`. Use whatever it generates and change the test's file path to match.
- Windows that hold a position still while a sell settles: an `executing` sell created within the last **10 minutes**, or a `filled` sell whose `filled_at` is within the last **2 minutes**.
- Every API test command runs from the repo root: `pnpm --filter @mercury/api exec vitest run <path>`. Core: `pnpm --filter @mercury/core exec vitest run <path>`.

## File structure

| File                                                                    | Change                    | Responsibility                                                                               |
| ----------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| `packages/core/src/portfolio/replay.ts`                                 | create                    | `replayPosition`: a token's movements in, its open figures out. Pure.                        |
| `packages/core/src/portfolio/replay.test.ts`                            | create                    | Its rules, including a hand-worked table.                                                    |
| `packages/core/src/index.ts`                                            | modify                    | Export it.                                                                                   |
| `services/api/src/db/schema.ts`                                         | modify                    | `lot.recorded_at`; the `disposal` table.                                                     |
| `services/api/drizzle/0025_disposal.sql` (+ snapshot, journal)          | generate                  | The DDL.                                                                                     |
| `services/api/drizzle/0026_disposal_backfill.sql` (+ snapshot, journal) | generate `--custom`, fill | `recorded_at` for past lots; a `sell` disposal per past filled sell.                         |
| `services/api/src/db/disposal-backfill.test.ts`                         | create                    | The backfill against seeded rows, run twice.                                                 |
| `services/api/src/orders/settle.ts`                                     | modify                    | A sell writes its disposal, and takes back a `transfer_out` recorded while it was in flight. |
| `services/api/src/orders/settle.test.ts`                                | modify                    | Those rules.                                                                                 |
| `services/api/src/portfolio/reconcile.ts`                               | modify                    | `HeldToken.settling`; `transfer_out` disposals; the dividend on tokens still held.           |
| `services/api/src/portfolio/reconcile.test.ts`                          | modify                    | Those rules; the existing "tokens that left" tests gain a disposal.                          |
| `services/api/src/portfolio/open.ts`                                    | create                    | `movementsByToken`: lot and disposal rows into ordered movements.                            |
| `services/api/src/portfolio/open.test.ts`                               | create                    | Its ordering.                                                                                |
| `services/api/src/portfolio/apply.ts`                                   | modify                    | Load rows, replay, set `settling`; write disposals.                                          |
| `services/api/src/portfolio/sync.ts`                                    | modify                    | Count disposals as written.                                                                  |
| `services/api/src/portfolio/books.test.ts`                              | create                    | End to end: trades through `settleOrder`, passes through the same calls position-sync makes. |

---

### Task 1: `replayPosition` in `@mercury/core`

**Files:**

- Create: `packages/core/src/portfolio/replay.ts`
- Create: `packages/core/src/portfolio/replay.test.ts`
- Modify: `packages/core/src/index.ts` (add one export line after `export * from "./portfolio/cost-basis.js";`)

**Interfaces:**

- Consumes: `D`, `ZERO`, `Decimal` from `packages/core/src/money.ts`.
- Produces (used by Tasks 5):

  ```ts
  export interface MovementIn {
    kind: "in";
    tokenQty: bigint;
    shares: Decimal;
    costUsd: Decimal;
    referenceUsd: Decimal;
    feeUsd: Decimal;
    acquiredAt: Date;
    isEstimated: boolean;
  }
  export interface MovementOut {
    kind: "out";
    tokenQty: bigint;
  }
  export type Movement = MovementIn | MovementOut;
  export interface OpenPosition {
    tokenQty: bigint;
    shares: Decimal;
    costUsd: Decimal;
    referenceUsd: Decimal;
    feeUsd: Decimal;
    heldSince: Date | null;
    isEstimated: boolean;
  }
  export const EMPTY_OPEN: OpenPosition;
  export const replayPosition: (movements: readonly Movement[]) => OpenPosition;
  ```

  All fields `readonly`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/portfolio/replay.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { D, ZERO } from "../money.js";
import { EMPTY_OPEN, replayPosition, type Movement, type MovementIn, type MovementOut } from "./replay.js";

const JAN = new Date("2025-01-15T15:00:00Z");
const MAR = new Date("2025-03-12T15:00:00Z");

/** A purchase of `tokens` tokens at one share each, for `usd`, quoted at what was paid. */
const buy = (tokens: number, usd: number, over: Partial<MovementIn> = {}): MovementIn => ({
  kind: "in",
  tokenQty: BigInt(tokens),
  shares: D(tokens),
  costUsd: D(usd),
  referenceUsd: D(usd),
  feeUsd: ZERO,
  acquiredAt: JAN,
  isEstimated: false,
  ...over,
});

/** A dividend: shares and no tokens, at no cost. */
const dividend = (shares: string): MovementIn => buy(0, 0, { shares: D(shares) });

const out = (tokens: number): MovementOut => ({ kind: "out", tokenQty: BigInt(tokens) });

describe("replayPosition", () => {
  it("costs the shares held at what they cost, after a sell and another buy", () => {
    // The case that is wrong today: lifetime lots scaled down to the chain say
    // $266.67 for two shares that cost $300.
    const open = replayPosition([buy(2, 200), out(1), buy(1, 200)]);
    expect(open.shares.toFixed()).toBe("2");
    expect(open.costUsd.toFixed(2)).toBe("300.00");
  });

  it("starts fresh once the holding has been emptied", () => {
    const open = replayPosition([buy(1, 100, { acquiredAt: JAN }), out(1), buy(1, 200, { acquiredAt: MAR })]);
    expect(open.costUsd.toFixed(2)).toBe("200.00");
    expect(open.heldSince).toEqual(MAR);
  });

  it("scales the reference and the fee by the same fraction as the cost", () => {
    // If one were scaled and not the others, the shares that left would read as
    // a market move, and the lines of a stacked return would stop summing.
    const open = replayPosition([buy(4, 800, { referenceUsd: D(792), feeUsd: D("0.8") }), out(1)]);
    expect(open.costUsd.toFixed(2)).toBe("600.00");
    expect(open.referenceUsd.toFixed(2)).toBe("594.00");
    expect(open.feeUsd.toFixed(2)).toBe("0.60");
  });

  it("takes a dividend at no cost, so the average cost per share falls", () => {
    const open = replayPosition([buy(4, 800), dividend("0.4")]);
    expect(open.shares.toFixed()).toBe("4.4");
    expect(open.costUsd.toFixed(2)).toBe("800.00");
    expect(open.tokenQty).toBe(4n);
  });

  it("never goes below empty, whatever leaves", () => {
    expect(replayPosition([buy(1, 100), out(5)])).toEqual(EMPTY_OPEN);
    expect(replayPosition([out(1)])).toEqual(EMPTY_OPEN);
  });

  it("is held since the earliest purchase still open, not the latest recorded", () => {
    // An imported lot is recorded today and acquired long ago. Order of entry
    // is not order of purchase.
    const open = replayPosition([buy(1, 100, { acquiredAt: MAR }), buy(1, 100, { acquiredAt: JAN })]);
    expect(open.heldSince).toEqual(JAN);
  });

  it("stays estimated while an estimated lot is open, and clears once the holding is emptied", () => {
    const partly = replayPosition([buy(2, 100, { isEstimated: true }), out(1)]);
    expect(partly.isEstimated).toBe(true);
    const emptied = replayPosition([buy(2, 100, { isEstimated: true }), out(2), buy(1, 50)]);
    expect(emptied.isEstimated).toBe(false);
  });

  /*
   * One sequence, worked by hand. Average cost: a purchase adds its cost, a
   * dividend adds shares at no cost, and anything leaving takes the same
   * fraction of every figure as the fraction of tokens it took.
   */
  const SEQUENCE: readonly Movement[] = [
    buy(4, 800), //   4 tokens   4 shares    $800
    out(1), //        3          3           $600   (kept 3/4)
    buy(1, 300), //   4          4           $900
    dividend("0.4"), // 4        4.4         $900
    out(2), //        2          2.2         $450   (kept 2/4)
    out(2), //        0          0           $0     (emptied)
    buy(1, 100), //   1          1           $100
  ];
  const AFTER: readonly [tokens: bigint, shares: string, cost: string][] = [
    [4n, "4", "800.00"],
    [3n, "3", "600.00"],
    [4n, "4", "900.00"],
    [4n, "4.4", "900.00"],
    [2n, "2.2", "450.00"],
    [0n, "0", "0.00"],
    [1n, "1", "100.00"],
  ];

  it.each(AFTER.map((expected, i) => [i + 1, expected] as const))(
    "matches the hand-worked table after %i movements",
    (count, [tokens, shares, cost]) => {
      const open = replayPosition(SEQUENCE.slice(0, count));
      expect(open.tokenQty).toBe(tokens);
      expect(open.shares.toFixed()).toBe(shares);
      expect(open.costUsd.toFixed(2)).toBe(cost);
    },
  );
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm --filter @mercury/core exec vitest run src/portfolio/replay.test.ts`
Expected: FAIL, `Failed to resolve import "./replay.js"`.

- [ ] **Step 3: Write `replay.ts`**

Create `packages/core/src/portfolio/replay.ts`:

```ts
import { D, ZERO, type Decimal } from "../money.js";

/**
 * A lot entering a position: a buy, a dividend, and later an import.
 *
 * The dollar figures are the lot's totals rather than per share, so a replay
 * adds them without knowing how each was priced.
 */
export interface MovementIn {
  readonly kind: "in";
  /** Smallest unit. Zero on a dividend lot, which adds shares and no tokens. */
  readonly tokenQty: bigint;
  readonly shares: Decimal;
  /** Shares x unit cost. Fees are not in it. */
  readonly costUsd: Decimal;
  /** Shares x the quote at acquisition, or the unit cost where none was recorded. */
  readonly referenceUsd: Decimal;
  readonly feeUsd: Decimal;
  readonly acquiredAt: Date;
  readonly isEstimated: boolean;
}

/** Tokens leaving it: a sell, or a transfer out. */
export interface MovementOut {
  readonly kind: "out";
  readonly tokenQty: bigint;
}

export type Movement = MovementIn | MovementOut;

/** What is still held, and what it cost. */
export interface OpenPosition {
  readonly tokenQty: bigint;
  readonly shares: Decimal;
  readonly costUsd: Decimal;
  readonly referenceUsd: Decimal;
  readonly feeUsd: Decimal;
  /** The earliest acquisition still open, counted from when the holding was last empty. */
  readonly heldSince: Date | null;
  /** True while any open lot's cost was estimated rather than read off a trade. */
  readonly isEstimated: boolean;
}

export const EMPTY_OPEN: OpenPosition = {
  tokenQty: 0n,
  shares: ZERO,
  costUsd: ZERO,
  referenceUsd: ZERO,
  feeUsd: ZERO,
  heldSince: null,
  isEstimated: false,
};

const enter = (open: OpenPosition, m: MovementIn): OpenPosition => ({
  tokenQty: open.tokenQty + m.tokenQty,
  shares: open.shares.add(m.shares),
  costUsd: open.costUsd.add(m.costUsd),
  referenceUsd: open.referenceUsd.add(m.referenceUsd),
  feeUsd: open.feeUsd.add(m.feeUsd),
  heldSince: open.heldSince === null || m.acquiredAt < open.heldSince ? m.acquiredAt : open.heldSince,
  isEstimated: open.isEstimated || m.isEstimated,
});

/*
 * Average cost: whatever leaves takes the same fraction of every figure, so the
 * cost per share of what remains does not move. The fraction is taken in
 * tokens, because tokens are exact and shares are not — a token's shares move
 * with the multiplier, and a dividend not yet written would make the two
 * disagree. Every token gone ends the run, whatever rounding left behind.
 */
const leave = (open: OpenPosition, m: MovementOut): OpenPosition => {
  if (m.tokenQty >= open.tokenQty) return EMPTY_OPEN;
  const remaining = open.tokenQty - m.tokenQty;
  const kept = D(remaining.toString()).div(D(open.tokenQty.toString()));
  return {
    ...open,
    tokenQty: remaining,
    shares: open.shares.mul(kept),
    costUsd: open.costUsd.mul(kept),
    referenceUsd: open.referenceUsd.mul(kept),
    feeUsd: open.feeUsd.mul(kept),
  };
};

/**
 * A token's position, worked out from everything that entered and left it.
 *
 * The caller orders the movements by when each entered or left Mercury, which
 * is not when a lot was acquired: an imported lot was bought long before it
 * arrived, and applying a sell to shares that were not here yet would cost them
 * wrongly. Pure, like everything in this package.
 */
export const replayPosition = (movements: readonly Movement[]): OpenPosition =>
  movements.reduce<OpenPosition>(
    (open, m) => (m.kind === "in" ? enter(open, m) : leave(open, m)),
    EMPTY_OPEN,
  );
```

Add to `packages/core/src/index.ts`, after the cost-basis export:

```ts
export * from "./portfolio/replay.js";
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter @mercury/core exec vitest run src/portfolio/replay.test.ts`
Expected: PASS, 14 tests (7 named, 7 table rows).

Run: `pnpm --filter @mercury/core typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/portfolio/replay.ts packages/core/src/portfolio/replay.test.ts packages/core/src/index.ts
git commit -F - <<'EOF'
feat(core): replay a position from what entered and what left

Lots record what was acquired and nothing records what left, so a position
has been every lot ever written scaled down to the chain. That is average
cost only until a sell is followed by another buy: buy 2 at $100, sell 1,
buy 1 at $200, and two shares that cost $300 read as $266.67.

replayPosition takes both halves, in the order they reached Mercury, and
gives what is still held and what it cost. Whatever leaves takes the same
fraction of every figure, counted in tokens because tokens are exact.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: The `disposal` table, `lot.recorded_at`, and the backfill

**Files:**

- Modify: `services/api/src/db/schema.ts` (the `lots` table at ~line 260; add `disposals` after it; the `positions` doc comment at ~line 313)
- Generate: `services/api/drizzle/0025_disposal.sql`, `services/api/drizzle/meta/0025_snapshot.json`, journal entry
- Generate then fill: `services/api/drizzle/0026_disposal_backfill.sql`, `meta/0026_snapshot.json`, journal entry
- Create: `services/api/src/db/disposal-backfill.test.ts`

**Interfaces:**

- Produces (used by Tasks 3 and 5): `disposals` table export from `schema.ts` with columns `id`, `userId`, `tokenId`, `instrumentId`, `tokenQty` (bigint), `shares` (numeric string), `kind` (`"sell" | "transfer_out"`), `orderId` (uuid, nullable, unique), `occurredAt`, `recordedAt` (default now). `lots.recordedAt` (timestamptz, not null, default now).

- [ ] **Step 1: Add the columns to the schema**

In `services/api/src/db/schema.ts`, inside `lots`, directly after the `acquiredAt` line:

```ts
    /**
     * When the lot entered Mercury, which a position is replayed in order of.
     *
     * The same moment as `acquiredAt` for everything written so far. An imported
     * lot is the first that differs: bought in March, recorded today. Replaying
     * it by when it was bought would apply last month's sell to shares that were
     * not here yet.
     */
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
```

Directly after the `lots` table (before the `positions` doc comment), add:

```ts
/**
 * Shares that left: a sell, or a transfer out position-sync noticed. The other
 * half of `lot`. A position is a replay of the two in the order they were
 * recorded, at average cost (`replayPosition` in @mercury/core), so the cost of
 * shares that left goes with them rather than staying to be mixed into the next
 * purchase.
 */
export const disposals = pgTable(
  "disposal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokens.id),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id),
    /** Smallest unit, as it left. */
    tokenQty: bigint("token_qty", { mode: "bigint" }).notNull(),
    /** token_qty x the multiplier in force when it left. For reading; the replay counts tokens. */
    shares: usd("shares").notNull(),
    kind: text("kind", { enum: ["sell", "transfer_out"] }).notNull(),
    /** The sell that wrote it. Unique, so a sell settled twice removes its shares once. */
    orderId: uuid("order_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("disposal_user_token_idx").on(t.userId, t.tokenId),
    uniqueIndex("disposal_order_idx").on(t.orderId),
  ],
);
```

Change the `positions` doc comment from `Rebuildable from lots at any time.` to:

```ts
/** A derived rollup, per user per instrument. Rebuildable from lots and disposals at any time. */
```

- [ ] **Step 2: Generate the DDL migration**

Run: `pnpm --filter @mercury/api exec drizzle-kit generate --name disposal`
Expected: a new `drizzle/0025_disposal.sql` containing `CREATE TABLE "disposal"`, `ALTER TABLE "lot" ADD COLUMN "recorded_at" timestamp with time zone DEFAULT now() NOT NULL`, the two indexes and the foreign keys; a new snapshot; a journal entry. Read the SQL and check it says exactly that and nothing else.

- [ ] **Step 3: Generate the empty data migration**

Run: `pnpm --filter @mercury/api exec drizzle-kit generate --custom --name disposal_backfill`
Expected: an empty `drizzle/0026_disposal_backfill.sql` and its journal entry.

- [ ] **Step 4: Write the failing backfill test**

Create `services/api/src/db/disposal-backfill.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./testing.js";
import { disposals, instruments, lots, orders, tokens, users } from "./schema.js";

/**
 * 0026 writes the shares every past sell removed, so the first replay after
 * deploy costs positions the way they will be costed from then on. Without it
 * every sell before deploy would look like a transfer out, dated the day of
 * the deploy, and a sell followed by a buy would stay wrong.
 *
 * `testDb` has already applied it, to empty tables. Running it again over seeded
 * rows is what it meets in production, and running it twice is a retried deploy.
 */
const migration = readFileSync(new URL("../../drizzle/0026_disposal_backfill.sql", import.meta.url), "utf8")
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const FILLED = new Date("2026-10-01T15:00:00Z");
const BOUGHT = new Date("2026-09-20T10:00:00Z");

/** A stored decision whose candidate for NVDAx sold `filledShares` at `multiplier`. */
const decision = (filledShares: string | null, multiplier = "1.001") => ({
  kind: "execute",
  candidates: [
    { mint: "SomeOtherMint", multiplier: "1", filledShares: "9" },
    { mint: NVDAX, multiplier, filledShares },
  ],
});

const seeded = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:backfill" }).returning();
  const [instrument] = await db
    .insert(instruments)
    .values({ ticker: "NVDA", name: "Nvidia", sector: "Technology" })
    .returning();
  const [token] = await db
    .insert(tokens)
    .values({ instrumentId: instrument!.id, mint: NVDAX, symbol: "NVDAx", issuer: "backed", decimals: 8 })
    .returning();
  const order = (over: Partial<typeof orders.$inferInsert> = {}) =>
    db
      .insert(orders)
      .values({
        userId: user!.id,
        instrumentId: instrument!.id,
        side: "sell",
        usdAmount: "100",
        decision: decision("0.5005"),
        chosenTokenId: token!.id,
        status: "filled",
        filledAt: FILLED,
        ...over,
      })
      .returning();

  const [sold] = await order();
  await order({ side: "buy" });
  await order({ status: "executing", filledAt: null });
  await order({ decision: decision(null) });
  await db.insert(lots).values({
    userId: user!.id,
    tokenId: token!.id,
    instrumentId: instrument!.id,
    tokenQty: 100_000_000n,
    shares: "1",
    unitCostUsd: "200",
    acquiredAt: BOUGHT,
    source: "buy",
  });
  return { db, soldId: sold!.id, tokenId: token!.id };
};

const run = async (db: Awaited<ReturnType<typeof testDb>>) => {
  for (const statement of migration) await db.execute(sql.raw(statement));
};

describe("0026_disposal_backfill", () => {
  it("records every filled sell as the tokens it removed, and nothing else", async () => {
    const { db, soldId, tokenId } = await seeded();
    await run(db);
    const rows = await db.select().from(disposals);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      orderId: soldId,
      tokenId,
      kind: "sell",
      // 0.5005 shares at a multiplier of 1.001 is 0.5 tokens, at eight decimals.
      tokenQty: 50_000_000n,
      occurredAt: FILLED,
      recordedAt: FILLED,
    });
    expect(Number(rows[0]!.shares)).toBe(0.5005);
  });

  it("dates every lot written before it as recorded when it was acquired", async () => {
    const { db } = await seeded();
    await run(db);
    const [lot] = await db.select().from(lots);
    expect(lot!.recordedAt).toEqual(BOUGHT);
  });

  /* A retried deploy runs it again over rows it already wrote. */
  it("writes each sell once when it runs twice", async () => {
    const { db } = await seeded();
    await run(db);
    await run(db);
    expect(await db.select().from(disposals)).toHaveLength(1);
  });
});
```

- [ ] **Step 5: Run it to see it fail**

Run: `pnpm --filter @mercury/api exec vitest run src/db/disposal-backfill.test.ts`
Expected: FAIL. The first test finds 0 disposals, the second finds `recordedAt` at insert time rather than `BOUGHT`.

- [ ] **Step 6: Write the backfill**

Replace the contents of `services/api/drizzle/0026_disposal_backfill.sql` with:

```sql
-- The shares every past sell removed, and when every past lot entered Mercury.
--
-- A position is now a replay of lots and disposals in the order they were
-- recorded. Lots written so far entered when they were acquired, and every
-- filled sell left a disposal it had nowhere to write.
UPDATE "lot" SET "recorded_at" = "acquired_at";
--> statement-breakpoint
-- A sell is an exact-in swap, so the chosen candidate's `filledShares` is the
-- shares that left, at the candidate's multiplier; tokens are those shares over
-- that multiplier. A sell whose decision cannot say is left out, and the first
-- position-sync after deploy records its drop as a transfer out instead.
INSERT INTO "disposal" ("user_id", "token_id", "instrument_id", "token_qty", "shares", "kind", "order_id", "occurred_at", "recorded_at")
SELECT
  o."user_id",
  t."id",
  o."instrument_id",
  round((c->>'filledShares')::numeric / (c->>'multiplier')::numeric * power(10::numeric, t."decimals"))::bigint,
  (c->>'filledShares')::numeric,
  'sell',
  o."id",
  o."filled_at",
  o."filled_at"
FROM "order" o
JOIN "token" t ON t."id" = o."chosen_token_id"
CROSS JOIN LATERAL jsonb_array_elements(o."decision"->'candidates') AS c
WHERE o."side" = 'sell'
  AND o."status" = 'filled'
  AND o."filled_at" IS NOT NULL
  AND c->>'mint' = t."mint"
  AND c->>'filledShares' IS NOT NULL
  AND (c->>'multiplier')::numeric > 0
ON CONFLICT ("order_id") DO NOTHING;
```

- [ ] **Step 7: Run it to see it pass**

Run: `pnpm --filter @mercury/api exec vitest run src/db/disposal-backfill.test.ts`
Expected: PASS, 3 tests.

Run: `pnpm --filter @mercury/api typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add services/api/src/db/schema.ts services/api/drizzle services/api/src/db/disposal-backfill.test.ts
git commit -F - <<'EOF'
feat(api): a table for the shares that leave, and every past sell in it

A disposal is the other half of a lot: the tokens that left, by a sell or a
transfer out, and when. Lots gain recorded_at, the moment they entered
Mercury, which a position will be replayed in order of. It equals acquired_at
for every lot so far; an import is the first that will differ.

The backfill writes a disposal for every filled sell. A sell is an exact-in
swap, so the chosen candidate's filledShares is exactly what left.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: A sell writes its disposal

**Files:**

- Modify: `services/api/src/orders/settle.ts` (imports at line 1–4; the claim at ~103–118; after the buy's lot insert at ~151; the doc comment at ~78–96)
- Modify: `services/api/src/orders/settle.test.ts` (imports; new `describe` block at the end)

**Interfaces:**

- Consumes: `disposals` from `../db/schema.js` (Task 2).
- Produces: every settled sell has exactly one `disposal` row with `kind: "sell"`, `orderId`, `tokenQty: fill.tokensRaw`, `shares: fixed(fill.shares)`, `occurredAt: fill.occurredAt`. Task 5's tests rely on this.

- [ ] **Step 1: Write the failing tests**

In `services/api/src/orders/settle.test.ts`, add `disposals` to the schema import:

```ts
import { activities, disposals, instruments, lots, orders, positions, tokens, users } from "../db/schema.js";
```

Append at the end of the file:

```ts
describe("settleOrder: the shares a sell removes", () => {
  const sold: Fill = { ...aFill, usd: D(110) };

  /** A sell of the seeded token, executing, created at `createdAt`. */
  const sellOrder = async (s: Awaited<ReturnType<typeof seed>>, createdAt?: Date) => {
    const [order] = await s.db
      .insert(orders)
      .values({
        userId: s.userId,
        instrumentId: s.instrumentId,
        side: "sell",
        usdAmount: "110",
        decision: { kind: "execute" },
        chosenTokenId: s.tokenId,
        status: "executing",
        ...(createdAt === undefined ? {} : { createdAt }),
      })
      .returning();
    return order!.id;
  };

  const transferOut = (s: Awaited<ReturnType<typeof seed>>, recordedAt: Date) =>
    s.db.insert(disposals).values({
      userId: s.userId,
      tokenId: s.tokenId,
      instrumentId: s.instrumentId,
      tokenQty: 44_901_800n,
      shares: "0.44978187",
      kind: "transfer_out",
      occurredAt: recordedAt,
      recordedAt,
    });

  it("records them, linked to the order", async () => {
    const s = await seed();
    const orderId = await sellOrder(s);
    await settleOrder(s.db, inputFor(s, { orderId, side: "sell", fill: sold }));

    const rows = await s.db.select().from(disposals);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "sell",
      orderId,
      tokenId: s.tokenId,
      instrumentId: s.instrumentId,
      tokenQty: 44_901_800n,
      occurredAt: AT,
    });
    expect(Number(rows[0]!.shares)).toBeCloseTo(0.44978187, 8);
  });

  it("removes them once when the sell is settled twice", async () => {
    const s = await seed();
    const orderId = await sellOrder(s);
    await settleOrder(s.db, inputFor(s, { orderId, side: "sell", fill: sold }));
    await settleOrder(s.db, inputFor(s, { orderId, side: "sell", fill: sold }));
    expect(await s.db.select().from(disposals)).toHaveLength(1);
  });

  it("takes back a transfer out recorded while the sell was in flight", async () => {
    // Confirmed late: position-sync saw the tokens leave before the client
    // came back, and read it as a transfer. It was this sell.
    const s = await seed();
    const orderId = await sellOrder(s, new Date(Date.now() - 20 * 60_000));
    await transferOut(s, new Date());
    await settleOrder(s.db, inputFor(s, { orderId, side: "sell", fill: sold }));
    expect(await s.db.select({ kind: disposals.kind }).from(disposals)).toEqual([{ kind: "sell" }]);
  });

  it("leaves a transfer out from before the order alone", async () => {
    const s = await seed();
    await transferOut(s, new Date(Date.now() - 60 * 60_000));
    const orderId = await sellOrder(s);
    await settleOrder(s.db, inputFor(s, { orderId, side: "sell", fill: sold }));
    const kinds = await s.db.select({ kind: disposals.kind }).from(disposals).orderBy(disposals.recordedAt);
    expect(kinds).toEqual([{ kind: "transfer_out" }, { kind: "sell" }]);
  });

  it("records none for a buy", async () => {
    const s = await seed();
    await settleOrder(s.db, inputFor(s));
    expect(await s.db.select().from(disposals)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @mercury/api exec vitest run src/orders/settle.test.ts`
Expected: the first four new tests FAIL (no disposal rows, or a transfer_out left behind); "records none for a buy" passes; the existing tests pass.

- [ ] **Step 3: Write the sell's disposal**

In `services/api/src/orders/settle.ts`, change the drizzle import and the schema import:

```ts
import { and, eq, gte, inArray } from "drizzle-orm";
```

```ts
import { activities, disposals, instruments, lots, orders, positions, tokens } from "../db/schema.js";
```

Change the claim's `.returning(...)` so it also returns when the order began:

```ts
      .returning({ id: orders.id, createdAt: orders.createdAt });
```

Directly after the `if (input.side === "buy") { ... }` block that inserts the lot, add:

```ts
if (input.side === "sell") {
  /*
   * A transfer out position-sync recorded since this order began is this
   * sell, seen on the chain before the client came back to confirm it. It
   * is taken back, so the shares leave once. If any of that drop really
   * was a transfer, the next pass finds the gap again and records it.
   */
  await tx
    .delete(disposals)
    .where(
      and(
        eq(disposals.userId, input.userId),
        eq(disposals.tokenId, input.tokenId),
        eq(disposals.kind, "transfer_out"),
        gte(disposals.recordedAt, claimed[0]!.createdAt),
      ),
    );
  await tx
    .insert(disposals)
    .values({
      userId: input.userId,
      tokenId: input.tokenId,
      instrumentId: input.instrumentId,
      tokenQty: fill.tokensRaw,
      shares: fixed(fill.shares),
      kind: "sell",
      orderId: input.orderId,
      occurredAt: fill.occurredAt,
    })
    // The claim already refuses a second settle; the unique order id
    // refuses a second disposal whatever reaches this line.
    .onConflictDoNothing();
}
```

Replace the last paragraph of the `settleOrder` doc comment (from `A sell writes no lot, on purpose.` to the end of the comment) with:

```ts
 * A sell writes no lot, on purpose: lots record what was acquired, and selling
 * acquires nothing. It writes a disposal instead, the tokens that left, and
 * the position follows from `planReconciliation`, which replays lots and
 * disposals in the order they were recorded at average cost. The cost per
 * share of what remains is exactly what it was, and the cost of what was sold
 * goes with it rather than staying to be mixed into the next purchase.
 */
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm --filter @mercury/api exec vitest run src/orders/settle.test.ts`
Expected: PASS, every test in the file.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/orders/settle.ts services/api/src/orders/settle.test.ts
git commit -F - <<'EOF'
feat(api): a sell records the shares it removed

Settling a sell now writes a disposal beside the order, in the same
transaction, keyed by the order so a second settle cannot remove the shares
twice. A transfer out recorded since the order began is taken back first: it
was this sell, seen on the chain before the client confirmed it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Reconcile on open figures, and record transfers out

**Files:**

- Modify: `services/api/src/portfolio/reconcile.ts` (`HeldToken` ~3–31; new `DisposalWrite`; `Reconciliation` ~68–72; `planReconciliation` ~112–214)
- Modify: `services/api/src/portfolio/reconcile.test.ts` (the `held()` helper; the "tokens that left" block; two new blocks)

**Interfaces:**

- Consumes: nothing new.
- Produces (used by Task 5):

  ```ts
  // HeldToken gains:
  readonly settling: boolean;
  // and its recorded* fields now mean "open": what the replay says is still held.
  export interface DisposalWrite { tokenId: string; instrumentId: string; tokenQty: bigint; shares: Decimal; kind: "transfer_out"; occurredAt: Date }
  export interface Reconciliation { lots; activity; disposals: readonly DisposalWrite[]; positions }
  ```

- [ ] **Step 1: Write the failing tests**

In `services/api/src/portfolio/reconcile.test.ts`, add `settling: false,` to the `held()` helper's defaults, after `recordedFeeUsd: ZERO,`:

```ts
  recordedFeeUsd: ZERO,
  settling: false,
  ...over,
```

In the `describe("planReconciliation: tokens that left", ...)` block, rename the first test and add a disposal expectation to it and to "writes no activity for it":

```ts
it("follows the chain down, and records the tokens that left", () => {
  const plan = planReconciliation(
    [
      held({
        chainRawAmount: ONE_TOKEN / 2n,
        recordedRawAmount: ONE_TOKEN,
        recordedShares: D(1),
        recordedCostUsd: D(200),
      }),
    ],
    NOW,
  );
  expect(plan.lots).toEqual([]);
  expect(plan.disposals).toEqual([
    {
      tokenId: "token-nvdax",
      instrumentId: "instrument-nvda",
      tokenQty: ONE_TOKEN / 2n,
      shares: D("0.5"),
      kind: "transfer_out",
      occurredAt: NOW,
    },
  ]);
  expect(plan.positions[0]).toEqual({
    instrumentId: "instrument-nvda",
    shares: D("0.5"),
    sharesWithBasisUsd: D("0.5"),
    costBasisUsd: D(100),
    referenceBasisUsd: D(100),
    feeUsd: ZERO,
    // Average cost does not move when a position shrinks. That is what
    // average-cost accounting means, and it is why the scaling is pro rata.
    avgUnitCostUsd: D(200),
  });
});
```

In "writes no activity for it, because we do not know what happened", add after `expect(plan.activity).toEqual([]);`:

```ts
expect(plan.disposals.map((d) => d.tokenQty)).toEqual([ONE_TOKEN]);
```

At the end of that same `describe` block, add:

```ts
it("records nothing on the pass after, once the records have caught up", () => {
  const plan = planReconciliation(
    [
      held({
        chainRawAmount: ONE_TOKEN / 2n,
        recordedRawAmount: ONE_TOKEN / 2n,
        recordedShares: D("0.5"),
        recordedCostUsd: D(100),
      }),
    ],
    NOW,
  );
  expect(plan.disposals).toEqual([]);
});

it("records nothing for tokens that arrived, which have no cost to take away", () => {
  const plan = planReconciliation([held({ chainRawAmount: ONE_TOKEN })], NOW);
  expect(plan.disposals).toEqual([]);
});

it("credits a dividend only on the tokens still held", () => {
  // Half the tokens left, then the multiplier rose by half. The dividend is
  // half a share on the half token still here, not on the token that went.
  const plan = planReconciliation(
    [
      held({
        chainRawAmount: ONE_TOKEN / 2n,
        recordedRawAmount: ONE_TOKEN,
        recordedShares: D(1),
        recordedCostUsd: D(200),
        multiplier: D("1.5"),
      }),
    ],
    NOW,
  );
  expect(plan.lots.map((l) => l.shares)).toEqual([D("0.25")]);
  expect(plan.positions[0]).toMatchObject({ shares: D("0.75"), costBasisUsd: D(100) });
});
```

After that `describe` block, add:

```ts
describe("planReconciliation: a sell in flight", () => {
  /*
   * The pass reads the finalized balance, and a sell settles against the
   * confirmed one, so for a few seconds the two disagree about a sell that is
   * fine. Reading that as a transfer would remove the shares twice.
   */
  it("leaves the stock as it was for the pass", () => {
    const plan = planReconciliation(
      [
        held({
          chainRawAmount: ONE_TOKEN / 2n,
          recordedRawAmount: ONE_TOKEN,
          recordedShares: D(1),
          recordedCostUsd: D(200),
          settling: true,
        }),
      ],
      NOW,
    );
    expect(plan).toEqual({ lots: [], activity: [], disposals: [], positions: [] });
  });

  it("leaves every wrapper of that stock as it was", () => {
    const backed = held({
      chainRawAmount: 0n,
      recordedRawAmount: ONE_TOKEN,
      recordedShares: D(1),
      settling: true,
    });
    const ondo = held({ tokenId: "token-nvdaon", mint: "OnDo", decimals: 6, chainRawAmount: 2_000_000n });
    expect(planReconciliation([backed, ondo], NOW).positions).toEqual([]);
  });

  it("goes on reconciling other stocks", () => {
    const nvda = held({
      chainRawAmount: 0n,
      recordedRawAmount: ONE_TOKEN,
      recordedShares: D(1),
      settling: true,
    });
    const spy = held({
      tokenId: "token-spyx",
      instrumentId: "instrument-spy",
      ticker: "SPY",
      chainRawAmount: ONE_TOKEN,
    });
    expect(planReconciliation([nvda, spy], NOW).positions.map((p) => p.instrumentId)).toEqual([
      "instrument-spy",
    ]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @mercury/api exec vitest run src/portfolio/reconcile.test.ts`
Expected: FAIL. TypeScript-in-vitest does not type-check, so the failures are behavioural: `plan.disposals` is `undefined`, the dividend credits `0.5` shares rather than `0.25`, and the settling tests get positions back.

- [ ] **Step 3: Change `HeldToken` and the plan's types**

In `services/api/src/portfolio/reconcile.ts`, replace the five `recorded*` doc comments in `HeldToken` and add `settling`:

```ts
  /** Tokens our records still hold: every lot, less every disposal, replayed (`replayPosition`). */
  readonly recordedRawAmount: bigint;
  /** The shares those open records come to. */
  readonly recordedShares: Decimal;
  /** What those open shares cost, shares x unit cost. Fees are not in it. */
  readonly recordedCostUsd: Decimal;
  /**
   * The same open shares at the price the stock was quoted at when each was
   * acquired. A lot with no reference recorded contributes its execution price
   * instead, which reads as no premium paid rather than as a guess.
   */
  readonly recordedReferenceUsd: Decimal;
  /** Fees paid to acquire the open shares. */
  readonly recordedFeeUsd: Decimal;
  /**
   * A sell of this stock is executing, or settled moments ago.
   *
   * The pass reads the finalized balance and a sell settles against the
   * confirmed one, so for a few seconds the chain and the records disagree
   * about a sell that is fine. The pass leaves the stock as it was, rather than
   * reading the gap as a transfer out and removing the same shares twice.
   */
  readonly settling: boolean;
```

After the `LotWrite` interface, add:

```ts
/** Tokens that left by a path other than a sell, which writes its own. */
export interface DisposalWrite {
  readonly tokenId: string;
  readonly instrumentId: string;
  readonly tokenQty: bigint;
  /** At the multiplier in force now. For reading; the replay counts tokens. */
  readonly shares: Decimal;
  readonly kind: "transfer_out";
  readonly occurredAt: Date;
}
```

Change `Reconciliation` to:

```ts
export interface Reconciliation {
  readonly lots: readonly LotWrite[];
  readonly activity: readonly ActivityWrite[];
  readonly disposals: readonly DisposalWrite[];
  readonly positions: readonly PositionWrite[];
}
```

- [ ] **Step 4: Rewrite `planReconciliation`**

Replace the whole of `planReconciliation` (its doc comment stays) with:

```ts
export function planReconciliation(held: readonly HeldToken[], now: Date): Reconciliation {
  const lots: LotWrite[] = [];
  const activity: ActivityWrite[] = [];
  const disposals: DisposalWrite[] = [];
  const byInstrument = new Map<
    string,
    { shares: Decimal; withBasis: Decimal; cost: Decimal; reference: Decimal; fee: Decimal }
  >();

  // Every wrapper of a stock with a sell in flight sits this pass out. See
  // `HeldToken.settling`. Its position row stays as it was: stale for seconds,
  // and right.
  const settling = new Set(held.filter((t) => t.settling).map((t) => t.instrumentId));

  for (const token of held) {
    if (settling.has(token.instrumentId)) continue;

    // What the chain says you hold. This is a fact and it is never inferred.
    const chainShares = scaled(token.chainRawAmount, token.decimals).mul(token.multiplier);

    let recordedRaw = token.recordedRawAmount;
    let recordedShares = token.recordedShares;
    let cost = token.recordedCostUsd;
    let reference = token.recordedReferenceUsd;
    let fee = token.recordedFeeUsd;

    /*
     * Tokens that left by a path other than a sell: a send from another app,
     * or anything we do not watch. A sell writes its own disposal when it
     * settles, so a gap here is everything else. It is recorded, so the cost
     * leaves with the shares rather than staying behind to be mixed into the
     * next purchase, which is what made a sell followed by a buy report the
     * wrong cost.
     *
     * Scaled by tokens rather than shares, as the replay is: tokens are exact,
     * and a dividend not yet written would make shares disagree.
     */
    if (token.chainRawAmount < recordedRaw) {
      const goneRaw = recordedRaw - token.chainRawAmount;
      disposals.push({
        tokenId: token.tokenId,
        instrumentId: token.instrumentId,
        tokenQty: goneRaw,
        shares: scaled(goneRaw, token.decimals).mul(token.multiplier),
        kind: "transfer_out",
        occurredAt: now,
      });
      const kept = D(token.chainRawAmount.toString()).div(D(recordedRaw.toString()));
      recordedRaw = token.chainRawAmount;
      recordedShares = recordedShares.mul(kept);
      cost = cost.mul(kept);
      reference = reference.mul(kept);
      fee = fee.mul(kept);
    }

    // A dividend: the multiplier rose, so the tokens we have lots for are worth
    // more shares than those lots record. Zero cost, so the average cost per
    // share falls — the same money now buys more shares, which is the figure
    // other integrations get wrong.
    //
    // Driven by the multiplier on the open records, after any transfer out, so
    // a dividend is never credited on tokens that have already left. Never
    // driven by a gap between the chain and our records: a gap upward means
    // tokens arrived from somewhere we did not witness, and calling that a
    // dividend would hand the holder free shares in the accounts.
    const recordedQty = scaled(recordedRaw, token.decimals);
    if (recordedQty.gt(ZERO) && recordedShares.gt(ZERO)) {
      const recordedMultiplier = recordedShares.div(recordedQty);
      const gained = recordedQty.mul(token.multiplier.sub(recordedMultiplier));
      if (gained.gte(DIVIDEND_FLOOR)) {
        lots.push({
          tokenId: token.tokenId,
          instrumentId: token.instrumentId,
          tokenQty: 0n,
          shares: gained,
          unitCostUsd: ZERO,
          source: "dividend",
          isEstimated: false,
          acquiredAt: now,
        });
        activity.push({
          kind: "dividend",
          // Labelled like every row, and said as what it was paid in: the
          // multiplier rose, so the dividend arrived as shares, at no cost.
          title: `${token.ticker} dividend`,
          subtitle: `Paid as ${plural(gained)}`,
          amountUsd: token.referencePricePerShare === null ? null : gained.mul(token.referencePricePerShare),
          refTable: "token",
          refId: token.tokenId,
          occurredAt: now,
        });
        recordedShares = recordedShares.add(gained);
      }
    }

    // Two separate truths, kept separate.
    //
    // `shares` is the chain's answer to what you hold. `withBasis` is how much
    // of it we can prove a cost for, which is whatever our open records cover —
    // a deposit we did not witness has no lot, so it counts toward the holding
    // and not toward the basis. Nothing here invents a price: a share with no
    // lot behind it is reported as one we have no cost for, and the screens say
    // so rather than showing a profit measured against a guess.
    //
    // After a transfer out the records equal the chain, so this cap only bites
    // when shares arrived unwitnessed.
    const withBasis = Decimal.min(recordedShares, chainShares);
    const ratio = recordedShares.isZero() ? ZERO : withBasis.div(recordedShares);

    const running = byInstrument.get(token.instrumentId) ?? {
      shares: ZERO,
      withBasis: ZERO,
      cost: ZERO,
      reference: ZERO,
      fee: ZERO,
    };
    byInstrument.set(token.instrumentId, {
      shares: running.shares.add(chainShares),
      withBasis: running.withBasis.add(withBasis),
      cost: running.cost.add(cost.mul(ratio)),
      // Scaled by the same ratio as the cost, and they have to be: a capped
      // basis whose reference was not capped with it would report the shares
      // that left as a market move, and the two lines would stop summing to
      // the dollars.
      reference: running.reference.add(reference.mul(ratio)),
      fee: running.fee.add(fee.mul(ratio)),
    });
  }

  const positions: PositionWrite[] = [...byInstrument.entries()].map(([instrumentId, r]) => ({
    instrumentId,
    shares: r.shares,
    sharesWithBasisUsd: r.withBasis,
    costBasisUsd: r.cost,
    referenceBasisUsd: r.reference,
    feeUsd: r.fee,
    avgUnitCostUsd: r.withBasis.isZero() ? ZERO : r.cost.div(r.withBasis),
  }));

  return { lots, activity, disposals, positions };
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `pnpm --filter @mercury/api exec vitest run src/portfolio/reconcile.test.ts`
Expected: PASS, every test in the file.

Run: `pnpm --filter @mercury/api typecheck`
Expected: FAIL in `src/portfolio/apply.ts` only (`settling` missing from the object it builds). Task 5 fixes it; do not commit a type error, so go straight on to Task 5 and commit the two together.

---

### Task 5: Load, replay and write

**Files:**

- Create: `services/api/src/portfolio/open.ts`
- Create: `services/api/src/portfolio/open.test.ts`
- Modify: `services/api/src/portfolio/apply.ts` (imports; `loadHeldTokens`; `applyReconciliation`)
- Modify: `services/api/src/portfolio/sync.ts:65` (the `written` count)
- Create: `services/api/src/portfolio/books.test.ts`

**Interfaces:**

- Consumes: `replayPosition`, `EMPTY_OPEN`, `Movement` from `@mercury/core` (Task 1); `disposals`, `lots.recordedAt` (Task 2); `HeldToken.settling`, `Reconciliation.disposals` (Task 4); sell disposals from `settleOrder` (Task 3).
- Produces:

  ```ts
  // open.ts
  export interface LotRow {
    id: string;
    tokenId: string;
    tokenQty: bigint;
    shares: string;
    unitCostUsd: string;
    referencePriceUsd: string | null;
    feeUsd: string;
    acquiredAt: Date;
    recordedAtUs: number;
    isEstimated: boolean;
  }
  export interface DisposalRow {
    id: string;
    tokenId: string;
    tokenQty: bigint;
    recordedAtUs: number;
  }
  export function movementsByToken(
    lots: readonly LotRow[],
    disposals: readonly DisposalRow[],
  ): Map<string, Movement[]>;
  // apply.ts
  export async function loadHeldTokens(
    db,
    deps,
    userId,
    walletAddress,
    now?: Date,
  ): Promise<readonly HeldToken[]>;
  ```

- [ ] **Step 1: Write the failing ordering test**

Create `services/api/src/portfolio/open.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { movementsByToken, type DisposalRow, type LotRow } from "./open.js";

const AT = new Date("2026-10-01T15:00:00Z");
/** Microseconds, as `loadHeldTokens` reads `recorded_at`. */
const AT_US = AT.getTime() * 1000;
const LATER_US = AT_US + 86_400_000_000;

const lot = (over: Partial<LotRow>): LotRow => ({
  id: "lot-a",
  tokenId: "token-nvdax",
  tokenQty: 100n,
  shares: "1",
  unitCostUsd: "200",
  referencePriceUsd: null,
  feeUsd: "0.5",
  acquiredAt: AT,
  recordedAtUs: AT_US,
  isEstimated: false,
  ...over,
});

const disposal = (over: Partial<DisposalRow>): DisposalRow => ({
  id: "disposal-a",
  tokenId: "token-nvdax",
  tokenQty: 100n,
  recordedAtUs: AT_US,
  ...over,
});

describe("movementsByToken", () => {
  it("orders by when each was recorded, not when a lot was acquired", () => {
    const moves = movementsByToken(
      [lot({ id: "imported", recordedAtUs: LATER_US, acquiredAt: new Date("2025-03-12T00:00:00Z") })],
      [disposal({ recordedAtUs: AT_US })],
    ).get("token-nvdax")!;
    expect(moves.map((m) => m.kind)).toEqual(["out", "in"]);
  });

  it("tells apart two rows recorded in the same millisecond", () => {
    const moves = movementsByToken(
      [lot({ recordedAtUs: AT_US + 1 })],
      [disposal({ recordedAtUs: AT_US })],
    ).get("token-nvdax")!;
    expect(moves.map((m) => m.kind)).toEqual(["out", "in"]);
  });

  it("puts a lot before a disposal recorded in the same instant", () => {
    const moves = movementsByToken([lot({})], [disposal({})]).get("token-nvdax")!;
    expect(moves.map((m) => m.kind)).toEqual(["in", "out"]);
  });

  it("keeps tokens apart", () => {
    const byToken = movementsByToken([lot({}), lot({ id: "lot-b", tokenId: "token-spyx" })], []);
    expect([...byToken.keys()].sort()).toEqual(["token-nvdax", "token-spyx"]);
  });

  it("prices a lot as the reconcile always has", () => {
    // Shares x unit cost, and the reference falls back to the unit cost when
    // none was recorded, which reads as no premium paid.
    const [move] = movementsByToken([lot({ shares: "2" })], []).get("token-nvdax")!;
    expect(move).toMatchObject({ kind: "in", tokenQty: 100n, isEstimated: false });
    if (move?.kind !== "in") throw new Error("expected a lot");
    expect(move.costUsd.toFixed(2)).toBe("400.00");
    expect(move.referenceUsd.toFixed(2)).toBe("400.00");
    expect(move.feeUsd.toFixed(2)).toBe("0.50");
  });
});
```

Run: `pnpm --filter @mercury/api exec vitest run src/portfolio/open.test.ts`
Expected: FAIL, `Failed to resolve import "./open.js"`.

- [ ] **Step 2: Write `open.ts`**

Create `services/api/src/portfolio/open.ts`:

```ts
import { D, type Movement } from "@mercury/core";

/** A lot as `loadHeldTokens` reads it. */
export interface LotRow {
  readonly id: string;
  readonly tokenId: string;
  readonly tokenQty: bigint;
  readonly shares: string;
  readonly unitCostUsd: string;
  readonly referencePriceUsd: string | null;
  readonly feeUsd: string;
  readonly acquiredAt: Date;
  /**
   * When it was recorded, in microseconds since the epoch. Not a Date: a Date
   * keeps milliseconds, and a lot and a disposal can land in the same one.
   */
  readonly recordedAtUs: number;
  readonly isEstimated: boolean;
}

/** A disposal as `loadHeldTokens` reads it. */
export interface DisposalRow {
  readonly id: string;
  readonly tokenId: string;
  readonly tokenQty: bigint;
  /** As on `LotRow`. */
  readonly recordedAtUs: number;
}

interface Entry {
  readonly tokenId: string;
  readonly at: number;
  /** In before out, at the same instant. */
  readonly rank: 0 | 1;
  readonly id: string;
  readonly movement: Movement;
}

/**
 * Each token's lots and disposals as one sequence, in the order they entered
 * and left Mercury, ready for `replayPosition`.
 *
 * A lot and a disposal recorded in the same instant go in before out, so a buy
 * and a sell in one millisecond cannot empty a holding that was never empty.
 * The id breaks any tie that is left, so the same rows always replay the same
 * way.
 */
export function movementsByToken(
  lots: readonly LotRow[],
  disposals: readonly DisposalRow[],
): Map<string, Movement[]> {
  const entries: Entry[] = [
    ...lots.map((l): Entry => {
      const shares = D(l.shares);
      return {
        tokenId: l.tokenId,
        at: l.recordedAtUs,
        rank: 0,
        id: l.id,
        movement: {
          kind: "in",
          tokenQty: l.tokenQty,
          shares,
          costUsd: shares.mul(D(l.unitCostUsd)),
          // A lot written before the reference was recorded falls back to the
          // price it executed at, which reads as no premium paid. Guessing one
          // from today's quote would book a market move that never happened.
          referenceUsd: shares.mul(D(l.referencePriceUsd ?? l.unitCostUsd)),
          feeUsd: D(l.feeUsd),
          acquiredAt: l.acquiredAt,
          isEstimated: l.isEstimated,
        },
      };
    }),
    ...disposals.map((d): Entry => ({
      tokenId: d.tokenId,
      at: d.recordedAtUs,
      rank: 1,
      id: d.id,
      movement: { kind: "out", tokenQty: d.tokenQty },
    })),
  ].sort((a, b) => a.at - b.at || a.rank - b.rank || a.id.localeCompare(b.id));

  const byToken = new Map<string, Movement[]>();
  for (const e of entries) byToken.set(e.tokenId, [...(byToken.get(e.tokenId) ?? []), e.movement]);
  return byToken;
}
```

Run: `pnpm --filter @mercury/api exec vitest run src/portfolio/open.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 3: Write the failing end-to-end tests**

Create `services/api/src/portfolio/books.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { D, ZERO } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import { testDb } from "../db/testing.js";
import { disposals, instruments, lots, orders, positions, tokens, users } from "../db/schema.js";
import { withPledged } from "../lending/pledged.js";
import type { LendingSource } from "../lending/ports.js";
import type { Fill } from "../orders/fill.js";
import { settleOrder } from "../orders/settle.js";
import { applyReconciliation, loadHeldTokens, type ReconcileDeps } from "./apply.js";
import { planReconciliation } from "./reconcile.js";

const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const WALLET = "Wa11et00000000000000000000000000000000000000";
/** One token at eight decimals. */
const ONE = 100_000_000n;
const MINUTE = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms);

/**
 * One account and one stock, on a chain whose balances the test sets. Trades
 * go through `settleOrder`, and a pass makes the same three calls position-sync
 * makes, so these are the books as production keeps them.
 */
const books = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:books" }).returning();
  const [instrument] = await db
    .insert(instruments)
    .values({ ticker: "NVDA", name: "Nvidia", sector: "Technology" })
    .returning();
  const [token] = await db
    .insert(tokens)
    .values({ instrumentId: instrument!.id, mint: NVDAX, symbol: "NVDAx", issuer: "backed", decimals: 8 })
    .returning();
  const userId = user!.id;
  const instrumentId = instrument!.id;
  const tokenId = token!.id;

  const state = { wallet: 0n, pledged: 0n, multiplier: D(1) };

  const chain: ChainReader = {
    mintConfig: async () => null,
    tokenBalances: async () =>
      state.wallet === 0n ? [] : [{ mint: NVDAX, rawAmount: state.wallet, decimals: 8 }],
  };
  const lending = {
    position: async () =>
      state.pledged === 0n
        ? null
        : {
            obligation: "Obligation",
            deposits: [
              {
                ticker: "NVDA",
                isStock: true,
                mint: NVDAX,
                raw: state.pledged,
                decimals: 8,
                tokens: ZERO,
                valueUsd: ZERO,
              },
            ],
            debtUsd: ZERO,
            owedUsdc: ZERO,
            debtBfAdjustedUsd: ZERO,
            allowedBorrowUsd: ZERO,
            liquidationBorrowUsd: ZERO,
          },
  } as unknown as LendingSource;
  const deps: ReconcileDeps = {
    chain: withPledged(chain, lending),
    prices: { pricesFor: async () => new Map() } as unknown as ReconcileDeps["prices"],
    multipliers: {
      multipliersFor: async () => new Map([[NVDAX, state.multiplier]]),
    } as unknown as ReconcileDeps["multipliers"],
  };

  const fillOf = (raw: bigint, usd: number, at: Date): Fill => {
    const tokensHeld = D(raw.toString()).div(D(ONE.toString()));
    const shares = tokensHeld.mul(state.multiplier);
    return {
      kind: "filled",
      tokensRaw: raw,
      tokens: tokensHeld,
      shares,
      usd: D(usd),
      feeUsd: ZERO,
      pricePerShare: D(usd).div(shares),
      occurredAt: at,
    };
  };

  /** An order, executing, and the settle that would land it. */
  const order = async (
    side: "buy" | "sell",
    raw: bigint,
    usd: number,
    opts: { createdAt?: Date; at?: Date } = {},
  ) => {
    const [row] = await db
      .insert(orders)
      .values({
        userId,
        instrumentId,
        side,
        usdAmount: String(usd),
        decision: { kind: "execute" },
        chosenTokenId: tokenId,
        status: "executing",
        ...(opts.createdAt === undefined ? {} : { createdAt: opts.createdAt }),
      })
      .returning();
    const fill = fillOf(raw, usd, opts.at ?? ago(60 * MINUTE));
    return {
      settle: () =>
        settleOrder(db, {
          userId,
          orderId: row!.id,
          signature: `sig-${row!.id}`,
          side,
          ticker: "NVDA",
          mint: NVDAX,
          tokenId,
          instrumentId,
          fill,
          referencePricePerShare: null,
        }),
    };
  };

  const buy = async (raw: bigint, usd: number) => {
    await (await order("buy", raw, usd)).settle();
    state.wallet += raw;
  };
  const sell = async (raw: bigint, usd: number) => {
    await (await order("sell", raw, usd)).settle();
    state.wallet -= raw;
  };
  const pass = async (now = new Date()) => {
    const held = await loadHeldTokens(db, deps, userId, WALLET, now);
    await applyReconciliation(db, userId, planReconciliation(held, now));
  };
  const position = async () => {
    const [row] = await db.select().from(positions).where(eq(positions.userId, userId));
    return row!;
  };
  const disposalKinds = async () =>
    (await db.select({ kind: disposals.kind }).from(disposals).orderBy(disposals.recordedAt)).map(
      (d) => d.kind,
    );

  return { db, state, order, buy, sell, pass, position, disposalKinds };
};

const usdOf = (v: string): string => D(v).toFixed(2);
const sharesOf = (v: string): string => D(v).toFixed();

describe("the books, end to end", () => {
  it("cost two shares at the $300 they cost, after a sell and another buy", async () => {
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();
    await b.sell(ONE, 150);
    await b.pass();
    await b.buy(ONE, 200);
    await b.pass();

    const p = await b.position();
    expect(sharesOf(p.sharesWithBasis)).toBe("2");
    expect(usdOf(p.costBasisUsd)).toBe("300.00");
    expect(usdOf(p.avgUnitCostUsd)).toBe("150.00");
  });

  it("start fresh after selling everything and buying again", async () => {
    const b = await books();
    await b.buy(ONE, 100);
    await b.pass();
    await b.sell(ONE, 120);
    await b.pass();
    await b.buy(ONE, 200);
    await b.pass();
    expect(usdOf((await b.position()).costBasisUsd)).toBe("200.00");
  });

  it("record a transfer out, and cost the next buy apart from it", async () => {
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();
    b.state.wallet -= ONE; // sent from another app
    await b.pass();
    expect(await b.disposalKinds()).toEqual(["transfer_out"]);

    await b.buy(ONE, 200);
    await b.pass();
    expect(usdOf((await b.position()).costBasisUsd)).toBe("300.00");
  });

  it("do not count a sell twice while it is in flight", async () => {
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();

    const now = new Date();
    const inFlight = await b.order("sell", ONE, 150, { at: now });
    b.state.wallet -= ONE; // landed, not yet confirmed
    await b.pass(now);
    expect(await b.disposalKinds()).toEqual([]);

    await inFlight.settle();
    await b.pass(now); // settled moments ago: still left alone
    await b.pass(new Date(now.getTime() + 3 * MINUTE));

    expect(await b.disposalKinds()).toEqual(["sell"]);
    expect(usdOf((await b.position()).costBasisUsd)).toBe("100.00");
  });

  it("take back the transfer out a late confirm turns out to have been", async () => {
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();

    const abandoned = await b.order("sell", ONE, 150, { createdAt: ago(20 * MINUTE) });
    b.state.wallet -= ONE;
    await b.pass();
    expect(await b.disposalKinds()).toEqual(["transfer_out"]);

    await abandoned.settle();
    await b.pass();
    expect(await b.disposalKinds()).toEqual(["sell"]);
    expect(usdOf((await b.position()).costBasisUsd)).toBe("100.00");
  });

  it("do not read pledging to Kamino as a transfer out", async () => {
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();
    b.state.wallet = 0n;
    b.state.pledged = 2n * ONE;
    await b.pass();

    expect(await b.disposalKinds()).toEqual([]);
    const p = await b.position();
    expect(sharesOf(p.sharesWithBasis)).toBe("2");
    expect(usdOf(p.costBasisUsd)).toBe("200.00");
  });

  it("credit a dividend after a partial sell on the shares still held", async () => {
    const b = await books();
    await b.buy(2n * ONE, 200);
    await b.pass();
    await b.sell(ONE, 150);
    await b.pass();
    b.state.multiplier = D("1.5");
    await b.pass();

    const dividends = await b.db.select().from(lots).where(eq(lots.source, "dividend"));
    expect(dividends.map((l) => sharesOf(l.shares))).toEqual(["0.5"]);
    const p = await b.position();
    expect(sharesOf(p.sharesWithBasis)).toBe("1.5");
    expect(usdOf(p.costBasisUsd)).toBe("100.00");
  });
});
```

Run: `pnpm --filter @mercury/api exec vitest run src/portfolio/books.test.ts`
Expected: FAIL. The "$300" test reports `266.67`, the transfer-out test finds no disposals, and the dividend test credits `1` share.

- [ ] **Step 4: Load, replay and write in `apply.ts`**

In `services/api/src/portfolio/apply.ts`, replace the imports with:

```ts
import { and, eq, gt, or, sql } from "drizzle-orm";
import { D, EMPTY_OPEN, replayPosition, type Decimal } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import type { MultiplierSource, PriceBoard } from "@mercury/market";
import type { Db } from "../db/client.js";
import { activities, disposals, instruments, lots, orders, positions, tokens } from "../db/schema.js";
import { movementsByToken } from "./open.js";
import { planReconciliation, type HeldToken, type Reconciliation } from "./reconcile.js";
```

Above `loadHeldTokens`, add:

```ts
/**
 * How long an executing sell holds its stock still. Long enough for a person
 * to sign and the network to land it. Past it, an order nobody confirmed is
 * taken as abandoned, and a drop in the chain is read as a transfer; a confirm
 * that does arrive later takes that transfer back (`settleOrder`).
 */
const EXECUTING_WINDOW_MS = 10 * 60_000;

/** How long after a sell settles before the finalized balance has caught up with it. */
const SETTLED_WINDOW_MS = 2 * 60_000;
```

Change `loadHeldTokens`'s signature to take the clock, and replace its body up to and including the `return relevant.map(...)` with:

```ts
export async function loadHeldTokens(
  db: Db,
  deps: ReconcileDeps,
  userId: string,
  walletAddress: string,
  now: Date = new Date(),
): Promise<readonly HeldToken[]> {
  const [balances, known, lotRows, disposalRows, settlingRows] = await Promise.all([
    // Finalized: this writes lots, and a dropped block would leave a purchase
    // that never happened.
    deps.chain.tokenBalances(walletAddress, "finalized"),
    db
      .select({
        tokenId: tokens.id,
        instrumentId: tokens.instrumentId,
        mint: tokens.mint,
        symbol: tokens.symbol,
        decimals: tokens.decimals,
        ticker: instruments.ticker,
        storedMultiplier: tokens.multiplier,
      })
      .from(tokens)
      .innerJoin(instruments, eq(instruments.id, tokens.instrumentId)),
    // Every lot and every disposal the user has, to be replayed. A token they
    // have emptied still needs a pass, or its position would stay stale at
    // what it used to be.
    db
      .select({
        id: lots.id,
        tokenId: lots.tokenId,
        tokenQty: lots.tokenQty,
        shares: lots.shares,
        unitCostUsd: lots.unitCostUsd,
        referencePriceUsd: lots.referencePriceUsd,
        feeUsd: lots.feeUsd,
        acquiredAt: lots.acquiredAt,
        // Microseconds, read by the database: a Date would drop them, and a
        // lot and a disposal can be recorded in the same millisecond.
        recordedAtUs: sql<number>`(extract(epoch from ${lots.recordedAt}) * 1000000)::bigint`.mapWith(Number),
        isEstimated: lots.isEstimated,
      })
      .from(lots)
      .where(eq(lots.userId, userId)),
    db
      .select({
        id: disposals.id,
        tokenId: disposals.tokenId,
        tokenQty: disposals.tokenQty,
        recordedAtUs: sql<number>`(extract(epoch from ${disposals.recordedAt}) * 1000000)::bigint`.mapWith(
          Number,
        ),
      })
      .from(disposals)
      .where(eq(disposals.userId, userId)),
    // Stocks with a sell in flight. See `HeldToken.settling`.
    db
      .selectDistinct({ instrumentId: orders.instrumentId })
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          eq(orders.side, "sell"),
          or(
            and(
              eq(orders.status, "executing"),
              gt(orders.createdAt, new Date(now.getTime() - EXECUTING_WINDOW_MS)),
            ),
            and(
              eq(orders.status, "filled"),
              gt(orders.filledAt, new Date(now.getTime() - SETTLED_WINDOW_MS)),
            ),
          ),
        ),
      ),
  ]);

  const onChain = new Map(balances.map((b) => [b.mint, b.rawAmount]));
  const open = new Map(
    [...movementsByToken(lotRows, disposalRows)].map(([tokenId, moves]) => [tokenId, replayPosition(moves)]),
  );
  const settling = new Set(settlingRows.map((r) => r.instrumentId));
  const relevant = known.filter((t) => onChain.has(t.mint) || open.has(t.tokenId));
  if (relevant.length === 0) return [];

  const mints = relevant.map((t) => t.mint);
  // Both reads at once, and each as one ask for every mint. This used to fetch
  // the board and then walk the tokens asking the mint about them one at a
  // time, which `position-sync` paid for once per wallet every two seconds.
  const [board, multipliers] = await Promise.all([
    deps.prices.pricesFor(mints),
    deps.multipliers.multipliersFor(mints),
  ]);

  return relevant.map((token) => {
    const held = open.get(token.tokenId) ?? EMPTY_OPEN;
    const price = board.get(token.mint);
    // The mint is the authority on the multiplier; the price board is the
    // fallback; the stored value is what we last saw. Never 1 by default —
    // that would shrink the shares of every holder of a paying token.
    const multiplier = multipliers.get(token.mint) ?? price?.multiplier ?? D(token.storedMultiplier);

    return {
      tokenId: token.tokenId,
      instrumentId: token.instrumentId,
      mint: token.mint,
      symbol: token.symbol,
      ticker: token.ticker,
      decimals: token.decimals,
      multiplier,
      referencePricePerShare: price?.pricePerShare ?? null,
      chainRawAmount: onChain.get(token.mint) ?? 0n,
      recordedRawAmount: held.tokenQty,
      recordedShares: held.shares,
      recordedCostUsd: held.costUsd,
      recordedReferenceUsd: held.referenceUsd,
      recordedFeeUsd: held.feeUsd,
      settling: settling.has(token.instrumentId),
    } satisfies HeldToken;
  });
}
```

In `applyReconciliation`, change the early return and add the disposals insert directly after the lots insert block:

```ts
if (plan.lots.length === 0 && plan.disposals.length === 0 && plan.positions.length === 0) return;
```

```ts
if (plan.disposals.length > 0) {
  await tx.insert(disposals).values(
    plan.disposals.map((d) => ({
      userId,
      tokenId: d.tokenId,
      instrumentId: d.instrumentId,
      tokenQty: d.tokenQty,
      shares: fixed(d.shares),
      kind: d.kind,
      occurredAt: d.occurredAt,
    })),
  );
}
```

- [ ] **Step 5: Count disposals in the sync summary**

In `services/api/src/portfolio/sync.ts`, change the `written` line and its doc comment:

```ts
  /** Lots, disposals and activity rows written. Zero on a pass that found nothing new. */
  readonly written: number;
```

```ts
written += plan.lots.length + plan.disposals.length + plan.activity.length;
```

- [ ] **Step 6: Run everything this touches**

Run: `pnpm --filter @mercury/api exec vitest run src/portfolio src/orders src/db src/lending`
Expected: PASS, including `books.test.ts` (7), `open.test.ts` (5), `reconcile.test.ts`, `settle.test.ts`, `sync.test.ts`, `disposal-backfill.test.ts`.

Run: `pnpm --filter @mercury/api typecheck`
Expected: no errors.

- [ ] **Step 7: Commit Tasks 4 and 5 together**

```bash
git add services/api/src/portfolio/reconcile.ts services/api/src/portfolio/reconcile.test.ts services/api/src/portfolio/open.ts services/api/src/portfolio/open.test.ts services/api/src/portfolio/apply.ts services/api/src/portfolio/sync.ts services/api/src/portfolio/books.test.ts
git commit -F - <<'EOF'
fix(api): cost follows the shares out

A position was every lot ever written, scaled down to what the chain holds.
That is average cost until a sell is followed by another buy, and then it is
wrong: buy 2 at $100, sell 1, buy 1 at $200, and two shares that cost $300
read as $266.67. Sell everything and buy again, and the new cost was mixed
with the old.

position-sync now replays each token's lots and disposals in the order they
were recorded, and reconciles against what is still open. A drop in the chain
that no sell explains is recorded as a transfer out, so its cost leaves with
it. While a sell of a stock is executing or has just settled, that stock sits
the pass out: the finalized balance lags the confirmed one the sell settled
against, and reading the gap as a transfer would remove the shares twice. A
dividend is credited only on tokens still held.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Check everything, and open the PR

**Files:** none new.

- [ ] **Step 1: Run the whole check**

Run: `pnpm check`
Expected: lint, format, typecheck and every test pass. If `format:check` fails, run `pnpm format` on the files this branch changed only (`git diff --name-only main`), and commit that as `style: prettier`.

If the API suite times out in files this branch did not touch, check the load average first (another worktree's tests can saturate the machine) and re-run those files alone with `--testTimeout=60000` before treating it as a failure.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/cost-follows-shares
gh pr create --base main --head feat/cost-follows-shares --title "Cost follows the shares out" --body-file - <<'EOF'
## What

A position's cost is now right after any sell or transfer out. It was every lot ever written scaled down to the chain, which is average cost only until a sell is followed by another buy: buy 2 at $100, sell 1, buy 1 at $200, and two shares that cost $300 read as $266.67. Sell everything and buy again, and the new cost mixed with the old.

Part A of [the import stocks design](docs/superpowers/specs/2026-10-18-import-stocks-design.md). An import is an acquisition, so it would inherit the error; this ships first and stands on its own.

- **`disposal`**, a new table: the tokens that left, by a `sell` or a `transfer_out`. `lot` gains `recorded_at`, the moment it entered Mercury, which positions are replayed in order of.
- **Sells** write their disposal in `settleOrder`'s transaction, keyed by the order. A transfer out recorded since the order began is taken back: it was this sell, seen before the client confirmed it.
- **Transfers out** are recorded by position-sync, for any drop in the chain that no sell explains. Pledged shares still count as held, so pledging is not a transfer.
- **A sell in flight** (executing within 10 minutes, or settled within 2) holds its stock still for the pass, because the finalized balance lags the confirmed one.
- **`replayPosition`** in `@mercury/core` works a position out from both halves, at average cost, counting the fraction that leaves in tokens. Dividends are credited only on tokens still held.

## Deploy

- Migrations `0025_disposal` (a table, a column with a default) and `0026_disposal_backfill` (data) run at boot. The backfill sets `recorded_at` on past lots and writes a `sell` disposal for every filled sell from its stored decision; sells are exact-in, so the decision's `filledShares` is what left. It is idempotent on the order id.
- The first position-sync after deploy records any gap still left per token as one `transfer_out`, dated then. History before deploy is approximate in that one respect.
- No client change. Positions read the same columns.

## Testing

- `replayPosition`: the $300 case, emptying and rebuying, reference and fee scaling, dividends, clamping, held-since, estimated, and a hand-worked table.
- End to end through `settleOrder` and the same calls position-sync makes: the $300 case, sell all and rebuy, a transfer out then a buy, a sell in flight not counted twice, a late confirm taking its transfer back, pledging, and a dividend after a partial sell.
- The backfill against seeded orders, run twice.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

- [ ] **Step 3: Bind the PR**

Call `mcp__ccd_pr__get_status`; if it does not report this PR, call `mcp__ccd_pr__bind_pr` with its URL. Then read its CI and offer Auto-fix. Do not poll CI.
