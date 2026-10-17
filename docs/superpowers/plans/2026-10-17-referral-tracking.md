# Referral Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every user gets an invite link. A friend who signs up through it is recorded against the inviter once, pays a quarter less of Mercury's trading fee for 90 days, and counts as funded once they have put in $50 and traded. An Invite panel shows the link and the counts.

**Architecture:** A `referral` table (one row per invited friend, unique on the friend) and a nullable unique `user.referral_code`. Every number from the deck lives in one pure module, `services/api/src/referrals/rules.ts`; `referrals/store.ts` is the Postgres side; `routes/referrals.ts` serves `GET /v1/referrals` and `POST /v1/referrals/claim`. The discount reaches the fee through one `pricing(userId)` call that replaces the four `read.tradingFeeBps` reads in `app.ts`. On the web, `?ref=` is saved before React mounts and claimed by an effect once the person is signed in.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`), Hono, drizzle-orm 0.45 on Postgres (PGlite in tests), zod 3, decimal.js through `@mercury/core`, Vitest. Web: React, TanStack Query, react-router. Landing: Astro (static).

**Spec:** _How Mercury makes money_ (internal deck, 14 October 2026), section 04, and `docs/revenue-todo.md` §3. The deck cites `docs/13-fees-and-referrals.md`, which does not exist, so the rules are copied below and this plan carries them.

**Followed by:** `docs/superpowers/plans/2026-10-17-referral-rewards.md`. That plan covers the inviter's share, the hold, the clawback and the weekly payout. It needs this plan's tables, and it waits on the lawyer.

## The rules, from the deck

- The friend gets 25% off fees for 90 days. The inviter gets 25% of Mercury's net fee from that friend for 12 months, in USDC, weekly. No fee, no reward.
- Inviter tiers by funded friends: 0–9 → 25%, 10–49 → 30%, 50+ → 35%. The founding 500 start at 30%.
- A friend counts once they fund $50+ and trade once. One inviter, set once. No self-referral. 7-day hold; quick round trips clawed back. Weekly USDC payout, $1 minimum.

This plan builds everything except money moving to the inviter: attribution, the friend's discount, qualification, the tier (computed, not yet shown), and the Invite panel.

## Global Constraints

- "Fees" in "25% off fees" means **Mercury's trading fee only**: the `mercury` part of `tradeCharge`. The network cost is charged at cost and is never discounted.
- The 90 days run from the moment the referral is recorded (`referral.created_at`), not from the friend's first trade.
- A friend is **funded** (`referral.qualified_at` set) when they have at least one `filled` order and at least **$50** of USDC `transfer_in` into their own wallet. Money that came from the inviter's own wallet does not count, and neither does a referral payout.
- One inviter per friend, set once: a unique index on `referral.friend_id`. Never the friend themself: a CHECK constraint, and a check in the route.
- A code can be claimed only by an account **under 7 days old that has no filled order**. Past that, the link did not bring them.
- Codes match exactly and are case-sensitive. Every code matches `^[A-Za-z0-9_-]{6,16}$`. Waitlist slugs are 12-character `base64url` strings, and each stays the code of whoever holds that waitlist email.
- Never a float for money: `numeric(38,18)` columns through `usd()`, `D()` from `@mercury/core` in code, and decimal strings on the wire.
- A rate is never rounded to one we did not charge. 37.5 bps reads "0.375%".
- **No copy in this plan promises the inviter money.** The Invite panel names the friend's discount. The inviter's share reaches the screen with the rewards plan, after the lawyer answers `docs/revenue-todo.md`'s "Can we pay inviters a share of stock-trading fees in our launch markets?"
- `vitest` does not typecheck. Before every commit, run the package's `typecheck` and `test`.
- Conventional commits (`feat` / `fix` / `refactor` / `chore` / `docs`).

## Facts established by reading the repo (do not re-derive)

- **Users.** `services/api/src/db/schema.ts:30–49` defines table `"user"`, with `email` nullable. The email is re-synced from Privy on every request (`auth/identity.ts:137`). A user row is created lazily by the first authenticated `/v1/*` request (`identity.ts:84–88`). There is **no first-sign-in hook**, so claiming a code is its own call.
- **Waitlist.** The table is kept (`schema.ts:494–533`). `email` is lower-cased, `position` is a serial (≤ 500 is founding), and `slug` came from `randomBytes(9).toString("base64url")`.
- **Founding links.** The old `/f/:slug` sent people to `trymercury.xyz/?ref=<slug>` (archived `waitlist/share.ts:72`, commit `a52ad7ba`). Today `app.ts:162` 301s to `https://trymercury.xyz` and drops the slug, and `app.test.ts:343` pins that.
- **The fee.** `tradeCharge(network, worthUsd, bps)` is in `relay/fee.ts:109` and floors Mercury's part to the cent. `read.tradingFeeBps` is read at `app.ts:269` (sell quote), `:296` (buy quote), `:456` (buy execute) and `:587` (sell execute). The user's id is in scope at all four. `chargeToWire` is at `app.ts:80`. Jupiter takes no cut: the fee rides in our own USDC transfer (`docs/revenue-todo.md` §1).
- **Orders.** `mercury_fee_usd` is written at execute (`app.ts:638`), and `status = 'filled'` by `orders/settle.ts:97`. The minimal insert for a test is `{ userId, instrumentId, side, usdAmount, decision, status }` on top of an instrument `{ ticker, name, sector }` (`orders/settle.test.ts:15–40`).
- **Money in.** USDC arriving in a wallet becomes an `activity` row with `kind = 'transfer_in'`, `mint = USDC_MINT`, `amount_usd` read from the chain and `basket_portfolio_id` null (`wallet-events/movements.ts:170–198`). There is no counterparty column. A transfer between two Mercury users writes a row for each, with the same `tx_signature`.
- **Jobs.** `every(name, ms, run)` is in `jobs/every.ts:60` and is registered in `index.ts`. It runs on boot and then every `ms`. `run` returns a string to log, or null to stay quiet. The API is one process by design.
- **API tests.** `testDb()` (`db/testing.ts`) is PGlite with the real migrations. Route tests mount the route on a bare Hono behind a middleware that sets `identity` (`routes/activity.test.ts:25`). The whole-app harness is `app.test.ts:79–193`. Run one file with `pnpm --filter @mercury/api exec vitest run <path>`.
- **Migrations.** Generate with `cd services/api && DATABASE_URL="postgres://unused" pnpm drizzle-kit generate --name <name>`. The last one is `0023_admin_indexes`.
- **Shared types.** `packages/types` exports zod schemas (`Usd`, `Ratio`, `Iso` in `src/primitives.ts`) and is re-exported from `src/index.ts`.
- **Web API.** `apiFetch` (`apps/web/src/api/client.ts:32`) sets `Content-Type: application/json` and throws `ApiError(status, code, message, details)`. Hooks use `["api", <resource>]` keys and `enabled: useSignedIn()`. Sample mode answers routes in `dev/sample.ts:819` (`sampleResponse`). Web vitest runs in node, with no `localStorage`, so storage is passed in.
- **Web UI.** Panels are query keys (`app/Panels.tsx:10`). The account menu holds Support and Sign out (`app/AccountMenu.tsx:197–218`). The copy and share buttons are `app/Receive.tsx:65–130`. `SidePanel` and `PanelHeader` are in `ui/Dialog.tsx`. `Skeleton` is in `app/portfolio/ui.tsx:132`. `Users` is an icon in `ui/icons.tsx`.
- **Landing.** Every CTA points at `site.app` (`apps/landing/src/config/site.ts:10`, `https://beta.trymercury.xyz`). The pages are static, and inline scripts are already in use (`components/Reveal.astro`). The root layout is `src/layouts/Base.astro`.

---

### Task 1: The tables

**Files:**
- Modify: `services/api/src/db/schema.ts` (the `users` table, the `drizzle-orm/pg-core` import, a new `referrals` table after `waitlist`)
- Create: `services/api/drizzle/0024_referral.sql` and its `meta/` snapshot (generated)
- Test: `services/api/src/referrals/schema.test.ts`

**Interfaces:**
- Produces: `users.referralCode` (`text`, unique, nullable); `referrals` (`id`, `inviterId`, `friendId`, `code`, `createdAt`, `qualifiedAt`); `type Referral`.

- [ ] **Step 1: Write the failing test**

```ts
// services/api/src/referrals/schema.test.ts
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { testDb } from "../db/testing.js";
import { referrals, users } from "../db/schema.js";

type Db = Awaited<ReturnType<typeof testDb>>;
const user = async (db: Db, n: number) =>
  (await db.insert(users).values({ privyUserId: `did:privy:${n}` }).returning())[0]!;

describe("referral table", () => {
  it("keeps one inviter per friend", async () => {
    const db = await testDb();
    const [a, b, friend] = [await user(db, 1), await user(db, 2), await user(db, 3)];
    await db.insert(referrals).values({ inviterId: a.id, friendId: friend.id, code: "abcdefgh" });
    await expect(
      db.insert(referrals).values({ inviterId: b.id, friendId: friend.id, code: "bcdefghj" }),
    ).rejects.toThrow();
  });

  it("refuses a referral of yourself", async () => {
    const db = await testDb();
    const a = await user(db, 1);
    await expect(db.insert(referrals).values({ inviterId: a.id, friendId: a.id, code: "abcdefgh" })).rejects.toThrow();
  });

  it("gives a code to one user only", async () => {
    const db = await testDb();
    const [a, b] = [await user(db, 1), await user(db, 2)];
    await db.update(users).set({ referralCode: "abcdefgh" }).where(eq(users.id, a.id));
    await expect(db.update(users).set({ referralCode: "abcdefgh" }).where(eq(users.id, b.id))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/schema.test.ts`
Expected: FAIL. `referrals` is not exported from `../db/schema.js`.

- [ ] **Step 3: Add the column and the table**

Add `check` to the `drizzle-orm/pg-core` import at the top of `schema.ts`, and add `import { sql } from "drizzle-orm";` under it.

In the `users` table, add this column after `displayCurrency`:

```ts
    /**
     * What this person's invite link carries. Null until they first open the
     * Invite panel. A waitlist member gets their old card's slug, so the
     * links they posted on X keep working.
     */
    referralCode: text("referral_code"),
```

and add this to the table's index array, beside `user_privy_user_id_idx`:

```ts
    uniqueIndex("user_referral_code_idx").on(t.referralCode),
```

Postgres lets a unique index hold any number of NULLs, so users who have never asked for a code do not collide.

After the `waitlist` table, add:

```ts
/**
 * Who invited whom. One row per invited friend, written once.
 *
 * `qualified_at` is when the friend first counted as funded — $50 in and one
 * filled trade — which is what the inviter's tier counts. The discount the
 * friend gets runs 90 days from `created_at`.
 */
export const referrals = pgTable(
  "referral",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    friendId: uuid("friend_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The code as claimed, kept because a code can be a waitlist slug and that history is worth having. */
    code: text("code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
  },
  (t) => [
    /* One inviter, set once. */
    uniqueIndex("referral_friend_idx").on(t.friendId),
    /* The Invite panel's counts and the tier both read one inviter's rows. */
    index("referral_inviter_idx").on(t.inviterId, t.qualifiedAt),
    check("referral_not_self", sql`${t.inviterId} <> ${t.friendId}`),
  ],
);
export type Referral = typeof referrals.$inferSelect;
```

- [ ] **Step 4: Generate the migration**

Run: `cd services/api && DATABASE_URL="postgres://unused" pnpm drizzle-kit generate --name referral`
Expected: `drizzle/0024_referral.sql` is created, holding `CREATE TABLE "referral"`, `ALTER TABLE "user" ADD COLUMN "referral_code" text`, the `referral_not_self` CHECK, the two foreign keys and the three indexes. `drizzle/meta/_journal.json` gains entry `idx: 24`. Read the SQL. If anything else appears in it, the schema has drifted from the migrations, so stop and ask.

- [ ] **Step 5: Run the test to see it pass**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/schema.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Typecheck, test, commit**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api test
git add services/api/src/db/schema.ts services/api/drizzle services/api/src/referrals/schema.test.ts
git commit -m "feat(api): a referral table and a code per user"
```

---

### Task 2: The rules, as pure functions

**Files:**
- Create: `packages/types/src/referrals.ts`
- Modify: `packages/types/src/index.ts`
- Create: `services/api/src/referrals/rules.ts`
- Test: `services/api/src/referrals/rules.test.ts`

**Interfaces:**
- Produces (types): `ReferralCode` (zod string), `ClaimReferralRequest` (`{ code }`), `ReferralSummary` (`{ code, link, invited, funded, founding, share, discountUntil }`).
- Produces (rules): `FRIEND_DISCOUNT: Decimal` (0.25), `FRIEND_DISCOUNT_DAYS = 90`, `QUALIFYING_FUNDING_USD: Decimal` (50), `CLAIM_WINDOW_DAYS = 7`, `isCode(s: string): boolean`, `newCode(): string`, `discountActive(referredAt: Date, now: Date): boolean`, `discountEndsAt(referredAt: Date): Date`, `pricingFor(baseBps: number, referredAt: Date | null, now: Date): FeePricing`, `inviterShare(funded: number, founding: boolean): Decimal`, `interface FeePricing { bps: number; discount: { pct: number; until: Date } | null }`.

- [ ] **Step 1: Add the wire types**

```ts
// packages/types/src/referrals.ts
import { z } from "zod";
import { Iso, Ratio } from "./primitives.js";

/** Exact and case-sensitive: waitlist slugs are base64url, and those links are still out there. */
export const ReferralCode = z.string().regex(/^[A-Za-z0-9_-]{6,16}$/);

export const ClaimReferralRequest = z.object({ code: ReferralCode });

export const ReferralSummary = z.object({
  code: ReferralCode,
  /** The link to share. It lands on the site, which carries the code into the app. */
  link: z.string().url(),
  invited: z.number().int().nonnegative(),
  /** Invited friends who have put in $50 and traded once. */
  funded: z.number().int().nonnegative(),
  founding: z.boolean(),
  /** The inviter's share of Mercury's fee at today's tier, as a ratio: "0.25". */
  share: Ratio,
  /** When this person's own invited-friend discount ends, if they have one running. */
  discountUntil: Iso.nullable(),
});

export type ClaimReferralRequest = z.infer<typeof ClaimReferralRequest>;
export type ReferralSummary = z.infer<typeof ReferralSummary>;
```

Add `export * from "./referrals.js";` to `packages/types/src/index.ts`, after the `baskets` line.

- [ ] **Step 2: Write the failing tests**

```ts
// services/api/src/referrals/rules.test.ts
import { describe, expect, it } from "vitest";
import { discountActive, inviterShare, isCode, newCode, pricingFor } from "./rules.js";

const DAY = 86_400_000;
const at = new Date("2026-10-17T12:00:00Z");
const later = (ms: number) => new Date(at.getTime() + ms);

describe("the friend's discount", () => {
  it("takes a quarter off Mercury's rate", () => {
    expect(pricingFor(50, at, at)).toEqual({
      bps: 37.5,
      discount: { pct: 25, until: later(90 * DAY) },
    });
  });

  it("still applies in the last millisecond of day 90", () => {
    expect(discountActive(at, later(90 * DAY - 1))).toBe(true);
  });

  it("stops at 90 days", () => {
    expect(pricingFor(50, at, later(90 * DAY))).toEqual({ bps: 50, discount: null });
  });

  it("leaves someone nobody invited alone", () => {
    expect(pricingFor(50, null, at)).toEqual({ bps: 50, discount: null });
  });

  /* A quarter off nothing is nothing, and "25% off" next to a free trade says something false. */
  it("names no discount when there is no fee to discount", () => {
    expect(pricingFor(0, at, at)).toEqual({ bps: 0, discount: null });
  });
});

describe("the inviter's share", () => {
  it.each([
    [0, "0.25"],
    [9, "0.25"],
    [10, "0.3"],
    [49, "0.3"],
    [50, "0.35"],
  ])("is %s funded friends → %s", (funded, share) => {
    expect(inviterShare(funded, false).toString()).toBe(share);
  });

  it("starts a founding member at 30%", () => {
    expect(inviterShare(0, true).toString()).toBe("0.3");
  });

  it("still lifts a founding member to 35% at 50", () => {
    expect(inviterShare(50, true).toString()).toBe("0.35");
  });
});

describe("codes", () => {
  it("makes eight characters nobody misreads", () => {
    for (let i = 0; i < 50; i++) {
      const code = newCode();
      expect(code).toMatch(/^[a-hj-km-np-z2-9]{8}$/);
      expect(isCode(code)).toBe(true);
    }
  });

  it("accepts a waitlist slug", () => {
    expect(isCode("3kQ9xZ1bTq7w")).toBe(true);
  });

  it.each(["", "abc", "has space", "a".repeat(17), "../etc/pw"])("refuses %j", (code) => {
    expect(isCode(code)).toBe(false);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/rules.test.ts`
Expected: FAIL. Cannot find module `./rules.js`.

- [ ] **Step 4: Write the rules**

```ts
// services/api/src/referrals/rules.ts
import { randomInt } from "node:crypto";
import { D, Decimal } from "@mercury/core";
import { ReferralCode } from "@mercury/types";

/**
 * Every number in the referral programme, from section 04 of the revenue deck
 * (14 October 2026). Nothing else in the codebase writes one of these down.
 */
export const FRIEND_DISCOUNT = D("0.25");
export const FRIEND_DISCOUNT_DAYS = 90;
export const QUALIFYING_FUNDING_USD = D(50);
/** A code claimed later than this did not bring the person in. */
export const CLAIM_WINDOW_DAYS = 7;

const DAY = 86_400_000;

export const isCode = (s: string): boolean => ReferralCode.safeParse(s).success;

/* No i, l, o, 0 or 1: a code read aloud or copied by hand should survive it. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export const newCode = (): string =>
  Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

export const discountEndsAt = (referredAt: Date): Date =>
  new Date(referredAt.getTime() + FRIEND_DISCOUNT_DAYS * DAY);

export const discountActive = (referredAt: Date, now: Date): boolean =>
  now.getTime() < discountEndsAt(referredAt).getTime();

export interface FeePricing {
  /** Mercury's rate for this trade, in basis points. Not always whole: 37.5 is a quarter off 50. */
  readonly bps: number;
  /** Present only while an invited friend's discount runs, so the confirm screen can say why. */
  readonly discount: { readonly pct: number; readonly until: Date } | null;
}

/** Mercury's rate for one person at one moment. Only Mercury's fee is discounted, never the network's. */
export const pricingFor = (baseBps: number, referredAt: Date | null, now: Date): FeePricing =>
  referredAt === null || baseBps === 0 || !discountActive(referredAt, now)
    ? { bps: baseBps, discount: null }
    : {
        bps: D(baseBps).mul(D(1).sub(FRIEND_DISCOUNT)).toNumber(),
        discount: { pct: FRIEND_DISCOUNT.mul(100).toNumber(), until: discountEndsAt(referredAt) },
      };

/** 25% under ten funded friends, 30% from ten, 35% from fifty. The founding 500 never drop below 30%. */
export const inviterShare = (funded: number, founding: boolean): Decimal => {
  const byCount = funded >= 50 ? D("0.35") : funded >= 10 ? D("0.30") : D("0.25");
  return founding ? Decimal.max(byCount, D("0.30")) : byCount;
};
```

- [ ] **Step 5: Run them to see them pass**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/rules.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 6: Typecheck, test, commit**

```bash
pnpm --filter @mercury/types typecheck && pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api test
git add packages/types/src/referrals.ts packages/types/src/index.ts services/api/src/referrals/rules.ts services/api/src/referrals/rules.test.ts
git commit -m "feat(api): the referral rules, in one place"
```

---

### Task 3: Seed helpers, and a code per user

**Files:**
- Create: `services/api/src/referrals/testing.ts` (test seeding, shared with the rewards plan)
- Create: `services/api/src/referrals/store.ts`
- Test: `services/api/src/referrals/store.test.ts`

**Interfaces:**
- Consumes: `newCode` (Task 2); `users`, `waitlist` (schema).
- Produces: `interface ReferralStore { codeFor(userId: string): Promise<string>; isFounding(userId: string): Promise<boolean> }` and `createReferralStore(db: Db): ReferralStore`. Seed helpers: `seedUser(db, n, over?)`, `seedInstrument(db)`, `seedOrder(db, { userId, instrumentId, side, status, filledAt?, mercuryFeeUsd? })`, `seedUsdcIn(db, { userId, usd, signature, kind? })`.

- [ ] **Step 1: Write the seed helpers**

```ts
// services/api/src/referrals/testing.ts
import { USDC_MINT } from "@mercury/chain";
import type { Db } from "../db/client.js";
import { activities, instruments, orders, users, waitlist } from "../db/schema.js";

/** Rows for the referral tests. Only what each table requires, so a test says what it is about. */
export const seedUser = async (
  db: Db,
  n: number,
  over: { email?: string; createdAt?: Date; referralCode?: string } = {},
) => (await db.insert(users).values({ privyUserId: `did:privy:${n}`, ...over }).returning())[0]!;

export const seedWaitlist = async (db: Db, row: { email: string; slug: string; position: number }) =>
  db.insert(waitlist).values({ ...row, country: "GB" });

export const seedInstrument = async (db: Db, ticker = "NVDA") =>
  (await db.insert(instruments).values({ ticker, name: ticker, sector: "Technology" }).returning())[0]!;

export const seedOrder = async (
  db: Db,
  o: {
    userId: string;
    instrumentId: string;
    side: "buy" | "sell";
    status: "filled" | "executing";
    filledAt?: Date;
    mercuryFeeUsd?: string;
  },
) =>
  (
    await db
      .insert(orders)
      .values({ usdAmount: "100", decision: { kind: "execute" }, ...o })
      .returning()
  )[0]!;

/** USDC arriving in a wallet, as `wallet-events` writes it. */
export const seedUsdcIn = async (
  db: Db,
  a: { userId: string; usd: string; signature: string; kind?: "transfer_in" | "transfer_out"; refTable?: string },
) =>
  db.insert(activities).values({
    userId: a.userId,
    kind: a.kind ?? "transfer_in",
    title: "Added cash",
    amountUsd: a.usd,
    mint: USDC_MINT,
    txSignature: a.signature,
    ...(a.refTable === undefined ? {} : { refTable: a.refTable }),
  });
```

- [ ] **Step 2: Write the failing tests**

```ts
// services/api/src/referrals/store.test.ts
import { describe, expect, it } from "vitest";
import { testDb } from "../db/testing.js";
import { createReferralStore } from "./store.js";
import { seedUser, seedWaitlist } from "./testing.js";

describe("codeFor", () => {
  it("makes a code once and keeps it", async () => {
    const db = await testDb();
    const ada = await seedUser(db, 1);
    const store = createReferralStore(db);
    const first = await store.codeFor(ada.id);
    expect(first).toMatch(/^[a-hj-km-np-z2-9]{8}$/);
    expect(await store.codeFor(ada.id)).toBe(first);
  });

  /* Their founding card's link said ?ref=<slug>; it should still mean them. */
  it("gives a waitlist member their card's slug, whatever case Privy sends the email in", async () => {
    const db = await testDb();
    await seedWaitlist(db, { email: "ada@example.com", slug: "3kQ9xZ1bTq7w", position: 12 });
    const ada = await seedUser(db, 1, { email: "Ada@Example.com" });
    expect(await createReferralStore(db).codeFor(ada.id)).toBe("3kQ9xZ1bTq7w");
  });

  it("gives two people two codes", async () => {
    const db = await testDb();
    const store = createReferralStore(db);
    const [a, b] = [await seedUser(db, 1), await seedUser(db, 2)];
    expect(await store.codeFor(a.id)).not.toBe(await store.codeFor(b.id));
  });
});

describe("isFounding", () => {
  it("is the first 500 on the waitlist", async () => {
    const db = await testDb();
    await seedWaitlist(db, { email: "ada@example.com", slug: "3kQ9xZ1bTq7w", position: 500 });
    await seedWaitlist(db, { email: "bo@example.com", slug: "Zz9xZ1bTq7wQ", position: 501 });
    const store = createReferralStore(db);
    expect(await store.isFounding((await seedUser(db, 1, { email: "ada@example.com" })).id)).toBe(true);
    expect(await store.isFounding((await seedUser(db, 2, { email: "bo@example.com" })).id)).toBe(false);
    expect(await store.isFounding((await seedUser(db, 3)).id)).toBe(false);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/store.test.ts`
Expected: FAIL. Cannot find module `./store.js`.

- [ ] **Step 4: Write the store**

```ts
// services/api/src/referrals/store.ts
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { users, waitlist } from "../db/schema.js";
import { newCode } from "./rules.js";

/** The waitlist's founding cohort: the first 500 places. */
const FOUNDING = 500;

export interface ReferralStore {
  /** This person's code, made the first time anyone asks for it. */
  codeFor(userId: string): Promise<string>;
  /** Among the first 500 on the waitlist, matched by the email Privy gave us. */
  isFounding(userId: string): Promise<boolean>;
}

export const createReferralStore = (db: Db): ReferralStore => {
  const waitlistRow = async (userId: string) => {
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
    const email = u?.email?.toLowerCase();
    if (email === undefined) return null;
    const [row] = await db
      .select({ slug: waitlist.slug, position: waitlist.position })
      .from(waitlist)
      .where(eq(waitlist.email, email));
    return row ?? null;
  };

  const taken = async (code: string) =>
    (await db.select({ id: users.id }).from(users).where(eq(users.referralCode, code))).length > 0;

  const codeFor = async (userId: string): Promise<string> => {
    const [u] = await db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId));
    if (u === undefined) throw new Error(`referrals: no user ${userId}`);
    if (u.code !== null) return u.code;

    /*
     * Looked up before it is written, as the waitlist learnt to do. The
     * `isNull` guard makes two first visits at once agree: the second write
     * matches no row, and both read back whichever code landed.
     */
    const slug = (await waitlistRow(userId))?.slug;
    for (const candidate of [...(slug === undefined ? [] : [slug]), newCode(), newCode(), newCode()]) {
      if (await taken(candidate)) continue;
      await db
        .update(users)
        .set({ referralCode: candidate })
        .where(and(eq(users.id, userId), isNull(users.referralCode)));
      const [now] = await db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId));
      if (now?.code) return now.code;
    }
    throw new Error("referrals: no free code after four tries");
  };

  return {
    codeFor,
    isFounding: async (userId) => {
      const row = await waitlistRow(userId);
      return row !== null && row.position <= FOUNDING;
    },
  };
};
```

- [ ] **Step 5: Run them to see them pass**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/store.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Typecheck, test, commit**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api test
git add services/api/src/referrals/testing.ts services/api/src/referrals/store.ts services/api/src/referrals/store.test.ts
git commit -m "feat(api): a referral code per user, keeping waitlist slugs"
```

---

### Task 4: Claiming a code

**Files:**
- Modify: `services/api/src/referrals/store.ts`
- Test: `services/api/src/referrals/store.test.ts`

**Interfaces:**
- Consumes: `CLAIM_WINDOW_DAYS` (Task 2); seed helpers (Task 3).
- Produces: `type ClaimResult` and two new `ReferralStore` methods: `claim(friendId: string, code: string, now: Date): Promise<ClaimResult>` and `referredAt(userId: string): Promise<Date | null>`.

- [ ] **Step 1: Write the failing tests**

Append to `store.test.ts`, adding `seedInstrument, seedOrder` to the `./testing.js` import:

```ts
describe("claim", () => {
  const DAY = 86_400_000;
  const now = new Date("2026-10-17T12:00:00Z");
  const setup = async () => {
    const db = await testDb();
    const store = createReferralStore(db);
    const inviter = await seedUser(db, 1, { referralCode: "inviter1" });
    const friend = await seedUser(db, 2, { createdAt: new Date(now.getTime() - DAY) });
    return { db, store, inviter, friend };
  };

  it("records the inviter once", async () => {
    const { store, inviter, friend } = await setup();
    expect(await store.claim(friend.id, "inviter1", now)).toEqual({ kind: "claimed", inviterId: inviter.id });
    expect(await store.referredAt(friend.id)).toEqual(now);
  });

  /* The web retries a claim it never heard back from; the second answer must not be an error. */
  it("answers a repeat of the same claim calmly", async () => {
    const { store, inviter, friend } = await setup();
    await store.claim(friend.id, "inviter1", now);
    expect(await store.claim(friend.id, "inviter1", now)).toEqual({ kind: "already", inviterId: inviter.id });
  });

  it("keeps the first inviter when a second code arrives", async () => {
    const { db, store, friend } = await setup();
    await seedUser(db, 3, { referralCode: "inviter2" });
    await store.claim(friend.id, "inviter1", now);
    expect(await store.claim(friend.id, "inviter2", now)).toEqual({ kind: "taken" });
  });

  it("refuses your own code", async () => {
    const { store, inviter } = await setup();
    expect(await store.claim(inviter.id, "inviter1", now)).toEqual({ kind: "self" });
  });

  it("does not know a code nobody holds", async () => {
    const { store, friend } = await setup();
    expect(await store.claim(friend.id, "nobody00", now)).toEqual({ kind: "unknown_code" });
  });

  it("is too late for an account more than a week old", async () => {
    const { db, store } = await setup();
    const old = await seedUser(db, 4, { createdAt: new Date(now.getTime() - 8 * DAY) });
    expect(await store.claim(old.id, "inviter1", now)).toEqual({ kind: "too_late" });
  });

  it("is too late for someone who has already traded", async () => {
    const { db, store, friend } = await setup();
    const nvda = await seedInstrument(db);
    await seedOrder(db, { userId: friend.id, instrumentId: nvda.id, side: "buy", status: "filled" });
    expect(await store.claim(friend.id, "inviter1", now)).toEqual({ kind: "too_late" });
  });

  it("says nobody referred a person nobody referred", async () => {
    const { store, friend } = await setup();
    expect(await store.referredAt(friend.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/store.test.ts`
Expected: FAIL. `store.claim is not a function`.

- [ ] **Step 3: Add `claim` and `referredAt`**

In `store.ts`, change the imports to:

```ts
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { orders, referrals, users, waitlist } from "../db/schema.js";
import { CLAIM_WINDOW_DAYS, newCode } from "./rules.js";
```

Add the result type above the interface:

```ts
/** What a claim came to. Only `claimed` writes anything. */
export type ClaimResult =
  | { readonly kind: "claimed" | "already"; readonly inviterId: string }
  | { readonly kind: "unknown_code" | "self" | "taken" | "too_late" };
```

Add these two members to `interface ReferralStore`:

```ts
  /** Attach a code to a new account. Set once, never yourself, never late. */
  claim(friendId: string, code: string, now: Date): Promise<ClaimResult>;
  /** When this person was referred, or null if nobody did. The discount runs from here. */
  referredAt(userId: string): Promise<Date | null>;
```

Inside `createReferralStore`, before `return`, add:

```ts
  const DAY = 86_400_000;

  const existing = async (friendId: string) =>
    (await db.select().from(referrals).where(eq(referrals.friendId, friendId)))[0] ?? null;

  const claim = async (friendId: string, code: string, now: Date): Promise<ClaimResult> => {
    const [inviter] = await db.select({ id: users.id }).from(users).where(eq(users.referralCode, code));
    if (inviter === undefined) return { kind: "unknown_code" };
    if (inviter.id === friendId) return { kind: "self" };

    const prior = await existing(friendId);
    if (prior !== null) return prior.inviterId === inviter.id ? { kind: "already", inviterId: inviter.id } : { kind: "taken" };

    const [friend] = await db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, friendId));
    if (friend === undefined || now.getTime() - friend.createdAt.getTime() > CLAIM_WINDOW_DAYS * DAY) {
      return { kind: "too_late" };
    }
    const traded = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.userId, friendId), eq(orders.status, "filled")))
      .limit(1);
    if (traded.length > 0) return { kind: "too_late" };

    const written = await db
      .insert(referrals)
      .values({ inviterId: inviter.id, friendId, code, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: referrals.id });
    if (written.length === 1) return { kind: "claimed", inviterId: inviter.id };

    /* Two claims raced and the other one landed first: answer as if this were the repeat. */
    const won = await existing(friendId);
    return won?.inviterId === inviter.id ? { kind: "already", inviterId: inviter.id } : { kind: "taken" };
  };
```

and add `claim` and `referredAt` to the returned object:

```ts
  return {
    codeFor,
    isFounding: async (userId) => {
      const row = await waitlistRow(userId);
      return row !== null && row.position <= FOUNDING;
    },
    claim,
    referredAt: async (userId) => (await existing(userId))?.createdAt ?? null,
  };
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/store.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck, test, commit**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api test
git add services/api/src/referrals/store.ts services/api/src/referrals/store.test.ts
git commit -m "feat(api): claim an invite code, once, while the account is new"
```

---

### Task 5: Counting a friend as funded

**Files:**
- Modify: `services/api/src/referrals/store.ts`
- Test: `services/api/src/referrals/store.test.ts`
- Modify: `services/api/src/index.ts` (register the job, and add it to the job table in the comment)

**Interfaces:**
- Consumes: `QUALIFYING_FUNDING_USD` (Task 2); `seedUsdcIn`, `seedOrder` (Task 3).
- Produces: `ReferralStore.qualifyPending(now: Date): Promise<number>`, which sets `qualified_at` and returns how many rows changed. Also a job, `referral-qualify`, every 10 minutes.

- [ ] **Step 1: Write the failing tests**

Append to `store.test.ts`, adding `seedUsdcIn` to the `./testing.js` import and `import { referrals } from "../db/schema.js";` at the top:

```ts
describe("qualifyPending", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const setup = async () => {
    const db = await testDb();
    const store = createReferralStore(db);
    const inviter = await seedUser(db, 1, { referralCode: "inviter1" });
    const friend = await seedUser(db, 2);
    await store.claim(friend.id, "inviter1", now);
    const nvda = await seedInstrument(db);
    const trade = () => seedOrder(db, { userId: friend.id, instrumentId: nvda.id, side: "buy", status: "filled" });
    const qualifiedAt = async () => (await db.select().from(referrals))[0]!.qualifiedAt;
    return { db, store, inviter, friend, trade, qualifiedAt };
  };

  it("counts a friend once they have put in $50 and traded", async () => {
    const { db, store, friend, trade, qualifiedAt } = await setup();
    await seedUsdcIn(db, { userId: friend.id, usd: "30", signature: "sig-1" });
    await seedUsdcIn(db, { userId: friend.id, usd: "20", signature: "sig-2" });
    await trade();
    expect(await store.qualifyPending(now)).toBe(1);
    expect(await qualifiedAt()).toEqual(now);
  });

  it("waits for the trade", async () => {
    const { db, store, friend } = await setup();
    await seedUsdcIn(db, { userId: friend.id, usd: "500", signature: "sig-1" });
    expect(await store.qualifyPending(now)).toBe(0);
  });

  it("waits for the full $50", async () => {
    const { db, store, friend, trade } = await setup();
    await seedUsdcIn(db, { userId: friend.id, usd: "49.99", signature: "sig-1" });
    await trade();
    expect(await store.qualifyPending(now)).toBe(0);
  });

  /* Otherwise $50 passed around a ring of accounts would buy a tier. */
  it("does not count money the inviter sent them", async () => {
    const { db, store, inviter, friend, trade } = await setup();
    await seedUsdcIn(db, { userId: inviter.id, usd: "50", signature: "sig-gift", kind: "transfer_out" });
    await seedUsdcIn(db, { userId: friend.id, usd: "50", signature: "sig-gift" });
    await trade();
    expect(await store.qualifyPending(now)).toBe(0);
  });

  it("does not count a referral payout as funding", async () => {
    const { db, store, friend, trade } = await setup();
    await seedUsdcIn(db, { userId: friend.id, usd: "50", signature: "sig-1", refTable: "referral_payout" });
    await trade();
    expect(await store.qualifyPending(now)).toBe(0);
  });

  it("dates a friend from the first pass that counted them, not the latest", async () => {
    const { db, store, friend, trade, qualifiedAt } = await setup();
    await seedUsdcIn(db, { userId: friend.id, usd: "50", signature: "sig-1" });
    await trade();
    await store.qualifyPending(now);
    expect(await store.qualifyPending(new Date(now.getTime() + 60_000))).toBe(0);
    expect(await qualifiedAt()).toEqual(now);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/store.test.ts`
Expected: FAIL. `store.qualifyPending is not a function`.

- [ ] **Step 3: Write `qualifyPending`**

In `store.ts`, change the drizzle import to `import { and, eq, isNull, sql } from "drizzle-orm";`, add `import { USDC_MINT } from "@mercury/chain";`, add `activities` to the schema import, and add `QUALIFYING_FUNDING_USD` to the rules import.

Add to `interface ReferralStore`:

```ts
  /** Mark every invited friend who now has $50 in and one filled trade. Returns how many changed. */
  qualifyPending(now: Date): Promise<number>;
```

Inside `createReferralStore`, before `return`, add:

```ts
  /*
   * One statement, so a friend is counted at most once however often it runs.
   *
   * Money in is the same rows the performance line reads as flows: USDC
   * `transfer_in` to the wallet itself, not a basket. Two kinds are left out.
   * A transfer whose signature also appears in the inviter's own activity is
   * the inviter's money going round. A row tagged `referral_payout` is a
   * reward, not funding.
   */
  const qualifyPending = async (now: Date): Promise<number> => {
    const fundedUsd = sql`(
      select coalesce(sum(a.amount_usd), 0)
      from ${activities} a
      where a.user_id = ${referrals.friendId}
        and a.kind = 'transfer_in'
        and a.mint = ${USDC_MINT}
        and a.basket_portfolio_id is null
        and a.amount_usd is not null
        and a.ref_table is distinct from 'referral_payout'
        and not exists (
          select 1 from ${activities} b
          where b.user_id = ${referrals.inviterId} and b.tx_signature = a.tx_signature
        )
    )`;
    const traded = sql`exists (
      select 1 from ${orders} o where o.user_id = ${referrals.friendId} and o.status = 'filled'
    )`;
    const changed = await db
      .update(referrals)
      .set({ qualifiedAt: now })
      .where(and(isNull(referrals.qualifiedAt), traded, sql`${fundedUsd} >= ${QUALIFYING_FUNDING_USD.toString()}`))
      .returning({ id: referrals.id });
    return changed.length;
  };
```

Add `qualifyPending` to the returned object.

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/store.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Register the job**

In `services/api/src/index.ts`, add `import { createReferralStore } from "./referrals/store.js";` with the other imports. Add this row to the job table in the comment above the jobs:

```
 * | `referral-qualify`   | 10m     | `referral.qualified_at`                              |
```

After the `loan-watch` registration, add:

```ts
/**
 * Ten minutes, because nobody is watching for the moment a friend starts to
 * count. It reads money in from the rows `wallet-events` writes and trades
 * from `order`, so it can only be as current as they are.
 */
const referralStore = createReferralStore(auth.db);
every("referral-qualify", 10 * 60 * 1000, async () => {
  const n = await referralStore.qualifyPending(new Date());
  return n === 0 ? null : `${n} invited ${n === 1 ? "friend" : "friends"} now count as funded`;
});
```

- [ ] **Step 6: Typecheck, test, commit**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api test
git add services/api/src/referrals/store.ts services/api/src/referrals/store.test.ts services/api/src/index.ts
git commit -m "feat(api): count an invited friend once they fund \$50 and trade"
```

---

### Task 6: The routes

**Files:**
- Modify: `services/api/src/referrals/store.ts` (add `summary`)
- Create: `services/api/src/routes/referrals.ts`
- Test: `services/api/src/routes/referrals.test.ts`
- Modify: `services/api/src/deps.ts` (`ReadDeps.referrals`, built in `buildReadDeps`)
- Modify: `services/api/src/app.ts` (mount after `requireAuth`)

**Interfaces:**
- Consumes: `ReferralStore` (Tasks 3–5); `ClaimReferralRequest`, `ReferralSummary` (Task 2); `inviterShare`, `discountActive`, `discountEndsAt` (Task 2).
- Produces: `ReferralStore.summary(userId: string, now: Date): Promise<Summary>`, where `interface Summary { code: string; invited: number; funded: number; founding: boolean; share: Decimal; discountUntil: Date | null }`. Also `interface ReferralDeps { store: ReferralStore; now?: () => Date }`, `referralRoutes(deps): Hono`, `SITE = "https://trymercury.xyz"`, and `ReadDeps.referrals?: ReferralDeps`.

- [ ] **Step 1: Write the failing route tests**

```ts
// services/api/src/routes/referrals.test.ts
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { D } from "@mercury/core";
import type { ReferralStore } from "../referrals/store.js";
import { referralRoutes } from "./referrals.js";

const now = new Date("2026-10-17T12:00:00Z");

const appWith = (store: Partial<ReferralStore>) => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: "WaLLeT" });
    await next();
  });
  app.route("/", referralRoutes({ store: store as ReferralStore, now: () => now }));
  return app;
};
const post = (app: Hono, body: unknown) =>
  app.request("/v1/referrals/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("GET /v1/referrals", () => {
  it("gives the link, the counts and the tier", async () => {
    const summary = vi.fn(async () => ({
      code: "abcdefgh",
      invited: 4,
      funded: 2,
      founding: false,
      share: D("0.25"),
      discountUntil: null,
    }));
    const res = await appWith({ summary }).request("/v1/referrals");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      code: "abcdefgh",
      link: "https://trymercury.xyz/?ref=abcdefgh",
      invited: 4,
      funded: 2,
      founding: false,
      share: "0.25",
      discountUntil: null,
    });
    expect(summary).toHaveBeenCalledWith("user-1", now);
  });
});

describe("POST /v1/referrals/claim", () => {
  it("claims for the signed-in person", async () => {
    const claim = vi.fn(async () => ({ kind: "claimed" as const, inviterId: "user-9" }));
    const res = await post(appWith({ claim }), { code: "abcdefgh" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "claimed" });
    expect(claim).toHaveBeenCalledWith("user-1", "abcdefgh", now);
  });

  it.each([
    ["unknown_code", 404, "not_found"],
    ["self", 409, "self_referral"],
    ["taken", 409, "already_referred"],
    ["too_late", 409, "too_late"],
  ] as const)("answers %s with %i %s", async (kind, status, code) => {
    const res = await post(appWith({ claim: async () => ({ kind }) }), { code: "abcdefgh" });
    expect(res.status).toBe(status);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(code);
  });

  it("refuses something that is not a code without asking the store", async () => {
    const claim = vi.fn();
    const res = await post(appWith({ claim }), { code: "../etc" });
    expect(res.status).toBe(400);
    expect(claim).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write the failing `summary` test**

Append to `store.test.ts`:

```ts
describe("summary", () => {
  it("counts invited and funded friends and names the tier", async () => {
    const db = await testDb();
    const store = createReferralStore(db);
    const now = new Date("2026-10-17T12:00:00Z");
    const inviter = await seedUser(db, 1, { referralCode: "inviter1" });
    const [f1, f2] = [await seedUser(db, 2), await seedUser(db, 3)];
    await store.claim(f1.id, "inviter1", now);
    await store.claim(f2.id, "inviter1", now);
    await db.update(referrals).set({ qualifiedAt: now }).where(eq(referrals.friendId, f1.id));

    const s = await store.summary(inviter.id, now);
    expect(s).toMatchObject({ code: "inviter1", invited: 2, funded: 1, founding: false, discountUntil: null });
    expect(s.share.toString()).toBe("0.25");

    expect((await store.summary(f1.id, now)).discountUntil).toEqual(new Date(now.getTime() + 90 * 86_400_000));
  });
});
```

and add `import { eq } from "drizzle-orm";` at the top of `store.test.ts`.

- [ ] **Step 3: Run both to see them fail**

Run: `pnpm --filter @mercury/api exec vitest run src/routes/referrals.test.ts src/referrals/store.test.ts`
Expected: FAIL. Cannot find module `./referrals.js`, and `store.summary is not a function`.

- [ ] **Step 4: Add `summary` to the store**

In `store.ts`, change the drizzle import to `import { and, count, eq, isNull, sql } from "drizzle-orm";`, add `import type { Decimal } from "@mercury/core";`, and add `discountActive, discountEndsAt, inviterShare` to the rules import.

Above the interface, add:

```ts
export interface Summary {
  readonly code: string;
  readonly invited: number;
  readonly funded: number;
  readonly founding: boolean;
  /** The inviter's share at today's tier. */
  readonly share: Decimal;
  /** When this person's own discount ends, if one is running. */
  readonly discountUntil: Date | null;
}
```

Add to the interface:

```ts
  /** What the Invite panel shows. Makes the code if there is none yet. */
  summary(userId: string, now: Date): Promise<Summary>;
```

Inside `createReferralStore`, before `return`, add:

```ts
  const summary = async (userId: string, now: Date): Promise<Summary> => {
    const [code, founding, referred, [counts]] = await Promise.all([
      codeFor(userId),
      isFounding(userId),
      existing(userId),
      db
        .select({ invited: count(), funded: count(referrals.qualifiedAt) })
        .from(referrals)
        .where(eq(referrals.inviterId, userId)),
    ]);
    const funded = counts?.funded ?? 0;
    return {
      code,
      invited: counts?.invited ?? 0,
      funded,
      founding,
      share: inviterShare(funded, founding),
      discountUntil:
        referred !== null && discountActive(referred.createdAt, now) ? discountEndsAt(referred.createdAt) : null,
    };
  };
```

`summary` calls `isFounding` by name, so lift it out of the returned object into a `const isFounding = async (userId: string) => { ... }` above `summary`. The returned object then reads:

```ts
  return {
    codeFor,
    isFounding,
    claim,
    referredAt: async (userId) => (await existing(userId))?.createdAt ?? null,
    qualifyPending,
    summary,
  };
```

- [ ] **Step 5: Write the routes**

```ts
// services/api/src/routes/referrals.ts
import { Hono } from "hono";
import { ClaimReferralRequest, type ReferralSummary } from "@mercury/types";
import type {} from "../auth/middleware.js";
import type { ReferralStore } from "../referrals/store.js";

export interface ReferralDeps {
  readonly store: ReferralStore;
  /** Injected so a test can stand at a chosen moment. */
  readonly now?: () => Date;
}

/** Where a shared link lands: the site, whose buttons carry the code on into the app. */
export const SITE = "https://trymercury.xyz";

const fail = (code: string, message: string) => ({ error: { code, message } });

export function referralRoutes(deps: ReferralDeps): Hono {
  const app = new Hono();
  const now = deps.now ?? (() => new Date());

  app.get("/v1/referrals", async (c) => {
    const s = await deps.store.summary(c.get("identity").userId, now());
    const body: ReferralSummary = {
      code: s.code,
      link: `${SITE}/?ref=${encodeURIComponent(s.code)}`,
      invited: s.invited,
      funded: s.funded,
      founding: s.founding,
      share: s.share.toString(),
      discountUntil: s.discountUntil?.toISOString() ?? null,
    };
    return c.json(body);
  });

  /*
   * Called by the web once someone is signed in with a code waiting. Every
   * refusal is final, and the web drops the code on any 4xx, so the codes say
   * why for the logs rather than for a screen.
   */
  app.post("/v1/referrals/claim", async (c) => {
    const parsed = ClaimReferralRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", "Not an invite code."), 400);

    const result = await deps.store.claim(c.get("identity").userId, parsed.data.code, now());
    switch (result.kind) {
      case "claimed":
      case "already":
        return c.json({ status: result.kind });
      case "unknown_code":
        return c.json(fail("not_found", "Nobody has that invite code."), 404);
      case "self":
        return c.json(fail("self_referral", "That is your own invite code."), 409);
      case "taken":
        return c.json(fail("already_referred", "Someone else invited you first."), 409);
      case "too_late":
        return c.json(fail("too_late", "Invite codes count only for new accounts."), 409);
    }
  });

  return app;
}
```

- [ ] **Step 6: Wire and mount it**

In `deps.ts`:
- Add `import { createReferralStore } from "./referrals/store.js";` and `import type { ReferralDeps } from "./routes/referrals.js";`.
- Add to `interface ReadDeps`, after `feedback?`:

```ts
  /** Invite links and the friend's discount. Optional so a test app can leave it out. */
  readonly referrals?: ReferralDeps;
```

- In `buildReadDeps`'s returned object, after `orders: pgOrderStore(db),` add:

```ts
    referrals: { store: createReferralStore(db) },
```

In `app.ts`, add `import { referralRoutes } from "./routes/referrals.js";`. After `app.route("/", activityRoutes(read.activity));` (any place after `app.use("/v1/*", requireAuth(auth))` works), add:

```ts
  if (read.referrals) app.route("/", referralRoutes(read.referrals));
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `pnpm --filter @mercury/api exec vitest run src/routes/referrals.test.ts src/referrals/store.test.ts`
Expected: PASS, 7 route tests and 19 store tests.

- [ ] **Step 8: Typecheck, test, commit**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api test
git add services/api/src/referrals/store.ts services/api/src/referrals/store.test.ts services/api/src/routes/referrals.ts services/api/src/routes/referrals.test.ts services/api/src/deps.ts services/api/src/app.ts
git commit -m "feat(api): GET /v1/referrals and POST /v1/referrals/claim"
```

---

### Task 7: The friend's discount on the fee

**Files:**
- Modify: `services/api/src/app.ts` (`chargeToWire`; a `pricing` helper inside `createApp`; lines 269, 296, 456, 587)
- Test: `services/api/src/app.test.ts`

**Interfaces:**
- Consumes: `pricingFor`, `FeePricing` (Task 2); `ReadDeps.referrals` (Task 6).
- Produces: the quote's `fee` gains `discount?: { pct: number; until: string }`, and `fee.mercuryBps` can be fractional (37.5). Execute charges and records the discounted fee.

- [ ] **Step 1: Write the failing tests**

In `app.test.ts`, widen the harness's `over` parameter:

```ts
  over: { balances?: TokenBalance[]; sponsored?: boolean; tradingFeeBps?: number; referredAt?: Date } = {},
```

and add to the `read` object, after `borrow: {},`:

```ts
    ...(over.referredAt === undefined
      ? {}
      : { referrals: { store: { referredAt: async () => over.referredAt ?? null } } }),
```

Then append:

```ts
/*
 * A quarter off 0.5% is 0.375%. On $500 that is $1.875, floored to the cent
 * like every Mercury fee: $1.87.
 */
describe("an invited friend's fee", () => {
  const DAY = 86_400_000;

  it("quotes a quarter off for their first 90 days, and says so", async () => {
    const { post } = await harness({ referredAt: new Date(Date.now() - 10 * DAY) });
    const res = await post("/v1/quote", { ticker: "NVDA", side: "buy", amount: "500" });
    const body = (await res.json()) as {
      fee: { mercury: string; mercuryBps: number; network: string; discount?: { pct: number; until: string } };
    };
    expect(body.fee).toMatchObject({ mercury: "1.87", mercuryBps: 37.5, network: "0.01", discount: { pct: 25 } });
  });

  it("quotes the full rate once the 90 days are up", async () => {
    const { post } = await harness({ referredAt: new Date(Date.now() - 91 * DAY) });
    const res = await post("/v1/quote", { ticker: "NVDA", side: "buy", amount: "500" });
    const body = (await res.json()) as { fee: { mercury: string; discount?: unknown } };
    expect(body.fee.mercury).toBe("2.5");
    expect(body.fee.discount).toBeUndefined();
  });

  it("records the discounted fee on the order it executes", async () => {
    const h = await harness({ referredAt: new Date(Date.now() - 10 * DAY) });
    const { orderId } = (await (
      await h.post("/v1/orders", { ticker: "NVDA", side: "buy", amount: "500" })
    ).json()) as { orderId: string };
    await h.post(`/v1/orders/${orderId}/execute`, {});
    const order = (await (await h.get(`/v1/orders/${orderId}`)).json()) as { mercuryFeeUsd: string | null };
    expect(order.mercuryFeeUsd).toBe("1.87");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @mercury/api exec vitest run src/app.test.ts -t "invited friend"`
Expected: FAIL. `mercury` is `"2.5"` where `"1.87"` was expected.

- [ ] **Step 3: Route the rate through `pricing`**

In `app.ts`, add `import { pricingFor, type FeePricing } from "./referrals/rules.js";`.

Replace `chargeToWire` (line 80) with:

```ts
const chargeToWire = (charge: TradeCharge, discount: FeePricing["discount"] = null) => ({
  usdc: charge.usdc.toString(),
  lamports: charge.lamports,
  network: charge.network.toString(),
  mercury: charge.mercury.toString(),
  mercuryBps: charge.mercuryBps,
  /* Why the rate is below the published one, so the confirm screen can say so. */
  ...(discount === null ? {} : { discount: { pct: discount.pct, until: discount.until.toISOString() } }),
});
```

Inside `createApp`, before the first route, add:

```ts
  /**
   * Mercury's rate for this person now: the configured one, or a quarter off
   * in an invited friend's first 90 days. One lookup per request, read by the
   * quote and by execute alike, so the two cannot disagree about who was invited.
   */
  const pricing = async (userId: string): Promise<FeePricing> =>
    pricingFor(
      read.tradingFeeBps,
      read.referrals === undefined ? null : await read.referrals.store.referredAt(userId),
      new Date(),
    );
```

In `POST /v1/quote`, directly after `if (!parsed.success) return ...`, add:

```ts
    const rate = await pricing(c.get("identity").userId);
```

and change the two charges and the two `chargeToWire` calls in that handler:
- line 269: `const charge = tradeCharge(network, gross, rate.bps);`
- line 273: `fee: chargeToWire(charge, rate.discount),`
- line 296: `const charge = tradeCharge(network, D(parsed.data.amount), rate.bps);`
- the buy branch's `fee: chargeToWire(charge),` (line 316): `fee: chargeToWire(charge, rate.discount),`

In `POST /v1/orders/:id/execute`, directly after `const identity = c.get("identity");`, add:

```ts
    const rate = await pricing(identity.userId);
```

and change:
- line 456: `const buying = selling ? null : tradeCharge(network, D(shown.amount), rate.bps);`
- line 587: `const charge = buying ?? tradeCharge(network, proceeds, rate.bps);`

Then run `grep -n "read.tradingFeeBps" services/api/src/app.ts`. Expected: one hit only, the one inside `pricing`.

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm --filter @mercury/api exec vitest run src/app.test.ts`
Expected: PASS, including the three new tests and every existing fee test (`mercuryBps: 50`, `tradingFeeBps: 35`, `5_000`).

- [ ] **Step 5: Typecheck, test, commit**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api test
git add services/api/src/app.ts services/api/src/app.test.ts
git commit -m "feat(api): a quarter off Mercury's fee for an invited friend's first 90 days"
```

---

### Task 8: Founding-card links carry their code again

**Files:**
- Modify: `services/api/src/app.ts:162`
- Test: `services/api/src/app.test.ts:343`

**Interfaces:**
- Consumes: `isCode` (Task 2); `SITE` (Task 6).

- [ ] **Step 1: Change the test first**

Replace the test at `app.test.ts:343` with:

```ts
  it("sends a founding card's old share link on to the site, with the card's code", async () => {
    const { get } = await harness();
    const res = await get("/f/3kQ9xZ1bTq7w");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://trymercury.xyz/?ref=3kQ9xZ1bTq7w");
  });

  it("sends anything that is not a code on to the site bare", async () => {
    const { get } = await harness();
    const res = await get("/f/x");
    expect(res.headers.get("location")).toBe("https://trymercury.xyz");
  });
```

- [ ] **Step 2: Run them to see the first fail**

Run: `pnpm --filter @mercury/api exec vitest run src/app.test.ts -t "share link"`
Expected: FAIL. The location is `https://trymercury.xyz`.

- [ ] **Step 3: Carry the slug**

In `app.ts`, add `isCode` to the `./referrals/rules.js` import and `SITE` to the `./routes/referrals.js` import. Replace line 162 with:

```ts
  /* The card's slug is its holder's invite code (see referrals/store.ts), so it goes along. */
  app.get("/f/:slug", (c) => {
    const slug = c.req.param("slug");
    return c.redirect(isCode(slug) ? `${SITE}/?ref=${encodeURIComponent(slug)}` : SITE, 301);
  });
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm --filter @mercury/api exec vitest run src/app.test.ts -t "share link|not a code"`
Expected: PASS, 2 tests.

- [ ] **Step 5: Typecheck, test, commit**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api test
git add services/api/src/app.ts services/api/src/app.test.ts
git commit -m "feat(api): founding-card links forward their invite code"
```

---

### Task 9: The web keeps `?ref=` through sign-in, then claims it

**Files:**
- Create: `apps/web/src/referrals/pending.ts`
- Test: `apps/web/src/referrals/pending.test.ts`
- Create: `apps/web/src/referrals/ClaimReferral.tsx`
- Modify: `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/dev/sample.ts`

**Interfaces:**
- Consumes: `POST /v1/referrals/claim` (Task 6); `ReferralCode` (Task 2); `apiFetch`, `useSignedIn`.
- Produces: `captureRef(search, store?, now?)`, `pendingRef(store?, now?)`, `clearRef(store?)`, `settles(err: unknown): boolean`, and a `<ClaimReferral />` component.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/referrals/pending.test.ts
import { describe, expect, it } from "vitest";
import { captureRef, clearRef, pendingRef, settles } from "./pending";

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
const DAY = 86_400_000;
const t0 = Date.UTC(2026, 9, 17);

describe("the pending invite code", () => {
  it("keeps the code from the address the visitor arrived on", () => {
    const store = memory();
    captureRef("?ref=abcdefgh&utm_source=x", store, t0);
    expect(pendingRef(store, t0 + DAY)).toBe("abcdefgh");
  });

  it("keeps a newer link over an older one", () => {
    const store = memory();
    captureRef("?ref=abcdefgh", store, t0);
    captureRef("?ref=hgfedcba", store, t0 + 1);
    expect(pendingRef(store, t0 + 2)).toBe("hgfedcba");
  });

  it("leaves a stored code alone when the address has none", () => {
    const store = memory();
    captureRef("?ref=abcdefgh", store, t0);
    captureRef("", store, t0 + 1);
    expect(pendingRef(store, t0 + 2)).toBe("abcdefgh");
  });

  it("ignores something that is not a code", () => {
    const store = memory();
    captureRef("?ref=%3Cscript%3E", store, t0);
    expect(pendingRef(store, t0)).toBeNull();
  });

  it("forgets a code after 30 days", () => {
    const store = memory();
    captureRef("?ref=abcdefgh", store, t0);
    expect(pendingRef(store, t0 + 30 * DAY)).toBeNull();
  });

  it("forgets it when told to", () => {
    const store = memory();
    captureRef("?ref=abcdefgh", store, t0);
    clearRef(store);
    expect(pendingRef(store, t0)).toBeNull();
  });

  it("survives a browser with no storage at all", () => {
    expect(() => captureRef("?ref=abcdefgh", null, t0)).not.toThrow();
    expect(pendingRef(null, t0)).toBeNull();
  });
});

/*
 * A refusal is final, so the code goes. A network failure is not, so it stays
 * for the next visit. Errors are built by hand rather than as `ApiError`:
 * `api/client.ts` loads Privy at import, which a node test has no business doing.
 */
const refused = (status: number) => Object.assign(new Error("refused"), { status });

describe("settles", () => {
  it("is true for a refusal", () => {
    expect(settles(refused(409))).toBe(true);
    expect(settles(refused(404))).toBe(true);
  });
  it("is false for a server or network failure", () => {
    expect(settles(refused(503))).toBe(false);
    expect(settles(new TypeError("Failed to fetch"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @mercury/web exec vitest run src/referrals/pending.test.ts`
Expected: FAIL. Cannot find module `./pending`.

- [ ] **Step 3: Write `pending.ts`**

```ts
// apps/web/src/referrals/pending.ts
import { ReferralCode } from "@mercury/types";

/**
 * An invite code from the address someone arrived on, kept until they are
 * signed in and it can be claimed.
 *
 * Read once, before React mounts, because the router redirects `/` to the
 * portfolio or opens sign-in, and neither keeps the query string. Stored
 * rather than threaded through, because Privy's email code is a step the
 * address does not survive on every device.
 */
const KEY = "harbor.ref";
const KEEP_MS = 30 * 86_400_000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const browser = (): Store | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const captureRef = (search: string, store: Store | null = browser(), now = Date.now()): void => {
  const code = new URLSearchParams(search).get("ref");
  if (store === null || code === null || !ReferralCode.safeParse(code).success) return;
  try {
    store.setItem(KEY, JSON.stringify({ code, at: now }));
  } catch {
    /* full or blocked: the link simply does not count */
  }
};

export const pendingRef = (store: Store | null = browser(), now = Date.now()): string | null => {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const { code, at } = JSON.parse(raw) as { code?: unknown; at?: unknown };
    return typeof code === "string" &&
      ReferralCode.safeParse(code).success &&
      typeof at === "number" &&
      now - at < KEEP_MS
      ? code
      : null;
  } catch {
    return null;
  }
};

export const clearRef = (store: Store | null = browser()): void => {
  try {
    store?.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
};

/**
 * Whether an attempt to claim is over for good. Only a refusal is: an
 * `ApiError` with a 4xx status. Read by shape rather than `instanceof`, so this
 * module stays free of `api/client.ts` and the Privy import that comes with it.
 */
export const settles = (err: unknown): boolean => {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500;
};
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm --filter @mercury/web exec vitest run src/referrals/pending.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Capture on boot, claim once signed in**

```tsx
// apps/web/src/referrals/ClaimReferral.tsx
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { apiFetch } from "../api/client";
import { useSignedIn } from "../api/hooks";
import { clearRef, pendingRef, settles } from "./pending";

/**
 * Claims a waiting invite code as soon as someone is signed in. Renders
 * nothing. The server decides whether it counts; whatever the answer, the
 * code is spent, unless the request never got an answer.
 */
export const ClaimReferral = () => {
  const signedIn = useSignedIn();
  const qc = useQueryClient();
  const busy = useRef(false);

  useEffect(() => {
    const code = pendingRef();
    if (!signedIn || code === null || busy.current) return;
    busy.current = true;
    apiFetch<{ status: string }>("/v1/referrals/claim", { method: "POST", body: JSON.stringify({ code }) })
      .then(() => {
        clearRef();
        void qc.invalidateQueries({ queryKey: ["api", "referrals"] });
      })
      .catch((err: unknown) => {
        if (settles(err)) clearRef();
      })
      .finally(() => {
        busy.current = false;
      });
  }, [signedIn, qc]);

  return null;
};
```

In `apps/web/src/main.tsx`, add `import { captureRef } from "./referrals/pending";` and call it before `startValueFlash();`:

```ts
// Before the router can redirect the address away: see referrals/pending.ts.
captureRef(window.location.search);
```

In `apps/web/src/App.tsx`, add `import { ClaimReferral } from "./referrals/ClaimReferral";` and render it beside `<ForgetOnSignOut />`:

```tsx
      <ForgetOnSignOut />
      <ClaimReferral />
```

In `apps/web/src/dev/sample.ts`, inside `sampleResponse` before `return undefined;`, add:

```ts
  if (route === "/v1/referrals/claim") return { status: "claimed" };
```

- [ ] **Step 6: Check it by hand**

Run the `web` preview (from `.claude/launch.json`), signed out, at `http://localhost:5175/?ref=abcdefgh`. In devtools, `localStorage.getItem("harbor.ref")` should read `{"code":"abcdefgh","at":…}` after the page has already redirected away from `/`. Sign in. One `POST /v1/referrals/claim` should appear in the network panel, and `harbor.ref` should then be gone.

- [ ] **Step 7: Typecheck, test, commit**

```bash
pnpm --filter @mercury/web typecheck && pnpm --filter @mercury/web test
git add apps/web/src/referrals apps/web/src/main.tsx apps/web/src/App.tsx apps/web/src/dev/sample.ts
git commit -m "feat(web): keep an invite code through sign-in, then claim it"
```

---

### Task 10: The confirm screen shows the discount

**Files:**
- Modify: `apps/web/src/app/fee-lines.ts`
- Test: `apps/web/src/app/fee-lines.test.ts`
- Modify: `apps/mobile/src/order/BuySheet.tsx:474`, `apps/mobile/src/api/orders.ts:45`

**Interfaces:**
- Consumes: the quote's `fee.discount` (Task 7).
- Produces: `WireCharge.discount?`, `Charge.discount?` (both `{ pct: number; until: string }`), and a `rateLabel` that keeps three decimals.

- [ ] **Step 1: Write the failing tests**

In `fee-lines.test.ts`, add to `describe("rateLabel", ...)`:

```ts
  it("keeps a discounted rate exact", () => {
    expect(rateLabel(37.5)).toBe("0.375%");
  });
```

Add to `describe("chargeFromWire", ...)`:

```ts
  it("carries an invited friend's discount through", () => {
    expect(
      chargeFromWire({
        usdc: "1.88",
        network: "0.01",
        mercury: "1.87",
        mercuryBps: 37.5,
        discount: { pct: 25, until: "2027-01-15T12:00:00.000Z" },
      }).discount,
    ).toEqual({ pct: 25, until: "2027-01-15T12:00:00.000Z" });
  });
```

Add to `describe("feeLines", ...)`:

```ts
  it("says why an invited friend's rate is lower, and until when", () => {
    const discounted = {
      total: 1.88,
      network: 0.01,
      mercury: 1.87,
      mercuryBps: 37.5,
      discount: { pct: 25, until: "2027-01-15T12:00:00.000Z" },
    };
    const [mercury] = feeLines(discounted, buy);
    expect(mercury?.label).toBe("Mercury fee (0.375%)");
    expect(mercury?.tip).toContain("25% off as an invited friend, until 15 Jan");
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @mercury/web exec vitest run src/app/fee-lines.test.ts`
Expected: FAIL. `rateLabel(37.5)` returns `"0.38%"`, and `discount` is undefined.

- [ ] **Step 3: Carry and say the discount**

In `fee-lines.ts`:

```ts
/** Why Mercury's rate is lower than published: an invited friend's first 90 days. */
export interface FeeDiscount {
  readonly pct: number;
  /** ISO. When the full rate applies again. */
  readonly until: string;
}
```

Add `readonly discount?: FeeDiscount;` to both `Charge` and `WireCharge`. In `chargeFromWire`'s returned object, add after `mercuryBps`:

```ts
    ...(fee.discount === undefined ? {} : { discount: fee.discount }),
```

Replace `rateLabel`:

```ts
/* 50 is "0.5%", 37.5 is "0.375%": as written, without the zeros, and never rounded to a rate we did not charge. */
export const rateLabel = (bps: number): string => `${Number((bps / 100).toFixed(3))}%`;
```

In `feeLines`, replace the mercury `tip:` with:

```ts
      tip:
        (ctx.selling
          ? `${rateLabel(charge.mercuryBps)} of what the shares sell for. Taken from the proceeds.`
          : `${rateLabel(charge.mercuryBps)} of the ${usd(ctx.amount)}. Taken from it, with the network fee, so ${usd(ctx.invested)} is invested.`) +
        (charge.discount === undefined
          ? ""
          : ` ${charge.discount.pct}% off as an invited friend, until ${new Date(charge.discount.until).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.`),
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm --filter @mercury/web exec vitest run src/app/fee-lines.test.ts`
Expected: PASS.

- [ ] **Step 5: Mobile reads the same rate**

In `apps/mobile/src/api/orders.ts:45`, beside `readonly mercuryBps?: number;`, add:

```ts
    readonly discount?: { readonly pct: number; readonly until: string };
```

In `apps/mobile/src/order/BuySheet.tsx:474`, change `toFixed(2)` to `toFixed(3)`:

```ts
  const rate = `${Number(((quote?.fee.mercuryBps ?? 0) / 100).toFixed(3))}%`;
```

- [ ] **Step 6: Typecheck, test, commit**

```bash
pnpm --filter @mercury/web typecheck && pnpm --filter @mercury/web test && pnpm --filter @mercury/mobile typecheck
git add apps/web/src/app/fee-lines.ts apps/web/src/app/fee-lines.test.ts apps/mobile/src/api/orders.ts apps/mobile/src/order/BuySheet.tsx
git commit -m "feat(web): name an invited friend's discount on the confirm screen"
```

---

### Task 11: The Invite panel

**Files:**
- Create: `apps/web/src/api/referrals.ts`
- Create: `apps/web/src/app/Invite.tsx`
- Modify: `apps/web/src/app/Receive.tsx` (export `Swap` and `useFlag`)
- Modify: `apps/web/src/app/Panels.tsx`, `apps/web/src/app/AccountMenu.tsx`, `apps/web/src/dev/sample.ts`

**Interfaces:**
- Consumes: `GET /v1/referrals` (Task 6); `ReferralSummary` (Task 2).
- Produces: `useReferrals()`, query key `["api", "referrals"]`, `usePanels().invite()`, panel key `invite`.

The panel is pure presentation over one GET, which the route tests already cover. Verify it in sample mode.

- [ ] **Step 1: The hook**

```ts
// apps/web/src/api/referrals.ts
import { useQuery } from "@tanstack/react-query";
import type { ReferralSummary } from "@mercury/types";
import { apiFetch } from "./client";
import { useSignedIn } from "./hooks";

/** The Invite panel's link and counts. Only read while the panel is open. */
export const useReferrals = (open: boolean) => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "referrals"],
    queryFn: () => apiFetch<ReferralSummary>("/v1/referrals"),
    enabled: signedIn && open,
    staleTime: 60_000,
  });
};
```

- [ ] **Step 2: Share the copy-button pieces**

In `apps/web/src/app/Receive.tsx`, change `const Swap = ` to `export const Swap = ` and `const useFlag = ` to `export const useFlag = `. Nothing else in that file changes.

- [ ] **Step 3: The panel**

```tsx
// apps/web/src/app/Invite.tsx
import type { ReferralSummary } from "@mercury/types";
import { useReferrals } from "../api/referrals";
import { Button } from "../ui/Button";
import { PanelHeader, SidePanel } from "../ui/Dialog";
import { Check, Copy } from "../ui/icons";
import { Skeleton } from "./portfolio/ui";
import { Swap, useFlag } from "./Receive";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/*
 * The friend's side only. What the inviter earns is not on this screen until
 * the lawyer has said it may be paid: see the rewards plan.
 */
const RULES = [
  "Friends who join through your link get 25% off Mercury's fee for 90 days.",
  "A friend counts as funded once they add $50 and make a trade.",
  "Each person can be invited once, and only while their account is new.",
];

const CopyLink = ({ link }: { link: string }) => {
  const [copied, flag] = useFlag();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      flag();
    } catch {
      /* no clipboard permission: nothing to report */
    }
  };
  return (
    <Button variant="primary" onClick={copy} iconSize="md">
      <Swap k={copied ? "copied" : "copy"}>
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy link"}
      </Swap>
    </Button>
  );
};

/** The platform share sheet where there is one; copying where there is not. */
const ShareLink = ({ link }: { link: string }) => {
  const [done, flag] = useFlag();
  const share = async () => {
    const text = `Join me on Mercury: 25% off the trading fee for your first 90 days. ${link}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Mercury", text, url: link });
        return;
      }
      await navigator.clipboard.writeText(text);
      flag();
    } catch {
      /* dismissed, or no permission: nothing to report */
    }
  };
  return (
    <Button onClick={share}>
      <Swap k={done ? "done" : "share"}>{done ? "Copied to share" : "Share"}</Swap>
    </Button>
  );
};

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg bg-ds-panel px-4 py-3">
    <dt className="text-[12px] leading-none text-ds-muted">{label}</dt>
    <dd className="mt-2 text-[24px] leading-none font-medium text-ds-ink">{value}</dd>
  </div>
);

const Body = ({ s }: { s: ReferralSummary }) => (
  <>
    <div className="rounded-lg bg-ds-panel p-1">
      <p className="truncate rounded-md bg-white px-4 py-3 font-mono text-[13px] text-ds-ink">{s.link}</p>
      <div className="mt-1 grid grid-cols-2 gap-1">
        <CopyLink link={s.link} />
        <ShareLink link={s.link} />
      </div>
    </div>
    <dl className="grid grid-cols-2 gap-3">
      <Stat label="Invited" value={s.invited} />
      <Stat label="Funded" value={s.funded} />
    </dl>
    <ul className="flex list-disc flex-col gap-2 pl-4 text-[13px] leading-[1.45] text-ds-muted">
      {RULES.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ul>
    {s.discountUntil !== null && (
      <p className="rounded-lg bg-ds-up-chip px-3 py-2.5 text-[12px] leading-[1.45] text-ds-ink">
        You were invited: 25% off Mercury's fee until {day(s.discountUntil)}.
      </p>
    )}
  </>
);

export const Invite = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const q = useReferrals(open);
  return (
    <SidePanel open={open} onClose={onClose} labelledBy="invite-heading">
      <PanelHeader id="invite-heading" title="Invite friends" sub="Share your link" onClose={onClose} />
      <div className="flex flex-col gap-5 px-6 pt-5 pb-6">
        {q.isPending ? (
          <Skeleton className="h-28 w-full" />
        ) : q.data === undefined ? (
          <p className="text-[13px] text-ds-muted">Your invite link didn't load. Close this and try again.</p>
        ) : (
          <Body s={q.data} />
        )}
      </div>
    </SidePanel>
  );
};
```

- [ ] **Step 4: Open it from the account menu**

In `apps/web/src/app/Panels.tsx`:
- Add `import { Invite } from "./Invite";`.
- Change `KEYS` to `["add", "send", "borrow", "ticker", "only", "invite"] as const`.
- In `usePanels`'s returned object, add `invite: () => set({ invite: "1" }),` after `send`.
- In `GlobalPanels`, add `const inviting = params.get("invite") === "1";` and `const inviteSeen = useSeen(inviting);` beside the others, and render `{inviteSeen && <Invite open={inviting} onClose={close} />}` after the `Send` line.

In `apps/web/src/app/AccountMenu.tsx`:
- Add `Users` to the `../ui/icons` import, and `import { usePanels } from "./Panels";`.
- In the component body, add `const panels = usePanels();`.
- Add this as the first child of the `div` that holds Support and Sign out:

```tsx
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  panels.invite();
                }}
                className={`${row} text-ds-ink`}
              >
                <Users className="size-4 shrink-0 text-ds-muted [stroke-width:1.5]" />
                Invite friends
              </button>
```

- Update the comment above that `div`: "the two things that are not a place to go" becomes "the three things that are not a place to go".

- [ ] **Step 5: Sample data**

In `apps/web/src/dev/sample.ts`, above `sampleResponse`, add:

```ts
const SAMPLE_REFERRALS = {
  code: "ada-0042",
  link: "https://trymercury.xyz/?ref=ada-0042",
  invited: 7,
  funded: 3,
  founding: true,
  share: "0.3",
  discountUntil: null,
};
```

and inside `sampleResponse`, before `return undefined;`:

```ts
  if (route === "/v1/referrals") return SAMPLE_REFERRALS;
```

- [ ] **Step 6: Check it in sample mode**

Run the `web-sample` preview and open `http://localhost:5174/portfolio`. Open the account menu, then **Invite friends**. Expect a panel showing the link `https://trymercury.xyz/?ref=ada-0042`, **Copy link** and **Share**, Invited 7, Funded 3, and the three rules. **Copy link** should flip to "Copied". At 375px wide the link should truncate rather than scroll. Escape and Back should both close the panel.

- [ ] **Step 7: Typecheck, test, commit**

```bash
pnpm --filter @mercury/web typecheck && pnpm --filter @mercury/web test
git add apps/web/src/api/referrals.ts apps/web/src/app/Invite.tsx apps/web/src/app/Receive.tsx apps/web/src/app/Panels.tsx apps/web/src/app/AccountMenu.tsx apps/web/src/dev/sample.ts
git commit -m "feat(web): an Invite friends panel from the account menu"
```

---

### Task 12: The site passes `?ref=` into the app

**Files:**
- Modify: `apps/landing/src/layouts/Base.astro`

**Interfaces:**
- Consumes: `site.app` (`apps/landing/src/config/site.ts:10`).

The landing has no test runner. Verify the built page instead.

- [ ] **Step 1: Rewrite the CTAs when a code is present**

In `Base.astro`, directly after `<Footer />` and before the `<Reveal />` comment, add:

```astro
    {/* An invite link lands here. Every way into the app carries its code on,
        so the friend is still the friend once they reach sign-in. Inline and
        after the markup, like Reveal, so the links exist when it runs. */}
    <script is:inline define:vars={{ app: site.app }}>
      (() => {
        const ref = new URLSearchParams(location.search).get("ref");
        if (!ref || !/^[A-Za-z0-9_-]{6,16}$/.test(ref)) return;
        for (const a of document.querySelectorAll(`a[href^="${app}"]`)) {
          const url = new URL(a.href);
          url.searchParams.set("ref", ref);
          a.href = url.toString();
        }
      })();
    </script>
```

- [ ] **Step 2: Build and check**

Run: `pnpm --filter @mercury/landing build && pnpm --filter @mercury/landing typecheck`
Expected: both pass.

Then run `pnpm --filter @mercury/landing dev` and open `/?ref=abcdefgh`. In devtools, every `a[href^="https://beta.trymercury.xyz"]` should end in `?ref=abcdefgh`. On `/` with no `ref`, the links should be unchanged.

- [ ] **Step 3: Commit**

```bash
git add apps/landing/src/layouts/Base.astro
git commit -m "feat(landing): carry an invite code into the app"
```

---

### Task 13: Mark it done

**Files:**
- Modify: `docs/revenue-todo.md` §3

- [ ] **Step 1: Tick what this plan built**

In `docs/revenue-todo.md` §3, change the heading line under "3 · Referral tracking" to `**Built <date>.** See docs/superpowers/plans/2026-10-17-referral-tracking.md.` Tick these items:
- Give every user a referral code and a share link
- Read `?ref=` on landing and web, keep it through Privy sign-in, then attach it at first sign-in
- Store who invited whom: one inviter, set once, no self-referral
- Count a referral only once the friend funds $50+ and trades once
- Friend discount: 25% off fees for 90 days, applied in the fee function from item 1
- Inviter tiers by funded friends: 0–9 → 25%, 10–49 → 30%, 50+ → 35% (computed; shown with rewards)
- Founding 500 start at 30%: match `waitlist.email` to `user.email`
- Keep `?ref=` when `/f/:slug` redirects

Leave "Invite screen: link, friends invited, friends funded, earned so far" unticked, and add after it: "(link and counts built; earnings arrive with §4)". Add one line under §3: "Mobile has no Invite screen yet: `apps/mobile/app/settings.tsx` is where its row goes."

- [ ] **Step 2: Commit**

```bash
git add docs/revenue-todo.md
git commit -m "docs: referral tracking is built"
```

---

## After this plan

- **Mobile Invite screen.** Add a row in `apps/mobile/app/settings.tsx` that pushes a new `app/invite.tsx`, reading the same `GET /v1/referrals` through `src/api/client.ts`, and share with `Share.share` (as `add-cash.tsx:56` does). Mobile users can already claim a code by signing in on the web first, so this can wait.
- **The rewards plan** (`2026-10-17-referral-rewards.md`) starts after the lawyer answers, and after the trading fee has run a few weeks, per the deck's order of work.
