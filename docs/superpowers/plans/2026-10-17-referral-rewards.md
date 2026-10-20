# Referral Rewards and Payouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An inviter earns 25%, 30% or 35% of Mercury's fee on each funded friend's trades for 12 months. Each reward is held for 7 days and voided if the trade was half of a quick round trip. Whatever is payable is sent once a week in USDC, $1 minimum, to the inviter's own wallet, and the Invite panel shows it.

**Architecture:** Two tables: `referral_reward`, one row per friend's filled order, and `referral_payout`, one row per inviter per ISO week. The bookkeeping (accrue, then mature) runs in the existing `referral-qualify` job and moves no money. A separate `referral-payouts` job plans, sends and confirms the transfers. It is registered only when `REFERRAL_PAYOUTS=on` and a relayer is configured. Each payout is a plain USDC transfer from the relayer's own account, signed by the relayer alone. Its signature is recorded before it is broadcast.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`), drizzle-orm 0.45 on Postgres (PGlite in tests), `@solana/kit` 2.3.0, `@solana-program/token` 0.5.1, decimal.js through `@mercury/core`, Vitest. Web: React and TanStack Query.

**Spec:** _How Mercury makes money_ (internal deck, 14 October 2026), section 04, and `docs/revenue-todo.md` §4.

**Depends on:** `docs/superpowers/plans/2026-10-17-referral-tracking.md`, all of it: the `referral` table, `ReferralStore`, `inviterShare`, the `referral-qualify` job, `GET /v1/referrals`, the Invite panel, and the seed helpers in `referrals/testing.ts`.

**Gate:**

- **Do not set `REFERRAL_PAYOUTS=on` in any environment until the lawyer has answered** `docs/revenue-todo.md`'s "Can we pay inviters a share of stock-trading fees in our launch markets?"
- The deck also says payouts start "after the trade fee has run a few weeks".
- Everything except the payout job can merge and run before then. It only writes rows.

## Global Constraints

- **Net fee** is `order.mercury_fee_usd`, exactly. Jupiter takes no cut on our path (`docs/revenue-todo.md` note A). The friend's 25% discount is already inside that figure. On a friend's $1,000 trade in their first 90 days: fee $3.75, inviter at 25% $0.9375.
- Rewards accrue only from orders with `status = 'filled'`, a positive `mercury_fee_usd`, and `filled_at` within **365 days** of `referral.created_at` (and not before it). The referral must be **qualified**. Orders before qualification still count once it qualifies, the qualifying trade included.
- The share is the inviter's tier **when the reward is written**, and it is stored on the row. A later tier change never rewrites an old reward.
- **Hold:** a reward becomes payable 7 days after the order filled.
- **Clawback:** a reward is voided if the same friend filled an opposite-side order in the same **instrument** (not token: one stock has several wrappers) less than 7 days before or after it. Both legs of a round trip are voided.
- **Payout:**
  - One per inviter per ISO week (UTC), and only when **≥ $1** is payable.
  - The amount is floored to USDC's 6 decimals.
  - It goes to the inviter's primary wallet (`wallets.is_primary`).
  - The relayer pays the network fee and, if needed, the rent for the recipient's USDC account. That is a cost to Mercury: a fraction of a cent per payout, plus a few tenths of a dollar the first time an inviter is paid.
- **A payout is written before it is sent, and its signature before it is broadcast.** A crash can leave a payout whose fate is unknown, never a transfer nobody recorded. A payout is released (rewards back to payable) only once the chain says it failed, or its blockhash has expired unseen.
- **Caps:** one payout above `REFERRAL_PAYOUT_MAX_USD` (default 250), or a week's total above `REFERRAL_PAYOUT_WEEKLY_MAX_USD` (default 5000), is parked as `review` and not sent. A person releases it by setting its status back to `pending`.
- Never a float for money: `numeric(38,18)` columns via `usd()`, written as `toFixed(18)`, read with `D()`.
- `vitest` does not typecheck. Before every commit, run the package's `typecheck` and `test`.
- Conventional commits.

## Facts established by reading the repo (do not re-derive)

- **The relayer.** It is loaded once in `services/api/src/index.ts:104–107` as `relay = { signer: await keypairRelaySigner(config.relayerSecretKey), builds }`. `RelaySigner` is `{ address, cosign(base64) }`, and `cosign` partially signs with the relayer's key (`relay/signer.ts:70–84`). A transaction whose only signer is the relayer is therefore fully signed by `cosign`. Fees collect in the relayer's USDC account. Vercel has no relayer (`vercel.ts:46–59`), so the payout job cannot run there.
- **No code sends USDC from our side today.** `relay/transfer.ts` is the pattern to follow: `findAssociatedTokenPda`, `getCreateAssociatedTokenIdempotentInstruction` and `getTransferInstruction` from `@solana-program/token`, with `createNoopSigner` for signers whose keys are elsewhere.
- **Sending and confirming.** `routes/send.ts:395–418`: `rpc.sendTransaction(wire, { encoding: "base64", preflightCommitment: "confirmed", maxRetries: 3n })`, then `getSignatureStatuses`. `feePayerSignature(wire)` is a private helper at `routes/send.ts:63–74`. This plan moves it to `relay/signature.ts`.
- **Test signers.** Use a seed we own: `keypairRelaySigner(getBase58Decoder().decode(Uint8Array.from({ length: 32 }, () => 7)))` (`relay/signer.test.ts:34–41`). Random addresses come from `generateKeyPairSigner()` in `@solana/kit` (`routes/send.test.ts:28`).
- **Activity tagging.** `funding/enrich.ts` names a `transfer_in` row after the fact: update only, never insert, guarded by `ref_table is null or (ref_table = X and ref_id = id)`. A payout lands in the inviter's wallet as an ordinary `transfer_in`, and gets tagged the same way. The tracking plan's qualification query already ignores rows tagged `referral_payout`.
- **Jobs.** `every()` runs on boot and then on its interval, in one process. So "weekly" must be a key in the database (the ISO week), not the interval.
- **Config.** `readConfig` is in `deps.ts:239`. The `basisPoints` helper (`deps.ts:207–225`) is the pattern for validating a number. Tests live in `config.test.ts`, starting from `base = { DATABASE_URL, PRIVY_APP_ID, SOLANA_RPC_URL }`. Optional env is documented in `services/api/.env.example`.
- **ADRs.** The last is `docs/adr/0016-price-history.md`. ADR 0015 warns that a key able to send arbitrary value from the public HTTP process "widens the blast radius". This plan does exactly that, so it gets an ADR.

---

### Task 1: Write down the decision

**Files:**

- Create: `docs/adr/0017-referral-payouts-from-the-relayer.md`

- [ ] **Step 1: Write the ADR**

```markdown
# ADR 0017 · Referral payouts come from the relayer, in-process, capped

**Status:** accepted · <date>

## Context

The referral programme pays inviters a share of Mercury's trading fee every
week in USDC. That is the first time Mercury sends its own money to a user
without the user signing anything. The fees it pays out of already sit in the
relayer's USDC account, and the relayer key is already loaded by the API.

ADR 0015 named the risk: a key that can send arbitrary value from the public
HTTP process widens the blast radius. The treasury service it proposed was
deleted, so there is no other place a key lives.

## Decision

- Payouts are sent from the relayer's own USDC account by a job inside the API
  process, the only place the key already is.
- The job is off unless `REFERRAL_PAYOUTS=on`. It is never on before the lawyer
  has said inviters may be paid a share of trading fees.
- It sends only to the inviter's primary embedded wallet, read from `wallet`,
  never to an address from a request.
- No single payout above `REFERRAL_PAYOUT_MAX_USD` and no week above
  `REFERRAL_PAYOUT_WEEKLY_MAX_USD` is sent. Those are parked as `review` for a
  person to release.
- Each payout is a row before it is a transaction, and its signature is stored
  before it is broadcast.

## Consequences

- A compromised API process can drain the relayer, as it already could by
  co-signing. The caps bound what this job does on its own, not what a thief
  holding the key can do.
- Fees not yet swept to a treasury are what pays inviters. If the sweep in
  `docs/revenue-todo.md` §1 is built, it must leave enough for the week's
  payouts.
- Moving payouts to a separate signer later changes only the job's wiring.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0017-referral-payouts-from-the-relayer.md
git commit -m "docs: ADR 0017, referral payouts from the relayer"
```

---

### Task 2: The tables, and the reward rules

**Files:**

- Modify: `services/api/src/db/schema.ts` (two tables after `referrals`)
- Create: `services/api/drizzle/0028_referral_rewards.sql` (the next free number after `0027_referral`) and its `meta/` snapshot (generated)
- Modify: `services/api/src/referrals/rules.ts`
- Test: `services/api/src/referrals/rules.test.ts`

**Interfaces:**

- Produces (schema): `referralPayouts` (`id, inviterId, week, amountUsd, wallet, status, txSignature, lastValidBlockHeight, error, createdAt, updatedAt`) and `referralRewards` (`id, referralId, inviterId, friendId, orderId, feeUsd, share, amountUsd, earnedAt, payableAt, status, payoutId, createdAt`), plus their `$inferSelect` types.
- Produces (rules): `REWARD_DAYS = 365`, `HOLD_DAYS = 7`, `PAYOUT_MINIMUM_USD: Decimal` (1), `isoWeek(d: Date): string`, `floorToUsdc(d: Decimal): Decimal`.

- [ ] **Step 1: Write the failing rule tests**

Append to `services/api/src/referrals/rules.test.ts`, adding `floorToUsdc, isoWeek` to its import and `import { D } from "@mercury/core";`:

```ts
/* ISO weeks run Monday to Sunday, and a week belongs to the year its Thursday is in. */
describe("isoWeek", () => {
  it.each([
    ["2026-10-17T12:00:00Z", "2026-W42"], // a Saturday
    ["2026-10-19T00:00:00Z", "2026-W43"], // the Monday after
    ["2026-12-31T23:59:59Z", "2026-W53"], // 2026 starts on a Thursday, so it has 53
    ["2027-01-01T00:00:00Z", "2026-W53"], // a Friday that still belongs to 2026
    ["2027-01-04T00:00:00Z", "2027-W01"],
  ])("puts %s in %s", (iso, week) => {
    expect(isoWeek(new Date(iso))).toBe(week);
  });
});

describe("floorToUsdc", () => {
  it("drops what USDC cannot carry, never rounding up", () => {
    expect(floorToUsdc(D("1.2345679")).toString()).toBe("1.234567");
    expect(floorToUsdc(D("0.9375")).toString()).toBe("0.9375");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/rules.test.ts`
Expected: FAIL. `isoWeek` is not exported.

- [ ] **Step 3: Add the rules**

Append to `services/api/src/referrals/rules.ts`:

```ts
/** "12 months" in the deck, counted from when the friend was referred. */
export const REWARD_DAYS = 365;
/** A reward waits this long before it can be paid, and a round trip inside it voids both legs. */
export const HOLD_DAYS = 7;
export const PAYOUT_MINIMUM_USD = D(1);

/** USDC has six decimals. Anything finer is not money we can send. */
export const floorToUsdc = (d: Decimal): Decimal => d.toDecimalPlaces(6, Decimal.ROUND_DOWN);

/** "2026-W42". The week a payout belongs to, so one is sent per inviter per week however often the job runs. */
export const isoWeek = (d: Date): string => {
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
};
```

- [ ] **Step 4: Add the tables**

In `schema.ts`, after the `referrals` table:

```ts
/**
 * One week's payment to one inviter. Written before anything is sent; the
 * signature is written before it is broadcast, so a crash leaves a row to look
 * up, never a payment nobody recorded.
 *
 * pending → sent → confirmed, or → failed (its rewards go back to payable).
 * review: over a cap, parked until a person sets it back to pending.
 */
export const referralPayouts = pgTable(
  "referral_payout",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** ISO week, "2026-W43": one payout per inviter per week. */
    week: text("week").notNull(),
    amountUsd: usd("amount_usd").notNull(),
    /** The inviter's primary wallet when the payout was planned. */
    wallet: text("wallet").notNull(),
    status: text("status", { enum: ["pending", "review", "sent", "confirmed", "failed"] })
      .notNull()
      .default("pending"),
    txSignature: text("tx_signature"),
    /** Past this block height an unseen transaction can never land, so the payout is safe to release. */
    lastValidBlockHeight: bigint("last_valid_block_height", { mode: "bigint" }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("referral_payout_week_idx").on(t.inviterId, t.week),
    uniqueIndex("referral_payout_tx_idx").on(t.txSignature),
    index("referral_payout_status_idx").on(t.status),
  ],
);

/**
 * What one friend's filled order earned their inviter. One row per order,
 * written once. The share is the tier when it was earned, kept on the row so a
 * later tier never rewrites it.
 *
 * held → payable after seven days, or → void if it was half of a round trip.
 * payable → paid once the payout carrying it confirms.
 */
export const referralRewards = pgTable(
  "referral_reward",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referralId: uuid("referral_id")
      .notNull()
      .references(() => referrals.id, { onDelete: "cascade" }),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    friendId: uuid("friend_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** Mercury's fee on the friend's order, as `order.mercury_fee_usd` recorded it. */
    feeUsd: usd("fee_usd").notNull(),
    share: usd("share").notNull(),
    amountUsd: usd("amount_usd").notNull(),
    earnedAt: timestamp("earned_at", { withTimezone: true }).notNull(),
    payableAt: timestamp("payable_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: ["held", "payable", "void", "paid"] })
      .notNull()
      .default("held"),
    /** The payout carrying it. Set while in flight, cleared if that payout fails. */
    payoutId: uuid("payout_id").references(() => referralPayouts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("referral_reward_order_idx").on(t.orderId),
    index("referral_reward_inviter_idx").on(t.inviterId, t.status),
    index("referral_reward_due_idx").on(t.status, t.payableAt),
  ],
);
export type ReferralPayout = typeof referralPayouts.$inferSelect;
export type ReferralReward = typeof referralRewards.$inferSelect;
```

- [ ] **Step 5: Generate the migration**

Run: `cd services/api && DATABASE_URL="postgres://unused" pnpm drizzle-kit generate --name referral_rewards`
Expected: `drizzle/0028_referral_rewards.sql`, holding the two `CREATE TABLE`s, their foreign keys and six indexes, and nothing else. Read it.

- [ ] **Step 6: Run the tests to see them pass**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/rules.test.ts src/referrals/schema.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck, test, commit**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api test
git add services/api/src/db/schema.ts services/api/drizzle services/api/src/referrals/rules.ts services/api/src/referrals/rules.test.ts
git commit -m "feat(api): referral reward and payout tables"
```

---

### Task 3: Accruing rewards

**Files:**

- Modify: `services/api/src/referrals/store.ts` (add `shareFor`, and use it in `summary`)
- Modify: `services/api/src/referrals/testing.ts` (add `seedWallet`, `seedReferral`)
- Create: `services/api/src/referrals/rewards.ts`
- Test: `services/api/src/referrals/rewards.test.ts`

**Interfaces:**

- Consumes: `referralRewards` (Task 2); `REWARD_DAYS`, `HOLD_DAYS` (Task 2); `inviterShare` and `ReferralStore` (tracking plan); seed helpers.
- Produces: `ReferralStore.shareFor(inviterId: string): Promise<Decimal>`; `accrueRewards(db: Db, store: Pick<ReferralStore, "shareFor">, now: Date): Promise<number>`; seed helpers `seedWallet(db, userId, address)` and `seedReferral(db, { inviterId, friendId, createdAt?, qualifiedAt? })`.

- [ ] **Step 1: Add the seed helpers**

Append to `services/api/src/referrals/testing.ts`, and add `referrals, wallets` to its schema import:

```ts
export const seedWallet = async (db: Db, userId: string, address: string) =>
  db.insert(wallets).values({ userId, address, kind: "privy_embedded", isPrimary: true });

export const seedReferral = async (
  db: Db,
  r: { inviterId: string; friendId: string; createdAt?: Date; qualifiedAt?: Date | null },
) =>
  (
    await db
      .insert(referrals)
      .values({ code: "seeded00", qualifiedAt: null, ...r })
      .returning()
  )[0]!;
```

- [ ] **Step 2: Write the failing tests**

```ts
// services/api/src/referrals/rewards.test.ts
import { describe, expect, it } from "vitest";
import { testDb } from "../db/testing.js";
import { referralRewards } from "../db/schema.js";
import { accrueRewards } from "./rewards.js";
import { createReferralStore } from "./store.js";
import { seedInstrument, seedOrder, seedReferral, seedUser, seedWaitlist } from "./testing.js";

const DAY = 86_400_000;
const t0 = new Date("2026-10-01T12:00:00Z");
const at = (days: number) => new Date(t0.getTime() + days * DAY);

const setup = async (over: { qualified?: boolean; inviterEmail?: string } = {}) => {
  const db = await testDb();
  const store = createReferralStore(db);
  const inviter = await seedUser(db, 1, over.inviterEmail === undefined ? {} : { email: over.inviterEmail });
  const friend = await seedUser(db, 2);
  await seedReferral(db, {
    inviterId: inviter.id,
    friendId: friend.id,
    createdAt: t0,
    qualifiedAt: over.qualified === false ? null : at(1),
  });
  const nvda = await seedInstrument(db);
  const order = (o: { days: number; fee?: string; status?: "filled" | "executing" }) =>
    seedOrder(db, {
      userId: friend.id,
      instrumentId: nvda.id,
      side: "buy",
      status: o.status ?? "filled",
      filledAt: at(o.days),
      mercuryFeeUsd: o.fee ?? "2.5",
    });
  const rewards = () => db.select().from(referralRewards);
  return { db, store, inviter, friend, nvda, order, rewards };
};

describe("accrueRewards", () => {
  it("credits the inviter a quarter of Mercury's fee, held for seven days", async () => {
    const { db, store, inviter, order, rewards } = await setup();
    const o = await order({ days: 2 });
    expect(await accrueRewards(db, store, at(3))).toBe(1);
    const [r] = await rewards();
    expect(r).toMatchObject({
      inviterId: inviter.id,
      orderId: o.id,
      status: "held",
      earnedAt: at(2),
      payableAt: at(9),
    });
    expect(Number(r!.amountUsd)).toBe(0.625);
    expect(Number(r!.share)).toBe(0.25);
  });

  it("credits a founding inviter 30%", async () => {
    const { db, store, order, rewards } = await setup({ inviterEmail: "ada@example.com" });
    await seedWaitlist(db, { email: "ada@example.com", slug: "3kQ9xZ1bTq7w", position: 3 });
    await order({ days: 2 });
    await accrueRewards(db, store, at(3));
    expect(Number((await rewards())[0]!.amountUsd)).toBe(0.75);
  });

  it("credits nothing until the friend is funded", async () => {
    const { db, store, order } = await setup({ qualified: false });
    await order({ days: 2 });
    expect(await accrueRewards(db, store, at(3))).toBe(0);
  });

  it("credits a trade from before the friend counted, once they do", async () => {
    const { db, store, order } = await setup();
    await order({ days: 0.5 });
    expect(await accrueRewards(db, store, at(3))).toBe(1);
  });

  it.each([
    ["before the referral", { days: -1 }],
    ["after twelve months", { days: 366 }],
    ["not filled", { days: 2, status: "executing" as const }],
    ["with no fee", { days: 2, fee: "0" }],
  ])("credits nothing for an order %s", async (_, o) => {
    const { db, store, order } = await setup();
    await order(o);
    expect(await accrueRewards(db, store, at(400))).toBe(0);
  });

  it("credits an order once however often it runs", async () => {
    const { db, store, order, rewards } = await setup();
    await order({ days: 2 });
    await accrueRewards(db, store, at(3));
    expect(await accrueRewards(db, store, at(4))).toBe(0);
    expect(await rewards()).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/rewards.test.ts`
Expected: FAIL. Cannot find module `./rewards.js`.

- [ ] **Step 4: Add `shareFor` to the store**

In `store.ts`, add to the interface:

```ts
  /** The inviter's share today: by funded friends, with the founding floor. */
  shareFor(inviterId: string): Promise<Decimal>;
```

Inside `createReferralStore`, after `isFounding`, add:

```ts
const shareFor = async (inviterId: string): Promise<Decimal> => {
  const [row] = await db
    .select({ funded: count(referrals.qualifiedAt) })
    .from(referrals)
    .where(eq(referrals.inviterId, inviterId));
  return inviterShare(row?.funded ?? 0, await isFounding(inviterId));
};
```

In `summary`, replace `share: inviterShare(funded, founding),` with `share: await shareFor(userId),`, and add `shareFor` to the returned object. `summary`'s existing test still passes unchanged.

- [ ] **Step 5: Write `accrueRewards`**

```ts
// services/api/src/referrals/rewards.ts
import { and, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { D, type Decimal } from "@mercury/core";
import type { Db } from "../db/client.js";
import { orders, referralRewards, referrals } from "../db/schema.js";
import { HOLD_DAYS, REWARD_DAYS } from "./rules.js";
import type { ReferralStore } from "./store.js";

const DAY = 86_400_000;

/**
 * Write a reward for every funded friend's filled order that has none yet.
 *
 * Bookkeeping only: nothing here moves money, which is why it runs whether or
 * not payouts are switched on. The share is read once per inviter per pass and
 * stored on the row, so the tier a reward was earned at is the tier it keeps.
 */
export const accrueRewards = async (
  db: Db,
  store: Pick<ReferralStore, "shareFor">,
  _now: Date,
): Promise<number> => {
  const due = await db
    .select({
      referralId: referrals.id,
      inviterId: referrals.inviterId,
      friendId: referrals.friendId,
      orderId: orders.id,
      feeUsd: orders.mercuryFeeUsd,
      filledAt: orders.filledAt,
    })
    .from(orders)
    .innerJoin(referrals, eq(referrals.friendId, orders.userId))
    .leftJoin(referralRewards, eq(referralRewards.orderId, orders.id))
    .where(
      and(
        isNotNull(referrals.qualifiedAt),
        eq(orders.status, "filled"),
        isNotNull(orders.filledAt),
        sql`${orders.mercuryFeeUsd} > 0`,
        gte(orders.filledAt, referrals.createdAt),
        sql`${orders.filledAt} < ${referrals.createdAt} + (${REWARD_DAYS} * interval '1 day')`,
        isNull(referralRewards.id),
      ),
    )
    .limit(1000);
  if (due.length === 0) return 0;

  const shares = new Map<string, Decimal>();
  for (const inviterId of new Set(due.map((r) => r.inviterId))) {
    shares.set(inviterId, await store.shareFor(inviterId));
  }

  const written = await db
    .insert(referralRewards)
    .values(
      due.map((r) => {
        const fee = D(r.feeUsd ?? "0");
        const share = shares.get(r.inviterId) ?? D(0);
        const earnedAt = r.filledAt ?? new Date(0);
        return {
          referralId: r.referralId,
          inviterId: r.inviterId,
          friendId: r.friendId,
          orderId: r.orderId,
          feeUsd: fee.toFixed(18),
          share: share.toFixed(18),
          amountUsd: fee.mul(share).toFixed(18),
          earnedAt,
          payableAt: new Date(earnedAt.getTime() + HOLD_DAYS * DAY),
        };
      }),
    )
    .onConflictDoNothing()
    .returning({ id: referralRewards.id });
  return written.length;
};
```

The `_now` parameter is unused today. It is there so every function in this module has the same shape for the job that calls them, and so a later rule that needs the clock does not change call sites.

- [ ] **Step 6: Run them to see them pass**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/rewards.test.ts src/referrals/store.test.ts`
Expected: PASS. 9 reward tests, and the store tests unchanged.

- [ ] **Step 7: Typecheck, test, commit**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api test
git add services/api/src/referrals/store.ts services/api/src/referrals/testing.ts services/api/src/referrals/rewards.ts services/api/src/referrals/rewards.test.ts
git commit -m "feat(api): accrue an inviter's share of each funded friend's fee"
```

---

### Task 4: The hold and the clawback

**Files:**

- Modify: `services/api/src/referrals/rewards.ts`
- Test: `services/api/src/referrals/rewards.test.ts`
- Modify: `services/api/src/index.ts` (the `referral-qualify` job also accrues and matures)

**Interfaces:**

- Consumes: `accrueRewards` (Task 3); `HOLD_DAYS` (Task 2).
- Produces: `matureRewards(db: Db, now: Date): Promise<{ voided: number; payable: number }>`.

- [ ] **Step 1: Write the failing tests**

Append to `rewards.test.ts`, adding `matureRewards` to the `./rewards.js` import:

```ts
describe("matureRewards", () => {
  const trade = async (s: Awaited<ReturnType<typeof setup>>, side: "buy" | "sell", days: number) =>
    seedOrder(s.db, {
      userId: s.friend.id,
      instrumentId: s.nvda.id,
      side,
      status: "filled",
      filledAt: at(days),
      mercuryFeeUsd: "2.5",
    });

  it("makes a reward payable once seven days have passed", async () => {
    const s = await setup();
    await trade(s, "buy", 2);
    await accrueRewards(s.db, s.store, at(3));
    expect(await matureRewards(s.db, at(8.9))).toEqual({ voided: 0, payable: 0 });
    expect(await matureRewards(s.db, at(9))).toEqual({ voided: 0, payable: 1 });
    expect((await s.rewards())[0]!.status).toBe("payable");
  });

  it("voids both legs of a buy sold within the week", async () => {
    const s = await setup();
    await trade(s, "buy", 2);
    await trade(s, "sell", 5);
    await accrueRewards(s.db, s.store, at(6));
    await matureRewards(s.db, at(20));
    expect((await s.rewards()).map((r) => r.status)).toEqual(["void", "void"]);
  });

  it("leaves a buy and a sell more than a week apart alone", async () => {
    const s = await setup();
    await trade(s, "buy", 2);
    await trade(s, "sell", 9.5);
    await accrueRewards(s.db, s.store, at(10));
    await matureRewards(s.db, at(20));
    expect((await s.rewards()).map((r) => r.status)).toEqual(["payable", "payable"]);
  });

  it("does not void two buys", async () => {
    const s = await setup();
    await trade(s, "buy", 2);
    await trade(s, "buy", 3);
    await accrueRewards(s.db, s.store, at(4));
    await matureRewards(s.db, at(20));
    expect((await s.rewards()).map((r) => r.status)).toEqual(["payable", "payable"]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/rewards.test.ts -t matureRewards`
Expected: FAIL. `matureRewards` is not exported.

- [ ] **Step 3: Write `matureRewards`**

Add `lte` to the drizzle import in `rewards.ts`, then append:

```ts
/**
 * Settle every held reward whose seven days are up: void it if it was half of
 * a round trip, otherwise make it payable.
 *
 * A round trip is the same friend filling a buy and a sell of the same
 * instrument less than seven days apart. Instrument, not token: one stock has
 * a wrapper per issuer, and selling one to buy the other is still a round trip.
 * Voiding runs first, so nothing it should catch is made payable in between.
 */
export const matureRewards = async (db: Db, now: Date): Promise<{ voided: number; payable: number }> => {
  const due = and(eq(referralRewards.status, "held"), lte(referralRewards.payableAt, now));

  const voided = await db
    .update(referralRewards)
    .set({ status: "void" })
    .where(
      and(
        due,
        sql`exists (
          select 1
          from ${orders} mine
          join ${orders} other
            on other.user_id = mine.user_id
           and other.instrument_id = mine.instrument_id
           and other.side <> mine.side
           and other.status = 'filled'
          where mine.id = ${referralRewards.orderId}
            and other.filled_at > mine.filled_at - (${HOLD_DAYS} * interval '1 day')
            and other.filled_at < mine.filled_at + (${HOLD_DAYS} * interval '1 day')
        )`,
      ),
    )
    .returning({ id: referralRewards.id });

  const payable = await db
    .update(referralRewards)
    .set({ status: "payable" })
    .where(due)
    .returning({ id: referralRewards.id });

  return { voided: voided.length, payable: payable.length };
};
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/rewards.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Run the bookkeeping in the existing job**

In `services/api/src/index.ts`, add `import { accrueRewards, matureRewards } from "./referrals/rewards.js";`, and replace the `referral-qualify` job body with:

```ts
every("referral-qualify", 10 * 60 * 1000, async () => {
  const now = new Date();
  const qualified = await referralStore.qualifyPending(now);
  const accrued = await accrueRewards(auth.db, referralStore, now);
  const { voided, payable } = await matureRewards(auth.db, now);
  if (qualified + accrued + voided + payable === 0) return null;
  return `${qualified} friends funded, ${accrued} rewards accrued, ${payable} payable, ${voided} voided`;
});
```

Update its row in the job table comment to:

```
 * | `referral-qualify`   | 10m     | `referral.qualified_at`, `referral_reward`           |
```

- [ ] **Step 6: Typecheck, test, commit**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api test
git add services/api/src/referrals/rewards.ts services/api/src/referrals/rewards.test.ts services/api/src/index.ts
git commit -m "feat(api): hold referral rewards a week and void quick round trips"
```

---

### Task 5: The payout transaction

**Files:**

- Create: `services/api/src/relay/signature.ts` (moved out of `routes/send.ts`)
- Modify: `services/api/src/routes/send.ts` (import it instead)
- Create: `services/api/src/referrals/payout-tx.ts`
- Test: `services/api/src/referrals/payout-tx.test.ts`

**Interfaces:**

- Produces: `feePayerSignature(wire: string): string | null` from `relay/signature.ts`; `buildPayoutTransfer(input: PayoutTransferInput): Promise<string>`, a base64 wire transaction with the relayer as its only signer.

- [ ] **Step 1: Move `feePayerSignature`**

Create `services/api/src/relay/signature.ts` holding the function exactly as it is at `routes/send.ts:63–74`, exported, with the imports it uses:

```ts
import {
  getBase58Decoder,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
} from "@solana/kit";

/** The fee payer's signature, which is the transaction's id. Null for anything that is not a signed transaction. */
export const feePayerSignature = (wire: string): string | null => {
  try {
    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(wire));
    const message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
    const payer = message.staticAccounts[0];
    if (payer === undefined) return null;
    const sig = tx.signatures[payer as keyof typeof tx.signatures];
    return sig ? getBase58Decoder().decode(sig) : null;
  } catch {
    return null;
  }
};
```

In `routes/send.ts`, delete the local `feePayerSignature` and add `import { feePayerSignature } from "../relay/signature.js";`. Remove any `@solana/kit` imports that only it used. `tsc` reports them as unused.

Run: `pnpm --filter @mercury/api exec vitest run src/routes/send.test.ts`
Expected: PASS, unchanged.

- [ ] **Step 2: Write the failing test**

```ts
// services/api/src/referrals/payout-tx.test.ts
import {
  generateKeyPairSigner,
  getBase58Decoder,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type Blockhash,
} from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { keypairRelaySigner } from "../relay/signer.js";
import { feePayerSignature } from "../relay/signature.js";
import { buildPayoutTransfer } from "./payout-tx.js";

const relayerSigner = () =>
  keypairRelaySigner(getBase58Decoder().decode(Uint8Array.from({ length: 32 }, () => 7)));
const BLOCKHASH = "4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZAMdL4VZHirAn" as Blockhash;

const transferredIn = (wire: string): bigint => {
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(wire));
  const message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  const transfer = message.instructions.find(
    (ix) => message.staticAccounts[ix.programAddressIndex] === TOKEN_PROGRAM_ADDRESS && ix.data?.[0] === 3,
  );
  const data = transfer!.data!;
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(1, true);
};

describe("buildPayoutTransfer", () => {
  it("sends the amount from the relayer, which is the only signer", async () => {
    const relayer = await relayerSigner();
    const inviter = await generateKeyPairSigner();
    const wire = await buildPayoutTransfer({
      relayer: relayer.address,
      recipient: inviter.address,
      amountUsd: D("12.3456789"),
      blockhash: BLOCKHASH,
      lastValidBlockHeight: 100n,
    });
    const signed = await relayer.cosign(wire);

    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(signed));
    const message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
    expect(message.header.numSignerAccounts).toBe(1);
    expect(message.staticAccounts[0]).toBe(relayer.address);
    expect(feePayerSignature(signed)).not.toBeNull();
    /* Floored to USDC's six decimals: 12.345678, never 12.345679. */
    expect(transferredIn(signed)).toBe(12_345_678n);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/payout-tx.test.ts`
Expected: FAIL. Cannot find module `./payout-tx.js`.

- [ ] **Step 4: Write the builder**

```ts
// services/api/src/referrals/payout-tx.ts
import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { USDC_DECIMALS, USDC_MINT } from "@mercury/chain";
import { Decimal } from "@mercury/core";
import { floorToUsdc } from "./rules.js";

const USDC = USDC_MINT as Address;

export interface PayoutTransferInput {
  readonly relayer: Address;
  /** The inviter's wallet, not their token account; the account is derived. */
  readonly recipient: Address;
  readonly amountUsd: Decimal;
  readonly blockhash: Blockhash;
  readonly lastValidBlockHeight: bigint;
}

/**
 * USDC from the relayer's own account to an inviter's wallet.
 *
 * `relay/transfer.ts` has a user send and the relayer pay. Here the relayer
 * does both: it owns the USDC and it pays the fee, so it is the only signer
 * and `cosign` completes the transaction. The recipient's USDC account is
 * opened if they have none, at the relayer's expense, because a payout that
 * fails for want of $0.20 of rent is a payout nobody receives.
 */
export const buildPayoutTransfer = async (input: PayoutTransferInput): Promise<string> => {
  const ata = (owner: Address) =>
    findAssociatedTokenPda({ owner, mint: USDC, tokenProgram: TOKEN_PROGRAM_ADDRESS }).then(([a]) => a);
  const [source, destination] = await Promise.all([ata(input.relayer), ata(input.recipient)]);
  const relayer = createNoopSigner(input.relayer);
  const amount = BigInt(
    floorToUsdc(input.amountUsd)
      .mul(10 ** USDC_DECIMALS)
      .toFixed(0, Decimal.ROUND_DOWN),
  );

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(input.relayer, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: input.blockhash, lastValidBlockHeight: input.lastValidBlockHeight },
        m,
      ),
    (m) =>
      appendTransactionMessageInstructions(
        [
          getCreateAssociatedTokenIdempotentInstruction({
            payer: relayer,
            ata: destination,
            owner: input.recipient,
            mint: USDC,
          }),
          getTransferInstruction({ source, destination, authority: relayer, amount }),
        ],
        m,
      ),
  );
  return getBase64EncodedWireTransaction(compileTransaction(message));
};
```

- [ ] **Step 5: Run it to see it pass**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/payout-tx.test.ts src/routes/send.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck, test, commit**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api test
git add services/api/src/relay/signature.ts services/api/src/routes/send.ts services/api/src/referrals/payout-tx.ts services/api/src/referrals/payout-tx.test.ts
git commit -m "feat(api): a USDC transfer from the relayer, for referral payouts"
```

---

### Task 6: Planning a week's payouts

**Files:**

- Create: `services/api/src/referrals/payouts.ts`
- Test: `services/api/src/referrals/payouts.test.ts`
- Modify: `services/api/src/referrals/testing.ts` (add `seedReward`)

**Interfaces:**

- Consumes: `referralPayouts`, `referralRewards` (Task 2); `isoWeek`, `floorToUsdc`, `PAYOUT_MINIMUM_USD` (Task 2).
- Produces: `interface PayoutLimits { maxPerPayoutUsd: Decimal; maxPerWeekUsd: Decimal }` and `planPayouts(db: Db, now: Date, limits: PayoutLimits): Promise<number>`. Seed helper: `seedReward(db, { referralId, inviterId, friendId, orderId, amountUsd, status })`.

- [ ] **Step 1: Add the seed helper**

Append to `testing.ts`, adding `referralRewards` to its schema import:

```ts
export const seedReward = async (
  db: Db,
  r: {
    referralId: string;
    inviterId: string;
    friendId: string;
    orderId: string;
    amountUsd: string;
    status: "held" | "payable" | "void" | "paid";
  },
) =>
  (
    await db
      .insert(referralRewards)
      .values({
        ...r,
        feeUsd: "0",
        share: "0.25",
        earnedAt: new Date("2026-10-01T00:00:00Z"),
        payableAt: new Date("2026-10-08T00:00:00Z"),
      })
      .returning()
  )[0]!;
```

- [ ] **Step 2: Write the failing tests**

```ts
// services/api/src/referrals/payouts.test.ts
import { eq } from "drizzle-orm";
import { generateKeyPairSigner } from "@solana/kit";
import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { testDb } from "../db/testing.js";
import { referralPayouts, referralRewards, wallets } from "../db/schema.js";
import { planPayouts } from "./payouts.js";
import { seedInstrument, seedOrder, seedReferral, seedReward, seedUser, seedWallet } from "./testing.js";

const limits = { maxPerPayoutUsd: D(250), maxPerWeekUsd: D(5000) };
const monday = new Date("2026-10-19T01:00:00Z"); // 2026-W43

/** An inviter with a wallet, one funded friend, and rewards of the given amounts. */
const owed = async (amounts: string[], status: "payable" | "held" = "payable") => {
  const db = await testDb();
  const inviter = await seedUser(db, 1);
  const wallet = (await generateKeyPairSigner()).address;
  await seedWallet(db, inviter.id, wallet);
  const friend = await seedUser(db, 2);
  const referral = await seedReferral(db, {
    inviterId: inviter.id,
    friendId: friend.id,
    qualifiedAt: new Date(),
  });
  const nvda = await seedInstrument(db);
  for (const amountUsd of amounts) {
    const order = await seedOrder(db, {
      userId: friend.id,
      instrumentId: nvda.id,
      side: "buy",
      status: "filled",
    });
    await seedReward(db, {
      referralId: referral.id,
      inviterId: inviter.id,
      friendId: friend.id,
      orderId: order.id,
      amountUsd,
      status,
    });
  }
  return { db, inviter, wallet };
};

describe("planPayouts", () => {
  it("plans one payout of everything payable, floored to USDC", async () => {
    const { db, inviter, wallet } = await owed(["0.625", "0.9375", "0.0000004"]);
    expect(await planPayouts(db, monday, limits)).toBe(1);
    const [p] = await db.select().from(referralPayouts);
    expect(p).toMatchObject({ inviterId: inviter.id, week: "2026-W43", wallet, status: "pending" });
    expect(D(p!.amountUsd).toString()).toBe("1.5625");
    const linked = await db.select().from(referralRewards).where(eq(referralRewards.payoutId, p!.id));
    expect(linked).toHaveLength(3);
  });

  it("waits until a dollar is owed", async () => {
    const { db } = await owed(["0.625"]);
    expect(await planPayouts(db, monday, limits)).toBe(0);
    expect(await db.select().from(referralRewards).where(eq(referralRewards.status, "payable"))).toHaveLength(
      1,
    );
  });

  it("does not pay what is still held", async () => {
    const { db } = await owed(["5"], "held");
    expect(await planPayouts(db, monday, limits)).toBe(0);
  });

  it("plans once a week however often it runs", async () => {
    const { db } = await owed(["5"]);
    await planPayouts(db, monday, limits);
    expect(await planPayouts(db, new Date("2026-10-25T23:00:00Z"), limits)).toBe(0);
    expect(await db.select().from(referralPayouts)).toHaveLength(1);
  });

  it("parks a payout over the cap for a person to look at", async () => {
    const { db } = await owed(["300"]);
    await planPayouts(db, monday, limits);
    expect((await db.select().from(referralPayouts))[0]!.status).toBe("review");
  });

  it("parks a payout that would take the week over its cap", async () => {
    const { db } = await owed(["200"]);
    await planPayouts(db, monday, { maxPerPayoutUsd: D(250), maxPerWeekUsd: D(150) });
    expect((await db.select().from(referralPayouts))[0]!.status).toBe("review");
  });

  it("pays nobody it has no wallet for", async () => {
    const { db, inviter } = await owed(["5"]);
    await db.delete(wallets).where(eq(wallets.userId, inviter.id));
    expect(await planPayouts(db, monday, limits)).toBe(0);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/payouts.test.ts`
Expected: FAIL. Cannot find module `./payouts.js`.

- [ ] **Step 4: Write `planPayouts`**

```ts
// services/api/src/referrals/payouts.ts
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { D, type Decimal } from "@mercury/core";
import type { Db } from "../db/client.js";
import { referralPayouts, referralRewards, wallets } from "../db/schema.js";
import { PAYOUT_MINIMUM_USD, floorToUsdc, isoWeek } from "./rules.js";

export interface PayoutLimits {
  readonly maxPerPayoutUsd: Decimal;
  readonly maxPerWeekUsd: Decimal;
}

/** Thrown inside a transaction to roll it back when there turns out to be too little to pay. */
class TooLittle extends Error {}

/**
 * One payout per inviter for this ISO week, carrying every payable reward not
 * already in one.
 *
 * Rewards are linked first and summed from what was linked, inside one
 * transaction, so a reward that turned payable a moment ago is either in this
 * payout and its amount or in neither.
 */
export const planPayouts = async (db: Db, now: Date, limits: PayoutLimits): Promise<number> => {
  const week = isoWeek(now);
  const inviters = await db
    .selectDistinct({ inviterId: referralRewards.inviterId })
    .from(referralRewards)
    .where(and(eq(referralRewards.status, "payable"), isNull(referralRewards.payoutId)));

  let planned = 0;
  for (const { inviterId } of inviters) {
    const [wallet] = await db
      .select({ address: wallets.address })
      .from(wallets)
      .where(and(eq(wallets.userId, inviterId), eq(wallets.isPrimary, true)));
    if (wallet === undefined) continue;

    try {
      const made = await db.transaction(async (tx) => {
        const [payout] = await tx
          .insert(referralPayouts)
          .values({ inviterId, week, amountUsd: "0", wallet: wallet.address })
          .onConflictDoNothing()
          .returning({ id: referralPayouts.id });
        if (payout === undefined) return false; // this week's is already planned

        const linked = await tx
          .update(referralRewards)
          .set({ payoutId: payout.id })
          .where(
            and(
              eq(referralRewards.inviterId, inviterId),
              eq(referralRewards.status, "payable"),
              isNull(referralRewards.payoutId),
            ),
          )
          .returning({ amountUsd: referralRewards.amountUsd });
        const amount = floorToUsdc(linked.reduce((sum, r) => sum.add(D(r.amountUsd)), D(0)));
        if (amount.lt(PAYOUT_MINIMUM_USD)) throw new TooLittle();

        const [weekSoFar] = await tx
          .select({ total: sql<string>`coalesce(sum(${referralPayouts.amountUsd}), 0)` })
          .from(referralPayouts)
          .where(
            and(
              eq(referralPayouts.week, week),
              inArray(referralPayouts.status, ["pending", "sent", "confirmed"]),
            ),
          );
        const overCap =
          amount.gt(limits.maxPerPayoutUsd) ||
          D(weekSoFar?.total ?? "0")
            .add(amount)
            .gt(limits.maxPerWeekUsd);

        await tx
          .update(referralPayouts)
          .set({ amountUsd: amount.toFixed(18), status: overCap ? "review" : "pending" })
          .where(eq(referralPayouts.id, payout.id));
        return true;
      });
      if (made) planned++;
    } catch (err) {
      if (!(err instanceof TooLittle)) throw err;
    }
  }
  return planned;
};
```

- [ ] **Step 5: Run them to see them pass**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/payouts.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Typecheck, test, commit**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api test
git add services/api/src/referrals/payouts.ts services/api/src/referrals/payouts.test.ts services/api/src/referrals/testing.ts
git commit -m "feat(api): plan one referral payout per inviter per week"
```

---

### Task 7: Sending and confirming

**Files:**

- Modify: `services/api/src/referrals/payouts.ts`
- Test: `services/api/src/referrals/payouts.test.ts`

**Interfaces:**

- Consumes: `buildPayoutTransfer` (Task 5); `feePayerSignature` (Task 5); `RelaySigner` (`relay/signer.ts`); `planPayouts` (Task 6).
- Produces:
  - `interface PayoutChain { latestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: bigint }>; send(wire: string): Promise<void>; status(signature: string): Promise<"confirmed" | "failed" | null>; blockHeight(): Promise<bigint> }`
  - `solanaPayoutChain(rpcUrl: string): PayoutChain`
  - `sendPayouts(db: Db, deps: { chain: PayoutChain; signer: RelaySigner }): Promise<number>`
  - `confirmPayouts(db: Db, chain: PayoutChain): Promise<{ confirmed: number; failed: number }>`

- [ ] **Step 1: Write the failing tests**

Append to `payouts.test.ts`, adding `confirmPayouts, sendPayouts, type PayoutChain` to the `./payouts.js` import, plus:

```ts
import { getBase58Decoder } from "@solana/kit";
import { keypairRelaySigner } from "../relay/signer.js";
```

```ts
const relayer = () => keypairRelaySigner(getBase58Decoder().decode(Uint8Array.from({ length: 32 }, () => 7)));

const fakeChain = (over: Partial<PayoutChain> = {}) => {
  const sent: string[] = [];
  const chain: PayoutChain = {
    latestBlockhash: async () => ({
      blockhash: "4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZAMdL4VZHirAn",
      lastValidBlockHeight: 100n,
    }),
    send: async (wire) => void sent.push(wire),
    status: async () => null,
    blockHeight: async () => 50n,
    ...over,
  };
  return { chain, sent };
};

describe("sendPayouts", () => {
  it("records the signature, then sends", async () => {
    const { db } = await owed(["5"]);
    await planPayouts(db, monday, limits);
    const { chain, sent } = fakeChain();
    expect(await sendPayouts(db, { chain, signer: await relayer() })).toBe(1);
    const [p] = await db.select().from(referralPayouts);
    expect(p).toMatchObject({ status: "sent", lastValidBlockHeight: 100n });
    expect(p!.txSignature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/);
    expect(sent).toHaveLength(1);
  });

  /* The send can fail after the transaction reached a validator. Only the chain knows; confirm will ask it. */
  it("keeps the payout as sent when the broadcast throws", async () => {
    const { db } = await owed(["5"]);
    await planPayouts(db, monday, limits);
    const { chain } = fakeChain({
      send: async () => {
        throw new Error("timeout");
      },
    });
    await sendPayouts(db, { chain, signer: await relayer() });
    expect((await db.select().from(referralPayouts))[0]!.status).toBe("sent");
  });

  it("sends nothing parked for review", async () => {
    const { db } = await owed(["300"]);
    await planPayouts(db, monday, limits);
    const { chain, sent } = fakeChain();
    expect(await sendPayouts(db, { chain, signer: await relayer() })).toBe(0);
    expect(sent).toHaveLength(0);
  });
});

describe("confirmPayouts", () => {
  const sentPayout = async () => {
    const o = await owed(["5"]);
    await planPayouts(o.db, monday, limits);
    await sendPayouts(o.db, { chain: fakeChain().chain, signer: await relayer() });
    const rewards = () => o.db.select().from(referralRewards);
    const payout = async () => (await o.db.select().from(referralPayouts))[0]!;
    return { ...o, rewards, payout };
  };

  it("marks a landed payout confirmed and its rewards paid", async () => {
    const s = await sentPayout();
    expect(await confirmPayouts(s.db, fakeChain({ status: async () => "confirmed" }).chain)).toEqual({
      confirmed: 1,
      failed: 0,
    });
    expect((await s.payout()).status).toBe("confirmed");
    expect((await s.rewards()).map((r) => r.status)).toEqual(["paid"]);
  });

  it("releases the rewards of a payout the chain refused", async () => {
    const s = await sentPayout();
    await confirmPayouts(s.db, fakeChain({ status: async () => "failed" }).chain);
    expect((await s.payout()).status).toBe("failed");
    expect(await s.rewards()).toMatchObject([{ status: "payable", payoutId: null }]);
  });

  it("releases a payout never seen once its blockhash has expired", async () => {
    const s = await sentPayout();
    await confirmPayouts(s.db, fakeChain({ blockHeight: async () => 101n }).chain);
    expect((await s.payout()).status).toBe("failed");
  });

  it("waits on a payout not seen yet whose blockhash is still good", async () => {
    const s = await sentPayout();
    expect(await confirmPayouts(s.db, fakeChain({ blockHeight: async () => 100n }).chain)).toEqual({
      confirmed: 0,
      failed: 0,
    });
    expect((await s.payout()).status).toBe("sent");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/payouts.test.ts`
Expected: FAIL. `sendPayouts` is not exported.

- [ ] **Step 3: Write send, confirm and the chain adapter**

Add these imports to `payouts.ts`:

```ts
import {
  createSolanaRpc,
  type Address,
  type Base64EncodedWireTransaction,
  type Blockhash,
  type Signature,
} from "@solana/kit";
import { logger } from "../log/index.js";
import { feePayerSignature } from "../relay/signature.js";
import type { RelaySigner } from "../relay/signer.js";
import { buildPayoutTransfer } from "./payout-tx.js";
```

Append:

```ts
const log = logger("referral-payouts");

/** What the payout job needs from Solana. An interface so the job can be tested without one. */
export interface PayoutChain {
  latestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: bigint }>;
  send(wire: string): Promise<void>;
  /** "confirmed" once it is in a confirmed block, "failed" if it landed with an error, null if not seen. */
  status(signature: string): Promise<"confirmed" | "failed" | null>;
  blockHeight(): Promise<bigint>;
}

export const solanaPayoutChain = (rpcUrl: string): PayoutChain => {
  const rpc = createSolanaRpc(rpcUrl);
  return {
    latestBlockhash: async () => {
      const { value } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
      return { blockhash: value.blockhash, lastValidBlockHeight: value.lastValidBlockHeight };
    },
    send: async (wire) => {
      await rpc
        .sendTransaction(wire as Base64EncodedWireTransaction, {
          encoding: "base64",
          preflightCommitment: "confirmed",
          maxRetries: 3n,
        })
        .send();
    },
    status: async (signature) => {
      const { value } = await rpc.getSignatureStatuses([signature as Signature]).send();
      const s = value[0];
      if (!s) return null;
      if (s.err) return "failed";
      return s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized"
        ? "confirmed"
        : null;
    },
    blockHeight: () => rpc.getBlockHeight({ commitment: "confirmed" }).send(),
  };
};

/**
 * Send every pending payout.
 *
 * The signature is written, and the row moved to `sent`, before the
 * transaction is broadcast. If the process dies in between, the row names a
 * transaction that may or may not exist, and `confirmPayouts` finds out. The
 * other order could leave money sent and no row saying so.
 */
export const sendPayouts = async (
  db: Db,
  deps: { chain: PayoutChain; signer: RelaySigner },
): Promise<number> => {
  const pending = await db.select().from(referralPayouts).where(eq(referralPayouts.status, "pending"));
  let sent = 0;
  for (const p of pending) {
    const { blockhash, lastValidBlockHeight } = await deps.chain.latestBlockhash();
    const wire = await buildPayoutTransfer({
      relayer: deps.signer.address as Address,
      recipient: p.wallet as Address,
      amountUsd: D(p.amountUsd),
      blockhash: blockhash as Blockhash,
      lastValidBlockHeight,
    });
    const signed = await deps.signer.cosign(wire);
    const signature = feePayerSignature(signed);
    if (signature === null) throw new Error("referral payout: the signed transaction carries no signature");

    const claimed = await db
      .update(referralPayouts)
      .set({ status: "sent", txSignature: signature, lastValidBlockHeight, updatedAt: new Date() })
      .where(and(eq(referralPayouts.id, p.id), eq(referralPayouts.status, "pending")))
      .returning({ id: referralPayouts.id });
    if (claimed.length === 0) continue;

    try {
      await deps.chain.send(signed);
    } catch (err) {
      log.warn({ payoutId: p.id, signature, err }, "payout broadcast failed; confirm will settle it");
    }
    sent++;
  }
  return sent;
};

/** Settle every sent payout the chain has an answer for. A failed one gives its rewards back to be paid next week. */
export const confirmPayouts = async (
  db: Db,
  chain: PayoutChain,
): Promise<{ confirmed: number; failed: number }> => {
  const inFlight = await db.select().from(referralPayouts).where(eq(referralPayouts.status, "sent"));
  let confirmed = 0;
  let failed = 0;
  for (const p of inFlight) {
    if (p.txSignature === null) continue;
    const status = await chain.status(p.txSignature);
    const expired =
      status === null &&
      p.lastValidBlockHeight !== null &&
      (await chain.blockHeight()) > p.lastValidBlockHeight;

    if (status === "confirmed") {
      await db.transaction(async (tx) => {
        await tx
          .update(referralPayouts)
          .set({ status: "confirmed", updatedAt: new Date() })
          .where(eq(referralPayouts.id, p.id));
        await tx.update(referralRewards).set({ status: "paid" }).where(eq(referralRewards.payoutId, p.id));
      });
      confirmed++;
    } else if (status === "failed" || expired) {
      await db.transaction(async (tx) => {
        await tx
          .update(referralPayouts)
          .set({
            status: "failed",
            error: status === "failed" ? "the chain refused it" : "never landed before its blockhash expired",
            updatedAt: new Date(),
          })
          .where(eq(referralPayouts.id, p.id));
        await tx.update(referralRewards).set({ payoutId: null }).where(eq(referralRewards.payoutId, p.id));
      });
      failed++;
    }
  }
  return { confirmed, failed };
};
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/payouts.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Typecheck, test, commit**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api test
git add services/api/src/referrals/payouts.ts services/api/src/referrals/payouts.test.ts
git commit -m "feat(api): send and confirm referral payouts, recording before broadcasting"
```

---

### Task 8: Name the payout in the inviter's activity

**Files:**

- Modify: `services/api/src/referrals/payouts.ts`
- Test: `services/api/src/referrals/payouts.test.ts`

**Interfaces:**

- Consumes: `confirmPayouts` (Task 7); `seedUsdcIn` (tracking plan).
- Produces: `reconcilePayoutActivity(db: Db, now: Date): Promise<number>`.

- [ ] **Step 1: Write the failing test**

Append to `payouts.test.ts`, adding `reconcilePayoutActivity` to the `./payouts.js` import, `activities` to the schema import, and `seedUsdcIn` to the `./testing.js` import:

```ts
describe("reconcilePayoutActivity", () => {
  it("names the payout on the row wallet-events wrote for it", async () => {
    const { db, inviter } = await owed(["5"]);
    await planPayouts(db, monday, limits);
    await sendPayouts(db, { chain: fakeChain().chain, signer: await relayer() });
    await confirmPayouts(db, fakeChain({ status: async () => "confirmed" }).chain);
    const payout = (await db.select().from(referralPayouts))[0]!;
    await seedUsdcIn(db, { userId: inviter.id, usd: "5", signature: payout.txSignature! });

    expect(await reconcilePayoutActivity(db, new Date())).toBe(1);
    const [row] = await db.select().from(activities);
    expect(row).toMatchObject({ title: "Invite reward", refTable: "referral_payout", refId: payout.id });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/payouts.test.ts -t reconcilePayoutActivity`
Expected: FAIL. `reconcilePayoutActivity` is not exported.

- [ ] **Step 3: Write it**

Add `gt` to the drizzle import, `activities` to the schema import, and `import { USDC_MINT } from "@mercury/chain";` in `payouts.ts`. Then append:

```ts
/**
 * Say where the money came from, on the row `wallet-events` already wrote.
 *
 * The shape is `funding/enrich.ts`'s. Update only, never insert: the amount
 * that landed is the chain's fact, and wallet-events reads it. The guard keeps
 * a row something else has already named. The tag also keeps the payout from
 * counting as the inviter's own funding (see `qualifyPending`).
 */
export const reconcilePayoutActivity = async (db: Db, now: Date): Promise<number> => {
  const week = new Date(now.getTime() - 7 * 86_400_000);
  const landed = await db
    .select()
    .from(referralPayouts)
    .where(and(eq(referralPayouts.status, "confirmed"), gt(referralPayouts.updatedAt, week)));
  let named = 0;
  for (const p of landed) {
    if (p.txSignature === null) continue;
    const updated = await db
      .update(activities)
      .set({ title: "Invite reward", subtitle: null, refTable: "referral_payout", refId: p.id })
      .where(
        and(
          eq(activities.userId, p.inviterId),
          eq(activities.txSignature, p.txSignature),
          eq(activities.mint, USDC_MINT),
          eq(activities.kind, "transfer_in"),
          sql`(${activities.refTable} is null or (${activities.refTable} = 'referral_payout' and ${activities.refId} = ${p.id}))`,
        ),
      )
      .returning({ id: activities.id });
    named += updated.length;
  }
  return named;
};
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/payouts.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Typecheck, test, commit**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api test
git add services/api/src/referrals/payouts.ts services/api/src/referrals/payouts.test.ts
git commit -m "feat(api): name a referral payout in the inviter's activity"
```

---

### Task 9: Config and the payout job

**Files:**

- Modify: `services/api/src/deps.ts` (`Config` and `readConfig`)
- Test: `services/api/src/config.test.ts`
- Modify: `services/api/.env.example`
- Modify: `services/api/src/index.ts`

**Interfaces:**

- Consumes: `planPayouts`, `sendPayouts`, `confirmPayouts`, `reconcilePayoutActivity`, `solanaPayoutChain` (Tasks 6–8).
- Produces: `Config.referralPayouts: boolean`, `Config.referralPayoutMaxUsd: number`, `Config.referralPayoutWeeklyMaxUsd: number`, and the `referral-payouts` job.

- [ ] **Step 1: Write the failing config tests**

Append inside the `describe` in `config.test.ts`:

```ts
/* Off unless somebody turns it on: it sends Mercury's money. See ADR 0017. */
it("leaves referral payouts off unless REFERRAL_PAYOUTS is on", () => {
  expect(readConfig(base).referralPayouts).toBe(false);
  expect(readConfig({ ...base, REFERRAL_PAYOUTS: "true" }).referralPayouts).toBe(false);
  expect(readConfig({ ...base, REFERRAL_PAYOUTS: "on" }).referralPayouts).toBe(true);
});

it("caps a payout at $250 and a week at $5,000 unless told otherwise", () => {
  expect(readConfig(base)).toMatchObject({ referralPayoutMaxUsd: 250, referralPayoutWeeklyMaxUsd: 5000 });
  expect(readConfig({ ...base, REFERRAL_PAYOUT_MAX_USD: "100" }).referralPayoutMaxUsd).toBe(100);
});

it.each(["-1", "abc", "0"])("refuses a payout cap of %j", (v) => {
  expect(() => readConfig({ ...base, REFERRAL_PAYOUT_MAX_USD: v })).toThrow("REFERRAL_PAYOUT_MAX_USD");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @mercury/api exec vitest run src/config.test.ts`
Expected: FAIL. `referralPayouts` is undefined.

- [ ] **Step 3: Read the config**

In `deps.ts`, add to `interface Config`:

```ts
  /** Whether the weekly referral payout job runs. Only the exact value "on" turns it on. See ADR 0017. */
  readonly referralPayouts: boolean;
  /** No single payout above this is sent; it is parked as `review`. Dollars. */
  readonly referralPayoutMaxUsd: number;
  /** No week's payouts together above this are sent. Dollars. */
  readonly referralPayoutWeeklyMaxUsd: number;
```

Beside `basisPoints`, add:

```ts
const positiveDollars = (env: NodeJS.ProcessEnv, key: string, fallback: number): number => {
  const raw = env[key];
  if (raw === undefined || raw.length === 0) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(`${key} must be a positive number of dollars, got "${raw}"`);
  return n;
};
```

In `readConfig`'s returned object, after `depositFeeBps`:

```ts
    referralPayouts: env["REFERRAL_PAYOUTS"] === "on",
    referralPayoutMaxUsd: positiveDollars(env, "REFERRAL_PAYOUT_MAX_USD", 250),
    referralPayoutWeeklyMaxUsd: positiveDollars(env, "REFERRAL_PAYOUT_WEEKLY_MAX_USD", 5000),
```

In `services/api/.env.example`, after `DEPOSIT_FEE_BPS=`, add:

```
# Referral payouts (ADR 0017). Off unless exactly "on". Never on before the
# lawyer has said inviters may be paid a share of trading fees.
REFERRAL_PAYOUTS=
# Dollars. A payout or a week above these is parked as `review`, not sent.
REFERRAL_PAYOUT_MAX_USD=
REFERRAL_PAYOUT_WEEKLY_MAX_USD=
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm --filter @mercury/api exec vitest run src/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Register the job**

In `index.ts`, add:

```ts
import { D } from "@mercury/core";
import {
  confirmPayouts,
  planPayouts,
  reconcilePayoutActivity,
  sendPayouts,
  solanaPayoutChain,
} from "./referrals/payouts.js";
```

(`D` may already be imported. If so, skip that line.) After the `referral-qualify` job, add:

```ts
/**
 * Referral payouts, if switched on and there is a relayer to pay from.
 *
 * Hourly, but weekly in effect: a payout is keyed to its ISO week, so the
 * first pass of a week plans it and every later pass finds it planned. Each
 * pass also sends what was planned and confirms what was sent, so a pass that
 * died part way is finished by the next. See ADR 0017.
 */
const payoutsOn = config.referralPayouts && relay !== undefined;
boot.info(
  {
    on: payoutsOn,
    ...(payoutsOn
      ? { maxUsd: config.referralPayoutMaxUsd, weeklyMaxUsd: config.referralPayoutWeeklyMaxUsd }
      : {}),
  },
  payoutsOn
    ? "referral payouts on, from the relayer"
    : config.referralPayouts
      ? "referral payouts asked for, but there is no relayer to pay from"
      : "referral payouts off (REFERRAL_PAYOUTS not on); rewards accrue, nothing is sent",
);
/* `relay !== undefined` again, rather than `payoutsOn` alone, so the callback below keeps the narrowing. */
if (payoutsOn && relay !== undefined) {
  const chain = solanaPayoutChain(config.solanaRpcUrl);
  const limits = {
    maxPerPayoutUsd: D(config.referralPayoutMaxUsd),
    maxPerWeekUsd: D(config.referralPayoutWeeklyMaxUsd),
  };
  every("referral-payouts", 60 * 60 * 1000, async () => {
    const now = new Date();
    const planned = await planPayouts(auth.db, now, limits);
    const sent = await sendPayouts(auth.db, { chain, signer: relay.signer });
    const { confirmed, failed } = await confirmPayouts(auth.db, chain);
    await reconcilePayoutActivity(auth.db, now);
    if (planned + sent + confirmed + failed === 0) return null;
    return `${planned} planned, ${sent} sent, ${confirmed} confirmed, ${failed} failed`;
  });
}
```

Add a row to the job table comment:

```
 * | `referral-payouts`   | 1h      | `referral_payout`, a USDC transfer (only if on)       |
```

- [ ] **Step 6: Typecheck, test, commit**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api test
git add services/api/src/deps.ts services/api/src/config.test.ts services/api/.env.example services/api/src/index.ts
git commit -m "feat(api): the weekly referral payout job, off unless switched on"
```

---

### Task 10: Earnings in `GET /v1/referrals`

**Files:**

- Modify: `packages/types/src/referrals.ts`
- Modify: `services/api/src/referrals/store.ts` (`summary`)
- Modify: `services/api/src/routes/referrals.ts`
- Test: `services/api/src/referrals/store.test.ts`, `services/api/src/routes/referrals.test.ts`
- Modify: `apps/web/src/dev/sample.ts`

**Interfaces:**

- Consumes: `referralRewards`, `referralPayouts` (Task 2).
- Produces: `Summary` gains `paidUsd: Decimal`, `pendingUsd: Decimal` and `payouts: { week, amountUsd: Decimal, status, txSignature: string | null }[]`. `ReferralSummary` gains `earned: { paidUsd, pendingUsd }` and `payouts: { week, amountUsd, status, txSignature }[]`.

- [ ] **Step 1: Widen the wire type**

In `packages/types/src/referrals.ts`, add `Usd` to the `./primitives.js` import and these fields to `ReferralSummary`:

```ts
  /** Paid: in the inviter's wallet. Pending: earned, held or payable, not yet paid. Void is in neither. */
  earned: z.object({ paidUsd: Usd, pendingUsd: Usd }),
  /** The last ten payouts, newest first. */
  payouts: z.array(
    z.object({
      week: z.string(),
      amountUsd: Usd,
      status: z.enum(["pending", "review", "sent", "confirmed", "failed"]),
      txSignature: z.string().nullable(),
    }),
  ),
```

- [ ] **Step 2: Write the failing store test**

Append to `store.test.ts`, adding `seedInstrument, seedOrder, seedReferral, seedReward` to the `./testing.js` import and `referralPayouts` to the schema import:

```ts
describe("summary, with earnings", () => {
  it("adds up paid and pending rewards, and lists payouts", async () => {
    const db = await testDb();
    const store = createReferralStore(db);
    const inviter = await seedUser(db, 1);
    const friend = await seedUser(db, 2);
    const referral = await seedReferral(db, {
      inviterId: inviter.id,
      friendId: friend.id,
      qualifiedAt: new Date(),
    });
    const nvda = await seedInstrument(db);
    const reward = async (amountUsd: string, status: "held" | "payable" | "void" | "paid") => {
      const order = await seedOrder(db, {
        userId: friend.id,
        instrumentId: nvda.id,
        side: "buy",
        status: "filled",
      });
      await seedReward(db, {
        referralId: referral.id,
        inviterId: inviter.id,
        friendId: friend.id,
        orderId: order.id,
        amountUsd,
        status,
      });
    };
    await reward("1.5", "paid");
    await reward("0.625", "payable");
    await reward("0.25", "held");
    await reward("9", "void");
    await db.insert(referralPayouts).values({
      inviterId: inviter.id,
      week: "2026-W43",
      amountUsd: "1.5",
      wallet: "W",
      status: "confirmed",
      txSignature: "sig",
    });

    const s = await store.summary(inviter.id, new Date());
    expect(s.paidUsd.toString()).toBe("1.5");
    expect(s.pendingUsd.toString()).toBe("0.875");
    expect(s.payouts).toMatchObject([{ week: "2026-W43", status: "confirmed", txSignature: "sig" }]);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/store.test.ts -t earnings`
Expected: FAIL. `s.paidUsd` is undefined.

- [ ] **Step 4: Extend `summary`**

In `store.ts`, add `desc, inArray` to the drizzle import, `referralPayouts, referralRewards` to the schema import, and `D` to the `@mercury/core` import. Add to `interface Summary`:

```ts
  readonly paidUsd: Decimal;
  readonly pendingUsd: Decimal;
  readonly payouts: readonly {
    readonly week: string;
    readonly amountUsd: Decimal;
    readonly status: "pending" | "review" | "sent" | "confirmed" | "failed";
    readonly txSignature: string | null;
  }[];
```

In `summary`, before `return`, add:

```ts
const sumOf = async (statuses: ("held" | "payable" | "paid")[]) => {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${referralRewards.amountUsd}), 0)` })
    .from(referralRewards)
    .where(and(eq(referralRewards.inviterId, userId), inArray(referralRewards.status, statuses)));
  return D(row?.total ?? "0");
};
const [paidUsd, pendingUsd, payouts] = await Promise.all([
  sumOf(["paid"]),
  sumOf(["held", "payable"]),
  db
    .select()
    .from(referralPayouts)
    .where(eq(referralPayouts.inviterId, userId))
    .orderBy(desc(referralPayouts.createdAt))
    .limit(10),
]);
```

and add to the returned object:

```ts
      paidUsd,
      pendingUsd,
      payouts: payouts.map((p) => ({
        week: p.week,
        amountUsd: D(p.amountUsd),
        status: p.status,
        txSignature: p.txSignature,
      })),
```

- [ ] **Step 5: Send it**

In `routes/referrals.ts`, add to the `body` in `GET /v1/referrals`:

```ts
      earned: { paidUsd: s.paidUsd.toString(), pendingUsd: s.pendingUsd.toString() },
      payouts: s.payouts.map((p) => ({ ...p, amountUsd: p.amountUsd.toString() })),
```

In `routes/referrals.test.ts`, add `paidUsd: D("1.5"), pendingUsd: D("0.875"), payouts: []` to the fake `summary`'s result, and `earned: { paidUsd: "1.5", pendingUsd: "0.875" }, payouts: []` to the expected body.

In `apps/web/src/dev/sample.ts`, add to `SAMPLE_REFERRALS`:

```ts
  earned: { paidUsd: "14.62", pendingUsd: "3.18" },
  payouts: [
    { week: "2026-W42", amountUsd: "6.40", status: "confirmed", txSignature: "5Yd8sample" },
    { week: "2026-W41", amountUsd: "8.22", status: "confirmed", txSignature: "3Kq1sample" },
  ],
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `pnpm --filter @mercury/api exec vitest run src/referrals/store.test.ts src/routes/referrals.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck, test, commit**

```bash
pnpm --filter @mercury/types typecheck && pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api test && pnpm --filter @mercury/web typecheck
git add packages/types/src/referrals.ts services/api/src/referrals/store.ts services/api/src/referrals/store.test.ts services/api/src/routes/referrals.ts services/api/src/routes/referrals.test.ts apps/web/src/dev/sample.ts
git commit -m "feat(api): earnings and payouts in GET /v1/referrals"
```

---

### Task 11: Earnings on the Invite panel

**Files:**

- Modify: `apps/web/src/app/Invite.tsx`

**Interfaces:**

- Consumes: `ReferralSummary.earned`, `.payouts`, `.share` (Task 10).

Only merge this task once payouts are cleared to go on. Before that, the panel must not promise inviters money (tracking plan, Global Constraints).

- [ ] **Step 1: Say what the inviter earns, and show it**

In `Invite.tsx`, add `import { usd } from "@mercury/view";`, then:

Replace `RULES` with a function of the summary:

```tsx
const rules = (s: ReferralSummary) => [
  "Friends who join through your link get 25% off Mercury's fee for 90 days.",
  `You get ${Math.round(Number(s.share) * 100)}% of Mercury's fee on their trades for 12 months, paid in USDC every Monday once it reaches $1.`,
  "A friend counts as funded once they add $50 and make a trade. Ten funded friends lifts your share to 30%, fifty to 35%.",
  "A trade sold again within a week earns nothing, and each reward waits a week before it is paid.",
];
```

and in `Body`, render `rules(s)` in place of `RULES`.

Change the stats grid to three columns and add earnings:

```tsx
<dl className="grid grid-cols-3 gap-3">
  <Stat label="Invited" value={String(s.invited)} />
  <Stat label="Funded" value={String(s.funded)} />
  <Stat
    label="Earned"
    value={usd(Number(s.earned.paidUsd))}
    sub={`${usd(Number(s.earned.pendingUsd))} on its way`}
  />
</dl>
```

with `Stat` widened to:

```tsx
const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-lg bg-ds-panel px-4 py-3">
    <dt className="text-[12px] leading-none text-ds-muted">{label}</dt>
    <dd className="mt-2 text-[24px] leading-none font-medium text-ds-ink">{value}</dd>
    {sub !== undefined && <dd className="mt-1.5 text-[11px] leading-none text-ds-muted">{sub}</dd>}
  </div>
);
```

After the stats, list the payouts:

```tsx
{
  s.payouts.length > 0 && (
    <section aria-label="Payouts">
      <h3 className="text-[13px] font-medium text-ds-ink">Payouts</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {s.payouts.map((p) => (
          <li key={p.week} className="flex items-center justify-between text-[13px]">
            <span className="text-ds-muted">Week {p.week.split("-W")[1]}</span>
            <span className="flex items-center gap-3">
              <span className="font-medium text-ds-ink">{usd(Number(p.amountUsd))}</span>
              {p.txSignature !== null && p.status === "confirmed" ? (
                <a
                  href={`https://solscan.io/tx/${encodeURIComponent(p.txSignature)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] text-ds-link hover:underline"
                >
                  View ↗
                </a>
              ) : (
                <span className="text-[12px] text-ds-muted">
                  {p.status === "failed" ? "Retrying next week" : "On its way"}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Check it in sample mode**

Run the `web-sample` preview and open Invite friends from the account menu. Expect:

- three stats: Invited 7, Funded 3, Earned $14.62 with "$3.18 on its way";
- the share line reading "You get 30% …" (the sample is founding);
- two payouts, each with a Solscan link.

At 375px wide, the three stats should fit without horizontal scroll. If they do not, change the grid to `grid-cols-2` with Earned spanning both columns (`col-span-2`).

- [ ] **Step 3: Typecheck, test, commit**

```bash
pnpm --filter @mercury/web typecheck && pnpm --filter @mercury/web test
git add apps/web/src/app/Invite.tsx
git commit -m "feat(web): what an inviter has earned, on the Invite panel"
```

---

### Task 12: Mark it done

**Files:**

- Modify: `docs/revenue-todo.md` §3 and §4

- [ ] **Step 1: Tick what this plan built**

In §4, tick all five items. Note under the heading: `**Built <date>, off by default.** REFERRAL_PAYOUTS=on starts it; see ADR 0017 and docs/superpowers/plans/2026-10-17-referral-rewards.md.` Correct the first item to read "of Mercury's fee (Jupiter takes none on our path)" in place of "(after Jupiter's cut)". In §3, tick "Invite screen: link, friends invited, friends funded, earned so far".

Add under §4:

```markdown
- [ ] Turn on: lawyer's answer in, then `REFERRAL_PAYOUTS=on` on the deployment with the relayer
- [ ] Watch the first week's `referral_payout` rows; release any `review` by hand (`update referral_payout set status = 'pending' where id = …`)
```

- [ ] **Step 2: Commit**

```bash
git add docs/revenue-todo.md
git commit -m "docs: referral rewards and payouts are built, off by default"
```

---

## Not in this plan

- **An email per payout.** The activity row ("Invite reward") is the receipt. `notify/` can send one later through the `Notifier` that `lending/watch-loans.ts:106–119` uses.
- **Sweeping fees to a treasury** (`docs/revenue-todo.md` §1). When it is built, it must leave the week's payouts in the relayer.
- **Mobile earnings.** Comes with the mobile Invite screen (tracking plan, "After this plan").
