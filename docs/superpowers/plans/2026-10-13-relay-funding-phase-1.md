# Relay Funding · Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user picks any token on any chain Relay supports, gets an address, sends to it, and the USDC lands in their Privy wallet — with a server-side row for the deposit from the moment it is quoted.

**Architecture:** No transaction is built, signed or submitted anywhere in this phase. Our server mints a Relay quote with `useDepositAddress: true` and the user's Privy wallet as `recipient`, stores a `funding_intent` row, and hands back an address. Relay sweeps, fills, and tells us by signed webhook. `wallet-events` already sees the USDC arrive on the stream it walks today and writes the `transfer_in` row; the webhook enriches that row with where the money came from.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), pnpm 10.33.2 workspaces + Turborepo, Vitest, Hono, Drizzle + Postgres, `node:crypto`.

**Spec:** `docs/superpowers/specs/2026-10-13-any-token-funding-design.md`

**ADR:** `docs/adr/0014-relay-funding.md`

## Global Constraints

- **The client never calls Relay.** Every quote is minted server-side. `recipient`, `appFees` and the origin pair are ours to set, not the page's.
- `recipient` is **always** `identity.walletAddress` — the wallet Privy signed for, never a request body field.
- Destination is fixed: chain `792703809`, currency `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.
- `tradeType` is `EXACT_INPUT`. An open deposit address rejects `EXACT_OUTPUT`.
- `appFees` is **zero** in this phase. Do not add the field.
- Minimum deposit is **$10**. Relay does not sweep ≤$0.05; this floor is ours.
- **Every chain Relay reports is offered.** No curated allowlist.
- Only currencies Relay will actually solve. A non-solver token sent to a deposit address is unrecoverable.
- `refundTo` and `recoveryAddress` come from the environment, per VM family, and are **never** a user address.
- The webhook matches on `data.depositAddress.address`, **never** on the quote-time `requestId`.
- No secret is ever logged. No wallet address is ever logged — `wallet-events/sync.ts` logs the user id for exactly this reason.
- Conventional commits (`feat` / `fix` / `refactor` / `chore`); UI polish is `chore`.
- Never write the word "catalogue" — say stocks, supportedStocks or assets.
- `vitest` does not typecheck. Run `pnpm -r typecheck` **and** `pnpm -r test` before every commit.

## Facts established by reading the repo (do not re-derive)

- `services/api/src/app.ts:103` is `app.use("/v1/*", requireAuth(auth))`. Anything registered on a path **outside** `/v1/*` is unauthenticated. The webhook belongs there, and it is authenticated by signature instead.
- Migrations are applied by `applyMigrations` (`db/migrate.ts`) through Drizzle's migrator, which reads `drizzle/meta/_journal.json`. A new `.sql` file that is not in the journal **is silently never applied**. Last entry is `idx: 17`, tag `0017_snapshot_read_at`.
- `wallet-events/sync.ts` already walks the embedded wallet's USDC token accounts and writes `activities` rows with `kind: "transfer_in"`, deduplicated by `uniqueIndex("activity_signature_mint_idx").on(userId, txSignature, mint)`. **A Relay fill needs no new stream.**
- `baskets/glider/reconcile.ts:216` is the precedent for enriching an existing generic `transfer_in` row: an `onConflictDoUpdate` with a `setWhere` guard so it only overwrites a row that is still generic. Copy that shape.
- `portfolio/queries.ts:118` gives `transfer_in` a flow sign of `+1`. Enrichment must not change `kind`, or the performance line breaks.
- The API uses plain `fetch` for upstreams (`packages/chain/src/jupiter/lite.ts`, `baskets/glider/client.ts`) with a `defaultFetch()` injection point for tests. Follow that. **Do not add `@relayprotocol/relay-sdk` to the API** — it carries viem and 5MB for one POST. The SDK belongs in the web app in phase 3, where `execute()` is actually needed.
- `db/testing.ts` exists and is what the other store tests use. Read it before writing Task 2's test.

---

### Task 1: The Relay client

One file, plain `fetch`, injectable like every other upstream in this repo. Three things it does: list chains, mint a deposit-address quote, read a status.

**Files:**

- Create: `services/api/src/funding/relay.ts`
- Create: `services/api/src/funding/relay.test.ts`

**Interfaces:**

- Produces: `RelayClient` with `chains()`, `depositAddressQuote(input)`, `status(requestId)`; types `RelaySource`, `DepositAddressQuote`, `RelayStatus`.
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Write the failing test**

```ts
// services/api/src/funding/relay.test.ts
import { describe, expect, it } from "vitest";
import { createRelayClient, SOLANA_CHAIN_ID, SOLANA_USDC } from "./relay.js";

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe("createRelayClient", () => {
  it("sends the api key and never puts it in a url", async () => {
    let seen: { url: string; key: string | null } | null = null;
    const client = createRelayClient({
      apiKey: "secret-key",
      fetch: (input, init) => {
        seen = {
          url: String(input),
          key: new Headers(init?.headers).get("x-api-key"),
        };
        return ok({ chains: [] });
      },
    });

    await client.chains();

    expect(seen!.key).toBe("secret-key");
    expect(seen!.url).not.toContain("secret-key");
  });

  it("offers the native currency and the solver currencies, de-duplicated", async () => {
    const client = createRelayClient({
      apiKey: "k",
      fetch: () =>
        ok({
          chains: [
            {
              id: 792703809,
              name: "solana",
              displayName: "Solana",
              vmType: "svm",
              depositEnabled: true,
              currency: {
                id: "sol",
                symbol: "SOL",
                name: "Solana",
                address: "11111111111111111111111111111111",
                decimals: 9,
                supportsBridging: true,
              },
              solverCurrencies: [
                { id: "usdc", symbol: "USDC", name: "USD Coin", address: SOLANA_USDC, decimals: 6 },
              ],
            },
          ],
        }),
    });

    const [chain] = await client.chains();

    expect(chain!.currencies.map((c) => c.symbol)).toEqual(["SOL", "USDC"]);
  });

  it("drops a chain that cannot be deposited from", async () => {
    const client = createRelayClient({
      apiKey: "k",
      fetch: () =>
        ok({
          chains: [
            {
              id: 1,
              name: "ethereum",
              vmType: "evm",
              depositEnabled: false,
              currency: {
                id: "eth",
                symbol: "ETH",
                name: "Ether",
                address: "0x0",
                decimals: 18,
                supportsBridging: true,
              },
              solverCurrencies: [],
            },
          ],
        }),
    });

    expect(await client.chains()).toEqual([]);
  });

  it("mints a deposit address against the destination we fix, not one a caller names", async () => {
    let body: Record<string, unknown> = {};
    const client = createRelayClient({
      apiKey: "k",
      fetch: (_input, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return ok({
          requestId: "0xabc",
          steps: [{ id: "deposit", depositAddress: "0xdeadbeef" }],
          details: { currencyOut: { amount: "24846825" } },
        });
      },
    });

    const quote = await client.depositAddressQuote({
      originChainId: 8453,
      originCurrency: "0x0000000000000000000000000000000000000000",
      recipient: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      refundTo: "0xrefund",
      recoveryAddress: "0xrecovery",
    });

    expect(body["destinationChainId"]).toBe(SOLANA_CHAIN_ID);
    expect(body["destinationCurrency"]).toBe(SOLANA_USDC);
    expect(body["useDepositAddress"]).toBe(true);
    expect(body["tradeType"]).toBe("EXACT_INPUT");
    expect(body["appFees"]).toBeUndefined();
    expect(quote).toEqual({ requestId: "0xabc", depositAddress: "0xdeadbeef", quotedOutRaw: "24846825" });
  });

  it("refuses a quote that came back without a deposit address", async () => {
    const client = createRelayClient({
      apiKey: "k",
      fetch: () => ok({ requestId: "0xabc", steps: [{ id: "deposit" }] }),
    });

    await expect(
      client.depositAddressQuote({
        originChainId: 8453,
        originCurrency: "0x0",
        recipient: "9WzD",
        refundTo: "0xr",
        recoveryAddress: "0xrec",
      }),
    ).rejects.toThrow(/no deposit address/i);
  });

  it("carries the upstream status through without reinterpreting it", async () => {
    const client = createRelayClient({ apiKey: "k", fetch: () => ok({ status: "pending" }) });
    expect(await client.status("0xabc")).toBe("pending");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd services/api && pnpm vitest run src/funding/relay.test.ts`
Expected: FAIL — cannot resolve `./relay.js`.

- [ ] **Step 3: Write the client**

```ts
// services/api/src/funding/relay.ts
import { defaultFetch } from "@mercury/chain";

/**
 * Relay, as the funding path uses it.
 *
 * Hand-rolled over `fetch` rather than `@relayprotocol/relay-sdk`, which
 * carries viem and five megabytes to perform one POST. The SDK earns its place
 * in the browser, where `execute()` drives a wallet through a quote's steps;
 * here there is no wallet and no execution, only three HTTP calls. The same
 * reasoning `packages/chain/src/jupiter/lite.ts` already follows.
 */

const BASE = "https://api.relay.link";

/** Where every deposit lands. Fixed here so no caller can redirect it. */
export const SOLANA_CHAIN_ID = 792703809;
export const SOLANA_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export interface RelayCurrency {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly address: string;
  readonly decimals: number;
}

export interface RelaySource {
  readonly chainId: number;
  readonly name: string;
  readonly vmType: string;
  readonly currencies: readonly RelayCurrency[];
}

export interface DepositAddressQuote {
  readonly requestId: string;
  readonly depositAddress: string;
  /** What Relay expects to deliver, in USDC base units. Indicative, not a promise. */
  readonly quotedOutRaw: string | null;
}

/** Relay's own vocabulary, carried through rather than mapped. */
export type RelayStatus =
  "waiting" | "depositing" | "pending" | "submitted" | "success" | "failure" | "refund";

export interface DepositAddressInput {
  readonly originChainId: number;
  readonly originCurrency: string;
  /** The user's Privy wallet, from a Privy-signed token. Never a request body. */
  readonly recipient: string;
  readonly refundTo: string;
  readonly recoveryAddress: string;
}

export interface RelayClient {
  chains(): Promise<readonly RelaySource[]>;
  depositAddressQuote(input: DepositAddressInput): Promise<DepositAddressQuote>;
  status(requestId: string): Promise<RelayStatus | null>;
}

interface WireChain {
  readonly id?: number;
  readonly name?: string;
  readonly vmType?: string;
  readonly depositEnabled?: boolean;
  readonly currency?: (RelayCurrency & { readonly supportsBridging?: boolean }) | undefined;
  readonly solverCurrencies?: readonly RelayCurrency[];
}

/**
 * Everything on this chain somebody can deposit.
 *
 * The union of the native currency and the solver currencies, because the two
 * lists do not agree with each other: Solana reports SOL under `currency` and
 * omits it from `solverCurrencies`, while Eclipse lists its native ETH in both.
 * De-duplicated by address so the chain that lists it twice does not offer it
 * twice.
 */
const currenciesOf = (chain: WireChain): readonly RelayCurrency[] => {
  const native = chain.currency;
  const all = [
    ...(native !== undefined && native.supportsBridging === true ? [native] : []),
    ...(chain.solverCurrencies ?? []),
  ];
  const seen = new Set<string>();
  return all.filter((c) => (seen.has(c.address) ? false : (seen.add(c.address), true)));
};

export const createRelayClient = (config: {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}): RelayClient => {
  const base = config.baseUrl ?? BASE;
  const doFetch = config.fetch ?? defaultFetch();

  /*
   * The key goes in a header and never in a URL. A URL reaches logs, proxy
   * access records and error reports; a header does not.
   */
  const call = async (path: string, init?: RequestInit): Promise<unknown> => {
    const res = await doFetch(`${base}${path}`, {
      ...init,
      headers: { "content-type": "application/json", "x-api-key": config.apiKey },
    });
    if (!res.ok) {
      /* The body, not the key, and clipped: Relay's errors are readable and its 500s are not. */
      const detail = await res.text().catch(() => "");
      throw new Error(`relay ${path} failed: ${res.status} ${detail.slice(0, 200)}`);
    }
    return res.json();
  };

  return {
    async chains() {
      const body = (await call("/chains")) as { readonly chains?: readonly WireChain[] };
      return (body.chains ?? [])
        .filter((c): c is WireChain & { id: number } => c.depositEnabled === true && typeof c.id === "number")
        .map((c) => ({
          chainId: c.id,
          name: c.name ?? String(c.id),
          vmType: c.vmType ?? "evm",
          currencies: currenciesOf(c),
        }))
        .filter((c) => c.currencies.length > 0);
    },

    async depositAddressQuote(input) {
      const body = (await call("/quote/v2", {
        method: "POST",
        body: JSON.stringify({
          originChainId: input.originChainId,
          originCurrency: input.originCurrency,
          destinationChainId: SOLANA_CHAIN_ID,
          destinationCurrency: SOLANA_USDC,
          recipient: input.recipient,
          tradeType: "EXACT_INPUT",
          useDepositAddress: true,
          refundTo: input.refundTo,
          recoveryAddress: input.recoveryAddress,
        }),
      })) as {
        readonly requestId?: string;
        readonly steps?: readonly { readonly depositAddress?: string }[];
        readonly details?: { readonly currencyOut?: { readonly amount?: string } };
      };

      const depositAddress = body.steps?.find((s) => s.depositAddress !== undefined)?.depositAddress;
      /*
       * A quote with no address is not a degraded quote, it is a different
       * answer to a different question — almost always `useDepositAddress`
       * being silently refused for the route. Showing the user nothing is
       * better than showing them an address that is not theirs to send to.
       */
      if (body.requestId === undefined || depositAddress === undefined) {
        throw new Error("relay returned no deposit address for this route");
      }
      return {
        requestId: body.requestId,
        depositAddress,
        quotedOutRaw: body.details?.currencyOut?.amount ?? null,
      };
    },

    async status(requestId) {
      const body = (await call(`/intents/status/v3?requestId=${encodeURIComponent(requestId)}`)) as {
        readonly status?: RelayStatus;
      };
      return body.status ?? null;
    },
  };
};
```

- [ ] **Step 4: Run the tests**

Run: `cd services/api && pnpm vitest run src/funding/relay.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm -r typecheck
git add services/api/src/funding/relay.ts services/api/src/funding/relay.test.ts
git commit -m "feat(api): a Relay client for minting deposit addresses"
```

---

### Task 2: The `funding_intent` table

**Files:**

- Modify: `services/api/src/db/schema.ts` (append after `activities`)
- Create: `services/api/drizzle/0018_funding_intent.sql`
- Modify: `services/api/drizzle/meta/_journal.json`
- Create: `services/api/src/funding/store.ts`
- Create: `services/api/src/funding/store.test.ts`

**Interfaces:**

- Produces: `fundingIntents` table; `FundingStore` with `create(row)`, `byDepositAddress(address)`, `advance(address, patch)`, `forUser(userId)`.
- Consumes: `DepositAddressQuote`, `RelayStatus` from Task 1.

- [ ] **Step 1: Add the table to the schema**

```ts
// services/api/src/db/schema.ts — after the `activities` table

/**
 * A deposit we quoted, from the moment we quoted it.
 *
 * The row exists before the user sees an address, which is the whole point:
 * `wallet-events` can tell us that USDC arrived, and never what it arrived
 * from. Without this, a deposit from Tron and a transfer from a friend are the
 * same two lines in the database.
 */
export const fundingIntents = pgTable(
  "funding_intent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * The id Relay gave the quote we minted.
     *
     * Not an identity. Relay regenerates the quote on over- or underpayment and
     * the fill lands under a new id, so this is what we asked for and not
     * necessarily what happened. `deposit_address` is the identity.
     */
    relayRequestId: text("relay_request_id").notNull(),
    depositAddress: text("deposit_address").notNull(),
    originChainId: integer("origin_chain_id").notNull(),
    originCurrency: text("origin_currency").notNull(),
    /** The Privy wallet, as quoted. Stored so a changed wallet is visible rather than assumed. */
    recipientAddress: text("recipient_address").notNull(),
    /** USDC base units. Indicative at mint time and never updated. */
    quotedOutRaw: text("quoted_out_raw"),
    status: text("status").notNull().default("waiting"),
    inTxHash: text("in_tx_hash"),
    outTxHash: text("out_tx_hash"),
    failReason: text("fail_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("funding_intent_user_created_idx").on(t.userId, t.createdAt),
    index("funding_intent_deposit_address_idx").on(t.depositAddress),
    /**
     * Webhook idempotency, and deliberately on the pair rather than on
     * `relay_request_id`. An open deposit address is reusable for its route, so
     * one address legitimately has many deposits — each with its own origin
     * transaction, each a row. A unique index on the request id would collapse
     * a user's second deposit into their first.
     */
    uniqueIndex("funding_intent_address_in_tx_idx").on(t.depositAddress, t.inTxHash),
  ],
);
```

Then add to the exported types at the bottom of the file, beside `Wallet`:

```ts
export type FundingIntent = typeof fundingIntents.$inferSelect;
```

- [ ] **Step 2: Write the migration**

```sql
-- services/api/drizzle/0018_funding_intent.sql
CREATE TABLE IF NOT EXISTS "funding_intent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "relay_request_id" text NOT NULL,
  "deposit_address" text NOT NULL,
  "origin_chain_id" integer NOT NULL,
  "origin_currency" text NOT NULL,
  "recipient_address" text NOT NULL,
  "quoted_out_raw" text,
  "status" text DEFAULT 'waiting' NOT NULL,
  "in_tx_hash" text,
  "out_tx_hash" text,
  "fail_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "funding_intent" ADD CONSTRAINT "funding_intent_user_id_user_id_fk"
   FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "funding_intent_user_created_idx" ON "funding_intent" ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "funding_intent_deposit_address_idx" ON "funding_intent" ("deposit_address");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "funding_intent_address_in_tx_idx" ON "funding_intent" ("deposit_address","in_tx_hash");
```

- [ ] **Step 3: Register it in the journal**

Append to `entries` in `services/api/drizzle/meta/_journal.json`. **A migration that is not in the journal is silently never applied** — this step is not bookkeeping.

```json
{
  "idx": 18,
  "version": "7",
  "when": 1792000000000,
  "tag": "0018_funding_intent",
  "breakpoints": true
}
```

- [ ] **Step 4: Write the failing store test**

Read `services/api/src/db/testing.ts` first and follow the pattern the other store tests use.

```ts
// services/api/src/funding/store.test.ts
import { describe, expect, it } from "vitest";
import { withDb } from "../db/testing.js";
import { createFundingStore } from "./store.js";

const intent = (
  userId: string,
  over: Partial<Parameters<ReturnType<typeof createFundingStore>["create"]>[0]> = {},
) => ({
  userId,
  relayRequestId: "0xreq",
  depositAddress: "0xdeposit",
  originChainId: 8453,
  originCurrency: "0x0000000000000000000000000000000000000000",
  recipientAddress: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  quotedOutRaw: "24846825",
  ...over,
});

describe("createFundingStore", () => {
  it("advances a waiting intent to success", async () =>
    withDb(async (db, { userId }) => {
      const store = createFundingStore(db);
      await store.create(intent(userId));

      const advanced = await store.advance("0xdeposit", {
        status: "success",
        inTxHash: "0xin",
        outTxHash: "0xout",
      });

      expect(advanced?.status).toBe("success");
      expect(advanced?.inTxHash).toBe("0xin");
    }));

  it("claims the waiting row for the first deposit and makes a new row for the second", async () =>
    withDb(async (db, { userId }) => {
      const store = createFundingStore(db);
      await store.create(intent(userId));

      await store.advance("0xdeposit", { status: "success", inTxHash: "0xfirst" });
      await store.advance("0xdeposit", { status: "success", inTxHash: "0xsecond" });

      const rows = await store.forUser(userId);
      expect(rows.map((r) => r.inTxHash).sort()).toEqual(["0xfirst", "0xsecond"]);
    }));

  it("is idempotent for a redelivered webhook", async () =>
    withDb(async (db, { userId }) => {
      const store = createFundingStore(db);
      await store.create(intent(userId));

      await store.advance("0xdeposit", { status: "submitted", inTxHash: "0xin" });
      await store.advance("0xdeposit", { status: "success", inTxHash: "0xin" });
      await store.advance("0xdeposit", { status: "success", inTxHash: "0xin" });

      const rows = await store.forUser(userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe("success");
    }));

  it("knows nothing about an address it never minted", async () =>
    withDb(async (db) => {
      expect(await createFundingStore(db).byDepositAddress("0xunknown")).toBeNull();
    }));
});
```

- [ ] **Step 5: Run it and watch it fail**

Run: `cd services/api && pnpm vitest run src/funding/store.test.ts`
Expected: FAIL — cannot resolve `./store.js`.

- [ ] **Step 6: Write the store**

The shape to get right is `advance`. One deposit address can see several deposits, each identified by its origin transaction, and a webhook can be redelivered. So: claim the `in_tx_hash is null` row if there is one, otherwise upsert on `(deposit_address, in_tx_hash)`.

```ts
// services/api/src/funding/store.ts
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { fundingIntents, type FundingIntent } from "../db/schema.js";
import type { RelayStatus } from "./relay.js";

export interface NewFundingIntent {
  readonly userId: string;
  readonly relayRequestId: string;
  readonly depositAddress: string;
  readonly originChainId: number;
  readonly originCurrency: string;
  readonly recipientAddress: string;
  readonly quotedOutRaw: string | null;
}

export interface FundingAdvance {
  readonly status: RelayStatus;
  readonly inTxHash?: string | undefined;
  readonly outTxHash?: string | undefined;
  readonly failReason?: string | undefined;
  readonly relayRequestId?: string | undefined;
}

export interface FundingStore {
  create(row: NewFundingIntent): Promise<FundingIntent>;
  byDepositAddress(address: string): Promise<FundingIntent | null>;
  advance(address: string, patch: FundingAdvance): Promise<FundingIntent | null>;
  forUser(userId: string): Promise<readonly FundingIntent[]>;
}

export const createFundingStore = (db: Db): FundingStore => ({
  async create(row) {
    const [saved] = await db
      .insert(fundingIntents)
      .values({ ...row })
      .returning();
    if (saved === undefined) throw new Error("funding intent was not written");
    return saved;
  },

  async byDepositAddress(address) {
    const [row] = await db
      .select()
      .from(fundingIntents)
      .where(eq(fundingIntents.depositAddress, address))
      .orderBy(desc(fundingIntents.createdAt))
      .limit(1);
    return row ?? null;
  },

  /**
   * Move a deposit forward, by address and origin transaction.
   *
   * Three cases, and they are all one statement each rather than a read
   * followed by a write, because two webhook deliveries can arrive at once.
   *
   * The unclaimed row — `in_tx_hash is null` — is the one we minted and nobody
   * has deposited against yet. The first delivery claims it. A later delivery
   * naming the same transaction updates that same row, because the unique
   * index on `(deposit_address, in_tx_hash)` makes it the same row. A delivery
   * naming a *different* transaction is a second deposit to a reusable open
   * address, and gets a row of its own copied from the first.
   */
  async advance(address, patch) {
    const set = {
      status: patch.status,
      updatedAt: new Date(),
      ...(patch.inTxHash === undefined ? {} : { inTxHash: patch.inTxHash }),
      ...(patch.outTxHash === undefined ? {} : { outTxHash: patch.outTxHash }),
      ...(patch.failReason === undefined ? {} : { failReason: patch.failReason }),
      ...(patch.relayRequestId === undefined ? {} : { relayRequestId: patch.relayRequestId }),
    };

    if (patch.inTxHash === undefined) {
      /* Nothing has been deposited yet — a `waiting` heartbeat. Touch the unclaimed row only. */
      const [row] = await db
        .update(fundingIntents)
        .set(set)
        .where(and(eq(fundingIntents.depositAddress, address), isNull(fundingIntents.inTxHash)))
        .returning();
      return row ?? null;
    }

    const [claimed] = await db
      .update(fundingIntents)
      .set(set)
      .where(and(eq(fundingIntents.depositAddress, address), isNull(fundingIntents.inTxHash)))
      .returning();
    if (claimed !== undefined) return claimed;

    const [existing] = await db
      .update(fundingIntents)
      .set(set)
      .where(and(eq(fundingIntents.depositAddress, address), eq(fundingIntents.inTxHash, patch.inTxHash)))
      .returning();
    if (existing !== undefined) return existing;

    /*
     * A second deposit to a reusable address. Copied from the most recent row
     * for it so the new one carries the user and the route, which the webhook
     * does not tell us.
     */
    const previous = await this.byDepositAddress(address);
    if (previous === null) return null;
    const [made] = await db
      .insert(fundingIntents)
      .values({
        userId: previous.userId,
        relayRequestId: patch.relayRequestId ?? previous.relayRequestId,
        depositAddress: address,
        originChainId: previous.originChainId,
        originCurrency: previous.originCurrency,
        recipientAddress: previous.recipientAddress,
        quotedOutRaw: null,
        ...set,
      })
      .onConflictDoNothing({ target: [fundingIntents.depositAddress, fundingIntents.inTxHash] })
      .returning();
    return made ?? (await this.byDepositAddress(address));
  },

  async forUser(userId) {
    return db
      .select()
      .from(fundingIntents)
      .where(eq(fundingIntents.userId, userId))
      .orderBy(desc(fundingIntents.createdAt));
  },
});
```

- [ ] **Step 7: Run the tests, typecheck, commit**

```bash
cd services/api && pnpm vitest run src/funding/store.test.ts
cd ../.. && pnpm -r typecheck
git add services/api/src/db/schema.ts services/api/drizzle services/api/src/funding/store.ts services/api/src/funding/store.test.ts
git commit -m "feat(api): record a funding intent from the moment it is quoted"
```

---

### Task 3: Verifying a Relay webhook

A pure function, in its own file, because it is the only thing standing between a public endpoint and our deposit records. Everything it judges is passed in, so the rules can be tested exhaustively without a server.

**Files:**

- Create: `services/api/src/funding/verify.ts`
- Create: `services/api/src/funding/verify.test.ts`

**Interfaces:**

- Produces: `verifyRelayWebhook(input): WebhookVerdict`.

- [ ] **Step 1: Write the failing test**

```ts
// services/api/src/funding/verify.test.ts
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyRelayWebhook } from "./verify.js";

const SECRET = "relay-api-key";
const BODY = JSON.stringify({ event: "request.status.updated" });
const sign = (timestamp: string, body: string, secret = SECRET) =>
  createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

const at = (ms: number) => () => ms;

describe("verifyRelayWebhook", () => {
  const now = 1_792_000_000_000;
  const ts = String(now);

  it("accepts a correctly signed, fresh delivery", () => {
    expect(
      verifyRelayWebhook({
        body: BODY,
        timestamp: ts,
        signature: sign(ts, BODY),
        secret: SECRET,
        now: at(now),
      }),
    ).toEqual({ ok: true });
  });

  it("refuses a body that changed after signing", () => {
    const verdict = verifyRelayWebhook({
      body: JSON.stringify({ event: "request.status.updated", status: "success" }),
      timestamp: ts,
      signature: sign(ts, BODY),
      secret: SECRET,
      now: at(now),
    });
    expect(verdict).toEqual({ ok: false, code: "bad_signature" });
  });

  it("refuses a signature made with another key", () => {
    const verdict = verifyRelayWebhook({
      body: BODY,
      timestamp: ts,
      signature: sign(ts, BODY, "someone-elses-key"),
      secret: SECRET,
      now: at(now),
    });
    expect(verdict).toEqual({ ok: false, code: "bad_signature" });
  });

  it("refuses a replay from outside the window, even with a valid signature", () => {
    const old = String(now - 10 * 60_000);
    const verdict = verifyRelayWebhook({
      body: BODY,
      timestamp: old,
      signature: sign(old, BODY),
      secret: SECRET,
      now: at(now),
    });
    expect(verdict).toEqual({ ok: false, code: "stale" });
  });

  it("refuses a timestamp from the future by more than the window", () => {
    const ahead = String(now + 10 * 60_000);
    const verdict = verifyRelayWebhook({
      body: BODY,
      timestamp: ahead,
      signature: sign(ahead, BODY),
      secret: SECRET,
      now: at(now),
    });
    expect(verdict).toEqual({ ok: false, code: "stale" });
  });

  it.each([
    ["missing", null],
    ["not a number", "yesterday"],
    ["empty", ""],
  ])("refuses a %s timestamp", (_label, timestamp) => {
    const verdict = verifyRelayWebhook({
      body: BODY,
      timestamp,
      signature: sign(ts, BODY),
      secret: SECRET,
      now: at(now),
    });
    expect(verdict).toEqual({ ok: false, code: "malformed" });
  });

  it("refuses a missing signature without attempting a comparison", () => {
    expect(
      verifyRelayWebhook({ body: BODY, timestamp: ts, signature: null, secret: SECRET, now: at(now) }),
    ).toEqual({ ok: false, code: "malformed" });
  });

  it("refuses a signature of the wrong length rather than throwing", () => {
    expect(
      verifyRelayWebhook({ body: BODY, timestamp: ts, signature: "abcd", secret: SECRET, now: at(now) }),
    ).toEqual({ ok: false, code: "bad_signature" });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd services/api && pnpm vitest run src/funding/verify.test.ts`
Expected: FAIL — cannot resolve `./verify.js`.

- [ ] **Step 3: Write the verifier**

```ts
// services/api/src/funding/verify.ts
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Whether this really came from Relay, and recently.
 *
 * `POST /webhooks/relay` is the one route in this service with no session
 * behind it — it cannot have one, because the caller is Relay — so the
 * signature is the whole of its authentication, and this function is the whole
 * of the signature check. Pure on purpose: the clock is injected, so the
 * replay window is a test rather than a wait.
 *
 * Relay signs `timestamp.body` with the API key and sends the hex digest in
 * `X-Signature-SHA256`, with the timestamp in `X-Signature-Timestamp`.
 */

export type WebhookRefusal = "malformed" | "stale" | "bad_signature";

export type WebhookVerdict = { readonly ok: true } | { readonly ok: false; readonly code: WebhookRefusal };

/**
 * Five minutes either side.
 *
 * A valid signature is valid forever, so without a window a captured delivery
 * can be replayed back at us indefinitely — and `advance` would happily walk a
 * deposit from `success` to `refund` on somebody else's schedule. Both
 * directions, because a clock ahead of ours is as much a sign of something
 * replaying as a clock behind it.
 */
const WINDOW_MS = 5 * 60_000;

export const verifyRelayWebhook = (input: {
  readonly body: string;
  readonly timestamp: string | null;
  readonly signature: string | null;
  readonly secret: string;
  readonly now?: () => number;
}): WebhookVerdict => {
  if (input.timestamp === null || input.timestamp.length === 0 || input.signature === null) {
    return { ok: false, code: "malformed" };
  }

  const sent = Number(input.timestamp);
  if (!Number.isFinite(sent)) return { ok: false, code: "malformed" };

  const now = (input.now ?? Date.now)();
  if (Math.abs(now - sent) > WINDOW_MS) return { ok: false, code: "stale" };

  const expected = createHmac("sha256", input.secret).update(`${input.timestamp}.${input.body}`).digest();
  let got: Buffer;
  try {
    got = Buffer.from(input.signature, "hex");
  } catch {
    return { ok: false, code: "bad_signature" };
  }

  /*
   * `timingSafeEqual` throws on a length mismatch rather than returning false,
   * so the length is checked first. Checking it is not a leak: the digest
   * length is fixed and public.
   */
  if (got.length !== expected.length) return { ok: false, code: "bad_signature" };
  return timingSafeEqual(got, expected) ? { ok: true } : { ok: false, code: "bad_signature" };
};
```

- [ ] **Step 4: Run the tests, typecheck, commit**

```bash
cd services/api && pnpm vitest run src/funding/verify.test.ts
cd ../.. && pnpm -r typecheck
git add services/api/src/funding/verify.ts services/api/src/funding/verify.test.ts
git commit -m "feat(api): verify Relay's webhook signature, with a replay window"
```

---

### Task 4: The funding routes

`GET /v1/money/fund/sources` and `POST /v1/money/fund/address`, both behind the existing auth middleware.

**Files:**

- Create: `services/api/src/routes/fund.ts`
- Create: `services/api/src/routes/fund.test.ts`

**Interfaces:**

- Consumes: `RelayClient` (Task 1), `FundingStore` (Task 2).
- Produces: `fundRoutes(deps: FundDeps): Hono`; `FundDeps` with `relay`, `store`, `refundAddresses`, `recoveryAddresses`, `minimumUsd`.

- [ ] **Step 1: Write the failing test**

Follow the pattern in `services/api/src/routes/*.test.ts` for injecting an identity.

```ts
// services/api/src/routes/fund.test.ts
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { fundRoutes, type FundDeps } from "./fund.js";
import type { RelaySource } from "../funding/relay.js";

const SOLANA: RelaySource = {
  chainId: 792703809,
  name: "solana",
  vmType: "svm",
  currencies: [{ id: "usdt", symbol: "USDT", name: "USDT", address: "Es9vMFrz", decimals: 6 }],
};
const BASE: RelaySource = {
  chainId: 8453,
  name: "base",
  vmType: "evm",
  currencies: [{ id: "eth", symbol: "ETH", name: "Ether", address: "0x0", decimals: 18 }],
};

const ADDRESSES = { evm: "0xevm", svm: "SvmRefund", bvm: "bc1refund" };

const harness = (over: Partial<FundDeps> = {}, wallet: string | null = "PrivyWallet111") => {
  const chains = vi.fn().mockResolvedValue([SOLANA, BASE]);
  const depositAddressQuote = vi
    .fn()
    .mockResolvedValue({ requestId: "0xreq", depositAddress: "0xdeposit", quotedOutRaw: "9990000" });
  const create = vi.fn().mockResolvedValue({ id: "row" });
  const deps: FundDeps = {
    relay: { chains, depositAddressQuote, status: vi.fn() },
    store: { create, byDepositAddress: vi.fn(), advance: vi.fn(), forUser: vi.fn() },
    refund: ADDRESSES,
    recovery: { evm: "0xrec", svm: "SvmRec", bvm: "bc1rec" },
    minimumUsd: 10,
    ...over,
  };
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: wallet });
    await next();
  });
  app.route("/", fundRoutes(deps));
  return { app, chains, depositAddressQuote, create };
};

const post = (app: Hono, body: unknown) =>
  app.request("/v1/money/fund/address", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("fundRoutes", () => {
  it("offers every chain the client reports, and caches the list", async () => {
    const { app, chains } = harness();

    const first = await app.request("/v1/money/fund/sources");
    await app.request("/v1/money/fund/sources");

    expect(((await first.json()) as { chains: unknown[] }).chains).toHaveLength(2);
    expect(chains).toHaveBeenCalledTimes(1);
  });

  it("states the minimum rather than leaving the interface to hardcode it", async () => {
    const { app } = harness();
    const body = (await (await app.request("/v1/money/fund/sources")).json()) as { minimumUsd: string };
    expect(body.minimumUsd).toBe("10");
  });

  it("refuses a session with no wallet", async () => {
    const { app } = harness({}, null);
    expect((await app.request("/v1/money/fund/sources")).status).toBe(401);
    expect((await post(app, { chainId: 8453, currency: "0x0" })).status).toBe(401);
  });

  it("quotes to the session's wallet even when the body names another", async () => {
    const { app, depositAddressQuote } = harness();

    await post(app, { chainId: 8453, currency: "0x0", recipient: "AttackerWallet" });

    expect(depositAddressQuote.mock.calls[0]![0].recipient).toBe("PrivyWallet111");
  });

  it("picks the refund address by VM family, not by chain id", async () => {
    const { app, depositAddressQuote } = harness();

    await post(app, { chainId: 792703809, currency: "Es9vMFrz" });
    expect(depositAddressQuote.mock.calls[0]![0].refundTo).toBe(ADDRESSES.svm);

    await post(app, { chainId: 8453, currency: "0x0" });
    expect(depositAddressQuote.mock.calls[1]![0].refundTo).toBe(ADDRESSES.evm);
  });

  it("refuses an unknown chain and writes nothing", async () => {
    const { app, create, depositAddressQuote } = harness();

    expect((await post(app, { chainId: 999, currency: "0x0" })).status).toBe(400);
    expect(depositAddressQuote).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a token the chain does not solve, because such a deposit is unrecoverable", async () => {
    const { app, create, depositAddressQuote } = harness();

    expect((await post(app, { chainId: 8453, currency: "0xNotSolved" })).status).toBe(400);
    expect(depositAddressQuote).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("records the intent before answering", async () => {
    const { app, create } = harness();

    await post(app, { chainId: 8453, currency: "0x0" });

    expect(create.mock.calls[0]![0]).toMatchObject({
      userId: "user-1",
      depositAddress: "0xdeposit",
      originChainId: 8453,
      recipientAddress: "PrivyWallet111",
    });
  });

  it("answers 503 on an upstream failure without leaking its text", async () => {
    const { app } = harness({
      relay: {
        chains: vi.fn().mockResolvedValue([BASE]),
        depositAddressQuote: vi
          .fn()
          .mockRejectedValue(new Error("relay /quote/v2 failed: 500 x-api-key abc")),
        status: vi.fn(),
      },
    });

    const res = await post(app, { chainId: 8453, currency: "0x0" });

    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("x-api-key");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd services/api && pnpm vitest run src/routes/fund.test.ts`
Expected: FAIL — cannot resolve `./fund.js`.

- [ ] **Step 3: Write the routes**

```ts
// services/api/src/routes/fund.ts
import { Hono } from "hono";
import { z } from "zod";
import type { RelayClient, RelaySource } from "../funding/relay.js";
import type { FundingStore } from "../funding/store.js";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";

/** An address we control, per VM family. Never a user's. See ADR 0014. */
export interface VmAddresses {
  readonly evm: string;
  readonly svm: string;
  readonly bvm: string;
}

export interface FundDeps {
  readonly relay: RelayClient;
  readonly store: FundingStore;
  readonly refund: VmAddresses;
  readonly recovery: VmAddresses;
  /** What we will not quote below. Sent to the client so it is stated once. */
  readonly minimumUsd: number;
}

const fail = (code: string, message: string) => ({ error: { code, message } });

const Body = z.object({ chainId: z.number().int(), currency: z.string().min(1) });

/** Chains change rarely and the list is large. Ten minutes is a deploy, not a session. */
const CHAINS_TTL_MS = 10 * 60_000;

export function fundRoutes(deps: FundDeps): Hono {
  const app = new Hono();

  let cached: { readonly at: number; readonly sources: readonly RelaySource[] } | null = null;
  const sources = async (): Promise<readonly RelaySource[]> => {
    const now = Date.now();
    if (cached !== null && now - cached.at < CHAINS_TTL_MS) return cached.sources;
    const fresh = await deps.relay.chains();
    cached = { at: now, sources: fresh };
    return fresh;
  };

  /*
   * Every chain Relay reports, not a curated few. Sixty-one rows is a worse
   * list than eight, and that is the interface's problem to solve with search
   * — a short hardcoded list is us telling somebody we cannot take their money
   * when we can.
   */
  app.get("/v1/money/fund/sources", async (c) => {
    if (c.get("identity").walletAddress === null) {
      return c.json(fail("unauthorized", "No wallet on this session."), 401);
    }
    try {
      return c.json({ chains: await sources(), minimumUsd: String(deps.minimumUsd) });
    } catch (err) {
      console.error("fund: could not read Relay's chains", err);
      return c.json(fail("fund_unavailable", "Deposit options are unavailable right now."), 503);
    }
  });

  app.post("/v1/money/fund/address", async (c) => {
    const identity = c.get("identity");
    const wallet = identity.walletAddress;
    if (wallet === null) return c.json(fail("unauthorized", "No wallet on this session."), 401);

    const parsed = Body.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", "Pick a chain and a token."), 400);

    let available: readonly RelaySource[];
    try {
      available = await sources();
    } catch (err) {
      console.error("fund: could not read Relay's chains", err);
      return c.json(fail("fund_unavailable", "Deposit options are unavailable right now."), 503);
    }

    const chain = available.find((s) => s.chainId === parsed.data.chainId);
    if (chain === undefined) return c.json(fail("validation_failed", "We cannot accept that chain."), 400);

    /*
     * The currency has to be one Relay will solve. This is not input tidying:
     * a token sent to a deposit address that Relay does not solve is, by their
     * own documentation, unrecoverable. The only safe list is the one they gave
     * us.
     */
    const currency = chain.currencies.find((cur) => cur.address === parsed.data.currency);
    if (currency === undefined) return c.json(fail("validation_failed", "We cannot accept that token."), 400);

    const family = chain.vmType === "svm" ? "svm" : chain.vmType === "bvm" ? "bvm" : "evm";

    try {
      const quote = await deps.relay.depositAddressQuote({
        originChainId: chain.chainId,
        originCurrency: currency.address,
        /* From the token Privy signed, never from the body. A caller that could
           name a recipient could name somebody else's wallet. */
        recipient: wallet,
        refundTo: deps.refund[family],
        recoveryAddress: deps.recovery[family],
      });

      await deps.store.create({
        userId: identity.userId,
        relayRequestId: quote.requestId,
        depositAddress: quote.depositAddress,
        originChainId: chain.chainId,
        originCurrency: currency.address,
        recipientAddress: wallet,
        quotedOutRaw: quote.quotedOutRaw,
      });

      return c.json({
        depositAddress: quote.depositAddress,
        requestId: quote.requestId,
        chain: { id: chain.chainId, name: chain.name, vmType: chain.vmType },
        currency,
        minimumUsd: String(deps.minimumUsd),
      });
    } catch (err) {
      /* Logged for us, summarised for them: Relay's errors are not user-facing copy. */
      console.error("fund: could not mint a deposit address", err);
      return c.json(fail("fund_unavailable", "Could not set up that deposit. Please try again."), 503);
    }
  });

  return app;
}
```

- [ ] **Step 4: Run the tests, typecheck, commit**

```bash
cd services/api && pnpm vitest run src/routes/fund.test.ts
cd ../.. && pnpm -r typecheck
git add services/api/src/routes/fund.ts services/api/src/routes/fund.test.ts
git commit -m "feat(api): offer every Relay source and mint a deposit address"
```

---

### Task 5: The webhook route, and enriching the feed

The deposit's only inbound edge, and the one place this phase writes to `activities`.

**Files:**

- Create: `services/api/src/routes/relay-webhook.ts`
- Create: `services/api/src/routes/relay-webhook.test.ts`
- Create: `services/api/src/funding/enrich.ts`
- Create: `services/api/src/funding/enrich.test.ts`

**Interfaces:**

- Consumes: `verifyRelayWebhook` (Task 3), `FundingStore` (Task 2).
- Produces: `relayWebhookRoutes(deps)`; `enrichDepositActivity(db, input)`.

- [ ] **Step 1: Write `enrich` and its test first**

The enrichment must copy `baskets/glider/reconcile.ts:216` — an `onConflictDoUpdate` whose `setWhere` only overwrites a row that is still generic, so a webhook that arrives twice, or late, never clobbers something better. Read that function before writing this one.

Required behaviour, each a test:

1. A `transfer_in` row for this signature and the USDC mint gets its title and subtitle replaced — "Deposited 0.0100 ETH from Base" — and its `kind` left as `transfer_in`, because `portfolio/queries.ts:118` reads `kind` for the flow sign.
2. Running it twice writes the same row once and changes nothing the second time.
3. A row that is not generic any more is left alone.
4. If `wallet-events` has not written the row yet, the insert creates it rather than failing, with the same `(userId, txSignature, mint)` key so the later pass dedupes against it.

- [ ] **Step 2: Write the webhook route test**

```ts
// services/api/src/routes/relay-webhook.test.ts
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { relayWebhookRoutes } from "./relay-webhook.js";

const SECRET = "relay-api-key";

const deliver = (
  app: ReturnType<typeof relayWebhookRoutes>,
  body: string,
  over: { timestamp?: string; signature?: string } = {},
) => {
  const timestamp = over.timestamp ?? String(Date.now());
  const signature =
    over.signature ?? createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex");
  return app.request("/webhooks/relay", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature-timestamp": timestamp,
      "x-signature-sha256": signature,
    },
    body,
  });
};

const payload = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    event: "request.status.updated",
    data: {
      status: "success",
      requestId: "0xregenerated",
      txHashes: ["0xout"],
      depositAddress: { address: "0xdeposit", depositTxHash: "0xin" },
      ...over,
    },
  });

const harness = (advanceResult: unknown = { userId: "user-1", outTxHash: "0xout", status: "success" }) => {
  const advance = vi.fn().mockResolvedValue(advanceResult);
  const app = relayWebhookRoutes({
    db: {} as never,
    store: { create: vi.fn(), byDepositAddress: vi.fn(), advance, forUser: vi.fn() },
    secret: SECRET,
  });
  return { app, advance };
};

describe("relayWebhookRoutes", () => {
  it("advances the deposit on a correctly signed delivery", async () => {
    const { app, advance } = harness();

    const res = await deliver(app, payload());

    expect(res.status).toBe(200);
    expect(advance).toHaveBeenCalledWith(
      "0xdeposit",
      expect.objectContaining({ status: "success", inTxHash: "0xin" }),
    );
  });

  it("writes nothing when the signature is wrong", async () => {
    const { app, advance } = harness();

    const res = await deliver(app, payload(), { signature: "00".repeat(32) });

    expect(res.status).toBe(401);
    expect(advance).not.toHaveBeenCalled();
  });

  it("writes nothing when the signature is valid but the timestamp is old", async () => {
    const { app, advance } = harness();
    const old = String(Date.now() - 10 * 60_000);

    const res = await deliver(app, payload(), { timestamp: old });

    expect(res.status).toBe(401);
    expect(advance).not.toHaveBeenCalled();
  });

  it("matches on the deposit address, not on the requestId we minted", async () => {
    const { app, advance } = harness();

    await deliver(app, payload({ requestId: "0xnothing-we-have-ever-seen" }));

    expect(advance).toHaveBeenCalledWith("0xdeposit", expect.objectContaining({ status: "success" }));
  });

  it("answers 200 for an address it does not know, so Relay stops retrying", async () => {
    const { app } = harness(null);

    const res = await deliver(app, payload());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: "unknown deposit address" });
  });

  it("verifies the bytes it was sent, not a re-serialised parse of them", async () => {
    const { app } = harness();
    /* Key order reversed and whitespace added: JSON.stringify(JSON.parse(x)) is not x. */
    const raw =
      '{\n  "data": { "depositAddress": { "depositTxHash": "0xin", "address": "0xdeposit" }, "txHashes": ["0xout"], "status": "success" },\n  "event": "request.status.updated"\n}';

    expect((await deliver(app, raw)).status).toBe(200);
  });

  it("ignores a delivery carrying no deposit address", async () => {
    const { app, advance } = harness();

    const res = await deliver(app, payload({ depositAddress: null }));

    expect(res.status).toBe(200);
    expect(advance).not.toHaveBeenCalled();
  });

  it("does not record Relay's N/A as a failure reason", async () => {
    const { app, advance } = harness();

    await deliver(app, payload({ status: "submitted", failReason: "N/A" }));

    expect(advance.mock.calls[0]![1]).not.toHaveProperty("failReason");
  });
});
```

- [ ] **Step 3: Run both and watch them fail**

Run: `cd services/api && pnpm vitest run src/routes/relay-webhook.test.ts src/funding/enrich.test.ts`
Expected: FAIL — unresolved imports.

- [ ] **Step 4: Write the route**

```ts
// services/api/src/routes/relay-webhook.ts
import { Hono } from "hono";
import type { Db } from "../db/client.js";
import type { FundingStore } from "../funding/store.js";
import type { RelayStatus } from "../funding/relay.js";
import { verifyRelayWebhook } from "../funding/verify.js";
import { enrichDepositActivity } from "../funding/enrich.js";

export interface RelayWebhookDeps {
  readonly db: Db;
  readonly store: FundingStore;
  /** Relay signs with the API key. Same secret, two jobs — theirs, not our choice. */
  readonly secret: string;
}

interface WirePayload {
  readonly event?: string;
  readonly data?: {
    readonly status?: RelayStatus;
    readonly requestId?: string;
    readonly inTxHashes?: readonly string[];
    readonly txHashes?: readonly string[];
    readonly failReason?: string;
    readonly depositAddress?: { readonly address?: string; readonly depositTxHash?: string | null } | null;
  };
}

/**
 * Relay telling us a deposit moved.
 *
 * Registered outside `/v1/*`, so the auth middleware in `app.ts:103` does not
 * guard it — it cannot, because the caller is Relay and has no session. The
 * signature is its authentication; see `funding/verify.ts`.
 */
export function relayWebhookRoutes(deps: RelayWebhookDeps): Hono {
  const app = new Hono();

  app.post("/webhooks/relay", async (c) => {
    /*
     * The raw text, not a parse and re-serialise. The signature covers the
     * bytes Relay sent, and `JSON.stringify(JSON.parse(x))` is not reliably x.
     */
    const body = await c.req.text();
    const verdict = verifyRelayWebhook({
      body,
      timestamp: c.req.header("x-signature-timestamp") ?? null,
      signature: c.req.header("x-signature-sha256") ?? null,
      secret: deps.secret,
    });
    if (!verdict.ok) {
      /* The code, never the body or the headers: an unverified body is somebody
         else's data and may be anything at all. */
      console.warn(`relay-webhook: refused a delivery (${verdict.code})`);
      return c.json({ error: { code: verdict.code } }, 401);
    }

    let payload: WirePayload;
    try {
      payload = JSON.parse(body) as WirePayload;
    } catch {
      return c.json({ error: { code: "malformed" } }, 400);
    }

    const data = payload.data;
    /*
     * Matched on the deposit address, never on `requestId`. Relay regenerates
     * the quote on over- or underpayment and the fill lands under a new id
     * while the one we minted stays `waiting` forever — a tracker keyed on our
     * id reports a landed deposit as pending for all time.
     */
    const address = data?.depositAddress?.address;
    const status = data?.status;
    if (address === undefined || status === undefined) {
      return c.json({ ok: true, ignored: "no deposit address or status" });
    }

    /*
     * 200 for an address we do not know. A 4xx would have Relay retry forever
     * for a deposit that was never ours — another app's webhook pointed at us,
     * or a row we have since deleted.
     */
    const advanced = await deps.store.advance(address, {
      status,
      ...(data?.depositAddress?.depositTxHash ? { inTxHash: data.depositAddress.depositTxHash } : {}),
      ...(data?.txHashes?.[0] === undefined ? {} : { outTxHash: data.txHashes[0] }),
      ...(data?.failReason === undefined || data.failReason === "N/A" ? {} : { failReason: data.failReason }),
      ...(data?.requestId === undefined ? {} : { relayRequestId: data.requestId }),
    });
    if (advanced === null) return c.json({ ok: true, ignored: "unknown deposit address" });

    /*
     * Only a landed fill touches the feed. Everything before `success` is a
     * deposit in flight, and the row `wallet-events` writes does not exist yet
     * — there is no USDC to have seen.
     */
    if (status === "success" && advanced.outTxHash !== null) {
      try {
        await enrichDepositActivity(deps.db, advanced);
      } catch (err) {
        /* The deposit landed. A feed row we could not improve is not a reason
           to have Relay redeliver, and the generic transfer_in still reads true. */
        console.error(`relay-webhook: could not enrich the feed for user ${advanced.userId}`, err);
      }
    }

    return c.json({ ok: true, status });
  });

  return app;
}
```

- [ ] **Step 5: Run the tests, typecheck, commit**

```bash
cd services/api && pnpm vitest run src/routes/relay-webhook.test.ts src/funding/enrich.test.ts
cd ../.. && pnpm -r typecheck
git add services/api/src/routes/relay-webhook.ts services/api/src/routes/relay-webhook.test.ts services/api/src/funding/enrich.ts services/api/src/funding/enrich.test.ts
git commit -m "feat(api): take Relay's webhook and name the money in the feed"
```

---

### Task 6: Wiring, configuration, and the degraded path

Nothing above is reachable yet. This task mounts it and decides what happens when it is not configured.

**Files:**

- Modify: `services/api/src/deps.ts` (add `fund` to `ReadDeps`)
- Modify: `services/api/src/app.ts` (mount both route groups)
- Modify: `services/api/.env.example`
- Modify: `apps/web/.env.example` (nothing new — assert this, do not assume it)
- Modify: `docs/02-environment.md` or wherever env vars are documented; find it with `grep -rl "VITE_PRIVY_APP_ID" docs/`

**Interfaces:**

- Consumes: everything from Tasks 1–5.

- [ ] **Step 1: Decide the degraded path, and write the test for it**

Follow the precedent in `routes/send.ts`: `relay` and `fees` are optional there, and their absence degrades a feature rather than failing a boot. Funding does the same — **no `RELAY_API_KEY` means the routes are not mounted at all**, so `/v1/money/fund/sources` 404s and the interface hides the method, exactly as `AddCash.tsx` already hides a method whose precondition is unmet.

Do not default the refund addresses. A refund address that silently falls back to something is a refund sent somewhere nobody chose.

```ts
// the shape in deps.ts
readonly fund?: {
  readonly relay: RelayClient;
  readonly store: FundingStore;
  readonly refund: VmAddresses;
  readonly recovery: VmAddresses;
  readonly minimumUsd: number;
  readonly webhookSecret: string;
} | undefined;
```

Build it only when **all** of `RELAY_API_KEY`, `RELAY_REFUND_ADDRESS_{EVM,SVM,BVM}` and `RELAY_RECOVERY_ADDRESS_{EVM,SVM,BVM}` are set. Log once at boot, naming the variables that are missing **by name only, never by value**, and carry on.

- [ ] **Step 2: Mount the routes**

In `app.ts`, the webhook goes **above** `app.use("/v1/*", requireAuth(auth))` and the funding routes below it. Getting this backwards puts a session requirement on Relay, which has none, or removes one from the user's routes.

```ts
// app.ts — beside the other public routes, before the auth middleware
if (read.fund)
  app.route(
    "/",
    relayWebhookRoutes({ db: read.db, store: read.fund.store, secret: read.fund.webhookSecret }),
  );

// …after app.use("/v1/*", requireAuth(auth)), beside moneyRoutes
if (read.fund) app.route("/", fundRoutes(read.fund));
```

- [ ] **Step 3: Write the env example entries**

```sh
# services/api/.env.example

# Relay, for funding from any chain. Absent, the funding method is not offered.
# The key is also the secret Relay signs its webhooks with.
RELAY_API_KEY=
# Addresses WE control, one per VM family. Never a user's address: a deposit
# withdrawn from an exchange has the exchange's hot wallet as its sender, so an
# automatic refund aimed at "the depositor" is gone. See ADR 0014.
RELAY_REFUND_ADDRESS_EVM=
RELAY_REFUND_ADDRESS_SVM=
RELAY_REFUND_ADDRESS_BVM=
# For withdrawing from Relay's depository when they can neither fill nor refund.
# May hold the same value as the refund address for now; separate variables so
# splitting them later is configuration rather than code. Must not be the
# native-currency sentinel address.
RELAY_RECOVERY_ADDRESS_EVM=
RELAY_RECOVERY_ADDRESS_SVM=
RELAY_RECOVERY_ADDRESS_BVM=
```

- [ ] **Step 4: Verify the whole suite and the boot path**

```bash
pnpm check
```

Then start the API with no `RELAY_API_KEY` and confirm: it boots, it logs the missing variables by name, `/health` answers, and `/v1/money/fund/sources` 404s. Then start it with the variables set and confirm `/v1/money/fund/sources` answers with chains.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): mount the funding routes, and degrade when unconfigured"
```

---

### Task 7: `GET /v1/money/fund/intents`

A BTC deposit sits in `pending` for ten to sixty minutes. Without a way to read
that back, the user sends real money and the app shows them nothing — which is
indistinguishable from having lost it. This route is the reason phase 1 can ship
on its own.

**Files:**

- Modify: `services/api/src/routes/fund.ts`
- Modify: `services/api/src/routes/fund.test.ts`

**Interfaces:**

- Consumes: `FundingStore.forUser` (Task 2).
- Produces: `GET /v1/money/fund/intents` → `{ intents: [{ id, status, depositAddress, originChainId, originCurrency, quotedOutRaw, inTxHash, outTxHash, failReason, createdAt }] }`.

- [ ] **Step 1: Write the failing tests**

```ts
// append to services/api/src/routes/fund.test.ts
it("returns this user's deposits, newest first", async () => {
  const forUser = vi.fn().mockResolvedValue([
    {
      id: "b",
      status: "pending",
      depositAddress: "0xd",
      originChainId: 8253038,
      createdAt: new Date("2026-10-13T10:00:00Z"),
    },
    {
      id: "a",
      status: "success",
      depositAddress: "0xd",
      originChainId: 8453,
      createdAt: new Date("2026-10-12T10:00:00Z"),
    },
  ]);
  const { app } = harness({
    store: { create: vi.fn(), byDepositAddress: vi.fn(), advance: vi.fn(), forUser },
  });

  const body = (await (await app.request("/v1/money/fund/intents")).json()) as { intents: { id: string }[] };

  expect(forUser).toHaveBeenCalledWith("user-1");
  expect(body.intents.map((i) => i.id)).toEqual(["b", "a"]);
});

it("never returns another user's deposits", async () => {
  const forUser = vi.fn().mockResolvedValue([]);
  const { app } = harness({
    store: { create: vi.fn(), byDepositAddress: vi.fn(), advance: vi.fn(), forUser },
  });

  await app.request("/v1/money/fund/intents");

  /* The user id comes from the session, so there is no parameter to tamper with. */
  expect(forUser).toHaveBeenCalledExactlyOnceWith("user-1");
});

it("refuses an unauthenticated read of deposits", async () => {
  const { app } = harness({}, null);
  expect((await app.request("/v1/money/fund/intents")).status).toBe(401);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd services/api && pnpm vitest run src/routes/fund.test.ts`
Expected: FAIL — 404, the route does not exist.

- [ ] **Step 3: Add the route**

In `fundRoutes`, beside the other two. The user id comes from the session, never from a query parameter — there is nothing to tamper with.

```ts
app.get("/v1/money/fund/intents", async (c) => {
  const identity = c.get("identity");
  if (identity.walletAddress === null) {
    return c.json(fail("unauthorized", "No wallet on this session."), 401);
  }
  const intents = await deps.store.forUser(identity.userId);
  return c.json({
    intents: intents.map((i) => ({
      id: i.id,
      status: i.status,
      depositAddress: i.depositAddress,
      originChainId: i.originChainId,
      originCurrency: i.originCurrency,
      quotedOutRaw: i.quotedOutRaw,
      inTxHash: i.inTxHash,
      outTxHash: i.outTxHash,
      failReason: i.failReason,
      createdAt: i.createdAt.toISOString(),
    })),
  });
});
```

- [ ] **Step 4: Run, typecheck, commit**

```bash
cd services/api && pnpm vitest run src/routes/fund.test.ts
cd ../.. && pnpm -r typecheck
git add services/api/src/routes/fund.ts services/api/src/routes/fund.test.ts
git commit -m "feat(api): read back the deposits a user has in flight"
```

---

### Task 8: An interface plain enough to ship

Deliberately plain. Phase 4 designs this properly; the job here is that a real
person can complete a real deposit and see it land. Read
`apps/web/src/app/AddCash.tsx` and `apps/web/src/app/Receive.tsx` first — the
method rows, the `LIVE.filter` gating and the QR treatment all already exist and
this follows them rather than inventing a second way.

**Files:**

- Create: `apps/web/src/api/fund-sources.ts`
- Create: `apps/web/src/app/money/FundFromChain.tsx`
- Create: `apps/web/src/app/money/FundFromChain.test.tsx`
- Modify: `apps/web/src/app/AddCash.tsx` (one more method row)

**Interfaces:**

- Consumes: `/v1/money/fund/sources`, `/v1/money/fund/address`, `/v1/money/fund/intents`.
- Produces: `useFundSources()`, `useFundAddress()`, `useFundIntents()`, `<FundFromChain />`.

- [ ] **Step 1: Write the query hooks**

```ts
// apps/web/src/api/fund-sources.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";

export interface FundCurrency {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly address: string;
  readonly decimals: number;
}

export interface FundSource {
  readonly chainId: number;
  readonly name: string;
  readonly vmType: string;
  readonly currencies: readonly FundCurrency[];
}

/**
 * Every chain and token we can accept.
 *
 * Long-lived on purpose: it is the same answer for everybody and it changes
 * when Relay adds a chain, not while somebody is choosing one.
 */
export const useFundSources = () =>
  useQuery<{ chains: readonly FundSource[]; minimumUsd: string }>({
    queryKey: ["fund-sources"],
    staleTime: 10 * 60_000,
    queryFn: () => apiFetch("/v1/money/fund/sources"),
  });

export interface FundIntent {
  readonly id: string;
  readonly status: string;
  readonly depositAddress: string;
  readonly originChainId: number;
  readonly originCurrency: string;
  readonly inTxHash: string | null;
  readonly outTxHash: string | null;
  readonly failReason: string | null;
  readonly createdAt: string;
}

/** A deposit in flight. Polled while anything is unfinished, idle otherwise. */
export const useFundIntents = () =>
  useQuery<{ intents: readonly FundIntent[] }>({
    queryKey: ["fund-intents"],
    queryFn: () => apiFetch("/v1/money/fund/intents"),
    refetchInterval: (query) => {
      const intents = query.state.data?.intents ?? [];
      const settled = new Set(["success", "failure", "refund"]);
      return intents.some((i) => !settled.has(i.status)) ? 15_000 : false;
    },
  });

export const useFundAddress = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { chainId: number; currency: string }) =>
      apiFetch<{ depositAddress: string; chain: FundSource; currency: FundCurrency; minimumUsd: string }>(
        "/v1/money/fund/address",
        { method: "POST", body: JSON.stringify(input) },
      ),
    /* The intent exists the moment this resolves, so the pending list is stale. */
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["fund-intents"] }),
  });
};
```

- [ ] **Step 2: Write the failing component test**

Cases, each a test, against the house testing-library style:

```ts
// apps/web/src/app/money/FundFromChain.test.tsx
// 1. Renders a searchable list: typing "tron" narrows 61 chains to the Tron rows.
// 2. Picking a chain and a token calls /v1/money/fund/address once with both.
// 3. The returned address is shown in full, is copyable, and is NOT truncated —
//    a truncated deposit address is money sent nowhere.
// 4. The minimum from the server is shown, not a hardcoded figure.
// 5. A Bitcoin pick says the deposit takes block confirmations, not seconds.
// 6. A pending intent renders with its origin chain and a waiting state.
// 7. A failed intent shows its failReason and tells the user to contact us —
//    there is no self-service refund in this phase and the copy must not imply one.
```

Write these out in full before implementing. Case 3 matters most: assert the
exact address string is present, not a prefix.

**This is the one step in this plan specified rather than written.** The other
test steps carry their code; this one does not, because the web app's
testing-library setup was not read while this was written and guessing at it
would produce code to delete rather than run. Read a neighbouring component test
— `apps/web/src/app/money/` has them — and follow it. If the seven cases above
turn out to need an eighth, add it; they are a floor.

- [ ] **Step 3: Build the component**

Three states in one panel, in this order: pick a chain and token (searchable
over the full list); show the address with a QR and the minimum; show anything
in flight underneath. No amount field — the user chooses the amount in their own
wallet or exchange, which is the whole point of a deposit address.

Copy requirements:

- Name the asset and chain exactly as the user picked them, every time the
  address is on screen. "Send USDT on Tron to this address" and never "send
  your tokens here".
- State the minimum.
- For a Bitcoin origin, say it takes block confirmations. For everything else,
  about a minute.
- Say that sending a different token or using a different chain cannot be
  recovered. This is not hedging — Relay's documentation says so plainly, and
  `useUsdcAck` already exists in `Receive.tsx` because people did exactly this.

- [ ] **Step 4: Add the method row to Add cash**

Follow `AddCash.tsx`'s existing shape — a `METHODS` entry plus a glyph, gated
through the same `LIVE.filter` pattern that already hides the wallet method when
no wallet is present. This one is gated on `/v1/money/fund/sources` answering at
all: if the API is not configured for Relay, the route 404s and the row does not
appear.

- [ ] **Step 5: Verify, then commit**

```bash
pnpm check
```

```bash
git add apps/web/src/api/fund-sources.ts apps/web/src/app/money/FundFromChain.tsx apps/web/src/app/money/FundFromChain.test.tsx apps/web/src/app/AddCash.tsx
git commit -m "feat(web): add cash from any chain"
```

---

### Task 9: Prove it end to end against mainnet

Not a unit test. The thing this phase exists to do, done once, by hand, before anyone calls it finished.

- [ ] **Step 1: Mint a real deposit address**

Against the deployed Coolify API with a real session, `POST /v1/money/fund/address` for a cheap origin — Base ETH or Solana USDT. Confirm the `funding_intent` row exists with `status: 'waiting'`.

- [ ] **Step 2: Send a real deposit**

Above the $10 floor. Note the origin transaction hash.

- [ ] **Step 3: Watch the webhook arrive**

Confirm in order: the row's `status` advances; `in_tx_hash` matches what you sent; `out_tx_hash` is set on `success`; the USDC balance in the app increases.

- [ ] **Step 4: Confirm the feed**

One row, not two. It names the origin asset and chain. The performance chart does not show a gain equal to the deposit — if it does, `kind` was changed and `portfolio/queries.ts:118` is now reading a flow it does not recognise.

- [ ] **Step 5: Record what it actually cost**

The quote's `relayerGas` against a wallet that already holds USDC, versus the $0.188 measured on a fresh one. Put the real figure in the spec's §7 if it differs — a measured number beats an estimate, and the next person reads that table.

- [ ] **Step 6: Commit any copy or figure corrections**

```bash
git commit -m "docs: record what a real deposit cost"
```

---

## What is deliberately not in this phase

- **No wallet connection.** No AppKit, no Relay SDK in the browser, no signing. Phase 2.
- **No `appFees`.** Zero, and the field is absent rather than set to zero.
- **No refund process.** The addresses are configured and the data is captured; returning money to a user is a human loop that does not exist yet. Spec §8 names this as a known debt.
- **No polling fallback.** The webhook is the only status path. If enablement is still pending when this is ready, add `GET /requests/v3?depositAddress=` as a background pass — it is a Task of its own, not a branch inside Task 5.
- **No same-chain shortcut.** USDC on Solana still goes through PR #63's direct transfer, which is right: a same-asset same-chain move is not a swap and should not be quoted as one.
