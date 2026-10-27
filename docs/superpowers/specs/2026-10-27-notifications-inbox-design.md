# Notifications inbox: design

**Status:** agreed, not built · 27 October 2026 · web only.

The bell in the top bar gets something behind it: a list of things that happened while the person
wasn't watching, each read or unread, with a count on the bell and "Mark all as read".

No toasts, no push, no email changes, and no mobile in this piece. Those come later and can reuse
what this builds.

## What it shows

Three kinds, all of which already write a row to `activity` today:

| Kind         | Written by                                                     | Activity `kind` | Example                                      |
| ------------ | -------------------------------------------------------------- | --------------- | -------------------------------------------- |
| `money_in`   | `wallet-events` (`wallet-events/sync.ts`), named by `funding/enrich.ts` | `transfer_in`   | "Added cash · From Tron · USDT · $250.00"    |
| `dividend`   | `position-sync` (`portfolio/reconcile.ts`)                     | `dividend`      | "NVDA dividend · Paid as 0.004 shares"       |
| `loan_alert` | The loan watcher (`lending/watch-loans.ts`)                    | `loan_alert`    | The same title and body as the warning email |

Queued orders filled or refused at the open join once the trigger-order poller exists. Until then
an order that would queue is refused at once, so there is nothing to tell.

Fills the person made themselves are left out: they were there when it happened.

## Decisions already made

- **Read state is per item.** The badge counts unread items. Opening the panel marks nothing.
  Clicking an item marks it read, and "Mark all as read" marks them all. A loan warning can't
  disappear because someone glanced at the bell.
- **Clicking an item takes you to what it's about** and marks it read.
- **Read state is stored on the server,** so it survives a cleared browser and is ready for mobile.
- **Web only** for now.
- **History:** 90 days kept, newest 50 shown. Activity remains the full record.

## A notification points at an activity row

Every notification in this piece is about something `activity` already records. So a
notification row holds only what `activity` doesn't: that it is worth telling, and whether it has
been read. Its words come from the activity row when it is read, not copied when it is written.

That matters for `money_in`. `wallet-events` writes the generic "Added cash" row first, and
`funding/enrich.ts` adds "From Tron · USDT" a pass later. A copied title would stay generic;
a joined one picks up the better wording by itself.

A later notice with no activity row behind it (a new sign-in, say) adds its own `title` and `body`
columns then. Nothing in this piece needs them.

## Data

Migration `0029_notifications.sql`:

```ts
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
    /** Null while unread. */
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [
    /** The list, newest first. */
    index("notification_user_created_idx").on(t.userId, t.createdAt, t.id),
    /** The badge. Partial, so it stays as small as the unread set. */
    index("notification_unread_idx").on(t.userId).where(sql`${t.readAt} is null`),
    /** One notification per activity row, however many times the writer runs. */
    uniqueIndex("notification_activity_idx").on(t.activityId),
  ],
);
```

The unique index on `activity_id` is the idempotency guarantee, the same job
`activity_signature_mint_idx` does for `activity`: a pass that runs twice, or two API instances
running the same job, write one notification.

## Writing them

Each writer already inserts its activity rows. It inserts the notification in the **same
transaction**, from the ids the insert returns, with `onConflictDoNothing` on `activity_id`. A
notification never exists without its activity row, and an activity row worth telling never
commits without its notification.

One helper in `services/api/src/notify/inbox.ts` does the insert, so the three writers don't each
know the table's shape.

- **`wallet-events/sync.ts`.** The activity insert already has `.returning({ id })`. Widen it to
  return `kind` and `occurredAt`, and notify each `transfer_in` whose `occurredAt` is under 24
  hours old. The age check is there because a known wallet's new token stream is backfilled
  (see the comments around `shouldBackfill`), and its old history is not news. A wallet's very
  first pass is baselined, not backfilled, so it writes nothing to notify about.
- **`portfolio/reconcile.ts`.** Where the dividend activity row is written, notify it. Its
  `occurredAt` is always now.
- **`lending/watch-loans.ts`.** The `loan_alert` activity insert gains `.returning({ id })`, and
  notifies it. This runs before the email, for the reason the comment there already gives: the
  in-app copy is the one we control.

`transfer_in` includes stock tokens arriving from elsewhere, not only USDC. Both are "something
arrived", so both are told.

## API

All behind `requireAuth`, scoped to the signed-in user, in `routes/notifications.ts`. None of them
read the chain, so none of them cost RPC.

| Route                                   | Returns                                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /v1/notifications`                 | `{ items, unread }`. The newest 50 from the last 90 days. Each item is `{ id, kind, createdAt, readAt, activity }`, with `activity` serialized as `/v1/activity` serializes it |
| `GET /v1/notifications/unread`          | `{ unread }`. The badge's poll                                                                                                                   |
| `POST /v1/notifications/:id/read`       | `204`. Idempotent: reading a read item changes nothing, and its first `readAt` stands. `404` if it isn't the caller's                            |
| `POST /v1/notifications/read-all`       | `204`. Body `{ upTo }`, the `createdAt` of the newest item the panel showed. Marks only items at or before it                                    |

`upTo` exists so that "Mark all as read" can't mark something that arrived after the panel was
drawn. The person never saw that item; it stays unread.

The unread count is capped at 90 days like the list, so the badge never counts something the
panel can't show.

## Retention

A daily job deletes notifications older than 90 days, on the same `every` runner the other jobs
use. The activity rows stay; only the notification goes.

## Web

All in `apps/web/src/app/HeaderChrome.tsx` and a new `apps/web/src/api/notifications.ts`. The
settings panel next to it doesn't change.

**The badge**

- Shows the unread count on the bell, `9+` above nine, nothing at zero.
- The bell's label says the count: "Notifications, 3 unread".
- Polled from `/v1/notifications/unread` every 30 seconds, using the `LIVE` policy in
  `api/live.ts`, so it stops in a background tab and refreshes on focus.

**The panel**

- Opens from the bell, as today: closes on Escape or a click outside.
- Wider than today's 300px placeholder, about 360px, with the list scrolling inside a capped
  height.
- Header: "Notifications" and "Mark all as read". The button is disabled when nothing is unread.
- The list is fetched when the panel opens, newest first.
- Each item: an unread dot, the activity's title and subtitle, its amount if it has one, and how
  long ago. Unread items are in stronger type.
- Empty: "Nothing yet. Money arriving, dividends and loan warnings will show up here."
- A failed load says so, with a retry, rather than showing the empty state.

**Clicking an item**

1. Marks it read at once (optimistic), and sends the request.
2. Closes the panel.
3. Opens what it's about:
   - `money_in` and `dividend` open the activity receipt, `?event=<activityId>` through
     `panels.receipt` in `Panels.tsx`, which works from any page.
   - `loan_alert` goes to `/portfolio`, where the loan and `LoanAlert` are.

If the read request fails, the item goes back to unread on the next fetch. Nothing else is
undone; the person still lands where they clicked.

After any read, the badge's query is invalidated so the count updates without waiting for the
next poll.

## Edge cases

- **The same movement seen twice** (a crash between write and cursor, two instances): one activity
  row, so one notification.
- **A user deleted:** their notifications go with them (`cascade`).
- **An activity row deleted:** its notification goes with it (`cascade`).
- **A burst** (a basket exit landing ten tokens): ten notifications. It's rare and each is real.
  Grouping waits until it is shown to be a problem.
- **Clocks:** `createdAt` and `upTo` are both server times, so the browser's clock can't make
  "Mark all as read" miss or over-reach.

## Tests

- **Writers:** each of the three writes one notification per new activity row, none on a repeat
  pass, and `wallet-events` none for a `transfer_in` older than 24 hours.
- **Routes:** another user's notification is a `404`; read is idempotent and keeps the first
  `readAt`; read-all respects `upTo`; list and count both stop at 90 days.
- **Retention job:** deletes at 90 days, keeps the activity row.
- **Web:** the badge's `9+` and zero cases; the click marks read and routes by kind; read-all is
  disabled at zero unread.

## Not in this piece

- Toasts, push, email, and mobile.
- Preferences or muting by kind.
- Queued orders, until the trigger-order poller exists.
- Grouping or roundups.
