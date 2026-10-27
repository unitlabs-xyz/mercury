# Notifications Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the web app's bell a real inbox: money arriving, dividends and loan warnings, each read or unread, with an unread count on the bell and "Mark all as read".

**Architecture:** A `notification` table where each row points at one `activity` row and records whether it has been read. The three jobs that already write those activity rows (`wallet-events`, `position-sync`'s apply step, the loan watcher) add the notification in the same transaction. Four authenticated routes read and mark them; none read the chain. The web bell polls the unread count and fetches the list when opened.

**Tech Stack:** Hono, Drizzle (Postgres; PGlite in tests), Vitest, React with TanStack Query, react-router.

**Spec:** [docs/superpowers/specs/2026-10-27-notifications-inbox-design.md](../specs/2026-10-27-notifications-inbox-design.md)

## Global Constraints

- Web only. No toasts, push, email changes, mobile, preferences or grouping.
- Three kinds only: `money_in` (activity `transfer_in`), `dividend` (activity `dividend`), `loan_alert` (activity `loan_alert`).
- A notification's words come from its activity row at read time, never copied into the notification.
- One notification per activity row: unique index on `activity_id`, inserts use `onConflictDoNothing`.
- The notification is written in the same transaction as its activity row.
- `money_in` only for a `transfer_in` whose `occurredAt` is under **24 hours** old at the time of the pass.
- History: **90 days** kept, newest **50** listed. The unread count is also limited to 90 days.
- Reading an item is idempotent and keeps its first `readAt`.
- "Mark all as read" takes `upTo` (the `createdAt` of the newest item shown) and marks only items at or before it.
- Badge: hidden at zero, `9+` above nine. Polled every 30 seconds using `LIVE` from `apps/web/src/api/live.ts`.
- Click: `money_in` and `dividend` open `?event=<activityId>`; `loan_alert` goes to `/portfolio`.
- Empty state copy: "Nothing yet. Money arriving, dividends and loan warnings will show up here."
- Migration file is `0029_notifications.sql`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File map

| File                                                      | Responsibility                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `services/api/src/db/schema.ts`                           | Add the `notifications` table                                            |
| `services/api/drizzle/0029_notifications.sql` (+ `meta/`) | Generated migration                                                      |
| `services/api/src/notify/inbox.ts`                        | The write side: `notifyFor`, the one helper every writer calls           |
| `services/api/src/notify/inbox.test.ts`                   | Its tests                                                                |
| `services/api/src/wallet-events/sync.ts`                  | Notify fresh `transfer_in` rows                                          |
| `services/api/src/portfolio/apply.ts`                     | Notify dividend rows                                                     |
| `services/api/src/lending/watch-loans.ts`                 | Notify `loan_alert` rows                                                 |
| `services/api/src/notify/inbox-queries.ts`                | The read side: list, count, mark, prune                                  |
| `services/api/src/notify/inbox-queries.test.ts`           | Its tests                                                                |
| `services/api/src/routes/notifications.ts`                | The four routes                                                          |
| `services/api/src/routes/notifications.test.ts`           | Their tests                                                              |
| `services/api/src/routes/activity.ts`                     | Export `activityWire` so both routes serialize a row the same way        |
| `services/api/src/deps.ts`, `src/app.ts`, `src/index.ts`  | Wiring, and the daily prune job                                          |
| `apps/web/src/api/notifications.ts`                       | Queries, mutations, and the pure helpers `badgeText` and `destinationOf` |
| `apps/web/src/api/notifications.test.ts`                  | Tests for the pure helpers                                               |
| `apps/web/src/app/HeaderChrome.tsx`                       | The bell's badge and the panel                                           |

Run API tests from `services/api` with `pnpm vitest run <path>`; web tests from `apps/web` the same way.

---

### Task 1: The table and the write helper

**Files:**

- Modify: `services/api/src/db/schema.ts` (after `loanAlerts`, around line 744)
- Create: `services/api/drizzle/0029_notifications.sql` (generated)
- Create: `services/api/src/notify/inbox.ts`
- Test: `services/api/src/notify/inbox.test.ts`

**Interfaces:**

- Produces:
  - `notifications` table export and `type Notification` from `db/schema.ts`
  - `type NoticeKind = "money_in" | "dividend" | "loan_alert"`
  - `interface Noticed { readonly activityId: string; readonly kind: NoticeKind }`
  - `type Writer = Db | Tx` where `Tx` is the argument `db.transaction` passes its callback
  - `notifyFor(db: Writer, userId: string, rows: readonly Noticed[]): Promise<number>` returns how many were new

- [ ] **Step 1: Add the table to the schema**

In `services/api/src/db/schema.ts`, after the `export type LoanAlert = ...` line, add:

```ts
/**
 * Something worth telling, and whether it has been read.
 *
 * Every notification points at an `activity` row and carries none of its
 * words: the title and subtitle are read from the row when the inbox is read,
 * so a deposit `funding/enrich.ts` names a pass later ("From Tron · USDT")
 * shows the better wording without anything being copied twice.
 *
 * The unique index on `activity_id` is the idempotency guarantee, the same job
 * `activity_signature_mint_idx` does for `activity`: a pass that runs twice
 * writes one notification.
 */
export const notifications = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["money_in", "dividend", "loan_alert"] }).notNull(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Null while unread. Set once: reading it again keeps the first time. */
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [
    index("notification_user_created_idx").on(t.userId, t.createdAt, t.id),
    /* The badge. Partial, so it stays as small as the unread set. */
    index("notification_unread_idx")
      .on(t.userId)
      .where(sql`${t.readAt} is null`),
    uniqueIndex("notification_activity_idx").on(t.activityId),
  ],
);
export type Notification = typeof notifications.$inferSelect;
```

Check that `sql` is imported from `drizzle-orm` at the top of `schema.ts`; add it to the existing import if not.

- [ ] **Step 2: Generate the migration**

Run from `services/api`:

```bash
pnpm drizzle-kit generate --name notifications
```

Expected: `drizzle/0029_notifications.sql` created, containing `CREATE TABLE "notification"`, the two foreign keys, the two indexes (one with `WHERE "notification"."read_at" is null`) and the unique index. `drizzle/meta/_journal.json` gains an entry with `"tag": "0029_notifications"`. If the file has a different number or name, stop: someone has added a migration since this plan was written.

- [ ] **Step 3: Write the failing test**

Create `services/api/src/notify/inbox.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../db/testing.js";
import { activities, notifications, users } from "../db/schema.js";
import { notifyFor } from "./inbox.js";

const seed = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:inbox" }).returning();
  const [row] = await db
    .insert(activities)
    .values({ userId: user!.id, kind: "transfer_in", title: "Added cash", mint: null })
    .returning();
  return { db, userId: user!.id, activityId: row!.id };
};

describe("notifyFor", () => {
  it("writes one unread notification for an activity row", async () => {
    const { db, userId, activityId } = await seed();
    const written = await notifyFor(db, userId, [{ activityId, kind: "money_in" }]);

    expect(written).toBe(1);
    const rows = await db.select().from(notifications).where(eq(notifications.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("money_in");
    expect(rows[0]!.activityId).toBe(activityId);
    expect(rows[0]!.readAt).toBeNull();
  });

  /* The unique index doing its job: a pass that runs twice tells once. */
  it("writes nothing the second time for the same activity row", async () => {
    const { db, userId, activityId } = await seed();
    await notifyFor(db, userId, [{ activityId, kind: "money_in" }]);
    const again = await notifyFor(db, userId, [{ activityId, kind: "money_in" }]);

    expect(again).toBe(0);
    expect(await db.select().from(notifications)).toHaveLength(1);
  });

  it("does nothing with nothing to tell", async () => {
    const { db, userId } = await seed();
    expect(await notifyFor(db, userId, [])).toBe(0);
  });

  it("goes when its activity row goes", async () => {
    const { db, userId, activityId } = await seed();
    await notifyFor(db, userId, [{ activityId, kind: "money_in" }]);
    await db.delete(activities).where(eq(activities.id, activityId));
    expect(await db.select().from(notifications)).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `pnpm vitest run src/notify/inbox.test.ts`
Expected: FAIL, cannot resolve `./inbox.js`.

- [ ] **Step 5: Write the helper**

Create `services/api/src/notify/inbox.ts`:

```ts
import type { Db } from "../db/client.js";
import { notifications } from "../db/schema.js";

/**
 * The write side of the inbox: one helper every writer calls, so none of them
 * knows the table's shape.
 *
 * Called inside the writer's own transaction, with the ids its activity insert
 * returned. A notification never exists without its activity row, and an
 * activity row worth telling never commits without its notification.
 */
export type NoticeKind = "money_in" | "dividend" | "loan_alert";

export interface Noticed {
  readonly activityId: string;
  readonly kind: NoticeKind;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Writer = Db | Tx;

/** How many were new. A repeat is absorbed by the unique index on `activity_id`. */
export async function notifyFor(db: Writer, userId: string, rows: readonly Noticed[]): Promise<number> {
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(notifications)
    .values(rows.map((r) => ({ userId, kind: r.kind, activityId: r.activityId })))
    .onConflictDoNothing({ target: notifications.activityId })
    .returning({ id: notifications.id });
  return inserted.length;
}
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm vitest run src/notify/inbox.test.ts src/db/migrate.test.ts && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts drizzle/0029_notifications.sql drizzle/meta src/notify/inbox.ts src/notify/inbox.test.ts
git commit -m "feat(api): a notification table, one row per activity row worth telling

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Money in, from `wallet-events`

**Files:**

- Modify: `services/api/src/wallet-events/sync.ts` (`WalletEventsDeps` around line 20; `syncWallet` around lines 186 and 205-220)
- Test: `services/api/src/wallet-events/sync.test.ts`

**Interfaces:**

- Consumes: `notifyFor`, `Noticed` from `../notify/inbox.js` (Task 1)
- Produces: `WalletEventsDeps.now?: () => Date`, used only by tests

- [ ] **Step 1: Write the failing tests**

In `services/api/src/wallet-events/sync.test.ts`, add `notifications` to the schema import:

```ts
import { activities, notifications, users, walletStreams, wallets } from "../db/schema.js";
```

Then add inside `describe("syncAllWalletEvents", ...)`:

```ts
describe("the inbox", () => {
  /** Both streams behind the deposit, as in "writes a deposit once". */
  const behind = async () => {
    const { db, userId } = await seed();
    const [wallet] = await db.select().from(wallets).where(eq(wallets.address, WALLET));
    await db.insert(walletStreams).values([
      { walletId: wallet!.id, address: WALLET, cursor: "older" },
      { walletId: wallet!.id, address: USDC_ACCOUNT, cursor: "older" },
    ]);
    const history: ChainHistory = {
      tokenAccountsFor: () => Promise.resolve([USDC_ACCOUNT]),
      signatures: (address) => Promise.resolve(address === USDC_ACCOUNT ? [ref] : []),
      transaction: () => Promise.resolve(deposit),
    };
    return { db, userId, history };
  };
  const landed = new Date(1_790_573_221 * 1000);
  const after = (ms: number) => () => new Date(landed.getTime() + ms);

  it("tells the owner about money that just arrived, once", async () => {
    const { db, userId, history } = await behind();
    await syncAllWalletEvents(db, { history, lendingProgram: KAMINO, now: after(60_000) });

    const told = await db.select().from(notifications).where(eq(notifications.userId, userId));
    const [row] = await db.select().from(activities).where(eq(activities.userId, userId));
    expect(told).toHaveLength(1);
    expect(told[0]!.kind).toBe("money_in");
    expect(told[0]!.activityId).toBe(row!.id);

    await db.update(walletStreams).set({ cursor: "older" });
    await syncAllWalletEvents(db, { history, lendingProgram: KAMINO, now: after(90_000) });
    expect(await db.select().from(notifications)).toHaveLength(1);
  });

  /* A backfilled stream brings old history, and old history is not news. */
  it("records but does not tell about money that arrived more than a day ago", async () => {
    const { db, history } = await behind();
    await syncAllWalletEvents(db, { history, lendingProgram: KAMINO, now: after(25 * 60 * 60_000) });

    expect(await db.select().from(activities)).toHaveLength(1);
    expect(await db.select().from(notifications)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run src/wallet-events/sync.test.ts`
Expected: the two new tests FAIL (TypeScript complains about `now`, or no notification is found). The existing tests still pass.

- [ ] **Step 3: Implement**

In `services/api/src/wallet-events/sync.ts`:

1. Add the import after the other local imports:

```ts
import { notifyFor } from "../notify/inbox.js";
```

2. Add to `WalletEventsDeps`, after `fundingDeposits`:

```ts
  /** The clock, for tests. A pass's "now" decides which money is news. */
  readonly now?: () => Date;
```

3. Below `const LOOKUP_EVERY_MS = ...`, add:

```ts
/**
 * How old a movement can be and still be news. A known wallet's new token
 * stream is backfilled (see `shouldBackfill`), and its history is recorded but
 * not announced: a deposit from last month is not something that just happened.
 */
const NEWS_WITHIN_MS = 24 * 60 * 60_000;
```

4. In `syncWallet`, change `const now = new Date();` to:

```ts
const now = deps.now?.() ?? new Date();
```

5. In the transaction, replace the activity insert's `.returning({ id: activities.id });` and the `written = inserted.length;` line after it with:

```ts
        .returning({ id: activities.id, kind: activities.kind, occurredAt: activities.occurredAt });
      written = inserted.length;

      await notifyFor(
        tx,
        userId,
        inserted
          .filter((r) => r.kind === "transfer_in" && now.getTime() - r.occurredAt.getTime() < NEWS_WITHIN_MS)
          .map((r) => ({ activityId: r.id, kind: "money_in" as const })),
      );
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/wallet-events/sync.test.ts && pnpm typecheck`
Expected: PASS, every test in the file.

- [ ] **Step 5: Commit**

```bash
git add src/wallet-events/sync.ts src/wallet-events/sync.test.ts
git commit -m "feat(api): money that just arrived goes in the inbox

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Dividends, from `position-sync`

**Files:**

- Modify: `services/api/src/portfolio/apply.ts` (the `plan.activity` insert, around line 226)
- Test: `services/api/src/portfolio/apply-notify.test.ts` (create)

**Interfaces:**

- Consumes: `notifyFor` from `../notify/inbox.js` (Task 1); `applyReconciliation(db, userId, plan: Reconciliation)` from `./apply.js`; `Reconciliation` from `./reconcile.js`

- [ ] **Step 1: Write the failing test**

Create `services/api/src/portfolio/apply-notify.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { testDb } from "../db/testing.js";
import { activities, instruments, notifications, tokens, users } from "../db/schema.js";
import { applyReconciliation } from "./apply.js";
import type { Reconciliation } from "./reconcile.js";

const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const NOW = new Date("2026-10-27T12:00:00.000Z");

const seed = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:div" }).returning();
  const [instrument] = await db
    .insert(instruments)
    .values({ ticker: "NVDA", name: "Nvidia", sector: "Technology" })
    .returning();
  const [token] = await db
    .insert(tokens)
    .values({ instrumentId: instrument!.id, mint: NVDAX, symbol: "NVDAx", issuer: "backed", decimals: 8 })
    .returning();
  return { db, userId: user!.id, instrumentId: instrument!.id, tokenId: token!.id };
};

/** A pass that found a dividend: one free lot, and the feed row that says so. */
const dividendPlan = (tokenId: string, instrumentId: string): Reconciliation => ({
  lots: [
    {
      tokenId,
      instrumentId,
      tokenQty: 0n,
      shares: D("0.004"),
      unitCostUsd: D(0),
      source: "dividend",
      isEstimated: false,
      acquiredAt: NOW,
    },
  ],
  activity: [
    {
      kind: "dividend",
      title: "NVDA dividend",
      subtitle: "Paid as 0.004 shares",
      amountUsd: D("0.72"),
      refTable: "token",
      refId: tokenId,
      occurredAt: NOW,
    },
  ],
  disposals: [],
  retracted: [],
  positions: [],
});

describe("applyReconciliation and the inbox", () => {
  it("tells the holder about a dividend", async () => {
    const { db, userId, tokenId, instrumentId } = await seed();
    await applyReconciliation(db, userId, dividendPlan(tokenId, instrumentId));

    const [row] = await db.select().from(activities);
    const told = await db.select().from(notifications);
    expect(told).toHaveLength(1);
    expect(told[0]!.kind).toBe("dividend");
    expect(told[0]!.activityId).toBe(row!.id);
    expect(told[0]!.userId).toBe(userId);
  });
});
```

If `LotWrite` in `reconcile.ts` has fields this literal does not, TypeScript will name them; copy their values from the `lots.push({...})` call in `planReconciliation` (around line 268 of `reconcile.ts`).

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/portfolio/apply-notify.test.ts`
Expected: FAIL, `expected [] to have a length of 1`.

- [ ] **Step 3: Implement**

In `services/api/src/portfolio/apply.ts`, add the import:

```ts
import { notifyFor } from "../notify/inbox.js";
```

Replace the `plan.activity` block:

```ts
if (plan.activity.length > 0) {
  const written = await tx
    .insert(activities)
    .values(
      plan.activity.map((a) => ({
        userId,
        kind: a.kind,
        occurredAt: a.occurredAt,
        title: a.title,
        subtitle: a.subtitle,
        amountUsd: a.amountUsd === null ? null : fixed(a.amountUsd),
        refTable: a.refTable,
        refId: a.refId,
      })),
    )
    .returning({ id: activities.id });
  // Every row a pass writes here is a dividend (`ActivityWrite.kind`), and a dividend is news.
  await notifyFor(
    tx,
    userId,
    written.map((r) => ({ activityId: r.id, kind: "dividend" as const })),
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/portfolio && pnpm typecheck`
Expected: PASS, including `books.test.ts` and `sync.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/portfolio/apply.ts src/portfolio/apply-notify.test.ts
git commit -m "feat(api): a dividend goes in the inbox

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Loan warnings, from the loan watcher

**Files:**

- Modify: `services/api/src/lending/watch-loans.ts` (the `loan_alert` insert, around lines 127-138)
- Test: `services/api/src/lending/watch-loans.test.ts`

**Interfaces:**

- Consumes: `notifyFor` from `../notify/inbox.js` (Task 1)

- [ ] **Step 1: Write the failing test**

In `services/api/src/lending/watch-loans.test.ts`, add `notifications` to the schema import:

```ts
import { activities, loanAlerts, notifications, users, wallets } from "../db/schema.js";
```

Add inside `describe("watchAllLoans", ...)`:

```ts
it("puts the warning in the inbox too, once", async () => {
  const { db, userId } = await seed();
  for (let i = 0; i < 3; i++) await watchAllLoans(db, deps("60", collect().notifier), NOW);

  const [row] = await db.select().from(activities).where(eq(activities.userId, userId));
  const told = await db.select().from(notifications).where(eq(notifications.userId, userId));
  expect(told).toHaveLength(1);
  expect(told[0]!.kind).toBe("loan_alert");
  expect(told[0]!.activityId).toBe(row!.id);
});

/* The in-app copy is the one we control: it is there even when the mail is not. */
it("puts it in the inbox when the mail did not get through", async () => {
  const { db } = await seed();
  await watchAllLoans(db, deps("60", collect(false).notifier), NOW);
  expect(await db.select().from(notifications)).toHaveLength(1);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run src/lending/watch-loans.test.ts`
Expected: the two new tests FAIL with zero notifications.

- [ ] **Step 3: Implement**

In `services/api/src/lending/watch-loans.ts`, add the import:

```ts
import { notifyFor } from "../notify/inbox.js";
```

Replace the activity insert (the `await db.insert(activities).values({ ... kind: "loan_alert" ... }).onConflictDoNothing();` statement) with:

```ts
await db.transaction(async (tx) => {
  const written = await tx
    .insert(activities)
    .values({
      userId: row.userId,
      kind: "loan_alert",
      occurredAt: now,
      title: alert.title,
      subtitle: alert.body,
      mint: null,
    })
    .onConflictDoNothing()
    .returning({ id: activities.id });
  await notifyFor(
    tx,
    row.userId,
    written.map((r) => ({ activityId: r.id, kind: "loan_alert" as const })),
  );
});
```

Keep the comment above it ("The feed row is written whether or not the mail lands...") and add one line to it: "Its notification goes with it, in the same transaction."

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lending/watch-loans.test.ts && pnpm typecheck`
Expected: PASS, every test in the file.

- [ ] **Step 5: Commit**

```bash
git add src/lending/watch-loans.ts src/lending/watch-loans.test.ts
git commit -m "feat(api): a loan warning goes in the inbox as well as the mail

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The read side, and the daily prune

**Files:**

- Create: `services/api/src/notify/inbox-queries.ts`
- Test: `services/api/src/notify/inbox-queries.test.ts`
- Modify: `services/api/src/index.ts` (add a job after `price-bar-prune`, around line 317)

**Interfaces:**

- Consumes: `notifications`, `activities`, `tokens`, `instruments` from `../db/schema.js`; `NoticeKind` from `./inbox.js`; `ActivityRow` from `../routes/activity.js`
- Produces:
  - `KEPT_MS = 90 * 24 * 60 * 60_000`, `LIST_LIMIT = 50`
  - `interface InboxItem { readonly id: string; readonly kind: NoticeKind; readonly createdAt: Date; readonly readAt: Date | null; readonly activity: ActivityRow }`
  - `readInbox(db: Db, userId: string, now: Date): Promise<{ items: readonly InboxItem[]; unread: number }>`
  - `countUnread(db: Db, userId: string, now: Date): Promise<number>`
  - `markRead(db: Db, userId: string, id: string, now: Date): Promise<boolean>` (false when not this user's)
  - `markAllRead(db: Db, userId: string, upTo: Date, now: Date): Promise<number>`
  - `pruneNotifications(db: Db, now: Date): Promise<number>`

- [ ] **Step 1: Write the failing tests**

Create `services/api/src/notify/inbox-queries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../db/testing.js";
import { activities, notifications, users } from "../db/schema.js";
import { countUnread, markAllRead, markRead, pruneNotifications, readInbox } from "./inbox-queries.js";

const NOW = new Date("2026-10-27T12:00:00.000Z");
const DAY = 24 * 60 * 60_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const seed = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:q" }).returning();
  const [other] = await db.insert(users).values({ privyUserId: "did:privy:other" }).returning();
  /** One activity row and its notification, created `age` ago. */
  const tell = async (userId: string, title: string, age: number) => {
    const [a] = await db
      .insert(activities)
      .values({
        userId,
        kind: "transfer_in",
        title,
        subtitle: "From Tron · USDT",
        amountUsd: "250",
        mint: null,
      })
      .returning();
    const [n] = await db
      .insert(notifications)
      .values({ userId, kind: "money_in", activityId: a!.id, createdAt: ago(age) })
      .returning();
    return n!;
  };
  return { db, userId: user!.id, otherId: other!.id, tell };
};

describe("readInbox", () => {
  it("lists newest first, with the activity's own words, and counts the unread", async () => {
    const { db, userId, tell } = await seed();
    await tell(userId, "Older", 2 * DAY);
    await tell(userId, "Newer", DAY);

    const { items, unread } = await readInbox(db, userId, NOW);
    expect(items.map((i) => i.activity.title)).toEqual(["Newer", "Older"]);
    expect(items[0]!.activity.subtitle).toBe("From Tron · USDT");
    expect(items[0]!.kind).toBe("money_in");
    expect(items[0]!.readAt).toBeNull();
    expect(unread).toBe(2);
  });

  it("shows only the caller's", async () => {
    const { db, userId, otherId, tell } = await seed();
    await tell(otherId, "Theirs", DAY);
    expect((await readInbox(db, userId, NOW)).items).toEqual([]);
  });

  it("stops at 90 days, in the list and in the count", async () => {
    const { db, userId, tell } = await seed();
    await tell(userId, "Old", 91 * DAY);
    const { items, unread } = await readInbox(db, userId, NOW);
    expect(items).toEqual([]);
    expect(unread).toBe(0);
    expect(await countUnread(db, userId, NOW)).toBe(0);
  });

  it("lists at most 50", async () => {
    const { db, userId, tell } = await seed();
    for (let i = 0; i < 55; i++) await tell(userId, `n${i}`, i * 60_000);
    const { items, unread } = await readInbox(db, userId, NOW);
    expect(items).toHaveLength(50);
    expect(unread).toBe(55);
  });
});

describe("markRead", () => {
  it("marks one read and keeps the first time on a second read", async () => {
    const { db, userId, tell } = await seed();
    const n = await tell(userId, "A", DAY);

    expect(await markRead(db, userId, n.id, NOW)).toBe(true);
    expect(await markRead(db, userId, n.id, new Date(NOW.getTime() + DAY))).toBe(true);

    const [row] = await db.select().from(notifications).where(eq(notifications.id, n.id));
    expect(row!.readAt).toEqual(NOW);
    expect(await countUnread(db, userId, NOW)).toBe(0);
  });

  it("refuses someone else's", async () => {
    const { db, userId, otherId, tell } = await seed();
    const theirs = await tell(otherId, "Theirs", DAY);
    expect(await markRead(db, userId, theirs.id, NOW)).toBe(false);
    expect(await countUnread(db, otherId, NOW)).toBe(1);
  });
});

describe("markAllRead", () => {
  /* Something that arrived after the panel was drawn was never seen. */
  it("marks only what was at or before upTo", async () => {
    const { db, userId, tell } = await seed();
    const shown = await tell(userId, "Shown", DAY);
    await tell(userId, "Arrived later", 60_000);

    expect(await markAllRead(db, userId, shown.createdAt, NOW)).toBe(1);
    const { items, unread } = await readInbox(db, userId, NOW);
    expect(unread).toBe(1);
    expect(items.find((i) => i.activity.title === "Arrived later")!.readAt).toBeNull();
  });
});

describe("pruneNotifications", () => {
  it("drops notifications past 90 days and keeps their activity rows", async () => {
    const { db, userId, tell } = await seed();
    await tell(userId, "Old", 91 * DAY);
    await tell(userId, "Recent", DAY);

    expect(await pruneNotifications(db, NOW)).toBe(1);
    expect(await db.select().from(notifications)).toHaveLength(1);
    expect(await db.select().from(activities)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run src/notify/inbox-queries.test.ts`
Expected: FAIL, cannot resolve `./inbox-queries.js`.

- [ ] **Step 3: Implement**

Create `services/api/src/notify/inbox-queries.ts`:

```ts
import { and, count, desc, eq, gt, isNull, lt, lte, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { activities, instruments, notifications, tokens } from "../db/schema.js";
import type { ActivityRow } from "../routes/activity.js";
import type { NoticeKind } from "./inbox.js";

/**
 * The read side of the inbox. None of it reads the chain: the badge is polled
 * from every open tab, and after 23 October nothing polled may cost RPC.
 */

/** How long a notification is kept. Activity is the full record; this is the news. */
export const KEPT_MS = 90 * 24 * 60 * 60_000;
export const LIST_LIMIT = 50;

export interface InboxItem {
  readonly id: string;
  readonly kind: NoticeKind;
  readonly createdAt: Date;
  readonly readAt: Date | null;
  readonly activity: ActivityRow;
}

const kept = (now: Date) => gt(notifications.createdAt, new Date(now.getTime() - KEPT_MS));

export async function countUnread(db: Db, userId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), kept(now)));
  return row?.n ?? 0;
}

/**
 * The newest fifty, each with its activity row's words as they are now, and
 * the logo the feed would show. The joins are the feed's own (see
 * `portfolio/activity-queries.ts`).
 */
export async function readInbox(
  db: Db,
  userId: string,
  now: Date,
): Promise<{ items: readonly InboxItem[]; unread: number }> {
  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      activity: {
        id: activities.id,
        kind: activities.kind,
        occurredAt: activities.occurredAt,
        title: activities.title,
        subtitle: activities.subtitle,
        amountUsd: activities.amountUsd,
        txSignature: activities.txSignature,
        mint: activities.mint,
        logoUrl: instruments.logoUrl,
      },
    })
    .from(notifications)
    .innerJoin(activities, eq(activities.id, notifications.activityId))
    .leftJoin(tokens, eq(tokens.mint, activities.mint))
    .leftJoin(instruments, eq(instruments.id, tokens.instrumentId))
    .where(and(eq(notifications.userId, userId), kept(now)))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(LIST_LIMIT);

  return { items: rows, unread: await countUnread(db, userId, now) };
}

/**
 * Read once, and the first time stands. False when there is no such
 * notification on this account, which is the same answer as someone else's.
 */
export async function markRead(db: Db, userId: string, id: string, now: Date): Promise<boolean> {
  const updated = await db
    .update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, ${now.toISOString()}::timestamptz)` })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });
  return updated.length === 1;
}

/** Everything up to the newest item the panel showed. Returns how many changed. */
export async function markAllRead(db: Db, userId: string, upTo: Date, now: Date): Promise<number> {
  const updated = await db
    .update(notifications)
    .set({ readAt: now })
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt), lte(notifications.createdAt, upTo)),
    )
    .returning({ id: notifications.id });
  return updated.length;
}

/** Past 90 days, deleted. The activity rows stay. */
export async function pruneNotifications(db: Db, now: Date): Promise<number> {
  const gone = await db
    .delete(notifications)
    .where(lt(notifications.createdAt, new Date(now.getTime() - KEPT_MS)))
    .returning({ id: notifications.id });
  return gone.length;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/notify && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Add the daily prune job**

In `services/api/src/index.ts`, import `pruneNotifications` from `./notify/inbox-queries.js` beside the other imports, and add after the `price-bar-prune` job:

```ts
/**
 * Once a day. A notification is news, and news past ninety days is history,
 * which Activity already keeps. Quiet when there was nothing to drop.
 */
every(
  "notification-prune",
  24 * 60 * 60 * 1000,
  async () => {
    const dropped = await pruneNotifications(auth.db, new Date());
    return dropped === 0 ? null : `${dropped} notifications past ninety days dropped`;
  },
  jobClock(150_000),
);
```

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/notify/inbox-queries.ts src/notify/inbox-queries.test.ts src/index.ts
git commit -m "feat(api): read, mark and prune the inbox

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The routes

**Files:**

- Modify: `services/api/src/routes/activity.ts` (export the serializer)
- Create: `services/api/src/routes/notifications.ts`
- Test: `services/api/src/routes/notifications.test.ts`
- Modify: `services/api/src/deps.ts` (`ReadDeps` around line 566; its construction around line 685)
- Modify: `services/api/src/app.ts` (after `activityRoutes`, around line 207)

**Interfaces:**

- Consumes: `readInbox`, `countUnread`, `markRead`, `markAllRead`, `InboxItem` (Task 5)
- Produces:
  - `activityWire(row: ActivityRow)` exported from `routes/activity.ts`
  - `interface NotificationDeps { list(userId: string): Promise<{ items: readonly InboxItem[]; unread: number }>; unread(userId: string): Promise<number>; read(userId: string, id: string): Promise<boolean>; readAll(userId: string, upTo: Date): Promise<number> }`
  - `notificationRoutes(deps: NotificationDeps): Hono`
  - Wire item: `{ id, kind, createdAt: string, readAt: string | null, activity: ReturnType<typeof activityWire> }`

- [ ] **Step 1: Export the activity serializer**

In `services/api/src/routes/activity.ts`, rename `const wire = (i: ActivityRow) => ({` to `export const activityWire = (i: ActivityRow) => ({`, and update its two uses in the same file (`items.map(wire)` → `items.map(activityWire)`, `wire(found.row)` → `activityWire(found.row)`).

Run: `pnpm vitest run src/routes/activity.test.ts`
Expected: PASS.

- [ ] **Step 2: Write the failing tests**

Create `services/api/src/routes/notifications.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { notificationRoutes, type NotificationDeps } from "./notifications.js";
import type { InboxItem } from "../notify/inbox-queries.js";

const ID = "6f1c9a52-6a1d-4b55-9d0e-1e2a3b4c5d6e";

const item: InboxItem = {
  id: ID,
  kind: "money_in",
  createdAt: new Date("2026-10-27T11:00:00Z"),
  readAt: null,
  activity: {
    id: "a1",
    kind: "transfer_in",
    occurredAt: new Date("2026-10-27T10:59:00Z"),
    title: "Added cash",
    subtitle: "From Tron · USDT",
    amountUsd: "250.000000000000000000",
    txSignature: "sig",
    mint: null,
    logoUrl: null,
  },
};

const stub = (over: Partial<NotificationDeps> = {}): NotificationDeps => ({
  list: async () => ({ items: [item], unread: 1 }),
  unread: async () => 1,
  read: async () => true,
  readAll: async () => 1,
  ...over,
});

const appWith = (d: NotificationDeps) => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: "WaLLeT" });
    await next();
  });
  app.route("/", notificationRoutes(d));
  return app;
};

const post = (body?: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

describe("GET /v1/notifications", () => {
  it("returns the items on the wire, and the unread count", async () => {
    const res = await appWith(stub()).request("/v1/notifications");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: { id: string; createdAt: string; readAt: string | null; activity: { title: string } }[];
      unread: number;
    };
    expect(body.unread).toBe(1);
    expect(body.items[0]!.createdAt).toBe("2026-10-27T11:00:00.000Z");
    expect(body.items[0]!.readAt).toBeNull();
    expect(body.items[0]!.activity.title).toBe("Added cash");
  });
});

describe("GET /v1/notifications/unread", () => {
  it("returns the count for the caller", async () => {
    let asked = "";
    const res = await appWith(stub({ unread: async (u) => ((asked = u), 7) })).request(
      "/v1/notifications/unread",
    );
    expect(await res.json()).toEqual({ unread: 7 });
    expect(asked).toBe("user-1");
  });
});

describe("POST /v1/notifications/:id/read", () => {
  it("answers 204 when it was the caller's", async () => {
    const res = await appWith(stub()).request(`/v1/notifications/${ID}/read`, post());
    expect(res.status).toBe(204);
  });

  it("answers 404 when it was not", async () => {
    const res = await appWith(stub({ read: async () => false })).request(
      `/v1/notifications/${ID}/read`,
      post(),
    );
    expect(res.status).toBe(404);
  });

  /* Postgres throws on a malformed uuid; that is a 404, not a 500. */
  it("answers 404 for an id that is not a uuid, without asking the database", async () => {
    let asked = false;
    const res = await appWith(stub({ read: async () => ((asked = true), true) })).request(
      "/v1/notifications/not-an-id/read",
      post(),
    );
    expect(res.status).toBe(404);
    expect(asked).toBe(false);
  });
});

describe("POST /v1/notifications/read-all", () => {
  it("passes upTo down as a date and answers 204", async () => {
    let seen: Date | null = null;
    const res = await appWith(stub({ readAll: async (_u, upTo) => ((seen = upTo), 1) })).request(
      "/v1/notifications/read-all",
      post({ upTo: "2026-10-27T11:00:00.000Z" }),
    );
    expect(res.status).toBe(204);
    expect(seen).toEqual(new Date("2026-10-27T11:00:00.000Z"));
  });

  it("refuses a missing or unreadable upTo", async () => {
    for (const body of [{}, { upTo: "yesterday" }, undefined]) {
      const res = await appWith(stub()).request("/v1/notifications/read-all", post(body));
      expect(res.status).toBe(400);
    }
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm vitest run src/routes/notifications.test.ts`
Expected: FAIL, cannot resolve `./notifications.js`.

- [ ] **Step 4: Implement the routes**

Create `services/api/src/routes/notifications.ts`:

```ts
import { Hono } from "hono";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";
import type { InboxItem } from "../notify/inbox-queries.js";
import { activityWire } from "./activity.js";

export interface NotificationDeps {
  readonly list: (
    userId: string,
  ) => Promise<{ readonly items: readonly InboxItem[]; readonly unread: number }>;
  readonly unread: (userId: string) => Promise<number>;
  /** False when there is no such notification on this account. */
  readonly read: (userId: string, id: string) => Promise<boolean>;
  readonly readAll: (userId: string, upTo: Date) => Promise<number>;
}

const fail = (code: string, message: string) => ({ error: { code, message } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const wire = (n: InboxItem) => ({
  id: n.id,
  kind: n.kind,
  createdAt: n.createdAt.toISOString(),
  readAt: n.readAt === null ? null : n.readAt.toISOString(),
  activity: activityWire(n.activity),
});

/**
 * The inbox behind the bell. Nothing here reads the chain, so the badge can be
 * polled from every open tab for the price of one indexed count.
 */
export function notificationRoutes(deps: NotificationDeps): Hono {
  const app = new Hono();

  app.get("/v1/notifications", async (c) => {
    const { items, unread } = await deps.list(c.get("identity").userId);
    return c.json({ items: items.map(wire), unread });
  });

  app.get("/v1/notifications/unread", async (c) =>
    c.json({ unread: await deps.unread(c.get("identity").userId) }),
  );

  /*
   * "Mark all as read" says how far it read: the newest item the panel showed.
   * Something that arrived after the panel was drawn was never seen, and stays
   * unread. Registered before `/:id/read` so "read-all" is never taken for an id.
   */
  app.post("/v1/notifications/read-all", async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const raw = body !== null && typeof body === "object" && "upTo" in body ? body.upTo : undefined;
    const upTo = typeof raw === "string" ? new Date(raw) : null;
    if (upTo === null || Number.isNaN(upTo.getTime())) {
      return c.json(fail("validation_failed", "Say how far to mark, as upTo."), 400);
    }
    await deps.readAll(c.get("identity").userId, upTo);
    return c.body(null, 204);
  });

  app.post("/v1/notifications/:id/read", async (c) => {
    const id = c.req.param("id");
    const found = UUID.test(id) && (await deps.read(c.get("identity").userId, id));
    if (!found) return c.json(fail("not_found", "There is no such notification on this account."), 404);
    return c.body(null, 204);
  });

  return app;
}
```

- [ ] **Step 5: Run the route tests**

Run: `pnpm vitest run src/routes/notifications.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire it in**

In `services/api/src/deps.ts`:

1. Add imports beside the activity ones:

```ts
import type { NotificationDeps } from "./routes/notifications.js";
import { countUnread, markAllRead, markRead, readInbox } from "./notify/inbox-queries.js";
```

2. Add to `interface ReadDeps`, after `readonly activity: ActivityDeps;`:

```ts
  readonly notifications: NotificationDeps;
```

3. In the object that builds `ReadDeps`, after the `activity: { ... },` entry:

```ts
    notifications: {
      list: (userId) => readInbox(db, userId, new Date()),
      unread: (userId) => countUnread(db, userId, new Date()),
      read: (userId, id) => markRead(db, userId, id, new Date()),
      readAll: (userId, upTo) => markAllRead(db, userId, upTo, new Date()),
    },
```

In `services/api/src/app.ts`, import `notificationRoutes` from `./routes/notifications.js` and add after `app.route("/", activityRoutes(read.activity));`:

```ts
app.route("/", notificationRoutes(read.notifications));
```

In `src/app.test.ts` and `src/routes/fund-mount.test.ts`, add `notifications: {},` beside `activity: {},` in their `ReadDeps` stubs, so the stubs stay complete.

- [ ] **Step 7: Run the whole API suite**

Run: `pnpm typecheck && pnpm test`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/routes/activity.ts src/routes/notifications.ts src/routes/notifications.test.ts src/deps.ts src/app.ts src/app.test.ts src/routes/fund-mount.test.ts
git commit -m "feat(api): /v1/notifications, its unread count, and marking read

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The web client

**Files:**

- Create: `apps/web/src/api/notifications.ts`
- Test: `apps/web/src/api/notifications.test.ts`

**Interfaces:**

- Consumes: `apiFetch` from `./client`; `useSignedIn`, `ActivityItem` from `./hooks`; `LIVE` from `./live`
- Produces:
  - `type NoticeKind = "money_in" | "dividend" | "loan_alert"`
  - `interface Notification { readonly id: string; readonly kind: NoticeKind; readonly createdAt: string; readonly readAt: string | null; readonly activity: ActivityItem }`
  - `badgeText(unread: number): string | null`
  - `destinationOf(n: Notification): { readonly receipt: string } | { readonly path: string }`
  - `useUnreadCount()`, `useNotifications(open: boolean)`, `useMarkRead()`, `useMarkAllRead()`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/api/notifications.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { badgeText, destinationOf, type Notification } from "./notifications";

const of = (kind: Notification["kind"]): Notification => ({
  id: "n1",
  kind,
  createdAt: "2026-10-27T11:00:00.000Z",
  readAt: null,
  activity: {
    id: "a1",
    kind: "transfer_in",
    occurredAt: "2026-10-27T10:59:00.000Z",
    title: "Added cash",
    subtitle: null,
    amountUsd: "250",
    txSignature: null,
    mint: null,
    logoUrl: null,
  },
});

describe("badgeText", () => {
  it("shows nothing at zero", () => expect(badgeText(0)).toBeNull());
  it("shows the count up to nine", () => {
    expect(badgeText(1)).toBe("1");
    expect(badgeText(9)).toBe("9");
  });
  it("caps above nine", () => expect(badgeText(10)).toBe("9+"));
});

describe("destinationOf", () => {
  it("opens the receipt for money in and dividends", () => {
    expect(destinationOf(of("money_in"))).toEqual({ receipt: "a1" });
    expect(destinationOf(of("dividend"))).toEqual({ receipt: "a1" });
  });
  it("goes to the portfolio for a loan warning", () => {
    expect(destinationOf(of("loan_alert"))).toEqual({ path: "/portfolio" });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run from `apps/web`: `pnpm vitest run src/api/notifications.test.ts`
Expected: FAIL, cannot resolve `./notifications`.

- [ ] **Step 3: Implement**

Create `apps/web/src/api/notifications.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { useSignedIn, type ActivityItem } from "./hooks";
import { LIVE } from "./live";

/**
 * The inbox behind the bell.
 *
 * The badge's count is polled on the account reads' policy, and costs no RPC:
 * the server answers it from one indexed count. The list is fetched only while
 * the panel is open, because nobody reads it otherwise.
 */
export type NoticeKind = "money_in" | "dividend" | "loan_alert";

export interface Notification {
  readonly id: string;
  readonly kind: NoticeKind;
  readonly createdAt: string;
  readonly readAt: string | null;
  readonly activity: ActivityItem;
}

const KEY = ["api", "notifications"] as const;
const UNREAD_KEY = [...KEY, "unread"] as const;

/** Nothing at zero, then the count, then "9+". */
export const badgeText = (unread: number): string | null =>
  unread <= 0 ? null : unread > 9 ? "9+" : String(unread);

/** Where clicking an item goes: its receipt, or the page the loan lives on. */
export const destinationOf = (n: Notification): { readonly receipt: string } | { readonly path: string } =>
  n.kind === "loan_alert" ? { path: "/portfolio" } : { receipt: n.activity.id };

export const useUnreadCount = () => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: UNREAD_KEY,
    queryFn: () => apiFetch<{ unread: number }>("/v1/notifications/unread"),
    enabled: signedIn,
    ...LIVE,
    select: (r) => r.unread,
  });
};

export const useNotifications = (open: boolean) => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<{ items: Notification[]; unread: number }>("/v1/notifications"),
    enabled: signedIn && open,
    staleTime: 0,
  });
};

/** Read at once on screen; the server catches up. A failure comes back unread on the next fetch. */
export const useMarkRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/v1/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }),
    onMutate: (id) => {
      const now = new Date().toISOString();
      qc.setQueryData<{ items: Notification[]; unread: number }>(KEY, (prev) =>
        prev === undefined
          ? prev
          : {
              unread: prev.items.some((n) => n.id === id && n.readAt === null)
                ? prev.unread - 1
                : prev.unread,
              items: prev.items.map((n) => (n.id === id && n.readAt === null ? { ...n, readAt: now } : n)),
            },
      );
      qc.setQueryData<{ unread: number }>(UNREAD_KEY, (prev) =>
        prev === undefined ? prev : { unread: Math.max(0, prev.unread - 1) },
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

/** `upTo` is the newest item the panel showed, so nothing that arrived since is marked. */
export const useMarkAllRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (upTo: string) =>
      apiFetch("/v1/notifications/read-all", { method: "POST", body: JSON.stringify({ upTo }) }),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};
```

`invalidateQueries({ queryKey: KEY })` also refreshes `UNREAD_KEY`, because it starts with `KEY`.

- [ ] **Step 4: Run the tests**

Run from `apps/web`: `pnpm vitest run src/api/notifications.test.ts && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/api/notifications.ts src/api/notifications.test.ts
git commit -m "feat(web): the inbox's queries, and where an item goes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The bell and the panel

**Files:**

- Modify: `apps/web/src/app/HeaderChrome.tsx`

**Interfaces:**

- Consumes: everything Task 7 produces; `usePanels` from `./Panels`; `relTime` from `./portfolio/ui`; `usd` from `@mercury/view`; `useNavigate` from `react-router-dom`

- [ ] **Step 1: Split the alerts panel from the settings placeholder**

Rewrite `apps/web/src/app/HeaderChrome.tsx` so the settings button keeps its placeholder and the alerts button opens the inbox. Keep the outside-click and Escape handling exactly as it is.

```tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usd } from "@mercury/view";
import { Bell, Cog } from "../ui/icons";
import {
  badgeText,
  destinationOf,
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useUnreadCount,
  type Notification,
} from "../api/notifications";
import { usePanels } from "./Panels";
import { relTime } from "./portfolio/ui";

/**
 * Global chrome, the same on every app screen: the inbox behind the bell, and
 * the settings placeholder, which still says it is not built: a control that
 * does nothing when pressed reads as broken rather than as unfinished.
 */
type Panel = "alerts" | "settings";

const SETTINGS = {
  title: "Not built yet",
  body: "Your profile, security, and exporting the wallet to somewhere else will live here.",
};

export const HeaderChrome = () => {
  const [open, setOpen] = useState<Panel | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const unread = useUnreadCount().data ?? 0;
  const badge = badgeText(unread);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const button = (key: Panel) => {
    const Icon = key === "alerts" ? Bell : Cog;
    const active = open === key;
    const label =
      key === "alerts" ? (unread > 0 ? `Notifications, ${unread} unread` : "Notifications") : "Settings";
    return (
      <button
        key={key}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={active}
        onClick={() => setOpen(active ? null : key)}
        className={`relative grid size-9 place-items-center rounded-lg bg-white transition-colors max-sm:size-10 ${
          active ? "text-ds-ink" : "text-ds-muted hover:text-ds-ink"
        }`}
      >
        <Icon className="size-4" />
        {key === "alerts" && badge !== null && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-ds-ink px-1 text-[10px] leading-none font-medium text-white tabular-nums"
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div ref={box} className="relative flex items-center gap-2">
      {button("alerts")}
      {button("settings")}

      {open === "alerts" && <Inbox onClose={() => setOpen(null)} />}
      {open === "settings" && (
        <div
          role="dialog"
          aria-label="Settings"
          className="absolute top-[calc(100%+10px)] right-0 z-40 w-[300px] rounded-xl bg-white px-5 py-4 outline-1 outline-black/10"
        >
          <p className="text-[14px] leading-none font-medium text-ds-ink">{SETTINGS.title}</p>
          <p className="mt-3 text-[14px] leading-[1.45] text-ds-muted text-pretty">{SETTINGS.body}</p>
        </div>
      )}
    </div>
  );
};

const Inbox = ({ onClose }: { onClose: () => void }) => {
  const list = useNotifications(true);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const panels = usePanels();
  const navigate = useNavigate();

  const items = list.data?.items ?? [];
  const unread = list.data?.unread ?? 0;
  const newest = items[0];

  const go = (n: Notification) => {
    if (n.readAt === null) markRead.mutate(n.id);
    onClose();
    const to = destinationOf(n);
    if ("receipt" in to) panels.receipt(to.receipt);
    else navigate(to.path);
  };

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className="absolute top-[calc(100%+10px)] right-0 z-40 w-[360px] max-w-[calc(100vw-32px)] rounded-xl bg-white outline-1 outline-black/10"
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <p className="text-[14px] leading-none font-medium text-ds-ink">Notifications</p>
        <button
          type="button"
          disabled={unread === 0 || newest === undefined || markAll.isPending}
          onClick={() => newest && markAll.mutate(newest.createdAt)}
          className="text-[13px] text-ds-muted hover:text-ds-ink disabled:opacity-40 disabled:hover:text-ds-muted"
        >
          Mark all as read
        </button>
      </div>

      {list.isPending ? (
        <p className="px-5 pb-4 text-[14px] text-ds-muted">Loading…</p>
      ) : list.isError ? (
        <div className="px-5 pb-4 text-[14px] text-ds-muted">
          Couldn't load your notifications.{" "}
          <button type="button" className="text-ds-ink underline" onClick={() => void list.refetch()}>
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="px-5 pb-4 text-[14px] leading-[1.45] text-ds-muted text-pretty">
          Nothing yet. Money arriving, dividends and loan warnings will show up here.
        </p>
      ) : (
        <ul className="max-h-[420px] overflow-y-auto pb-2">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => go(n)}
                className="flex w-full items-start gap-3 px-5 py-2.5 text-left hover:bg-black/[0.03]"
              >
                <span
                  aria-hidden
                  className={`mt-1.5 size-1.5 shrink-0 rounded-full ${n.readAt === null ? "bg-ds-ink" : "bg-transparent"}`}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[14px] ${n.readAt === null ? "font-medium text-ds-ink" : "text-ds-muted"}`}
                  >
                    {n.activity.title}
                    {n.readAt === null && <span className="sr-only"> (unread)</span>}
                  </span>
                  {n.activity.subtitle && (
                    <span className="block truncate text-[13px] text-ds-muted">{n.activity.subtitle}</span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  {n.activity.amountUsd !== null && (
                    <span className="block text-[13px] text-ds-ink tabular-nums">
                      {usd(n.activity.amountUsd)}
                    </span>
                  )}
                  <span className="block text-[12px] text-ds-muted">{relTime(n.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
```

If `bg-ds-ink` or `text-ds-ink` doesn't produce the expected colours (check `apps/web/src/tokens.css`), use the token the rest of the top bar uses for strong text and keep the badge legible on white.

- [ ] **Step 2: Typecheck and run the web tests**

Run from `apps/web`: `pnpm typecheck && pnpm test`
Expected: PASS, no type errors.

- [ ] **Step 3: See it working**

Start the API and web dev servers through the preview tooling (configurations in `.claude/launch.json`). Sign in with a dev account that has activity, then insert a notification for it so the panel has something to show. From `services/api`, with `DATABASE_URL` pointing at the local dev database:

```sql
insert into notification (user_id, kind, activity_id)
select user_id, 'money_in', id from activity where kind = 'transfer_in' order by occurred_at desc limit 3
on conflict do nothing;
```

Check, with screenshots:

1. The bell shows `3`, and its label reads "Notifications, 3 unread".
2. Clicking the bell opens the panel; nothing is marked read by opening it.
3. Clicking an item closes the panel, opens its receipt, and the bell shows `2`.
4. "Mark all as read" clears the badge and is then disabled.
5. Escape and an outside click close the panel.
6. At 375px wide, the panel fits on screen.
7. With the list request blocked (or the API stopped), opening the panel shows the retry message, not the empty state.

- [ ] **Step 4: Commit**

```bash
git add src/app/HeaderChrome.tsx
git commit -m "feat(web): the bell shows what's unread, and the inbox behind it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the last task

- Run `pnpm test` and `pnpm typecheck` from the repo root.
- Add a line under **Product** in `TODO.md`: "Notifications inbox on web: money in, dividends, loan warnings. Next: queued orders once the poller exists; mobile."
- Open a PR from `feat/notifications-inbox` to `main`.
