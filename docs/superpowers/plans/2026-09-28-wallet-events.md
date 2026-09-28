# Wallet Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make native SOL and USDC movements appear in the activity feed, with the real transaction signature and the real block time.

**Architecture:** A new background job, `wallet-events`, walks Solana transaction history every 30 seconds. Each wallet has two signature streams — its own address (native SOL) and its USDC token account (USDC transfers) — because the RPC does not index an SPL transfer under the recipient's wallet. One `getTransaction` per new signature yields both assets. `position-sync` is untouched.

**Tech Stack:** TypeScript (ESM, strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Drizzle ORM on Postgres, Vitest, PGlite for the one test that needs a real database, Solana JSON-RPC over plain `fetch`.

**Spec:** `docs/superpowers/specs/2026-09-28-wallet-events-design.md`

## Global Constraints

- **Branch:** `fix/no-reconcile-on-read`. Do not start on `main`.
- **Never the word "catalogue" or "catalog"** anywhere — identifiers, comments, docs, job names. Use `stocks`, `supportedStocks`, `listed*`, `asset*`.
- **Never log a wallet address.** Log `userId`. An address in a log is a person's holdings in a log.
- **Never a float for an on-chain amount.** Raw amounts are `bigint` in the mint's smallest unit; USD values are `Decimal` from `@mercury/core` and `numeric(38,18)` in Postgres.
- **Relative imports carry a `.js` extension.** The repo is ESM with `moduleResolution: "Bundler"` and `verbatimModuleSyntax`; type-only imports must use `import type`.
- **`maxSupportedTransactionVersion: 255`.** Never 0 — 163 of 1,195 transactions in a sampled mainnet block were version 1, and the node returns an error rather than a result for a transaction above the ceiling.
- **Do not add `Co-Authored-By` or any attribution trailer to commits.**
- **No `.env` file is ever committed.** `.env.example` stays value-free.

## File Structure

| File                                          | Responsibility                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/chain/src/ports.ts`                 | Add the `ChainHistory` port and its three data types. Separate from `ChainReader` because `withPledged` implements that one as an object literal. |
| `packages/chain/src/solana/rpc.ts`            | `SolanaRpc` gains `tokenAccountsFor`, `signatures`, `transaction`. Decoding only — no policy.                                                     |
| `packages/chain/src/solana/history.test.ts`   | Adapter tests: request shape, version ceiling, bigint decoding.                                                                                   |
| `services/api/src/wallet-events/movements.ts` | **Pure.** A transaction plus a wallet address in, classified movements out. No clock, no network, no database.                                    |
| `services/api/src/wallet-events/walk.ts`      | The paginated signature walk for one stream. Takes `ChainHistory`, no database.                                                                   |
| `services/api/src/wallet-events/sync.ts`      | The job: load wallets and streams, walk, fetch, write, advance cursors.                                                                           |
| `services/api/src/db/schema.ts`               | `wallet_stream` table; `activity.mint`; the unique index that makes replays free.                                                                 |
| `services/api/src/db/testing.ts`              | PGlite harness — a real Postgres in-process, for the idempotency test.                                                                            |
| `services/api/src/deps.ts`                    | Expose `history` on `Deps`.                                                                                                                       |
| `services/api/src/index.ts`                   | Run the job on its own clock.                                                                                                                     |

---

### Task 1: The `ChainHistory` port and its Solana adapter

**Files:**

- Modify: `packages/chain/src/ports.ts` (append)
- Modify: `packages/chain/src/solana/rpc.ts`
- Test: `packages/chain/src/solana/history.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `ChainHistory`, `SignaturePage`, `SignatureRef`, `TokenBalanceEntry`, `TransactionDetail`, all exported from `@mercury/chain`. `SolanaRpc implements ChainReader, ChainHistory`.

- [ ] **Step 1: Write the failing test**

Create `packages/chain/src/solana/history.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FIXTURE_OWNER, NVDAX_MINT, USDC_MINT } from "../testing/index.js";
import { SolanaRpc } from "./rpc.js";

const RPC = "https://rpc.example/v1";

/** Captures every request body, and answers each method from a map. */
const node = (answers: Record<string, unknown>) => {
  const calls: string[] = [];
  const doFetch = ((_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const body = String(init?.body);
    calls.push(body);
    const method = (JSON.parse(body) as { method: string }).method;
    const result = answers[method];
    if (result === undefined) throw new Error(`no answer registered for ${method}`);
    return Promise.resolve(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
  return { doFetch, calls };
};

const SIG_A = "4FciXUT4ubwv8vt1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SIG_B = "51WvrJYbqCD29ZVzbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("SolanaRpc.tokenAccountsFor", () => {
  it("asks for the owner's accounts filtered to one mint, and returns their addresses", async () => {
    const n = node({
      getTokenAccountsByOwner: {
        context: { slot: 1 },
        value: [{ pubkey: "EDG4dRdPj7jsM9eCMHt5nRoFoXshXhWk7wUYcE5ibt2C" }],
      },
    });
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: n.doFetch });
    const accounts = await rpc.tokenAccountsFor(FIXTURE_OWNER, USDC_MINT);
    expect(accounts).toEqual(["EDG4dRdPj7jsM9eCMHt5nRoFoXshXhWk7wUYcE5ibt2C"]);
    expect(n.calls[0]).toContain(`"mint":"${USDC_MINT}"`);
    expect(n.calls[0]).toContain(FIXTURE_OWNER);
  });

  it("returns nothing when the owner has no account for that mint", async () => {
    const n = node({ getTokenAccountsByOwner: { context: { slot: 1 }, value: [] } });
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: n.doFetch });
    expect(await rpc.tokenAccountsFor(FIXTURE_OWNER, NVDAX_MINT)).toEqual([]);
  });
});

describe("SolanaRpc.signatures", () => {
  it("passes limit, until and before through, and reads err as failure", async () => {
    const n = node({
      getSignaturesForAddress: [
        { signature: SIG_A, slot: 451224633, blockTime: 1790573221, err: null },
        { signature: SIG_B, slot: 451224600, blockTime: null, err: { InstructionError: [0, "Custom"] } },
      ],
    });
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: n.doFetch });
    const page = await rpc.signatures(FIXTURE_OWNER, { limit: 100, until: SIG_B, before: SIG_A });

    expect(n.calls[0]).toContain('"limit":100');
    expect(n.calls[0]).toContain(`"until":"${SIG_B}"`);
    expect(n.calls[0]).toContain(`"before":"${SIG_A}"`);
    expect(page).toEqual([
      { signature: SIG_A, slot: 451224633, blockTime: 1790573221, failed: false },
      { signature: SIG_B, slot: 451224600, blockTime: null, failed: true },
    ]);
  });

  it("omits until and before when they are not given, rather than sending null", async () => {
    const n = node({ getSignaturesForAddress: [] });
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: n.doFetch });
    await rpc.signatures(FIXTURE_OWNER, { limit: 1 });
    expect(n.calls[0]).not.toContain("until");
    expect(n.calls[0]).not.toContain("before");
  });
});

describe("SolanaRpc.transaction", () => {
  const detail = {
    blockTime: 1790573221,
    slot: 451224633,
    transaction: {
      message: {
        accountKeys: [
          { pubkey: FIXTURE_OWNER, source: "transaction" },
          { pubkey: "EDG4dRdPj7jsM9eCMHt5nRoFoXshXhWk7wUYcE5ibt2C", source: "lookupTable" },
        ],
      },
    },
    meta: {
      fee: 5001,
      preBalances: [2_000_000_000, 2_039_280],
      postBalances: [1_999_994_999, 2_039_280],
      preTokenBalances: [],
      postTokenBalances: [
        {
          accountIndex: 1,
          mint: USDC_MINT,
          owner: FIXTURE_OWNER,
          programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          uiTokenAmount: { amount: "500000000", decimals: 6, uiAmount: 500, uiAmountString: "500" },
        },
      ],
    },
  };

  it("asks with a version ceiling of 255, because 0 errors on a version 1 transaction", async () => {
    const n = node({ getTransaction: detail });
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: n.doFetch });
    await rpc.transaction(SIG_A);
    expect(n.calls[0]).toContain('"maxSupportedTransactionVersion":255');
    expect(n.calls[0]).toContain('"encoding":"jsonParsed"');
  });

  it("decodes lamports and token amounts as bigint, keys in index order", async () => {
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: node({ getTransaction: detail }).doFetch });
    const tx = await rpc.transaction(SIG_A);
    expect(tx).not.toBeNull();
    expect(tx!.signature).toBe(SIG_A);
    expect(tx!.blockTime).toBe(1790573221);
    expect(tx!.feeLamports).toBe(5001n);
    expect(tx!.accountKeys).toEqual([FIXTURE_OWNER, "EDG4dRdPj7jsM9eCMHt5nRoFoXshXhWk7wUYcE5ibt2C"]);
    expect(tx!.preLamports).toEqual([2_000_000_000n, 2_039_280n]);
    expect(tx!.postLamports).toEqual([1_999_994_999n, 2_039_280n]);
    expect(tx!.preTokens).toEqual([]);
    expect(tx!.postTokens).toEqual([
      { mint: USDC_MINT, owner: FIXTURE_OWNER, rawAmount: 500_000_000n, decimals: 6 },
    ]);
  });

  it("returns null when the node has no such transaction", async () => {
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: node({ getTransaction: null }).doFetch });
    expect(await rpc.transaction(SIG_A)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mercury/chain test history`
Expected: FAIL — `rpc.tokenAccountsFor is not a function`.

- [ ] **Step 3: Add the port**

Append to `packages/chain/src/ports.ts`:

```ts
/** One signature from an address's history. */
export interface SignatureRef {
  readonly signature: string;
  readonly slot: number;
  /** Seconds since the epoch. Null on a block the node has not timestamped. */
  readonly blockTime: number | null;
  /** A failed transaction moved nothing, and is skipped rather than read. */
  readonly failed: boolean;
}

export interface SignaturePage {
  readonly limit: number;
  /** Stop once this signature is reached. */
  readonly until?: string;
  /** Start below this signature. How the walk pages back through a busy window. */
  readonly before?: string;
}

/** One token account's balance on one side of a transaction. */
export interface TokenBalanceEntry {
  readonly mint: string;
  /** The wallet that owns the token account, not the account address. */
  readonly owner: string | null;
  readonly rawAmount: bigint;
  readonly decimals: number;
}

export interface TransactionDetail {
  readonly signature: string;
  readonly blockTime: number | null;
  /** Account keys in index order; under jsonParsed this includes lookup-table entries. */
  readonly accountKeys: readonly string[];
  readonly feeLamports: bigint;
  readonly preLamports: readonly bigint[];
  readonly postLamports: readonly bigint[];
  readonly preTokens: readonly TokenBalanceEntry[];
  readonly postTokens: readonly TokenBalanceEntry[];
}

/**
 * What happened to an address, as opposed to what it holds.
 *
 * A separate port from `ChainReader` rather than three more methods on it:
 * `withPledged` implements `ChainReader` as an object literal to fold in stock
 * pledged to Kamino, and a wrapper about holdings has no business answering
 * questions about signatures.
 */
export interface ChainHistory {
  /** The owner's token accounts for one mint. Empty when they have none yet. */
  tokenAccountsFor(owner: string, mint: string): Promise<readonly string[]>;
  /** Newest first, as the node returns them. */
  signatures(address: string, page: SignaturePage): Promise<readonly SignatureRef[]>;
  /** Null when the node has no such transaction, or has pruned it. */
  transaction(signature: string): Promise<TransactionDetail | null>;
}
```

- [ ] **Step 4: Implement the three methods**

In `packages/chain/src/solana/rpc.ts`, extend the imports and the class declaration:

```ts
import type {
  ChainHistory,
  ChainReader,
  MintConfig,
  SignaturePage,
  SignatureRef,
  TokenBalance,
  TokenBalanceEntry,
  TransactionDetail,
} from "../ports.js";
```

```ts
export class SolanaRpc implements ChainReader, ChainHistory {
```

Add these private response shapes beside the existing ones:

```ts
interface RpcSignature {
  readonly signature: string;
  readonly slot: number;
  readonly blockTime: number | null;
  readonly err: unknown;
}

interface RpcTokenBalance {
  readonly mint: string;
  readonly owner?: string;
  readonly uiTokenAmount: { readonly amount: string; readonly decimals: number };
}

interface RpcTransaction {
  readonly blockTime: number | null;
  readonly transaction: {
    readonly message: { readonly accountKeys: readonly { readonly pubkey: string }[] };
  };
  readonly meta: {
    readonly fee: number;
    readonly preBalances: readonly number[];
    readonly postBalances: readonly number[];
    readonly preTokenBalances?: readonly RpcTokenBalance[];
    readonly postTokenBalances?: readonly RpcTokenBalance[];
  } | null;
}

/**
 * The ceiling the node compares a transaction's version against, not an
 * assertion about what exists. A transaction above it returns an error rather
 * than a result, and version 1 is already 14% of a mainnet block — so 0 would
 * park a cursor forever on the first one the walk met.
 */
const MAX_TX_VERSION = 255;

const toEntry = (b: RpcTokenBalance): TokenBalanceEntry => ({
  mint: b.mint,
  owner: b.owner ?? null,
  rawAmount: BigInt(b.uiTokenAmount.amount),
  decimals: b.uiTokenAmount.decimals,
});
```

Add the methods to the class:

```ts
  /**
   * The owner's token accounts for one mint, by address.
   *
   * A mint filter rather than a program filter: the mint implies its program,
   * so this is one call. It also finds a non-associated account, which deriving
   * the associated address would miss.
   */
  async tokenAccountsFor(owner: string, mint: string): Promise<readonly string[]> {
    const res = await this.call<{ value: readonly { pubkey: string }[] }>("getTokenAccountsByOwner", [
      owner,
      { mint },
      { encoding: "jsonParsed" },
    ]);
    return res.value.map((a) => a.pubkey);
  }

  async signatures(address: string, page: SignaturePage): Promise<readonly SignatureRef[]> {
    // Built by spread: `exactOptionalPropertyTypes` rejects an explicit
    // undefined, and the node treats a null `until` as a malformed request.
    const params = {
      limit: page.limit,
      ...(page.until === undefined ? {} : { until: page.until }),
      ...(page.before === undefined ? {} : { before: page.before }),
    };
    const res = await this.call<readonly RpcSignature[]>("getSignaturesForAddress", [address, params]);
    return res.map((s) => ({
      signature: s.signature,
      slot: s.slot,
      blockTime: s.blockTime,
      failed: s.err !== null && s.err !== undefined,
    }));
  }

  /**
   * Lamports arrive as JSON numbers and become bigint here, so nothing
   * downstream can do float arithmetic on money.
   */
  async transaction(signature: string): Promise<TransactionDetail | null> {
    const res = await this.call<RpcTransaction | null>("getTransaction", [
      signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: MAX_TX_VERSION },
    ]);
    if (res === null || res.meta === null) return null;
    const meta = res.meta;
    return {
      signature,
      blockTime: res.blockTime,
      accountKeys: res.transaction.message.accountKeys.map((k) => k.pubkey),
      feeLamports: BigInt(meta.fee),
      preLamports: meta.preBalances.map((n) => BigInt(n)),
      postLamports: meta.postBalances.map((n) => BigInt(n)),
      preTokens: (meta.preTokenBalances ?? []).map(toEntry),
      postTokens: (meta.postTokenBalances ?? []).map(toEntry),
    };
  }
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `pnpm --filter @mercury/chain test && pnpm --filter @mercury/chain typecheck`
Expected: PASS, including the pre-existing `rpc.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/chain/src/ports.ts packages/chain/src/solana/rpc.ts packages/chain/src/solana/history.test.ts
git commit -m "feat(chain): read transaction history from Solana"
```

---

### Task 2: Classifying what moved

**Files:**

- Create: `services/api/src/wallet-events/movements.ts`
- Test: `services/api/src/wallet-events/movements.test.ts`

**Interfaces:**

- Consumes: `TransactionDetail`, `TokenBalanceEntry` from `@mercury/chain` (Task 1).
- Produces: `movementsIn(tx: TransactionDetail, ctx: MovementContext): readonly Movement[]`, `NATIVE_SOL_MINT: string`, and the `Movement` / `MovementContext` types. `MovementContext` is `{ wallet: string; now: Date }`.

This is the only file in the subsystem where a mistake costs money rather than a log line, so it is pure: no clock, no network, no database.

- [ ] **Step 1: Write the failing test**

Create `services/api/src/wallet-events/movements.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TokenBalanceEntry, TransactionDetail } from "@mercury/chain";
import { USDC_MINT } from "@mercury/chain";
import { movementsIn, NATIVE_SOL_MINT } from "./movements.js";

const WALLET = "6Yg9nNQEqCQBMcYHLrrfj6qGjcR6hvhdhHQZPjtDqLRT";
const OTHER = "FMVHP1xw6ZHB9zLGyrJeeAvEzCBgouH8bPzdkYqq2C5W";
const SIG = "5f121XsT7YRkYk5SoDMSMAtCmKKwm58NhWumjUNCtR4o6qPBgwCT2upBB3uUizLsykU51RSvLt1Z8Cwt5RXFcbAW";
const NOW = new Date("2026-09-28T12:00:00.000Z");

const usdc = (owner: string, amount: bigint): TokenBalanceEntry => ({
  mint: USDC_MINT,
  owner,
  rawAmount: amount,
  decimals: 6,
});

/** The wallet is the fee payer at index 0 unless a test says otherwise. */
const tx = (over: Partial<TransactionDetail> = {}): TransactionDetail => ({
  signature: SIG,
  blockTime: 1_790_573_221,
  accountKeys: [WALLET, OTHER],
  feeLamports: 5_000n,
  preLamports: [1_000_000_000n, 0n],
  postLamports: [999_995_000n, 0n],
  preTokens: [],
  postTokens: [],
  ...over,
});

const ctx = { wallet: WALLET, now: NOW };

describe("movementsIn — USDC", () => {
  it("reads a first deposit, where the account was created by this transaction and has no pre entry", () => {
    const m = movementsIn(tx({ preTokens: [], postTokens: [usdc(WALLET, 500_000_000n)] }), ctx);
    expect(m).toHaveLength(1);
    expect(m[0]!.mint).toBe(USDC_MINT);
    expect(m[0]!.kind).toBe("transfer_in");
    expect(m[0]!.title).toBe("Added cash");
    expect(m[0]!.amountUsd!.toFixed()).toBe("500");
    expect(m[0]!.signature).toBe(SIG);
    expect(m[0]!.occurredAt).toEqual(new Date(1_790_573_221 * 1000));
  });

  it("reads a withdrawal as money leaving", () => {
    const m = movementsIn(
      tx({ preTokens: [usdc(WALLET, 500_000_000n)], postTokens: [usdc(WALLET, 200_000_000n)] }),
      ctx,
    );
    expect(m).toHaveLength(1);
    expect(m[0]!.kind).toBe("transfer_out");
    expect(m[0]!.title).toBe("Sent cash");
    expect(m[0]!.amountUsd!.toFixed()).toBe("300");
  });

  it("sums two accounts for the same mint, which a wallet is allowed to have", () => {
    const m = movementsIn(
      tx({
        preTokens: [usdc(WALLET, 100_000_000n), usdc(WALLET, 0n)],
        postTokens: [usdc(WALLET, 100_000_000n), usdc(WALLET, 50_000_000n)],
      }),
      ctx,
    );
    expect(m).toHaveLength(1);
    expect(m[0]!.amountUsd!.toFixed()).toBe("50");
  });

  it("ignores another owner's accounts in the same transaction", () => {
    const m = movementsIn(tx({ preTokens: [usdc(OTHER, 0n)], postTokens: [usdc(OTHER, 900_000_000n)] }), ctx);
    expect(m).toEqual([]);
  });

  it("falls back to the given clock when the node reports no block time", () => {
    const m = movementsIn(tx({ blockTime: null, postTokens: [usdc(WALLET, 1_000_000n)] }), ctx);
    expect(m[0]!.occurredAt).toEqual(NOW);
  });
});

describe("movementsIn — native SOL", () => {
  it("reads an incoming transfer where the wallet is not the fee payer", () => {
    const m = movementsIn(
      tx({
        accountKeys: [OTHER, WALLET],
        preLamports: [5_000_000_000n, 1_000_000_000n],
        postLamports: [3_799_994_700n, 2_200_000_000n],
      }),
      ctx,
    );
    expect(m).toHaveLength(1);
    expect(m[0]!.mint).toBe(NATIVE_SOL_MINT);
    expect(m[0]!.kind).toBe("transfer_in");
    expect(m[0]!.title).toBe("Received SOL");
    expect(m[0]!.subtitle).toBe("1.2 SOL");
    expect(m[0]!.amountUsd).toBeNull();
  });

  it("emits nothing when the only lamport change is the fee the wallet paid", () => {
    // preLamports/postLamports in the default differ by exactly feeLamports.
    expect(movementsIn(tx(), ctx)).toEqual([]);
  });

  it("adds the fee back, so an outgoing transfer reports the amount sent and not the gas", () => {
    const m = movementsIn(tx({ preLamports: [1_000_000_000n, 0n], postLamports: [499_995_000n, 0n] }), ctx);
    expect(m).toHaveLength(1);
    expect(m[0]!.kind).toBe("transfer_out");
    expect(m[0]!.subtitle).toBe("0.5 SOL");
  });

  it("suppresses the SOL leg when the same transaction moved USDC, because that is rent and gas", () => {
    const m = movementsIn(
      tx({
        preLamports: [1_000_000_000n, 0n],
        postLamports: [997_955_720n, 0n], // fee plus rent for the new token account
        postTokens: [usdc(WALLET, 500_000_000n)],
      }),
      ctx,
    );
    expect(m).toHaveLength(1);
    expect(m[0]!.mint).toBe(USDC_MINT);
  });

  it("emits nothing when the wallet is not an account key at all", () => {
    const m = movementsIn(tx({ accountKeys: [OTHER], preLamports: [1n], postLamports: [2n] }), ctx);
    expect(m).toEqual([]);
  });

  it("does not trim a whole number to nonsense", () => {
    const m = movementsIn(
      tx({
        accountKeys: [OTHER, WALLET],
        preLamports: [0n, 0n],
        postLamports: [0n, 100_000_000_000n],
      }),
      ctx,
    );
    expect(m[0]!.subtitle).toBe("100 SOL");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mercury/api test movements`
Expected: FAIL — cannot resolve `./movements.js`.

- [ ] **Step 3: Write the implementation**

Create `services/api/src/wallet-events/movements.ts`:

```ts
import { D, type Decimal } from "@mercury/core";
import { USDC_DECIMALS, USDC_MINT, type TokenBalanceEntry, type TransactionDetail } from "@mercury/chain";

/**
 * Native SOL, recorded under the wrapped-SOL mint.
 *
 * The column is a mint and native SOL has none. This is the identifier every
 * Solana tool already uses for it, and the unique index on
 * (user_id, tx_signature, mint) needs a non-null value or two passes could
 * write the same movement twice.
 */
export const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

const SOL_DECIMALS = 9;

export interface Movement {
  readonly mint: string;
  readonly kind: "transfer_in" | "transfer_out";
  readonly title: string;
  readonly subtitle: string | null;
  /** Null unless the asset is itself a dollar. Nothing here invents a price. */
  readonly amountUsd: Decimal | null;
  readonly signature: string;
  readonly occurredAt: Date;
}

export interface MovementContext {
  readonly wallet: string;
  /** Used only when the node reports no block time for the slot. */
  readonly now: Date;
}

const scaled = (raw: bigint, decimals: number): Decimal => D(raw.toString()).div(D(10).pow(decimals));

const abs = (v: bigint): bigint => (v < 0n ? -v : v);

/** Trailing zeros, but only after a decimal point: "100" must not become "1". */
const trim = (v: Decimal, dp: number): string => {
  const s = v.toDecimalPlaces(dp).toFixed();
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};

const sumOwned = (entries: readonly TokenBalanceEntry[], owner: string, mint: string): bigint =>
  entries.reduce((total, e) => (e.owner === owner && e.mint === mint ? total + e.rawAmount : total), 0n);

/**
 * What one transaction did to one wallet, in cash terms.
 *
 * Pure: no database, no clock, no network. Every rule here is a millisecond to
 * test, which is what a file about money should cost to be sure of.
 *
 * Balances are summed per side rather than matched entry by entry, which makes
 * the two hard cases free. An account created inside the transaction has no
 * `pre` entry at all — the first-deposit case — and contributes zero to the pre
 * sum, which is the right answer. A wallet holding two accounts for one mint
 * falls out of the same sum.
 */
export function movementsIn(tx: TransactionDetail, ctx: MovementContext): readonly Movement[] {
  const occurredAt = tx.blockTime === null ? ctx.now : new Date(tx.blockTime * 1000);
  const moved: Movement[] = [];

  const usdc = sumOwned(tx.postTokens, ctx.wallet, USDC_MINT) - sumOwned(tx.preTokens, ctx.wallet, USDC_MINT);

  if (usdc !== 0n) {
    moved.push({
      mint: USDC_MINT,
      kind: usdc > 0n ? "transfer_in" : "transfer_out",
      title: usdc > 0n ? "Added cash" : "Sent cash",
      subtitle: null,
      // USDC is a dollar. No price lookup, and none to be wrong about.
      amountUsd: scaled(abs(usdc), USDC_DECIMALS),
      signature: tx.signature,
      occurredAt,
    });
    // Rent for a new token account and the fee for the deposit are plumbing for
    // the cash event, not a second event. A SOL row is written only when a SOL
    // change is the whole of what happened to this wallet.
    return moved;
  }

  const index = tx.accountKeys.indexOf(ctx.wallet);
  if (index < 0) return moved;
  const pre = tx.preLamports[index];
  const post = tx.postLamports[index];
  if (pre === undefined || post === undefined) return moved;

  // The fee payer is the first account key, and its balance change includes the
  // fee. Without adding it back, every swap would say "Sent 0.000005 SOL".
  const delta = post - pre + (index === 0 ? tx.feeLamports : 0n);
  if (delta === 0n) return moved;

  moved.push({
    mint: NATIVE_SOL_MINT,
    kind: delta > 0n ? "transfer_in" : "transfer_out",
    title: delta > 0n ? "Received SOL" : "Sent SOL",
    // The quantity, not a price: the block time is often hours old, and pricing
    // it at today's price would put a wrong number on a past event.
    subtitle: `${trim(scaled(abs(delta), SOL_DECIMALS), SOL_DECIMALS)} SOL`,
    amountUsd: null,
    signature: tx.signature,
    occurredAt,
  });

  return moved;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @mercury/api test movements`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/wallet-events/movements.ts services/api/src/wallet-events/movements.test.ts
git commit -m "feat(api): classify SOL and USDC movements from a transaction"
```

---

### Task 3: The paginated signature walk

**Files:**

- Create: `services/api/src/wallet-events/walk.ts`
- Test: `services/api/src/wallet-events/walk.test.ts`

**Interfaces:**

- Consumes: `ChainHistory`, `SignatureRef`, `SignaturePage` from `@mercury/chain` (Task 1).
- Produces: `walkStream(history: ChainHistory, address: string, cursor: string | null): Promise<StreamWalk>` where `StreamWalk` is `{ signatures: readonly SignatureRef[]; newestSignature: string | null }`. `signatures` is oldest-first and excludes failed transactions.

- [ ] **Step 1: Write the failing test**

Create `services/api/src/wallet-events/walk.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ChainHistory, SignaturePage, SignatureRef } from "@mercury/chain";
import { walkStream } from "./walk.js";

const ADDRESS = "6Yg9nNQEqCQBMcYHLrrfj6qGjcR6hvhdhHQZPjtDqLRT";

const ref = (n: number, failed = false): SignatureRef => ({
  signature: `sig-${String(n).padStart(4, "0")}`,
  slot: 1000 + n,
  blockTime: 1_790_000_000 + n,
  failed,
});

/**
 * A node holding a fixed history, newest first, answering `until` and `before`
 * the way the real one does. The walk's correctness is entirely about paging,
 * so the fake has to page properly or the test proves nothing.
 */
const nodeWith = (history: readonly SignatureRef[]) => {
  const asked: SignaturePage[] = [];
  const h: ChainHistory = {
    tokenAccountsFor: () => Promise.resolve([]),
    transaction: () => Promise.resolve(null),
    signatures: (_address, page) => {
      asked.push(page);
      let window = [...history];
      if (page.before !== undefined) {
        const at = window.findIndex((s) => s.signature === page.before);
        window = at < 0 ? window : window.slice(at + 1);
      }
      if (page.until !== undefined) {
        const at = window.findIndex((s) => s.signature === page.until);
        window = at < 0 ? window : window.slice(0, at);
      }
      return Promise.resolve(window.slice(0, page.limit));
    },
  };
  return { history: h, asked };
};

describe("walkStream", () => {
  it("records where it is and emits nothing on first sight, because there is no backfill", async () => {
    const n = nodeWith([ref(9), ref(8), ref(7)]);
    const walk = await walkStream(n.history, ADDRESS, null);
    expect(walk.signatures).toEqual([]);
    expect(walk.newestSignature).toBe("sig-0009");
    // One signature is all it takes to know where to start.
    expect(n.asked).toEqual([{ limit: 1 }]);
  });

  it("returns nothing at all for an address with no history", async () => {
    const walk = await walkStream(nodeWith([]).history, ADDRESS, null);
    expect(walk.signatures).toEqual([]);
    expect(walk.newestSignature).toBeNull();
  });

  it("returns everything since the cursor, oldest first", async () => {
    const n = nodeWith([ref(5), ref(4), ref(3), ref(2), ref(1)]);
    const walk = await walkStream(n.history, ADDRESS, "sig-0002");
    expect(walk.signatures.map((s) => s.signature)).toEqual(["sig-0003", "sig-0004", "sig-0005"]);
    expect(walk.newestSignature).toBe("sig-0005");
  });

  it("pages back with before until a short page, so a busy window loses nothing", async () => {
    // 250 new signatures: more than two full pages of 100.
    const history = Array.from({ length: 251 }, (_, i) => ref(251 - i));
    const n = nodeWith(history);
    const walk = await walkStream(n.history, ADDRESS, "sig-0001");

    expect(walk.signatures).toHaveLength(250);
    expect(walk.signatures[0]!.signature).toBe("sig-0002");
    expect(walk.signatures[249]!.signature).toBe("sig-0251");
    expect(walk.newestSignature).toBe("sig-0251");

    // Three calls: two full pages, then a short one that ends the walk.
    expect(n.asked).toHaveLength(3);
    expect(n.asked[0]).toEqual({ limit: 100, until: "sig-0001" });
    expect(n.asked[1]).toEqual({ limit: 100, until: "sig-0001", before: "sig-0152" });
    expect(n.asked[2]).toEqual({ limit: 100, until: "sig-0001", before: "sig-0052" });
  });

  it("drops failed transactions, which moved nothing", async () => {
    const n = nodeWith([ref(3), ref(2, true), ref(1)]);
    const walk = await walkStream(n.history, ADDRESS, "sig-0000");
    expect(walk.signatures.map((s) => s.signature)).toEqual(["sig-0001", "sig-0003"]);
    // The cursor still advances past the failure, or it would be retried forever.
    expect(walk.newestSignature).toBe("sig-0003");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mercury/api test walk`
Expected: FAIL — cannot resolve `./walk.js`.

- [ ] **Step 3: Write the implementation**

Create `services/api/src/wallet-events/walk.ts`:

```ts
import type { ChainHistory, SignatureRef } from "@mercury/chain";

/** What the node will return in one call. Its own maximum. */
const PAGE = 100;

export interface StreamWalk {
  /** Oldest first, failures removed. */
  readonly signatures: readonly SignatureRef[];
  /** Where to move the cursor, once the writes commit. Null on an empty address. */
  readonly newestSignature: string | null;
}

/**
 * Every signature on one address since `cursor`.
 *
 * The paging loop is the whole point. `getSignaturesForAddress` returns at most
 * `limit` signatures, newest first, so if more than a page has happened since
 * the cursor the older ones are simply absent from the response. Advancing the
 * cursor to the newest of that page would step over them and lose them
 * permanently. Paging back with `before` until a short page arrives is what
 * makes the walk gap-free, which is the property the whole design rests on.
 *
 * Oldest-first out, because a crash part way through a pass should leave the
 * cursor behind and replay a little, rather than leave a hole.
 */
export async function walkStream(
  history: ChainHistory,
  address: string,
  cursor: string | null,
): Promise<StreamWalk> {
  if (cursor === null) {
    // First sight: note where we are and emit nothing. A wallet Privy created
    // during sign-up has no history to lose, and an external wallet with years
    // of it is out of scope in v1 per ADR 0003.
    const page = await history.signatures(address, { limit: 1 });
    return { signatures: [], newestSignature: page[0]?.signature ?? null };
  }

  const collected: SignatureRef[] = [];
  let before: string | undefined;

  for (;;) {
    const page = await history.signatures(address, {
      limit: PAGE,
      until: cursor,
      ...(before === undefined ? {} : { before }),
    });
    collected.push(...page);
    if (page.length < PAGE) break;
    const oldest = page[page.length - 1];
    if (oldest === undefined) break;
    before = oldest.signature;
  }

  return {
    // The cursor advances past a failure too. It moved nothing, and leaving the
    // cursor behind it would retry it on every pass forever.
    newestSignature: collected[0]?.signature ?? null,
    signatures: collected.filter((s) => !s.failed).reverse(),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @mercury/api test walk`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/wallet-events/walk.ts services/api/src/wallet-events/walk.test.ts
git commit -m "feat(api): walk an address's signature history without gaps"
```

---

### Task 4: Schema — streams, the mint column, and the unique index

**Files:**

- Modify: `services/api/src/db/schema.ts`
- Create: `services/api/drizzle/0003_*.sql` (generated)
- Test: `services/api/src/db/schema.test.ts` (append)

**Interfaces:**

- Consumes: nothing.
- Produces: `walletStreams` table export with columns `walletId`, `address`, `cursor`, `checkedAt`; `activities.mint`; a unique index named `activity_signature_mint_idx` on `(user_id, tx_signature, mint)`.

- [ ] **Step 1: Write the failing test**

Append to `services/api/src/db/schema.test.ts`:

```ts
import { walletStreams } from "./schema.js";

describe("wallet event streams", () => {
  it("follows an address per wallet, with a cursor and a last-checked time", () => {
    const cols = Object.keys(getTableColumns(walletStreams));
    expect(cols).toEqual(expect.arrayContaining(["walletId", "address", "cursor", "checkedAt"]));
  });

  it("tells an activity row which asset moved, so cash and SOL are distinguishable", () => {
    const cols = Object.keys(getTableColumns(activities));
    expect(cols).toEqual(expect.arrayContaining(["mint", "txSignature"]));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mercury/api test schema`
Expected: FAIL — `walletStreams` is not exported.

- [ ] **Step 3: Add the table and the column**

In `services/api/src/db/schema.ts`, add `mint` to the `activities` column block, directly below `txSignature`:

```ts
    txSignature: text("tx_signature"),
    /** Which asset moved. Null on a row with no single asset, such as a dividend. */
    mint: text("mint"),
```

and replace the `activities` index list with:

```ts
  (t) => [
    index("activity_user_occurred_idx").on(t.userId, t.occurredAt, t.id),
    /**
     * The idempotency guarantee. A movement seen twice — a crash between
     * writing and advancing a cursor, a transaction that appears in both of a
     * wallet's streams, or two API instances running the job — is written once.
     *
     * Rows where `mint` is null are not constrained, which is what lets the
     * dividend rows `position-sync` writes carry no mint and no signature.
     */
    uniqueIndex("activity_signature_mint_idx").on(t.userId, t.txSignature, t.mint),
  ],
```

Add the new table after `wallets`:

```ts
/**
 * One signature stream we follow for a wallet.
 *
 * A row rather than a column per stream: a wallet follows its own address for
 * native SOL and its USDC token account for cash today, and following a stock
 * account later is an insert rather than a migration.
 *
 * The RPC indexes a transaction under its account keys, and an SPL transfer's
 * accounts do not include the recipient's wallet — so the wallet address alone
 * would find a first deposit and miss every one after it.
 */
export const walletStreams = pgTable(
  "wallet_stream",
  {
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    /** The address whose signatures this row follows. */
    address: text("address").notNull(),
    /** Newest signature processed. Null until the first pass records where we are. */
    cursor: text("cursor"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.walletId, t.address] })],
);
```

Add to the type exports at the bottom:

```ts
export type WalletStream = typeof walletStreams.$inferSelect;
```

- [ ] **Step 4: Generate the migration**

Run: `pnpm --filter @mercury/api exec drizzle-kit generate`
Expected: a new `services/api/drizzle/0003_*.sql` creating `wallet_stream`, adding `activity.mint`, and creating the unique index.

Read the generated SQL before continuing. It must contain `CREATE TABLE "wallet_stream"`, `ALTER TABLE "activity" ADD COLUMN "mint" text`, and `CREATE UNIQUE INDEX "activity_signature_mint_idx"`. If drizzle-kit asks whether a column was renamed, answer that it is new.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @mercury/api test schema && pnpm --filter @mercury/api typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/api/src/db/schema.ts services/api/src/db/schema.test.ts services/api/drizzle
git commit -m "feat(api): record which asset moved, and where each stream has read to"
```

---

### Task 5: The job, and proving the index is wired

**Files:**

- Create: `services/api/src/db/testing.ts`
- Create: `services/api/src/wallet-events/sync.ts`
- Test: `services/api/src/wallet-events/sync.test.ts`
- Modify: `services/api/package.json` (add `@electric-sql/pglite` to devDependencies)

**Interfaces:**

- Consumes: `walkStream` / `StreamWalk` (Task 3), `movementsIn` / `NATIVE_SOL_MINT` (Task 2), `ChainHistory` (Task 1), `walletStreams` / `activities` (Task 4).
- Produces: `syncAllWalletEvents(db: Db, deps: WalletEventsDeps): Promise<EventsSummary>` where `WalletEventsDeps` is `{ history: ChainHistory }` and `EventsSummary` is `{ wallets: number; checked: number; failed: number; written: number }`. Also `testDb(): Promise<Db>` from `db/testing.ts`.

The idempotency test runs against PGlite — a real Postgres, in process. A fake database would only assert our own belief about the unique index back to us, and the index is the mechanism the whole replay story depends on.

- [ ] **Step 1: Add the test-only database**

Run: `pnpm --filter @mercury/api add -D @electric-sql/pglite`

Create `services/api/src/db/testing.ts`:

```ts
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema.js";
import type { Db } from "./client.js";

/**
 * A real Postgres, in process, with the real migrations applied.
 *
 * The tests that need this are the ones about a unique index doing its job.
 * A fake would assert our own belief about the index back to us, which is not
 * a test of anything.
 *
 * The cast is the single concession: drizzle types a PGlite handle differently
 * from a postgres-js one, though the query API they expose is identical.
 */
export async function testDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
  return db as unknown as Db;
}
```

- [ ] **Step 2: Write the failing test**

Create `services/api/src/wallet-events/sync.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ChainHistory, SignatureRef, TransactionDetail } from "@mercury/chain";
import { USDC_MINT } from "@mercury/chain";
import { testDb } from "../db/testing.js";
import { activities, users, walletStreams, wallets } from "../db/schema.js";
import { syncAllWalletEvents } from "./sync.js";

const WALLET = "6Yg9nNQEqCQBMcYHLrrfj6qGjcR6hvhdhHQZPjtDqLRT";
const USDC_ACCOUNT = "EDG4dRdPj7jsM9eCMHt5nRoFoXshXhWk7wUYcE5ibt2C";
const SIG = "5f121XsT7YRkYk5SoDMSMAtCmKKwm58NhWumjUNCtR4o6qPBgwCT2upBB3uUizLsykU51RSvLt1Z8Cwt5RXFcbAW";

const seed = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:test" }).returning();
  await db.insert(wallets).values({ userId: user!.id, address: WALLET, kind: "privy_embedded" });
  return { db, userId: user!.id };
};

const deposit: TransactionDetail = {
  signature: SIG,
  blockTime: 1_790_573_221,
  accountKeys: ["FMVHP1xw6ZHB9zLGyrJeeAvEzCBgouH8bPzdkYqq2C5W", USDC_ACCOUNT],
  feeLamports: 5_000n,
  preLamports: [1_000_000_000n, 2_039_280n],
  postLamports: [999_995_000n, 2_039_280n],
  preTokens: [],
  postTokens: [{ mint: USDC_MINT, owner: WALLET, rawAmount: 500_000_000n, decimals: 6 }],
};

const ref: SignatureRef = { signature: SIG, slot: 451_224_633, blockTime: 1_790_573_221, failed: false };

/** A node that knows one USDC account and one deposit, on the account's stream. */
const node = (signaturesByAddress: Record<string, readonly SignatureRef[]>): ChainHistory => ({
  tokenAccountsFor: () => Promise.resolve([USDC_ACCOUNT]),
  signatures: (address, page) => {
    const all = signaturesByAddress[address] ?? [];
    // `until` is only ever the cursor; once set, this fake has nothing newer.
    return Promise.resolve(page.until === undefined ? all.slice(0, page.limit) : []);
  },
  transaction: (signature) => Promise.resolve(signature === SIG ? deposit : null),
});

describe("syncAllWalletEvents", () => {
  it("records where each stream is on first sight, and writes nothing", async () => {
    const { db } = await seed();
    const summary = await syncAllWalletEvents(db, {
      history: node({ [WALLET]: [ref], [USDC_ACCOUNT]: [ref] }),
    });

    expect(summary).toEqual({ wallets: 1, checked: 1, failed: 0, written: 0 });
    const rows = await db.select().from(activities);
    expect(rows).toEqual([]);

    const streams = await db.select().from(walletStreams);
    expect(streams.map((s) => s.address).sort()).toEqual([USDC_ACCOUNT, WALLET].sort());
    expect(streams.every((s) => s.cursor === SIG)).toBe(true);
  });

  it("writes a deposit once, and writes nothing at all on a second pass", async () => {
    const { db, userId } = await seed();
    // Put both streams behind the deposit, so the first pass has work to do.
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

    const first = await syncAllWalletEvents(db, { history });
    expect(first.written).toBe(1);

    const rows = await db.select().from(activities).where(eq(activities.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("transfer_in");
    expect(rows[0]!.title).toBe("Added cash");
    expect(rows[0]!.mint).toBe(USDC_MINT);
    expect(rows[0]!.txSignature).toBe(SIG);
    expect(Number(rows[0]!.amountUsd)).toBe(500);
    expect(rows[0]!.occurredAt).toEqual(new Date(1_790_573_221 * 1000));

    // Replay the same window: the unique index must absorb it.
    await db.update(walletStreams).set({ cursor: "older" });
    const second = await syncAllWalletEvents(db, { history });
    expect(second.written).toBe(0);
    expect(await db.select().from(activities).where(eq(activities.userId, userId))).toHaveLength(1);
  });

  it("leaves the cursor alone when a transaction cannot be fetched, so nothing is stepped over", async () => {
    const { db } = await seed();
    const [wallet] = await db.select().from(wallets).where(eq(wallets.address, WALLET));
    await db.insert(walletStreams).values({ walletId: wallet!.id, address: WALLET, cursor: "older" });

    const summary = await syncAllWalletEvents(db, {
      history: {
        tokenAccountsFor: () => Promise.resolve([]),
        signatures: (address) => Promise.resolve(address === WALLET ? [ref] : []),
        transaction: () => Promise.resolve(null),
      },
    });

    expect(summary.failed).toBe(1);
    expect(summary.written).toBe(0);
    const streams = await db.select().from(walletStreams).where(eq(walletStreams.address, WALLET));
    expect(streams[0]!.cursor).toBe("older");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @mercury/api test sync`
Expected: FAIL — cannot resolve `./sync.js`.

- [ ] **Step 4: Write the implementation**

Create `services/api/src/wallet-events/sync.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { USDC_MINT, type ChainHistory, type SignatureRef } from "@mercury/chain";
import type { Db } from "../db/client.js";
import { activities, users, walletStreams, wallets } from "../db/schema.js";
import { movementsIn, type Movement } from "./movements.js";
import { walkStream } from "./walk.js";

export interface WalletEventsDeps {
  readonly history: ChainHistory;
}

export interface EventsSummary {
  readonly wallets: number;
  readonly checked: number;
  readonly failed: number;
  /** Activity rows actually inserted. Zero on a pass that found nothing new. */
  readonly written: number;
}

/** A money column is numeric(38,18); a Decimal goes in at full scale or not at all. */
const fixed = (v: { toFixed: (dp: number) => string }): string => v.toFixed(18);

interface Advance {
  readonly address: string;
  readonly cursor: string;
}

/**
 * One wallet's pass over both its streams.
 *
 * Throws on any failure, which the caller counts and moves past. Nothing is
 * written and no cursor moves, so the next pass retries the same window — free,
 * because the unique index absorbs anything already recorded.
 */
async function syncWallet(
  db: Db,
  deps: WalletEventsDeps,
  userId: string,
  walletId: string,
  address: string,
): Promise<number> {
  const existing = await db.select().from(walletStreams).where(eq(walletStreams.walletId, walletId));
  const byAddress = new Map(existing.map((s) => [s.address, s]));

  // The wallet's own address finds native SOL, and the transaction that creates
  // the USDC account. Its USDC account finds every transfer after that one.
  if (!byAddress.has(address)) {
    await db.insert(walletStreams).values({ walletId, address });
    byAddress.set(address, { walletId, address, cursor: null, checkedAt: null });
  }

  const hasTokenStream = [...byAddress.keys()].some((a) => a !== address);
  if (!hasTokenStream) {
    // Discovered once, then stored: the address never changes. Empty until the
    // first USDC arrives, and that transfer is caught by the wallet's stream.
    for (const account of await deps.history.tokenAccountsFor(address, USDC_MINT)) {
      if (byAddress.has(account)) continue;
      await db.insert(walletStreams).values({ walletId, address: account });
      byAddress.set(account, { walletId, address: account, cursor: null, checkedAt: null });
    }
  }

  const found = new Map<string, SignatureRef>();
  const advances: Advance[] = [];

  for (const stream of byAddress.values()) {
    const walk = await walkStream(deps.history, stream.address, stream.cursor);
    for (const sig of walk.signatures) found.set(sig.signature, sig);
    if (walk.newestSignature !== null) {
      advances.push({ address: stream.address, cursor: walk.newestSignature });
    }
  }

  // Oldest first, so a crash part way through replays rather than leaving a
  // hole. Slot orders across both streams; the signature settles a tie.
  const ordered = [...found.values()].sort((a, b) =>
    a.slot === b.slot ? a.signature.localeCompare(b.signature) : a.slot - b.slot,
  );

  const moved: Movement[] = [];
  const now = new Date();
  for (const sig of ordered) {
    const tx = await deps.history.transaction(sig.signature);
    // Stopping costs a retry. Skipping would advance a cursor past a movement
    // and lose it permanently.
    if (tx === null) throw new Error(`transaction ${sig.signature} could not be read`);
    moved.push(...movementsIn(tx, { wallet: address, now }));
  }

  return db.transaction(async (tx) => {
    let written = 0;
    if (moved.length > 0) {
      const inserted = await tx
        .insert(activities)
        .values(
          moved.map((m) => ({
            userId,
            kind: m.kind,
            occurredAt: m.occurredAt,
            title: m.title,
            subtitle: m.subtitle,
            amountUsd: m.amountUsd === null ? null : fixed(m.amountUsd),
            txSignature: m.signature,
            mint: m.mint,
          })),
        )
        .onConflictDoNothing({
          target: [activities.userId, activities.txSignature, activities.mint],
        })
        .returning({ id: activities.id });
      written = inserted.length;
    }

    // Only now. A cursor that moved before its rows were committed would step
    // over them on the next pass.
    for (const a of advances) {
      await tx
        .update(walletStreams)
        .set({ cursor: a.cursor, checkedAt: now })
        .where(and(eq(walletStreams.walletId, walletId), eq(walletStreams.address, a.address)));
    }
    return written;
  });
}

/**
 * Turn every account's recent history into activity rows.
 *
 * One wallet failing does not stop the rest, as `position-sync` already does.
 * A wallet we cannot read is a wallet whose feed stays where it was — behind
 * but right — which is the correct answer when an upstream is down.
 */
export async function syncAllWalletEvents(db: Db, deps: WalletEventsDeps): Promise<EventsSummary> {
  const rows = await db
    .select({ userId: users.id, walletId: wallets.id, address: wallets.address })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .where(eq(wallets.isPrimary, true));

  let checked = 0;
  let failed = 0;
  let written = 0;

  for (const row of rows) {
    try {
      written += await syncWallet(db, deps, row.userId, row.walletId, row.address);
      checked += 1;
    } catch (error: unknown) {
      failed += 1;
      // The user, never the address: an address in a log is a person's
      // holdings in a log.
      console.error(`wallet-events: wallet for user ${row.userId} failed`, error);
    }
  }

  return { wallets: rows.length, checked, failed, written };
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @mercury/api test sync`
Expected: PASS, 3 tests. The second one is the one that matters: it proves the unique index absorbs a replay.

- [ ] **Step 6: Commit**

```bash
git add services/api/src/wallet-events/sync.ts services/api/src/wallet-events/sync.test.ts services/api/src/db/testing.ts services/api/package.json pnpm-lock.yaml
git commit -m "feat(api): turn wallet history into activity rows, once each"
```

---

### Task 6: Run it

**Files:**

- Modify: `services/api/src/deps.ts`
- Modify: `services/api/src/index.ts`
- Modify: `docs/05-read-model.md` (or whichever doc lists the background jobs — check first with `grep -rn "position-sync" docs/`)

**Interfaces:**

- Consumes: `syncAllWalletEvents` (Task 5), `ChainHistory` (Task 1).
- Produces: a running `wallet-events` job on a 30-second clock.

- [ ] **Step 1: Expose the port**

In `services/api/src/deps.ts`, add to the `@mercury/chain` type imports:

```ts
  type ChainHistory,
```

add to the `Deps` interface, below `chain`:

```ts
  /** The same adapter, asked what happened rather than what is held. */
  readonly history: ChainHistory;
```

and add to the object `buildDeps` returns, below `chain,`:

```ts
    history: chain,
```

`chain` is the `SolanaRpc` instance and implements both ports. It is deliberately the raw adapter, not the `withPledged` wrapper — pledged stock is a holding, not a transaction.

- [ ] **Step 2: Run the job**

In `services/api/src/index.ts`, add the import:

```ts
import { syncAllWalletEvents } from "./wallet-events/sync.js";
```

and add this after the `position-sync` block:

```ts
/**
 * Thirty seconds, because this answers "what happened" and `position-sync`
 * already answers "what do I hold" every two. The balance a user checks is the
 * fresh one; only the row in the feed waits.
 *
 * Two streams per wallet — its own address for native SOL, its USDC account for
 * cash — so a quiet pass is four calls a minute per wallet and says nothing.
 */
every("wallet-events", 30_000, async () => {
  const s = await syncAllWalletEvents(auth.db, { history: deps.history });
  if (s.written === 0 && s.failed === 0) return null;
  return (
    `${s.written} rows across ${s.checked}/${s.wallets} wallets` +
    (s.failed > 0 ? `, ${s.failed} failed` : "")
  );
});
```

- [ ] **Step 3: Verify the whole workspace**

Run: `pnpm check`
Expected: lint, format, typecheck and tests all pass. That is the same set the four CI workflows run per pull request.

- [ ] **Step 4: Apply the migration and boot**

```bash
pnpm --filter @mercury/api exec drizzle-kit migrate
```

Then start the API (`pnpm --filter @mercury/api dev`) and confirm it logs `mercury api listening on :8787` and prints no `wallet-events failed:` lines in the first two minutes.

- [ ] **Step 5: The live check**

Send USDC to a real Privy wallet **twice**, waiting for the first to appear before sending the second. Confirm `GET /v1/activity` returns two rows, each with its real `txSignature` and a `occurredAt` matching the block time on an explorer.

Two sends, not one: a single deposit creates the token account and would have been found even under the bug this design fixes. The second send is the test.

- [ ] **Step 6: Update the docs**

Find the doc that lists the background jobs (`grep -rn "position-sync" docs/`) and add `wallet-events` beside it: what it reads, what it writes, its cadence, and that it never writes a lot or a position.

- [ ] **Step 7: Commit and push**

```bash
git add services/api/src/deps.ts services/api/src/index.ts docs
git commit -m "feat(api): run the wallet events job"
git push
```

---

## Decisions this plan makes that the spec left open

Flagged so a reviewer can overrule them rather than discover them:

1. **A fetch failure abandons the whole wallet pass**, rather than committing the signatures processed before it. The spec says "stops that wallet's pass at that signature"; with two streams, a partial commit would need per-stream cursors bounded by the failing signature's slot. Abandoning is simpler and strictly safe, and the unique index makes the replay free.
2. **`amountUsd` is null for SOL.** The transaction has a real block time, often hours old, and today's price on a past event is a wrong number stated confidently. The quantity goes in `subtitle`.
3. **`refTable` and `refId` stay null** on these rows. `mint` is the reference now, and setting them for SOL but not USDC would be a seam for no gain.
4. **A SOL change is suppressed when the same transaction moved USDC.** Rent and fees are plumbing for the cash event. The cost is that a genuine simultaneous SOL and USDC transfer reports only the cash — rare, and the quieter failure.

## Known defect found while planning, not fixed here

`plural()` in `services/api/src/portfolio/reconcile.ts` trims trailing zeros with `replace(/\.?0+$/, "")`, which eats significant zeros from a whole number: `"100"` becomes `"1"` and `"10"` becomes `"1"`. A 100-share dividend currently renders as "1 shares". `trim()` in Task 2 does not repeat the mistake. Out of scope for this plan; worth its own one-line fix and a test.
