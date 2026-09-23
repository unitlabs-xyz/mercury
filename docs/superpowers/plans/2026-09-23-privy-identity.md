# Privy Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real email address produces a real Solana wallet, and the API can prove which user is calling it.

**Architecture:** The browser runs Privy's email-OTP flow and gets an ES256 access token. It sends that token as a bearer header. The API verifies the token against Privy's public verification key, fetches the user's embedded Solana wallet from Privy's API, and upserts `user` + `wallet` rows in Postgres. The server never holds a key. Backend lands first and is testable with a fake token verifier before any frontend work starts.

**Tech Stack:** Hono, Drizzle ORM, Postgres, Vitest, `@privy-io/node` 0.35.0 (server), `@privy-io/react-auth` 3.45.0 (web), React 19, Vite.

**Spec:** [docs/superpowers/specs/2026-09-23-backend-design.md](../specs/2026-09-23-backend-design.md)

## Global Constraints

- Node `>=24`, pnpm `10.33.2`. Workspace commands use `pnpm --filter <pkg>`.
- TypeScript strict, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Indexing an array yields `T | undefined` — handle it.
- ESM. All relative imports inside `services/` and `packages/` end in `.js`, even from `.ts` files.
- `packages/core` is not modified by this plan.
- **Do not install `@solana/kit`.** It is deferred to subsystem 3. Every chain-specific peer of both Privy packages is optional; install neither.
- **Do not install `@privy-io/server-auth`.** It is deprecated in favour of `@privy-io/node` and drags in `@solana/web3.js@1`.
- Money never crosses a boundary as a number. Not relevant to this plan — no money is touched — but do not introduce a pattern that breaks it later.
- Never log an access token, an app secret, or a full wallet address at info level.
- Commit after every task. Commit messages are lowercase `feat:` / `test:` / `chore:` prefixed.

---

## File Structure

**Created**

| File | Responsibility |
| --- | --- |
| `services/api/src/db/schema.ts` | Drizzle table definitions for `user` and `wallet` only. Other tables arrive with their subsystems. |
| `services/api/src/db/client.ts` | One pooled Drizzle client built from `DATABASE_URL`. |
| `services/api/drizzle.config.ts` | Drizzle Kit config so migrations can be generated. |
| `services/api/src/auth/verifier.ts` | The `TokenVerifier` port and its real Privy implementation. This is the seam that makes the rest testable. |
| `services/api/src/auth/identity.ts` | Turns a verified `user_id` into `user` + `wallet` rows. Talks to Privy's user API and to Postgres. |
| `services/api/src/auth/middleware.ts` | Hono middleware. Reads the bearer header, verifies, loads identity, sets context. |
| `services/api/src/auth/verifier.test.ts` | Tests for the middleware and identity upsert using a fake verifier. |
| `apps/web/src/auth/PrivyBoundary.tsx` | Wraps the app in `PrivyProvider` with Solana-only config. |
| `apps/web/src/auth/useEmailLogin.ts` | Adapts Privy's `OtpFlowState` to the modal's existing `Pending` union, and owns the minimum-display-duration rule. |
| `apps/web/src/auth/useEmailLogin.test.ts` | Tests the state mapping and the duration floor with fake timers. |
| `apps/web/src/api/client.ts` | `fetch` wrapper that attaches the Privy access token. |

**Modified**

| File | Change |
| --- | --- |
| `services/api/src/deps.ts` | `Config` gains Privy and loses Chainlink/Pyth. `Deps` gains `db` and `verifier`. `buildDeps` stops throwing for the auth path. |
| `services/api/src/app.ts` | Mount the middleware; add `GET /v1/me`. |
| `apps/web/src/auth/AuthContext.tsx` | Unchanged API, but reads real auth state. |
| `apps/web/src/auth/AuthModal.tsx` | Staged `setTimeout` machine replaced by `useEmailLogin`. |
| `apps/web/src/main.tsx` | Render inside `PrivyBoundary`. |

---

## Task 1: Database client and the two tables

**Files:**
- Create: `services/api/src/db/schema.ts`
- Create: `services/api/src/db/client.ts`
- Create: `services/api/drizzle.config.ts`
- Test: `services/api/src/db/schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `users` and `wallets` Drizzle tables; `type User = typeof users.$inferSelect`; `type Wallet = typeof wallets.$inferSelect`; `createDb(url: string): Db`; `type Db`.

- [ ] **Step 1: Install dependencies**

```bash
pnpm --filter @harbor/api add drizzle-orm postgres
pnpm --filter @harbor/api add -D drizzle-kit
```

- [ ] **Step 2: Write the failing test**

This test asserts the schema's *shape*, which is what later tasks depend on. It needs no database.

Create `services/api/src/db/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { users, wallets } from "./schema.js";

describe("schema", () => {
  it("gives a user an id, a creation time and a display currency", () => {
    const cols = Object.keys(getTableColumns(users));
    expect(cols).toEqual(
      expect.arrayContaining(["id", "privyUserId", "createdAt", "displayCurrency"]),
    );
  });

  it("gives a wallet an address, a kind and an owner", () => {
    const cols = Object.keys(getTableColumns(wallets));
    expect(cols).toEqual(
      expect.arrayContaining(["id", "userId", "address", "kind", "isPrimary"]),
    );
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `pnpm --filter @harbor/api exec vitest run src/db/schema.test.ts`
Expected: FAIL — cannot resolve `./schema.js`.

- [ ] **Step 4: Write the schema**

Create `services/api/src/db/schema.ts`:

```ts
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Only the two tables identity needs. Lots, positions, orders and activity
 * arrive with subsystem 2 — see docs/05-data-model.md for the whole shape.
 *
 * We store no email. Privy holds it, and docs/05 says we do not copy it.
 */
export const users = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Privy's DID for this user, e.g. "did:privy:clxxxx". Our join key to them. */
    privyUserId: text("privy_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    displayCurrency: text("display_currency").notNull().default("USD"),
  },
  (t) => [uniqueIndex("user_privy_user_id_idx").on(t.privyUserId)],
);

export const wallets = pgTable(
  "wallet",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    kind: text("kind", { enum: ["privy_embedded", "external"] }).notNull(),
    isPrimary: boolean("is_primary").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("wallet_address_idx").on(t.address)],
);

export type User = typeof users.$inferSelect;
export type Wallet = typeof wallets.$inferSelect;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @harbor/api exec vitest run src/db/schema.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Write the client and the Drizzle config**

Create `services/api/src/db/client.ts`:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof createDb>;

/** One pool per process. The worker builds its own. */
export const createDb = (url: string) => drizzle(postgres(url, { max: 10 }), { schema });
```

Create `services/api/drizzle.config.ts`:

```ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
} satisfies Config;
```

- [ ] **Step 7: Generate the migration**

Run: `pnpm --filter @harbor/api exec drizzle-kit generate`
Expected: a new SQL file under `services/api/drizzle/`. Read it and confirm it creates exactly two tables and two unique indexes. If it tries to drop anything, stop — the config is pointed at the wrong schema.

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter @harbor/api exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add services/api/src/db services/api/drizzle services/api/drizzle.config.ts services/api/package.json pnpm-lock.yaml
git commit -m "feat: add user and wallet tables"
```

---

## Task 2: The token verifier port and its Privy implementation

**Files:**
- Create: `services/api/src/auth/verifier.ts`
- Test: `services/api/src/auth/verifier.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface TokenVerifier { verify(token: string): Promise<VerifiedToken> }`; `type VerifiedToken = { privyUserId: string; sessionId: string; expiresAt: Date }`; `class InvalidToken extends Error`; `createPrivyVerifier(opts: { appId: string; verificationKey: string }): TokenVerifier`.

The port exists so every later task can be tested without a network or a real Privy app. That is its whole purpose — do not skip it and call `verifyAccessToken` directly from the middleware.

- [ ] **Step 1: Install the dependency**

```bash
pnpm --filter @harbor/api add @privy-io/node
```

- [ ] **Step 2: Write the failing test**

Create `services/api/src/auth/verifier.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InvalidToken, type TokenVerifier, type VerifiedToken } from "./verifier.js";

/** A verifier that accepts exactly one token. Used by every later auth test. */
const fakeVerifier = (token: string, result: VerifiedToken): TokenVerifier => ({
  verify: async (t) => {
    if (t !== token) throw new InvalidToken("unknown token");
    return result;
  },
});

describe("TokenVerifier", () => {
  const ok: VerifiedToken = {
    privyUserId: "did:privy:abc123",
    sessionId: "sess_1",
    expiresAt: new Date("2030-01-01T00:00:00Z"),
  };

  it("returns the claims for a token it accepts", async () => {
    const v = fakeVerifier("good", ok);
    await expect(v.verify("good")).resolves.toEqual(ok);
  });

  it("throws InvalidToken for anything else", async () => {
    const v = fakeVerifier("good", ok);
    await expect(v.verify("bad")).rejects.toBeInstanceOf(InvalidToken);
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `pnpm --filter @harbor/api exec vitest run src/auth/verifier.test.ts`
Expected: FAIL — cannot resolve `./verifier.js`.

- [ ] **Step 4: Write the implementation**

Create `services/api/src/auth/verifier.ts`:

```ts
import { InvalidAuthTokenError, verifyAccessToken } from "@privy-io/node";

/** What the rest of the server is allowed to believe about a caller. */
export interface VerifiedToken {
  /** Privy's DID for the user, e.g. "did:privy:clxxxx". */
  readonly privyUserId: string;
  readonly sessionId: string;
  readonly expiresAt: Date;
}

export interface TokenVerifier {
  verify(token: string): Promise<VerifiedToken>;
}

export class InvalidToken extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidToken";
  }
}

/**
 * Privy access tokens are standard ES256 JWTs. `verification_key` is the PEM
 * public key from the Privy dashboard; it is public, so it is configuration
 * rather than a secret. Verification needs no app secret at all.
 */
export const createPrivyVerifier = (opts: {
  appId: string;
  verificationKey: string;
}): TokenVerifier => ({
  async verify(token) {
    try {
      const claims = await verifyAccessToken({
        access_token: token,
        app_id: opts.appId,
        verification_key: opts.verificationKey,
      });
      return {
        privyUserId: claims.user_id,
        sessionId: claims.session_id,
        expiresAt: new Date(claims.expiration * 1000),
      };
    } catch (cause) {
      if (cause instanceof InvalidAuthTokenError) throw new InvalidToken("rejected by Privy");
      throw cause;
    }
  },
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @harbor/api exec vitest run src/auth/verifier.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @harbor/api exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add services/api/src/auth services/api/package.json pnpm-lock.yaml
git commit -m "feat: add the privy token verifier behind a port"
```

---

## Task 3: Identity upsert

**Files:**
- Create: `services/api/src/auth/identity.ts`
- Test: `services/api/src/auth/identity.test.ts`

**Interfaces:**
- Consumes: `users`, `wallets`, `Db` from Task 1. `VerifiedToken` from Task 2.
- Produces: `interface WalletDirectory { solanaWalletFor(privyUserId: string): Promise<string | null> }`; `createPrivyDirectory(opts: { appId: string; appSecret: string }): WalletDirectory`; `resolveIdentity(db: Db, dir: WalletDirectory, token: VerifiedToken): Promise<Identity>`; `type Identity = { userId: string; privyUserId: string; walletAddress: string | null }`.

**Why a directory port:** the wallet address must come from Privy, never from the client. A client that can name its own address can name someone else's. `_get` is Privy's method name for fetching a user by ID — the underscore is theirs, not a typo.

- [ ] **Step 1: Write the failing test**

Create `services/api/src/auth/identity.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { WalletDirectory } from "./identity.js";
import { resolveIdentity } from "./identity.js";
import type { VerifiedToken } from "./verifier.js";

const token: VerifiedToken = {
  privyUserId: "did:privy:abc123",
  sessionId: "sess_1",
  expiresAt: new Date("2030-01-01T00:00:00Z"),
};

const directory = (address: string | null): WalletDirectory => ({
  solanaWalletFor: async () => address,
});

/**
 * A stand-in for Drizzle that records what it was asked to do. We are testing
 * the decision — insert or reuse — not Postgres.
 */
const fakeDb = (existing: { id: string; privyUserId: string } | null) => {
  const inserted: string[] = [];
  return {
    inserted,
    db: {
      query: {
        users: { findFirst: async () => existing ?? undefined },
        wallets: { findFirst: async () => undefined },
      },
      insert: () => ({
        values: (v: Record<string, unknown>) => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              inserted.push(String(v["privyUserId"] ?? v["address"]));
              return [{ id: "user-1", privyUserId: token.privyUserId }];
            },
          }),
        }),
      }),
    },
  };
};

describe("resolveIdentity", () => {
  it("creates a user the first time a Privy id is seen", async () => {
    const { db, inserted } = fakeDb(null);
    const id = await resolveIdentity(db as never, directory("So1anaAddr"), token);
    expect(id.privyUserId).toBe("did:privy:abc123");
    expect(inserted).toContain("did:privy:abc123");
  });

  it("reuses the existing user on a later call", async () => {
    const { db, inserted } = fakeDb({ id: "user-1", privyUserId: token.privyUserId });
    const id = await resolveIdentity(db as never, directory("So1anaAddr"), token);
    expect(id.userId).toBe("user-1");
    expect(inserted).not.toContain("did:privy:abc123");
  });

  it("takes the wallet address from Privy, never from the caller", async () => {
    const dir = { solanaWalletFor: vi.fn(async () => "FromPrivy") };
    const { db } = fakeDb({ id: "user-1", privyUserId: token.privyUserId });
    const id = await resolveIdentity(db as never, dir, token);
    expect(dir.solanaWalletFor).toHaveBeenCalledWith("did:privy:abc123");
    expect(id.walletAddress).toBe("FromPrivy");
  });

  it("tolerates a user whose wallet has not provisioned yet", async () => {
    const { db } = fakeDb({ id: "user-1", privyUserId: token.privyUserId });
    const id = await resolveIdentity(db as never, directory(null), token);
    expect(id.walletAddress).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @harbor/api exec vitest run src/auth/identity.test.ts`
Expected: FAIL — cannot resolve `./identity.js`.

- [ ] **Step 3: Write the implementation**

Create `services/api/src/auth/identity.ts`:

```ts
import { PrivyClient } from "@privy-io/node";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { users, wallets } from "../db/schema.js";
import type { VerifiedToken } from "./verifier.js";

export interface Identity {
  readonly userId: string;
  readonly privyUserId: string;
  /** Null while Privy is still provisioning the wallet. Not an error. */
  readonly walletAddress: string | null;
}

/**
 * Where a wallet address comes from. Privy, always — a caller that can name
 * its own address can name somebody else's.
 */
export interface WalletDirectory {
  solanaWalletFor(privyUserId: string): Promise<string | null>;
}

export const createPrivyDirectory = (opts: {
  appId: string;
  appSecret: string;
}): WalletDirectory => {
  const client = new PrivyClient({ appID: opts.appId, appSecret: opts.appSecret });
  return {
    async solanaWalletFor(privyUserId) {
      // `_get` is Privy's own name for "get a user by id".
      const user = await client.users._get(privyUserId);
      const wallet = user.linked_accounts.find(
        (a) =>
          a.type === "wallet" &&
          "chain_type" in a &&
          a.chain_type === "solana" &&
          "connector_type" in a &&
          a.connector_type === "embedded",
      );
      return wallet && "address" in wallet ? wallet.address : null;
    },
  };
};

export const resolveIdentity = async (
  db: Db,
  directory: WalletDirectory,
  token: VerifiedToken,
): Promise<Identity> => {
  const existing = await db.query.users.findFirst({
    where: eq(users.privyUserId, token.privyUserId),
  });

  const user =
    existing ??
    (
      await db
        .insert(users)
        .values({ privyUserId: token.privyUserId })
        .onConflictDoNothing()
        .returning()
    )[0];

  if (!user) throw new Error(`could not create or find user for ${token.privyUserId}`);

  const address = await directory.solanaWalletFor(token.privyUserId);

  if (address) {
    const known = await db.query.wallets.findFirst({ where: eq(wallets.address, address) });
    if (!known) {
      await db
        .insert(wallets)
        .values({ userId: user.id, address, kind: "privy_embedded", isPrimary: true })
        .onConflictDoNothing()
        .returning();
    }
  }

  return { userId: user.id, privyUserId: user.privyUserId, walletAddress: address };
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @harbor/api exec vitest run src/auth/identity.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @harbor/api exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add services/api/src/auth
git commit -m "feat: resolve a verified token into user and wallet rows"
```

---

## Task 4: Auth middleware and `GET /v1/me`

**Files:**
- Create: `services/api/src/auth/middleware.ts`
- Modify: `services/api/src/deps.ts`
- Modify: `services/api/src/app.ts:28` — add the route after `/health`
- Test: `services/api/src/auth/middleware.test.ts`

**Interfaces:**
- Consumes: `TokenVerifier`, `InvalidToken` (Task 2); `resolveIdentity`, `WalletDirectory`, `Identity` (Task 3); `Db` (Task 1).
- Produces: `requireAuth(deps: AuthDeps): MiddlewareHandler`; `type AuthDeps = { db: Db; verifier: TokenVerifier; directory: WalletDirectory }`; Hono context variable `identity: Identity`.

**Do not put the middleware on `*`.** `/health` must answer without a token, or the deploy platform's health check will fail and the service will look down.

- [ ] **Step 1: Write the failing test**

Create `services/api/src/auth/middleware.test.ts`:

```ts
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { requireAuth, type AuthDeps } from "./middleware.js";
import { InvalidToken, type TokenVerifier } from "./verifier.js";

const verifier: TokenVerifier = {
  verify: async (t) => {
    if (t !== "good") throw new InvalidToken("nope");
    return {
      privyUserId: "did:privy:abc123",
      sessionId: "sess_1",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    };
  },
};

const deps = {
  db: {} as AuthDeps["db"],
  verifier,
  directory: { solanaWalletFor: async () => "So1anaAddr" },
};

/** The middleware is what we are testing, so identity resolution is stubbed. */
const appWith = (d: AuthDeps) => {
  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));
  app.use("/v1/*", requireAuth(d, async (_db, dir, token) => ({
    userId: "user-1",
    privyUserId: token.privyUserId,
    walletAddress: await dir.solanaWalletFor(token.privyUserId),
  })));
  app.get("/v1/me", (c) => c.json(c.get("identity")));
  return app;
};

describe("requireAuth", () => {
  it("lets /health through without a token", async () => {
    const res = await appWith(deps).request("/health");
    expect(res.status).toBe(200);
  });

  it("rejects a request with no Authorization header", async () => {
    const res = await appWith(deps).request("/v1/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "unauthenticated", message: expect.any(String) } });
  });

  it("rejects a malformed Authorization header", async () => {
    const res = await appWith(deps).request("/v1/me", { headers: { Authorization: "good" } });
    expect(res.status).toBe(401);
  });

  it("rejects a token the verifier refuses", async () => {
    const res = await appWith(deps).request("/v1/me", {
      headers: { Authorization: "Bearer bad" },
    });
    expect(res.status).toBe(401);
  });

  it("passes the identity through on a good token", async () => {
    const res = await appWith(deps).request("/v1/me", {
      headers: { Authorization: "Bearer good" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      userId: "user-1",
      privyUserId: "did:privy:abc123",
      walletAddress: "So1anaAddr",
    });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @harbor/api exec vitest run src/auth/middleware.test.ts`
Expected: FAIL — cannot resolve `./middleware.js`.

- [ ] **Step 3: Write the middleware**

Create `services/api/src/auth/middleware.ts`:

```ts
import type { MiddlewareHandler } from "hono";
import type { Db } from "../db/client.js";
import { resolveIdentity, type Identity, type WalletDirectory } from "./identity.js";
import { InvalidToken, type TokenVerifier, type VerifiedToken } from "./verifier.js";

export interface AuthDeps {
  readonly db: Db;
  readonly verifier: TokenVerifier;
  readonly directory: WalletDirectory;
}

declare module "hono" {
  interface ContextVariableMap {
    identity: Identity;
  }
}

type Resolve = (db: Db, dir: WalletDirectory, token: VerifiedToken) => Promise<Identity>;

/**
 * Mount on "/v1/*", never on "*": /health has to answer without a token or the
 * platform health check reports the service down.
 *
 * `resolve` is injected so the middleware can be tested without a database.
 */
export const requireAuth = (
  deps: AuthDeps,
  resolve: Resolve = resolveIdentity,
): MiddlewareHandler => {
  return async (c, next) => {
    const header = c.req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return c.json(
        { error: { code: "unauthenticated", message: "Expected a Bearer access token." } },
        401,
      );
    }

    try {
      const verified = await deps.verifier.verify(token);
      c.set("identity", await resolve(deps.db, deps.directory, verified));
    } catch (cause) {
      if (cause instanceof InvalidToken) {
        return c.json(
          { error: { code: "unauthenticated", message: "That session is not valid." } },
          401,
        );
      }
      throw cause;
    }

    await next();
  };
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @harbor/api exec vitest run src/auth/middleware.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Rewrite the config in `deps.ts`**

In `services/api/src/deps.ts`, replace the `Config` interface and add the auth deps. `Config` currently requires `chainlinkFeedUrl` and `pythApiKey`; both go, per the spec. `jupiterApiKey` becomes optional because only execution needs it.

Replace lines 14–20 (the `Config` interface) with:

```ts
export interface Config {
  /** Required. Nothing works without these. */
  readonly databaseUrl: string;
  readonly privyAppId: string;
  readonly privyAppSecret: string;
  /** The PEM public key from the Privy dashboard. Public, so not a secret. */
  readonly privyVerificationKey: string;
  readonly solanaRpcUrl: string;
  /** Execution only — subsystem 3. Absent until then. */
  readonly jupiterApiKey?: string;
}
```

Then replace the whole `readConfig` function with:

```ts
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const jupiterApiKey = env["JUPITER_API_KEY"];
  return {
    databaseUrl: required(env, "DATABASE_URL"),
    privyAppId: required(env, "PRIVY_APP_ID"),
    privyAppSecret: required(env, "PRIVY_APP_SECRET"),
    privyVerificationKey: required(env, "PRIVY_VERIFICATION_KEY"),
    solanaRpcUrl: required(env, "SOLANA_RPC_URL"),
    ...(jupiterApiKey ? { jupiterApiKey } : {}),
  };
}
```

The spread is not a style choice: `exactOptionalPropertyTypes` rejects assigning `undefined` to an optional property.

- [ ] **Step 6: Add the auth deps to `buildDeps`**

Still in `deps.ts`, add above the existing `buildDeps`:

```ts
import { createDb } from "./db/client.js";
import { createPrivyDirectory } from "./auth/identity.js";
import { createPrivyVerifier } from "./auth/verifier.js";
import type { AuthDeps } from "./auth/middleware.js";

/**
 * Identity only. The market ports still throw from `buildDeps` until subsystem
 * 2 lifts them out of the browser — see the spec. This lets the auth path boot
 * and be deployed on its own.
 */
export function buildAuthDeps(config: Config): AuthDeps {
  return {
    db: createDb(config.databaseUrl),
    verifier: createPrivyVerifier({
      appId: config.privyAppId,
      verificationKey: config.privyVerificationKey,
    }),
    directory: createPrivyDirectory({
      appId: config.privyAppId,
      appSecret: config.privyAppSecret,
    }),
  };
}
```

Leave the existing `buildDeps` throwing. It is still accurate.

- [ ] **Step 7: Mount the middleware and add the route**

In `services/api/src/app.ts`, change the `createApp` signature and add the route. The existing `app.use("*", cors())` stays where it is.

Change line 24 from `export function createApp(deps: Deps) {` to:

```ts
export function createApp(deps: Deps, auth: AuthDeps) {
```

Add the import at the top:

```ts
import { requireAuth, type AuthDeps } from "./auth/middleware.js";
```

Then immediately after the existing `/health` route (line 28), add:

```ts
  app.use("/v1/*", requireAuth(auth));

  /** Who is calling, and which wallet is theirs. The first authenticated route. */
  app.get("/v1/me", (c) => c.json(c.get("identity")));
```

- [ ] **Step 8: Update the entrypoint**

Replace `services/api/src/index.ts` entirely:

```ts
import { serve } from "@hono/node-server";
import { buildAuthDeps, buildDeps, readConfig } from "./deps.js";
import { createApp } from "./app.js";

const config = readConfig();
const port = Number(process.env.PORT ?? 8787);

serve({ fetch: createApp(buildDeps(config), buildAuthDeps(config)).fetch, port }, (info) => {
  console.log(`harbor api listening on :${info.port}`);
});
```

- [ ] **Step 9: Run the whole API suite and typecheck**

Run: `pnpm --filter @harbor/api exec vitest run`
Expected: PASS, 13 tests across four files (2 schema, 2 verifier, 4 identity, 5 middleware).

Run: `pnpm --filter @harbor/api exec tsc --noEmit`
Expected: no errors. If `c.get("identity")` is typed `unknown`, the `declare module "hono"` block in `middleware.ts` is not being included — check it is imported somewhere in the compilation.

- [ ] **Step 10: Commit**

```bash
git add services/api/src
git commit -m "feat: require a verified privy token on /v1 routes"
```

---

## Task 5: Prove it against a real Privy app

This is the one task that cannot be unit tested, and it is where the real problems appear. Do it before writing any frontend code — discovering a dashboard misconfiguration after building three components wastes the components.

**Files:**
- Modify: `services/api/.env.example`

- [ ] **Step 1: Configure the Privy dashboard**

At [dashboard.privy.io](https://dashboard.privy.io), in a new app:

1. **Login methods** — enable Email. Disable everything else.
2. **Embedded wallets** — enable Solana. Set "create on login" to *users without wallets*. Turn Ethereum embedded wallets **off**; we have no use for them and they double the provisioning time.
3. **App settings** — copy the App ID, the App Secret, and the **verification key** (a PEM block beginning `-----BEGIN PUBLIC KEY-----`).

- [ ] **Step 2: Record the variables**

Replace `services/api/.env.example` with:

```
PORT=8787

# Required. The server refuses to start without them.
DATABASE_URL=
SOLANA_RPC_URL=

# Privy. App ID and the verification key are public; the secret is not.
PRIVY_APP_ID=
PRIVY_APP_SECRET=
PRIVY_VERIFICATION_KEY=

# Execution only, from subsystem 3 onward. Absent until then.
JUPITER_API_KEY=
```

Values stay empty. Real values go in `.env`, which `.gitignore` already covers — confirm with `git check-ignore services/api/.env` before writing one.

- [ ] **Step 3: Create the database and run the migration**

Create a Postgres database (Neon's free tier is fine), put its URL in `services/api/.env`, then:

Run: `pnpm --filter @harbor/api exec drizzle-kit migrate`
Expected: two tables created. Confirm with `\dt` in `psql` — you should see `user` and `wallet`.

- [ ] **Step 4: Start the API**

Run: `pnpm --filter @harbor/api dev`
Expected: `harbor api listening on :8787`. If it exits with `PRIVY_VERIFICATION_KEY is required`, the `.env` is not being read — `tsx` loads it only if you are in the package directory or pass `--env-file`.

- [ ] **Step 5: Check the unauthenticated paths by hand**

```bash
curl -s localhost:8787/health
curl -s -o /dev/null -w "%{http_code}\n" localhost:8787/v1/me
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer nonsense" localhost:8787/v1/me
```

Expected: `{"ok":true}`, then `401`, then `401`.

- [ ] **Step 6: Get a real token and check the authenticated path**

There is no frontend yet, so mint a token from Privy's dashboard test user, or skip to Task 8 and return here. Once you have one:

```bash
curl -s -H "Authorization: Bearer $TOKEN" localhost:8787/v1/me
```

Expected: `{"userId":"…","privyUserId":"did:privy:…","walletAddress":"…"}`.

**If `walletAddress` is `null`:** the wallet has not provisioned. Check the dashboard's Solana embedded wallet setting from Step 1. This is the single most likely thing to be wrong, which is why this task exists.

- [ ] **Step 7: Commit**

```bash
git add services/api/.env.example
git commit -m "chore: record the privy environment variables"
```

---

## Task 6: The Privy boundary in the web app

**Files:**
- Create: `apps/web/src/auth/PrivyBoundary.tsx`
- Modify: `apps/web/src/main.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `PrivyBoundary` — a component wrapping `children`.

- [ ] **Step 1: Install the dependency**

```bash
pnpm --filter @harbor/web add @privy-io/react-auth
```

Expect pnpm to warn about unmet optional peers (`@solana/kit`, `permissionless`, and others). That is correct and deliberate — do not install them.

- [ ] **Step 2: Write the boundary**

Create `apps/web/src/auth/PrivyBoundary.tsx`:

```tsx
import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";

const APP_ID = import.meta.env["VITE_PRIVY_APP_ID"] as string | undefined;

/**
 * Solana only, email only. Ethereum embedded wallets are explicitly off: we
 * have no use for one and provisioning both doubles the wait a new user sits
 * through on the "ready" step.
 */
export const PrivyBoundary = ({ children }: { children: ReactNode }) => {
  if (!APP_ID) throw new Error("VITE_PRIVY_APP_ID is not set");
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        loginMethods: ["email"],
        embeddedWallets: {
          solana: { createOnLogin: "users-without-wallets" },
          ethereum: { createOnLogin: "off" },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
};
```

- [ ] **Step 3: Mount it**

In `apps/web/src/main.tsx`, wrap the existing root element in `<PrivyBoundary>`. It must be outside the router, because `AuthModal` renders on both the landing and app routes.

- [ ] **Step 4: Add the client variable**

Create `apps/web/.env.example`:

```
VITE_PRIVY_APP_ID=
VITE_API_URL=http://localhost:8787
```

Put the real App ID in `apps/web/.env`.

- [ ] **Step 5: Verify it boots**

Run: `pnpm --filter @harbor/web dev`
Expected: the app renders as before. Open the console — no Privy errors. If you see `Invalid Privy app ID`, the value in `.env` is wrong or Vite was not restarted; Vite reads `.env` only at startup.

- [ ] **Step 6: Typecheck and build**

Run: `pnpm --filter @harbor/web exec tsc --noEmit -p tsconfig.json && pnpm --filter @harbor/web build`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/auth/PrivyBoundary.tsx apps/web/src/main.tsx apps/web/.env.example apps/web/package.json pnpm-lock.yaml
git commit -m "feat: wrap the web app in a solana-only privy provider"
```

---

## Task 7: The email login hook, with the minimum display duration

**Files:**
- Create: `apps/web/src/auth/useEmailLogin.ts`
- Test: `apps/web/src/auth/useEmailLogin.test.ts`

**Interfaces:**
- Consumes: `@privy-io/react-auth`'s `useLoginWithEmail`.
- Produces: `useEmailLogin(): { pending: Pending; invalid: boolean; send(email: string): Promise<void>; submit(code: string): Promise<void>; reset(): void }`; `type Pending = "sending" | "resending" | "checking" | "creating" | null`; and the exported pure helper `atLeast<T>(ms: number, work: Promise<T>): Promise<T>`.

**The rule this task exists to enforce** (spec §4, subsystem 1): `SEND_MS`, `CHECK_MS` and `CREATE_MS` are no longer simulated latency. They are a **minimum display duration**. A response arriving early waits; a response arriving late hands the progress rule over to an indeterminate sweep. Without the floor, a fast network flickers through three designed states in under 100ms and the modal looks broken.

- [ ] **Step 1: Write the failing test for the floor**

Create `apps/web/src/auth/useEmailLogin.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { atLeast } from "./useEmailLogin.js";

describe("atLeast", () => {
  it("holds a fast result until the floor elapses", async () => {
    vi.useFakeTimers();
    const started = Date.now();
    let settledAt = 0;
    const p = atLeast(800, Promise.resolve("ok")).then((v) => {
      settledAt = Date.now();
      return v;
    });
    await vi.advanceTimersByTimeAsync(799);
    expect(settledAt).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toBe("ok");
    expect(settledAt - started).toBe(800);
    vi.useRealTimers();
  });

  it("does not delay a result that was already slower than the floor", async () => {
    vi.useFakeTimers();
    const slow = new Promise<string>((r) => setTimeout(() => r("ok"), 1500));
    const p = atLeast(800, slow);
    await vi.advanceTimersByTimeAsync(1500);
    await expect(p).resolves.toBe("ok");
    vi.useRealTimers();
  });

  it("propagates a rejection without waiting out the floor", async () => {
    vi.useFakeTimers();
    const p = atLeast(800, Promise.reject(new Error("nope")));
    await expect(p).rejects.toThrow("nope");
    vi.useRealTimers();
  });
});
```

The third case matters: holding an *error* for 800ms makes a typo feel like a network problem.

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @harbor/web exec vitest run src/auth/useEmailLogin.test.ts`
Expected: FAIL — cannot resolve `./useEmailLogin.js`.

- [ ] **Step 3: Write the hook**

Create `apps/web/src/auth/useEmailLogin.ts`:

```ts
import { useLoginWithEmail } from "@privy-io/react-auth";
import { useCallback, useState } from "react";

export type Pending = "sending" | "resending" | "checking" | "creating" | null;

export const SEND_MS = 800;
export const RESEND_MS = 650;
export const CHECK_MS = 700;
export const CREATE_MS = 800;

/**
 * A minimum display duration, not simulated latency — and the distinction
 * matters, because this looks like a bug otherwise. The progress hairline is
 * drawn to fill over a known time. A response that beats it would flicker
 * through three designed states in under 100ms, so we hold. A rejection is
 * never held: making a typo wait feels like a network fault.
 */
export const atLeast = async <T,>(ms: number, work: Promise<T>): Promise<T> => {
  const floor = new Promise<void>((resolve) => setTimeout(resolve, ms));
  const result = await work;
  await floor;
  return result;
};

export const useEmailLogin = () => {
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const [pending, setPending] = useState<Pending>(null);
  const [invalid, setInvalid] = useState(false);

  const send = useCallback(
    async (email: string) => {
      const phase: Pending = pending === null ? "sending" : "resending";
      setPending(phase);
      setInvalid(false);
      try {
        await atLeast(phase === "sending" ? SEND_MS : RESEND_MS, sendCode({ email }));
      } catch {
        setInvalid(true);
      } finally {
        setPending(null);
      }
    },
    [pending, sendCode],
  );

  const submit = useCallback(
    async (code: string) => {
      setPending("checking");
      try {
        await atLeast(CHECK_MS, loginWithCode({ code }));
        // The code was accepted; Privy is provisioning the wallet.
        setPending("creating");
        await atLeast(CREATE_MS, Promise.resolve());
      } catch {
        setInvalid(true);
      } finally {
        setPending(null);
      }
    },
    [loginWithCode],
  );

  const reset = useCallback(() => {
    setPending(null);
    setInvalid(false);
  }, []);

  return { pending, invalid, send, submit, reset };
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @harbor/web exec vitest run src/auth/useEmailLogin.test.ts`
Expected: PASS, 3 tests.

If `vitest` is not configured in `apps/web`, add it:

```bash
pnpm --filter @harbor/web add -D vitest
```

and add `"test": "vitest run"` to that package's scripts.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @harbor/web exec tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/auth/useEmailLogin.ts apps/web/src/auth/useEmailLogin.test.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat: adapt privy's otp flow to the modal's pending states"
```

---

## Task 8: Wire the modal to the hook

**Files:**
- Modify: `apps/web/src/auth/AuthModal.tsx`
- Modify: `apps/web/src/auth/AuthContext.tsx`

**Interfaces:**
- Consumes: `useEmailLogin`, `Pending` (Task 7).
- Produces: no new exports. `AuthModal`'s props and `useAuthModal`'s shape are unchanged.

**Preserve the design.** The step machine, the sealed code field, the hairline progress and the three-step choreography all stay. This task deletes the timers that *drove* them and connects real calls in their place. If the modal looks different afterwards, something has gone wrong.

- [ ] **Step 1: Remove the staged machine**

In `apps/web/src/auth/AuthModal.tsx`, delete:

- the `SEND_MS`, `RESEND_MS`, `CHECK_MS`, `CREATE_MS` constants (they now come from `useEmailLogin`)
- the `Pending` type declaration (now imported)
- the entire `useEffect` block beginning `/* Every staged wait lives here` — the `after()` helper and all four branches
- the `useEffect` that calls `setPending("checking")` when `code.length === 6`
- the `const [pending, setPending] = useState<Pending>(null)` line

Keep everything else: the height animation, the resize clip, the `resent` acknowledgement, the countdown, the `Fill` component, and the whole render tree.

- [ ] **Step 2: Connect the hook**

Add the import:

```ts
import { CHECK_MS, CREATE_MS, RESEND_MS, SEND_MS, useEmailLogin, type Pending } from "./useEmailLogin.js";
```

Inside the component, replace the removed `pending` state with:

```ts
const { pending, invalid: codeRejected, send, submit, reset } = useEmailLogin();
```

`invalid` already exists in this component for the email-format error. Name the hook's one `codeRejected` to avoid the collision, and show it on the code step.

- [ ] **Step 3: Call `send` on submit**

Replace the body of `submitEmail` after the format check:

```ts
setInvalid(false);
void send(email).then(() => setStep("code"));
```

- [ ] **Step 4: Call `submit` when the code completes**

Add back one effect, which is the only timer-free replacement for the two you deleted:

```ts
useEffect(() => {
  if (step === "code" && !pending && code.length === 6) {
    void submit(code).then(() => setStep("ready"));
  }
}, [code, step, pending, submit]);
```

- [ ] **Step 5: Reset on close**

In the existing close-reset effect, replace `setPending(null)` with `reset()`.

- [ ] **Step 6: Verify by hand — the fast path**

Run: `pnpm --filter @harbor/web dev` with the API running.

1. Open the modal, enter a real address you can receive mail at, submit.
2. The button reads "Sending", the hairline fills, and the step changes **when the hairline completes** — not before.
3. The OTP arrives from Privy's sender. Enter it.
4. The boxes seal, the rule fills, the status reads "Checking your code" then "Creating your wallet", then the ready step arrives.

- [ ] **Step 7: Verify by hand — the paths that usually break**

- **Wrong code:** the code step shows the rejection rather than advancing. The boxes must be editable again afterwards, not left sealed.
- **Close mid-flight:** close the modal while "Sending" and reopen. It must return to the email step with no stuck pending state.
- **Slow network:** throttle to Slow 3G in devtools and resend. The hairline finishes before the response arrives and then sits full and motionless. That is the case Step 8 fixes — confirm you can see it before fixing it.

- [ ] **Step 8: Hand the rule over to an indeterminate sweep**

Spec §4 requires both halves of the rule: a fast response waits, and a slow one must not leave a full bar looking hung. Same 2px rule, same place — it only ever appears once the floor has been outlived.

In `AuthModal.tsx`, replace the `Fill` component with:

```tsx
/**
 * The one loading material in this dialog. It fills over exactly the minimum
 * display duration, then — if the response still has not arrived — sweeps,
 * because a full bar that has not advanced reads as broken within a second.
 */
const Fill = ({ ms, className }: { ms: number; className: string }) => (
  <motion.span
    aria-hidden
    className={`origin-left ${className}`}
    initial={{ scaleX: 0 }}
    animate={{ scaleX: [0, 1, 1, 0.15, 1] }}
    transition={{
      duration: ms / 1000,
      ease: "linear",
      times: [0, 1, 1, 1.0001, 2],
      repeat: Infinity,
      repeatDelay: 0,
    }}
  />
);
```

That keyframe list is doing one specific thing: the first segment is the honest fill over `ms`, and everything after it only plays if the promise has not resolved, because the element unmounts the moment `pending` clears.

- [ ] **Step 9: Verify the slow path again**

Throttle to Slow 3G and resend. Expected: the hairline fills once at the designed pace, then sweeps until the response lands. At normal speed the sweep is never seen, because the element unmounts first.

- [ ] **Step 10: Typecheck and build**

Run: `pnpm --filter @harbor/web exec tsc --noEmit -p tsconfig.json && pnpm --filter @harbor/web build`
Expected: both clean. Any "declared but never used" error means a constant survived Step 1.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/auth
git commit -m "feat: drive the auth modal from privy instead of timers"
```

---

## Task 9: The authenticated API client, end to end

**Files:**
- Create: `apps/web/src/api/client.ts`
- Test: `apps/web/src/api/client.test.ts`

**Interfaces:**
- Consumes: `getAccessToken` from `@privy-io/react-auth`.
- Produces: `apiFetch<T>(path: string, init?: RequestInit): Promise<T>`; `class ApiError extends Error { status: number; code: string }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/api/client.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@privy-io/react-auth", () => ({ getAccessToken: vi.fn(async () => "tok_123") }));

import { getAccessToken } from "@privy-io/react-auth";
import { ApiError, apiFetch } from "./client.js";

describe("apiFetch", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("attaches the access token as a bearer header", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await apiFetch("/v1/me");
    const init = spy.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer tok_123");
  });

  it("throws ApiError carrying the server's code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "unauthenticated", message: "no" } }), {
        status: 401,
      }),
    );
    await expect(apiFetch("/v1/me")).rejects.toMatchObject({
      status: 401,
      code: "unauthenticated",
    });
  });

  it("sends no Authorization header when there is no session", async () => {
    vi.mocked(getAccessToken).mockResolvedValueOnce(null);
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    await apiFetch("/v1/me");
    expect(new Headers(spy.mock.calls[0]?.[1]?.headers).has("Authorization")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @harbor/web exec vitest run src/api/client.test.ts`
Expected: FAIL — cannot resolve `./client.js`.

- [ ] **Step 3: Write the client**

Create `apps/web/src/api/client.ts`:

```ts
import { getAccessToken } from "@privy-io/react-auth";

const BASE = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "http://localhost:8787";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * `getAccessToken` refreshes a token that is near expiry, so call it per
 * request rather than holding one. It returns null when nobody is signed in,
 * which is not an error — the server decides whether the route needed one.
 */
export const apiFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const err =
      body && typeof body === "object" && "error" in body
        ? (body.error as { code?: string; message?: string })
        : {};
    throw new ApiError(res.status, err.code ?? "unknown", err.message ?? res.statusText);
  }
  return body as T;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @harbor/web exec vitest run src/api/client.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Prove the whole loop by hand**

With both the API and the web app running, temporarily add this to `AuthModal.tsx` so the ready step calls the server the moment it renders:

```ts
useEffect(() => {
  void apiFetch("/v1/me").then(console.log);
}, []);
```

Expected in the console: `{userId: "…", privyUserId: "did:privy:…", walletAddress: "…"}`.

**This is the moment the subsystem is done.** A real email produced a real Solana wallet, and the server independently confirmed which user is calling and which wallet is theirs — without trusting anything the client said.

Remove the temporary effect before committing.

- [ ] **Step 6: Confirm the database agrees**

```sql
select u.privy_user_id, w.address, w.kind from "user" u join wallet w on w.user_id = u.id;
```

Expected: one row, `kind = 'privy_embedded'`, and `address` matching what `/v1/me` returned.

- [ ] **Step 7: Run everything and commit**

```bash
pnpm --filter @harbor/api exec vitest run
pnpm --filter @harbor/web exec vitest run
pnpm --filter @harbor/core exec vitest run
```

Expected: 13, 6 and 35 passing respectively. `core` must be untouched at 35.

```bash
git add apps/web/src/api
git commit -m "feat: add an authenticated api client"
```

---

## Done when

- A real email address receives a Privy OTP and produces a Solana wallet.
- `GET /v1/me` returns 401 without a token, 401 with a bad one, and the caller's identity with a good one.
- The `user` and `wallet` rows exist in Postgres, with the address taken from Privy rather than from the client.
- `packages/core` still reports 35 passing tests.
- The modal looks and moves exactly as it did before, because only its timers changed.

## Deliberately not in this plan

- `@solana/kit`, signing, and anything that spends money — subsystem 3.
- Logout, session expiry handling, and token refresh on 401 — small, and better done once a screen depends on it.
- Lifting the market clients out of the browser — subsystem 2.
- Deployment — the spec puts API and worker on one Fly.io app; nothing here assumes a host.
