# Admin Dashboard Implementation Plan

> **The implementation was removed on 16 October 2026 and this plan is kept for
> rebuilding it.** The API surface was built and merged
> ([#88](https://github.com/unitlabs-xyz/mercury/pull/88)), the page was taken out
> of the customer app ([#89](https://github.com/unitlabs-xyz/mercury/pull/89)), a
> standalone app was built and closed unmerged
> ([#90](https://github.com/unitlabs-xyz/mercury/pull/90)), and the API surface
> was then reverted. Nothing is lost — every file is in #88's and #90's history.
>
> Read the **As built** section at the end before following this plan again: it
> records seven things the plan got wrong that only measurement found, and the
> standalone attempt added two more (Privy resolves `@solana/kit` to a version
> that breaks Vite's dep pre-bundling, and a separate app is _not_ smaller
> because Privy ships the wallet stack transitively).
>
> The four time-first indexes it specifies are still applied and still declared
> in `schema.ts` — they were deliberately not dropped.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An `/admin` surface in the Mercury web app showing who is here, what they hold, what they have traded, and which chains their money arrives from — read from tables that are already written.

**Architecture:** No instrumentation. A new `src/admin/` module in the API holds one query function per question; `src/routes/admin.ts` exposes them as GETs behind an allowlist. The routes are not mounted when the allowlist is unset, so they 404 and the web app never shows the entry — the same way `read.fund` already makes the funding method disappear. The web surface is a `lazy()` route so no chart library reaches the bundle a user downloads.

**Tech Stack:** Hono, Drizzle over postgres.js, Zod at the boundary, PGlite for tests, React + react-router-dom + Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-15-observability-design.md`

## Global Constraints

- TypeScript strict with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`. Optional properties are omitted via spread, never assigned `undefined`.
- Intra-package imports carry a `.js` extension against `.ts` files.
- **Every admin route is a GET, and the admin module is given no write path.** Not a repository with writes it declines to call — no writes in scope at all.
- **A caller who is not on the allowlist gets 404, never 403.** A 403 confirms the surface exists and is worth attacking.
- The allowlist variable is `ADMIN_PRIVY_USER_IDS`, comma-separated. Unset means the routes are not mounted.
- Admin queries are read-only aggregates over tables serving live traffic. Every one takes a Zod-validated date range, has a hard row limit, and runs under a statement timeout.
- Never in a response: another user's email, wallet address or Privy DID. Aggregates and counts only, except where a task says otherwise and explains why.
- The web surface is behind `lazy()`. No charting dependency may enter the eager chunk; the main chunk is already 2.5 MB.
- `pnpm check` green before every commit. Conventional commits, terse bodies, ending `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- The banned word "catalogue"/"catalog" does not appear in any copy this plan adds. Say stocks, supportedStocks or assets.

---

### Task 1: Authorisation, and the smallest useful route

The authorisation shape is proved before any query depends on it, and `/v1/admin/health` is useful on its own.

**Files:**

- Create: `services/api/src/admin/allowlist.ts`
- Create: `services/api/src/admin/allowlist.test.ts`
- Create: `services/api/src/admin/freshness.ts`
- Create: `services/api/src/routes/admin.ts`
- Create: `services/api/src/routes/admin.test.ts`
- Modify: `services/api/src/deps.ts` (`Config`, `readConfig`, `buildReadDeps`)
- Modify: `services/api/src/app.ts` (mount)
- Modify: `services/api/src/index.ts` (boot announcement)
- Modify: `services/api/.env.example`

**Interfaces:**

- Produces:
  - `parseAdmins(raw: string | undefined): readonly string[]`
  - `requireAdmin(admins: readonly string[]): MiddlewareHandler`
  - `freshness(db: Db): Promise<Freshness>` where `Freshness = { snapshotAt: string | null; priceBarAt: string | null; activityAt: string | null; now: string }`
  - `adminRoutes(deps: AdminDeps): Hono` — `AdminDeps = { db: Db; admins: readonly string[] }`
  - `Config.adminPrivyUserIds?: readonly string[]`
- Consumes: `requireAuth` and `Identity` from `src/auth/`, already present.

- [x] **Step 1: Write the failing allowlist test**

`services/api/src/admin/allowlist.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseAdmins } from "./allowlist.js";

describe("parseAdmins", () => {
  it("is empty when unset, which is what keeps the routes unmounted", () => {
    /* The capability pattern this service already uses: absent configuration
       means the feature is not built, not that it is open. */
    expect(parseAdmins(undefined)).toEqual([]);
    expect(parseAdmins("")).toEqual([]);
    expect(parseAdmins("   ")).toEqual([]);
  });

  it("reads a comma-separated list", () => {
    expect(parseAdmins("did:privy:a,did:privy:b")).toEqual(["did:privy:a", "did:privy:b"]);
  });

  it("tolerates the spaces a person leaves when editing an env var", () => {
    expect(parseAdmins(" did:privy:a , did:privy:b ")).toEqual(["did:privy:a", "did:privy:b"]);
  });

  it("drops empty entries from a trailing comma", () => {
    /* `did:privy:a,` would otherwise admit the empty string, and an identity
       whose privyUserId was somehow empty would match it. */
    expect(parseAdmins("did:privy:a,,")).toEqual(["did:privy:a"]);
  });

  it("keeps the case, because a DID is case-sensitive", () => {
    expect(parseAdmins("did:privy:AbC")).toEqual(["did:privy:AbC"]);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `cd services/api && pnpm vitest run src/admin/allowlist.test.ts`
Expected: FAIL — cannot resolve `./allowlist.js`.

- [x] **Step 3: Write the allowlist and the middleware**

`services/api/src/admin/allowlist.ts`:

```ts
/**
 * Who may read the admin surface.
 *
 * An allowlist of Privy DIDs rather than a `role` column, because a column
 * would be a second thing to keep in step with who actually works here and a
 * row anybody with database access could grant themselves. An environment
 * variable is changed by whoever can already deploy.
 *
 * Unset means the routes are never mounted, which is the same shape every
 * other optional capability in this service has: `read.fund` being undefined
 * is why `/v1/money/fund/sources` 404s and the app hides the funding method.
 * Absent configuration means the feature does not exist, not that it is open.
 *
 * An admin is an ordinary authenticated session plus membership of this list.
 * There is no admin password and no second credential, so there is nothing
 * new to leak.
 */
import type { MiddlewareHandler } from "hono";

export const parseAdmins = (raw: string | undefined): readonly string[] =>
  (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

/**
 * Mounted after `requireAuth`, so `identity` is already resolved.
 *
 * Answers 404 and not 403. A 403 tells an unauthorised caller that the route
 * exists, which is the one fact worth withholding — the surface reads every
 * account's holdings, and there is no reason to advertise it to somebody
 * probing. The same answer an unmounted route gives, deliberately.
 */
export const requireAdmin = (admins: readonly string[]): MiddlewareHandler => {
  const allowed = new Set(admins);
  return async (c, next) => {
    if (!allowed.has(c.get("identity").privyUserId)) {
      return c.json({ error: { code: "not_found", message: "No such route." } }, 404);
    }
    await next();
    return undefined;
  };
};
```

- [x] **Step 4: Run the test to verify it passes**

Run: `cd services/api && pnpm vitest run src/admin/allowlist.test.ts`
Expected: PASS, 5 tests.

- [x] **Step 5: Write the freshness query**

`services/api/src/admin/freshness.ts`:

```ts
/**
 * How old the newest row of each kind is.
 *
 * The cheapest possible answer to "are the background jobs alive", and it
 * needs no telemetry at all — three `max()` reads against indexes that already
 * exist. Worth having even once Grafana is up, because this is the one check
 * that answers from inside the API rather than from a stack that could itself
 * be down.
 *
 * `portfolio_snapshot` is the row that matters most. It is the only record of
 * what an account used to be worth, nothing can reconstruct a reading that was
 * never taken, and the job that writes it runs hourly — so an age over about
 * ninety minutes is a problem that is still growing.
 */
import { sql } from "drizzle-orm";
import type { Db } from "../db/client.js";

export interface Freshness {
  readonly snapshotAt: string | null;
  readonly priceBarAt: string | null;
  readonly activityAt: string | null;
  readonly now: string;
}

export const freshness = async (db: Db): Promise<Freshness> => {
  const rows = await db.execute(sql`
    select
      (select max(captured_at) from portfolio_snapshot) as snapshot_at,
      (select max(bucket_start) from price_bar)         as price_bar_at,
      (select max(occurred_at) from activity)           as activity_at,
      now()                                             as now
  `);

  const row = (rows as unknown as readonly Record<string, unknown>[])[0] ?? {};
  const iso = (value: unknown): string | null =>
    value instanceof Date ? value.toISOString() : typeof value === "string" ? value : null;

  return {
    snapshotAt: iso(row["snapshot_at"]),
    priceBarAt: iso(row["price_bar_at"]),
    activityAt: iso(row["activity_at"]),
    now: iso(row["now"]) ?? new Date().toISOString(),
  };
};
```

- [x] **Step 6: Write the failing route test**

`services/api/src/routes/admin.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { testDb } from "../db/testing.js";
import { adminRoutes } from "./admin.js";

/** An app with the identity already set, as requireAuth would leave it. */
const appAs = async (privyUserId: string, admins: readonly string[]) => {
  const db = await testDb();
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "u1", privyUserId, walletAddress: null });
    await next();
  });
  app.route("/", adminRoutes({ db, admins }));
  return app;
};

describe("admin routes", () => {
  it("answers 404 to an authenticated caller who is not an admin", async () => {
    /* 404 and not 403: a 403 confirms the surface exists. It reads every
       account's holdings, so there is no reason to advertise it. */
    const app = await appAs("did:privy:nobody", ["did:privy:me"]);

    const res = await app.request("/v1/admin/health");

    expect(res.status).toBe(404);
  });

  it("answers an admin", async () => {
    const app = await appAs("did:privy:me", ["did:privy:me"]);

    const res = await app.request("/v1/admin/health");

    expect(res.status).toBe(200);
  });

  it("answers 404 to everybody when the allowlist is empty", async () => {
    /* The unmounted case, asserted at the route level as well: a config that
       was never set must not leave the surface open to the first caller. */
    const app = await appAs("did:privy:me", []);

    expect((await app.request("/v1/admin/health")).status).toBe(404);
  });

  it("reports nulls on an empty database rather than failing", async () => {
    /* A fresh deployment has no snapshot and no price bar. The health route is
       the first thing anybody opens, and it must not be the first thing that
       500s. */
    const app = await appAs("did:privy:me", ["did:privy:me"]);

    const body = (await (await app.request("/v1/admin/health")).json()) as {
      snapshotAt: string | null;
      now: string;
    };

    expect(body.snapshotAt).toBe(null);
    expect(body.now).toMatch(/^\d{4}-/);
  });

  it("exposes no route that is not a GET", async () => {
    /* Read-only by construction, asserted rather than assumed. The surface
       reads every account in the system; a POST on it is a bug nobody would
       notice until it mattered. */
    const app = await appAs("did:privy:me", ["did:privy:me"]);

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await app.request("/v1/admin/health", { method });
      expect(res.status).not.toBe(200);
    }
  });
});
```

- [x] **Step 7: Run it to verify it fails**

Run: `cd services/api && pnpm vitest run src/routes/admin.test.ts`
Expected: FAIL — cannot resolve `./admin.js`.

- [x] **Step 8: Write the routes module**

`services/api/src/routes/admin.ts`:

```ts
/**
 * The admin surface.
 *
 * Every route is a GET and this module is handed a `Db` and an allowlist and
 * nothing else — no store with writes, no relayer, no notifier. That is what
 * makes "read-only" a property of the code rather than a promise in a comment.
 */
import { Hono } from "hono";
import type { Db } from "../db/client.js";
import { requireAdmin } from "../admin/allowlist.js";
import { freshness } from "../admin/freshness.js";

export interface AdminDeps {
  readonly db: Db;
  readonly admins: readonly string[];
}

export const adminRoutes = (deps: AdminDeps): Hono => {
  const app = new Hono();

  app.use("/v1/admin/*", requireAdmin(deps.admins));

  app.get("/v1/admin/health", async (c) => c.json(await freshness(deps.db)));

  return app;
};
```

- [x] **Step 9: Run the tests to verify they pass**

Run: `cd services/api && pnpm vitest run src/routes/admin.test.ts`
Expected: PASS, 5 tests.

- [x] **Step 10: Thread the config through**

In `services/api/src/deps.ts`:

- add to `Config`:

```ts
  /**
   * Optional. Privy DIDs allowed to read the admin surface, comma-separated.
   *
   * Unset means the admin routes are not mounted at all, which is why the web
   * app never shows the entry — the same shape as `relayApiKey` and the
   * funding method.
   */
  readonly adminPrivyUserIds?: readonly string[];
```

- in `readConfig`, before the `return`:

```ts
const admins = parseAdmins(env["ADMIN_PRIVY_USER_IDS"]);
```

and inside the returned object, following the existing spread idiom that `exactOptionalPropertyTypes` requires:

```ts
    ...(admins.length > 0 ? { adminPrivyUserIds: admins } : {}),
```

- `buildReadDeps` gains an `admin` member built the same way `fund` is: present only when `config.adminPrivyUserIds` is set. Read the function first and match its existing shape.

- [x] **Step 11: Mount it**

In `services/api/src/app.ts`, after the other authenticated route mounts:

```ts
/* Absent when ADMIN_PRIVY_USER_IDS is unset, so the routes 404 and the web
     app never renders the entry — as with read.fund and the funding method. */
if (read.admin) app.route("/", adminRoutes(read.admin));
```

- [x] **Step 12: Announce it at boot**

In `services/api/src/index.ts`, alongside the other capability lines:

```ts
console.log(
  config.adminPrivyUserIds === undefined
    ? "admin: off (ADMIN_PRIVY_USER_IDS unset); the dashboard routes are not mounted"
    : `admin: on for ${config.adminPrivyUserIds.length} account${config.adminPrivyUserIds.length === 1 ? "" : "s"}`,
);
```

- [x] **Step 13: Document the variable**

Append to `services/api/.env.example`:

```
# Privy DIDs allowed to read /v1/admin/*, comma-separated. Unset means the
# admin routes are not mounted and the web app shows no entry for them.
ADMIN_PRIVY_USER_IDS=
```

- [x] **Step 14: Verify and commit**

Run: `cd /Users/sainathr19/Desktop/unit/mercury && pnpm check`

```bash
git add services/api/src/admin services/api/src/routes/admin.ts services/api/src/routes/admin.test.ts services/api/src/deps.ts services/api/src/app.ts services/api/src/index.ts services/api/.env.example
git commit -m "feat(api): an admin surface, unmounted unless an allowlist says otherwise"
```

---

### Task 2: Indexes for the aggregate queries

Before the queries, so no query is ever merged without the index it needs.

**Files:**

- Create: `services/api/drizzle/0021_admin_indexes.sql`
- Modify: `services/api/src/db/schema.ts` (declare the indexes)
- Create: `services/api/src/admin/indexes.test.ts`

- [x] **Step 1: Establish why**

The existing indexes are all user-first and useless to a dashboard:

| Index                             | Columns                      | Answers              | Does not answer                |
| --------------------------------- | ---------------------------- | -------------------- | ------------------------------ |
| `order_user_created_idx`          | `(user_id, created_at)`      | this user's orders   | every order last Tuesday       |
| `activity_user_occurred_idx`      | `(user_id, occurred_at, id)` | this user's feed     | activity by kind over a range  |
| `funding_intent_user_created_idx` | `(user_id, created_at)`      | this user's deposits | deposits by chain over a range |

A leading `user_id` cannot serve a query that does not filter on it, so every admin aggregate would be a sequential scan over a table that live traffic is writing to.

- [x] **Step 2: Declare the indexes in the schema**

Add to the index arrays in `services/api/src/db/schema.ts`:

```ts
// orders
    index("order_created_status_idx").on(t.createdAt, t.status),
// activities
    index("activity_occurred_kind_idx").on(t.occurredAt, t.kind),
// fundingIntents
    index("funding_intent_created_chain_idx").on(t.createdAt, t.originChainName, t.status),
// portfolioSnapshots — the latest reading per user, which the overview needs
    index("portfolio_snapshot_captured_idx").on(t.capturedAt),
```

Keep each one inside the table it belongs to, with a comment saying which admin query it serves.

- [x] **Step 3: Generate the migration**

Run: `cd services/api && pnpm drizzle-kit generate --name admin_indexes`

Read the generated SQL before committing it. If it contains anything other than `CREATE INDEX` statements, the schema edit was wider than intended — revert and redo it.

Then make each statement concurrent-safe by hand, because these tables are serving traffic:

```sql
CREATE INDEX IF NOT EXISTS "order_created_status_idx" ON "order" ("created_at","status");
```

Do **not** use `CONCURRENTLY`: `applyMigrations` runs inside a transaction and `CREATE INDEX CONCURRENTLY` cannot. At current table sizes a plain `CREATE INDEX` is milliseconds; revisit if a table passes a few million rows.

- [x] **Step 4: Write the test**

`services/api/src/admin/indexes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "../db/testing.js";

describe("the indexes the admin queries need", () => {
  it.each([
    ["order", "order_created_status_idx"],
    ["activity", "activity_occurred_kind_idx"],
    ["funding_intent", "funding_intent_created_chain_idx"],
    ["portfolio_snapshot", "portfolio_snapshot_captured_idx"],
  ])("exists on %s after the migrations run", async (table, name) => {
    /* Declared in schema.ts and created by a migration are two different
       things, and only the second one makes a query fast. This asserts the
       migration, by reading the catalog of a real Postgres. */
    const db = await testDb();

    const rows = await db.execute(
      sql`select indexname from pg_indexes where tablename = ${table} and indexname = ${name}`,
    );

    expect((rows as unknown as readonly unknown[]).length).toBe(1);
  });
});
```

- [x] **Step 5: Run it**

Run: `cd services/api && pnpm vitest run src/admin/indexes.test.ts`
Expected: PASS, 4 tests. A failure here means the migration was not generated or not applied.

- [x] **Step 6: Commit**

Run: `cd /Users/sainathr19/Desktop/unit/mercury && pnpm check`

```bash
git add services/api/drizzle services/api/src/db/schema.ts services/api/src/admin/indexes.test.ts
git commit -m "feat(api): indexes for the admin aggregates, which are all time-first"
```

---

### Task 3: The range, and a statement timeout

**Files:**

- Create: `services/api/src/admin/range.ts`
- Create: `services/api/src/admin/range.test.ts`

**Interfaces:**

- Produces: `rangeSchema` (Zod), `type Range = { from: Date; to: Date; days: number }`, `parseRange(query: Record<string, string | undefined>): Range`, `ADMIN_STATEMENT_TIMEOUT_MS`.

- [x] **Step 1: Write the failing test**

`services/api/src/admin/range.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRange, MAX_RANGE_DAYS } from "./range.js";

describe("parseRange", () => {
  it("defaults to the last thirty days", () => {
    const r = parseRange({});

    expect(r.days).toBe(30);
    expect(r.to.getTime() - r.from.getTime()).toBeCloseTo(30 * 86_400_000, -4);
  });

  it("reads an explicit range", () => {
    const r = parseRange({ from: "2026-09-01", to: "2026-09-08" });

    expect(r.from.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(r.days).toBe(7);
  });

  it("refuses a range longer than the cap", () => {
    /* These are aggregates over tables that live traffic is writing to. An
       unbounded range typed into a URL is how a dashboard takes down the API
       people are trading on. */
    expect(() => parseRange({ from: "2020-01-01", to: "2026-01-01" })).toThrow(/range/i);
  });

  it("refuses a range that runs backwards", () => {
    expect(() => parseRange({ from: "2026-09-08", to: "2026-09-01" })).toThrow();
  });

  it("refuses something that is not a date", () => {
    expect(() => parseRange({ from: "yesterday" })).toThrow();
    expect(() => parseRange({ from: '\'; drop table "order"; --' })).toThrow();
  });

  it("caps at a round number a person can reason about", () => {
    expect(MAX_RANGE_DAYS).toBe(366);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `cd services/api && pnpm vitest run src/admin/range.test.ts`
Expected: FAIL — cannot resolve `./range.js`.

- [x] **Step 3: Write it**

`services/api/src/admin/range.ts`:

```ts
/**
 * The window every admin query runs over, validated before it reaches SQL.
 *
 * Capped, because these are aggregates over the tables that serve live
 * traffic. A date range is the one parameter a person types by hand, and "all
 * time" typed into a URL is how an internal dashboard takes down the API that
 * people are trading on.
 *
 * Zod at the boundary, as everywhere else in this service: inside, the dates
 * are Dates and nothing has to be checked again.
 */
import { z } from "zod";

/** A year and a day, which covers "the last year" without inviting "forever". */
export const MAX_RANGE_DAYS = 366;

/** Belt and braces beside the cap: a bad plan cannot outlast this. */
export const ADMIN_STATEMENT_TIMEOUT_MS = 10_000;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD.");

export const rangeSchema = z.object({ from: day.optional(), to: day.optional() });

export interface Range {
  readonly from: Date;
  readonly to: Date;
  readonly days: number;
}

export const parseRange = (query: Readonly<Record<string, string | undefined>>): Range => {
  const { from, to } = rangeSchema.parse(query);
  const end = to === undefined ? new Date() : new Date(`${to}T00:00:00Z`);
  const start =
    from === undefined ? new Date(end.getTime() - 30 * 86_400_000) : new Date(`${from}T00:00:00Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error("Not a date.");
  if (start >= end) throw new Error("The range runs backwards.");

  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (days > MAX_RANGE_DAYS) throw new Error(`That range is longer than ${MAX_RANGE_DAYS} days.`);

  return { from: start, to: end, days };
};
```

- [x] **Step 4: Run the test to verify it passes**

Run: `cd services/api && pnpm vitest run src/admin/range.test.ts`
Expected: PASS, 6 tests.

- [x] **Step 5: Apply the timeout and the range in the routes**

In `services/api/src/routes/admin.ts`, add a middleware above the route handlers that sets the timeout for the connection this request uses, and a small helper that turns a thrown range error into a 400 rather than a 500:

```ts
/*
 * A statement timeout for admin queries only.
 *
 * `set local` so it applies to this transaction and never leaks to the
 * request after it. Beside the range cap rather than instead of it: the cap
 * stops the obvious mistake, this stops the one nobody predicted.
 */
```

Read the file as it stands after Task 1 and keep the shape. A range error answers
`400 { error: { code: "bad_range", message } }` — the message is for an engineer
reading their own dashboard, so it may name the cap.

- [x] **Step 6: Commit**

Run: `cd /Users/sainathr19/Desktop/unit/mercury && pnpm check`

```bash
git add services/api/src/admin/range.ts services/api/src/admin/range.test.ts services/api/src/routes/admin.ts
git commit -m "feat(api): a capped date range and a statement timeout for admin reads"
```

---

### Task 4: Overview, orders, funding and baskets

One task because the four are the same shape — a query function, a route, and a test over seeded fixtures — and splitting them would be four rounds of the same review.

**Files:**

- Create: `services/api/src/admin/overview.ts`, `orders.ts`, `funding.ts`, `baskets.ts`
- Create: `services/api/src/admin/overview.test.ts`, `orders.test.ts`, `funding.test.ts`, `baskets.test.ts`
- Create: `services/api/src/admin/fixtures.ts`
- Modify: `services/api/src/routes/admin.ts`

**Interfaces:**

- Consumes: `Range` from Task 3, `Db`.
- Produces, each taking `(db: Db, range: Range)`:
  - `overview` → `{ users: number; newUsers: { day: string; count: number }[]; walletsByKind: { kind: string; count: number }[]; funded: number; traded: number; aumUsd: string }`
  - `orderStats` → `{ byDay: { day: string; buys: number; sells: number; volumeUsd: string; feesUsd: string; realisedPnlUsd: string }[]; byStatus: { status: string; count: number }[]; topTickers: { ticker: string; count: number; volumeUsd: string }[] }`
  - `fundingStats` → `{ byChain: { chain: string; day: string; status: string; count: number }[]; settleSeconds: { chain: string; p50: number }[]; failures: { reason: string; count: number }[] }`
  - `basketStats` → `{ byKind: { kind: string; count: number }[]; byState: { state: string; count: number }[]; stuck: number }`

- [x] **Step 1: Write the fixtures**

`services/api/src/admin/fixtures.ts` — a `seedAdminFixtures(db: Db)` that inserts, with fixed dates so assertions are exact: three users (one with no activity), wallets of both kinds, four orders across two tickers and both sides including one `refused`, three `funding_intent` rows from two chains with one `failed` carrying a `fail_reason`, two `portfolio_snapshot` rows per user at different hours, and two `basket_action` rows.

Return the ids it created so each test can assert against known values rather than re-querying.

- [x] **Step 2: Write the failing tests**

Four files, each against `testDb()` plus `seedAdminFixtures`. The cases that matter, one per behaviour:

`funding.test.ts` is the one the user actually asked for, so write it first and fullest:

```ts
import { describe, expect, it } from "vitest";
import { testDb } from "../db/testing.js";
import { seedAdminFixtures } from "./fixtures.js";
import { fundingStats } from "./funding.js";
import { parseRange } from "./range.js";

describe("fundingStats", () => {
  it("groups deposits by the chain they came from", async () => {
    /* This is the question: which chains is money arriving from, and is that
       changing. `funding_intent` has stored `origin_chain_name` since ADR 0014
       precisely so the answer does not depend on what Relay calls a chain
       today. */
    const db = await testDb();
    await seedAdminFixtures(db);

    const stats = await fundingStats(db, parseRange({ from: "2026-09-01", to: "2026-10-01" }));

    expect(stats.byChain.map((r) => r.chain)).toEqual(expect.arrayContaining(["Base", "Arbitrum"]));
  });

  it("counts each status separately, so a failure rate is readable", async () => {
    const db = await testDb();
    await seedAdminFixtures(db);

    const stats = await fundingStats(db, parseRange({ from: "2026-09-01", to: "2026-10-01" }));

    expect(stats.byChain.some((r) => r.status === "failed")).toBe(true);
  });

  it("names why deposits failed", async () => {
    const db = await testDb();
    await seedAdminFixtures(db);

    const stats = await fundingStats(db, parseRange({ from: "2026-09-01", to: "2026-10-01" }));

    expect(stats.failures[0]?.reason).toBeTypeOf("string");
  });

  it("reports how long a deposit took to settle", async () => {
    /* updated_at - created_at, which is the only latency this system records
       for the cross-chain path. */
    const db = await testDb();
    await seedAdminFixtures(db);

    const stats = await fundingStats(db, parseRange({ from: "2026-09-01", to: "2026-10-01" }));

    expect(stats.settleSeconds[0]?.p50).toBeGreaterThan(0);
  });

  it("excludes rows outside the range", async () => {
    const db = await testDb();
    await seedAdminFixtures(db);

    const stats = await fundingStats(db, parseRange({ from: "2020-01-01", to: "2020-02-01" }));

    expect(stats.byChain).toEqual([]);
  });

  it("returns empty arrays rather than failing on an empty database", async () => {
    const db = await testDb();

    const stats = await fundingStats(db, parseRange({}));

    expect(stats).toEqual({ byChain: [], settleSeconds: [], failures: [] });
  });
});
```

`overview.test.ts`: counts users; counts only users with a `funding_intent` as funded and only users with a filled `order` as traded; sums AUM from the **latest** snapshot per user and not every snapshot (the bug this test exists to catch — two readings per user would double the assets under management); returns zeroes on an empty database.

`orders.test.ts`: separates buys from sells; sums `fee_usd` and `realised_pnl_usd` as exact decimal strings and never floats (money is `usd()` in this schema for a reason); counts `refused` under `byStatus` and excludes it from volume; orders `topTickers` by volume.

`baskets.test.ts`: groups by `kind` and by `reconciliation_state`; counts as stuck anything whose `reconcile_after` has passed and whose state is not terminal.

- [x] **Step 3: Run them to verify they fail**

Run: `cd services/api && pnpm vitest run src/admin`
Expected: FAIL on the four new files.

- [x] **Step 4: Write the four query modules**

Drizzle's query builder where it reads clearly; `sql` template for the window functions that `overview`'s latest-snapshot-per-user needs. Money is summed in SQL as `numeric` and returned as a string — never through a JavaScript number.

Each module gets a doc comment saying which question it answers and which index it relies on.

- [x] **Step 5: Run them to verify they pass**

Run: `cd services/api && pnpm vitest run src/admin`
Expected: all green.

- [x] **Step 6: Mutation-test the AUM query**

Change `overview`'s latest-snapshot-per-user to sum every snapshot instead. The AUM test must fail. Restore it. This is the assertion most likely to be silently wrong and the one whose wrongness would be quoted in a meeting.

- [x] **Step 7: Add the routes**

Four GETs in `services/api/src/routes/admin.ts`, each parsing the range and calling its query. No new middleware.

- [x] **Step 8: Record the query plans**

For each of the four, run `EXPLAIN ANALYZE` against a database with realistic row counts and paste the output into the pull request body. An aggregate that sequentially scans `order` is not ready to merge, whatever the test says.

- [x] **Step 9: Verify and commit**

Run: `cd /Users/sainathr19/Desktop/unit/mercury && pnpm check`

```bash
git add services/api/src/admin services/api/src/routes/admin.ts
git commit -m "feat(api): admin aggregates for users, orders, funding and baskets"
```

---

### Task 5: The web surface

**Files:**

- Create: `apps/web/src/app/admin/Admin.tsx`, `panels.tsx`, `useAdmin.ts`, `format.ts`, `format.test.ts`
- Create: `apps/web/src/app/admin/bundle.test.ts`
- Modify: `apps/web/src/App.tsx` (one lazy route)
- Modify: `apps/web/src/app/AccountMenu.tsx` (the entry)

- [x] **Step 1: Write the bundle guard first**

`apps/web/src/app/admin/bundle.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Nothing in the eager graph may import the admin surface.
 *
 * It is a page three people will ever open, and its charts are the heaviest
 * thing on it. The main chunk is already 2.5 MB; a chart library pulled in
 * here is paid for by every user who never sees this page. The same mistake
 * shipped 806 lines of sample fixtures to production once already, and it was
 * invisible until somebody grepped the built bundle.
 *
 * App.tsx is the boundary: every route there is lazy, and this asserts that
 * the admin one stays that way.
 */
const app = readFileSync(fileURLToPath(new URL("../../App.tsx", import.meta.url)), "utf8");

describe("the admin route", () => {
  it("is loaded lazily, like every other route", () => {
    expect(app).toMatch(/const Admin = lazy\(\(\) => import\("\.\/app\/admin\/Admin"\)/);
  });

  it("is never imported eagerly", () => {
    const eager = [...app.matchAll(/^import .*from "(\.\/app\/[^"]+)"/gm)].map((m) => m[1]!);

    expect(eager.filter((path) => path.includes("admin"))).toEqual([]);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `cd apps/web && pnpm vitest run src/app/admin/bundle.test.ts`
Expected: FAIL — no `Admin` lazy import in `App.tsx` yet.

- [x] **Step 3: Write the formatting helpers and their tests**

`format.ts` holds the pure functions — a percentage from a count pair, a day label, a compact USD figure — and `format.test.ts` covers them, following `fund-reserve.test.ts`'s shape. Pure functions over fixtures, no component rendering.

Reuse `usd()` from `app/Money.tsx` rather than writing a second money formatter. A dashboard that rounds differently from the product is a dashboard that starts arguments.

- [x] **Step 4: Write the data hooks**

`useAdmin.ts` — TanStack Query hooks against the five routes, following the existing `api/` hook conventions. `useAdminAccess()` queries `/v1/admin/overview` and reports `granted` only on a 200; a 404 is the expected answer for everybody else and must not surface as an error toast.

- [x] **Step 5: Write the page**

`Admin.tsx` with five sections, in the order somebody actually reads them:

1. **Health** — the three row ages from `/v1/admin/health`, with the snapshot age first and called out when it exceeds ninety minutes
2. **People** — users, new users by day, wallets by kind, funded and traded counts
3. **Money in** — the chain-trend chart: deposits by `origin_chain_name` over time, settle times, and the failure reasons
4. **Trading** — volume, fees, realised P&L by day; fill rate by status; the busiest tickers
5. **Baskets** — by kind and state, and anything stuck

Charts reuse `ValueChart`, `Sparkline` and `DotChart` before any new dependency. If none fits a grouped time series, a plain table is a better answer than a new 90 kB import.

- [x] **Step 6: Add the route and the entry**

In `App.tsx`:

```ts
const Admin = lazy(() => import("./app/admin/Admin").then((m) => ({ default: m.Admin })));
```

and a `<Route path="/admin" …>` inside the existing authenticated `Suspense`, matching how `/portfolio` is wired.

In `AccountMenu.tsx`, render the Admin link only when `useAdminAccess().granted` — which comes from the API answering 200, never from a client-side flag anybody can flip in a console.

- [x] **Step 7: Run the guard and the tests**

Run: `cd apps/web && pnpm vitest run src/app/admin`
Expected: PASS.

- [x] **Step 8: Prove the bundle did not grow**

```bash
cd apps/web && pnpm build
```

Compare the main chunk's size against the figure before this task (2,565,157 bytes on 15 October 2026) and grep the eager chunks for an admin-only string:

```bash
grep -rl "Money in" dist/assets/ | head
```

It must appear only in the lazy admin chunk. If it is in the main chunk the route is not actually split, and the guard in step 1 passed on the shape of `App.tsx` while something else imported the page.

- [x] **Step 9: Verify and commit**

Run: `cd /Users/sainathr19/Desktop/unit/mercury && pnpm check`

```bash
git add apps/web/src/app/admin apps/web/src/App.tsx apps/web/src/app/AccountMenu.tsx
git commit -m "feat(web): an admin dashboard, behind a lazy route and a 200"
```

---

## Self-review

**Spec coverage.** B1 → Task 1. B2 → Tasks 1 and 4. B3 → Tasks 2 and 3. B4 → Task 5. Part B is fully covered.

**Ordering.** Authorisation (Task 1) precedes every query, so no query is ever reachable before the gate exists. Indexes (Task 2) precede the queries that need them. The bundle guard (Task 5 step 1) is written before the page it guards.

**Type consistency.** `Range` is produced in Task 3 and consumed by all four query functions in Task 4 — `parseRange` is used in Task 4's tests, which is why Task 3 comes first. `AdminDeps` is declared in Task 1 and extended in Tasks 3 and 4 without changing its shape. `Config.adminPrivyUserIds` is `readonly string[] | undefined` throughout, and the `exactOptionalPropertyTypes` spread idiom is spelled out in Task 1 step 10 rather than left to be rediscovered.

**One deliberate gap.** Task 4 step 8 asks for `EXPLAIN ANALYZE` against realistic row counts, which PGlite fixtures cannot provide — the test database has single-digit rows and will index-scan anything. That step needs a dump of production-scale data or a generated one; whoever runs it should say which they used.

---

## As built

All five tasks landed on `feat/admin-dashboard`. Seven things in the plan turned
out to be wrong when measured, and the code departs from it in each case. They
are recorded here because each one would otherwise read as an unexplained
difference between the plan and the branch.

**The migration is 0023, not 0021.** Main took 0021 and 0022 while this plan sat
unexecuted.

**`adminRoutes` takes query functions, not a `Db`.** The plan's interface said
`{ db, admins }`, which contradicts the plan's own global constraint that the
admin module is "given no write path — no writes in scope at all": a `Db`
carries `insert`, `update` and `delete`. `deps.ts` already documents the
closure convention for every other route module. It also drops the
authorisation tests to 7ms with no database.

**`freshness` uses typed selects, not `db.execute` of subqueries.** The two
drivers disagree about what `db.execute` returns — postgres.js answers the rows
array, PGlite answers `{ rows, fields, command, affectedRows, rowCount }` — so
`result[0]` is a row in production and `undefined` under test. It also skips
drizzle's column mappers, and PGlite reads a timestamp back as
`"2026-10-15 16:51:03.627+05"`, which is not ISO. Mutation-tested: the plan's
version returns null for a snapshot that exists while its own
empty-database test stays green. Every computed value in the four aggregates is
cast to `text` in SQL for the same reason.

**The migration keeps `IF NOT EXISTS` out.** The plan asked for it by hand, on
the grounds of making the statements "concurrent-safe". It is about idempotency,
not concurrency, and it guards nothing here: `db/migrate.ts` takes an advisory
lock and drizzle tracks applied migrations. 13 of the 16 `CREATE INDEX`
statements already in `drizzle/` omit it. The plan was right that `CONCURRENTLY`
is unavailable — `pg-core/dialect.js` runs every migration inside
`session.transaction`.

**The date range validates the calendar, not just the shape.** `new Date` does
not fail on a date that does not exist, it rolls over: `2026-02-30` is 2 March,
and `2026-02-29` is 1 March because 2026 is not a leap year. A range typed as
February would have reported March under February's heading.

**The statement timeout is inside each query's transaction, not in middleware.**
`SET LOCAL` outside a transaction block does nothing: after issuing it, `show
statement_timeout` still answers `0`. Inside one it answers `10s` and reverts to
`0` on commit, which is also what keeps it off the next request on a pooled
connection. `SET` takes no bind parameters either, so the value is `sql.raw`
behind an integer guard.

**The range is parsed in the handler, not thrown across the framework.** A
`try`/`catch` around `await next()` can never fire — Hono's `compose` catches a
handler's throw in the frame that called it and answers through `onError`
without rethrowing. `onError` would have worked and been worse: `app.ts` logs
everything it sees as `request failed` at error level, so every mistyped date
would land in the error stream.

Decisions the plan left open, each documented in the module that makes it:
`overview`'s funnel is lifetime rather than the range, and counts a _settled_
deposit as funded; `orderStats.byDay` reads filled orders only while `byStatus`
reads every status, and reports `feesUsd` and `revenueUsd` separately because
one transfer carries the network cost and Mercury's fee together;
`basketStats.stuck` is lifetime, because an action that jammed two months ago is
still jammed.

Added beyond the plan: `money.ts` (a decimal string helper, so no sum passes
through a float), `privacy.test.ts` (no payload carries a seeded email, wallet
address, DID or user id, asserted over the whole serialised response), and the
indexes test asserts each index's _leading column_ — reversing
`order_created_status_idx` to `(status, created_at)` still creates an index of
that name and still passes a name check.

**Still outstanding: Task 4 step 8.** `EXPLAIN ANALYZE` against realistic row
counts, which the plan's own self-review already names as a gap PGlite cannot
fill. The test database has single-digit rows and will sequentially scan
regardless, so a plan captured there would be misleading rather than reassuring.
