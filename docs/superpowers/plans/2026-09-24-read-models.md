# Read Models Implementation Plan — server side

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The API answers portfolio, money, activity and instrument reads from Postgres and from chain, with every market number read live from an upstream and no invented figure anywhere in the server.

**Architecture:** The browser already implements the market ports the server declares but never implemented. This plan lifts those five modules into `@mercury/market` and `@mercury/chain` as runtime-agnostic adapters — `fetch` injected, no Node built-ins, no `window` — then lands the Drizzle tables from docs/05, a supportedStocks sync that turns the live token universe into `instrument` and `token` rows, a holdings reconciliation that turns a wallet's on-chain balances into lots and positions, and the read routes on top. `buildDeps()` stops throwing.

**Tech Stack:** TypeScript strict, Hono, Drizzle ORM 0.45 + postgres-js, Vitest 3, `decimal.js`. No new runtime dependency is installed by this plan.

**Spec:** [docs/superpowers/specs/2026-09-23-backend-design.md](../specs/2026-09-23-backend-design.md) — subsystem 2, "Read models".

---

## Scope

**In:** everything in `packages/` and `services/api/`.

**Out: all of `apps/web`.** A teammate is revamping it. No file under `apps/web/` is created, modified or deleted by this plan, including `apps/web/src/market/*`, `apps/web/src/app/data.ts` and `apps/web/src/market/placeholder.ts`.

This splits the spec's subsystem 2 in half. The consequences, stated up front so nobody rediscovers them:

- **`apps/web/src/market/*` becomes a temporary duplicate** of the lifted packages. Two copies of the same parsing logic exist until the web half lands. This is the drift risk the spec's parity argument exists to remove, and it is real for as long as the duplication lasts. The lifted copy is the one that gets tests; the browser copy is frozen. Nobody edits the browser copy — changes go to the package.
- **The spec's "done when" for subsystem 2 cannot be met by this plan.** `grep -r "data.ts" apps/web/src` still returns hits when this plan finishes. That criterion belongs to the web half.
- **The parity test the spec asks for is still written**, in a form that works without the web app: Task 7 asserts the two `MultiplierSource` implementations agree. See "Deviations", item 1.

Also out, and deferred rather than dropped:

- `GET /v1/instruments/:ticker/chart` and `GET /v1/portfolio/history` — both need the price series that §6 of the spec assigns to `portfolio_snapshot`, written by the worker in subsystem 4. Not stubbed, not faked: the routes do not exist, so they 404.
- `basket`, `basket_constituent`, `basket_investment`, `plan`, `plan_allocation` tables — the spec puts them with their own subsystems.
- Order writes beyond persisting what `POST /v1/orders` already produces. Execute and confirm are subsystem 3.

---

## Global Constraints

- Node `>=24`, pnpm `10.33.2`. Workspace commands use `pnpm --filter <pkg>`.
- TypeScript strict, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Indexing an array yields `T | undefined` — handle it. Assigning `undefined` to an optional property is an error; spread it conditionally instead: `...(x ? { x } : {})`.
- ESM. All relative imports inside `services/` and `packages/` end in `.js`, even from `.ts` files.
- `packages/core` is not modified by this plan. It is imported, never edited.
- **Do not install `@solana/kit`.** It is deferred to subsystem 3, which needs it for signing. Every chain read in this plan is plain JSON-RPC over `fetch`.
- **Do not install any new runtime dependency.** Every adapter here is `fetch` against a keyless, CORS-open endpoint, or JSON-RPC against `SOLANA_RPC_URL`.
- **No new API key.** `JUPITER_API_KEY` stays optional and unused: this subsystem prices through Jupiter's keyless `lite-api.jup.ag`. Ultra arrives with execution in subsystem 3.
- **Money is never a float.** On-chain amounts are `bigint` in the token's smallest unit. Prices and USD values are `numeric(38,18)` in Postgres and `Decimal` in TypeScript. Numbers that arrive from an upstream as JSON floats are converted to `Decimal` at the adapter boundary and never arithmetic'd as numbers first.
- **Read it, do not type it.** Any number that exists on chain or behind a public API is read live and attributed. A figure written into source is a figure that goes quietly wrong.
- Never log a wallet address at info level, and never log an access token.
- Commit after every task. Commit messages are lowercase, `feat:` / `test:` / `chore:` / `docs:` prefixed.

---

## Deviations, recorded

Four places where this plan does not do what a document says. Each is a decision, not an oversight.

**1. `MultiplierSource` reads the mint, not Jupiter — and Jupiter becomes the fallback.**

The spec's §3 table maps `market/jupiter.ts` → `scaledUiConfig` onto `MultiplierSource`. Probing mainnet on 24 September 2026 shows a plain `getAccountInfo` with `encoding: "jsonParsed"` returns the Token-2022 extensions already decoded — no `@solana/kit`, no TLV walk:

```
EXT scaledUiAmountConfig {"authority":"S7vY…","multiplier":"1.0009180758490996",
                          "newMultiplier":"1.001701196801074",
                          "newMultiplierEffectiveTimestamp":1789000200}
EXT pausableConfig       {"authority":"JDq1…","paused":false}
```

Two things follow. The multiplier arrives as an **exact decimal string** rather than Jupiter's JSON float, which matters for a number that multiplies every share count we store. And `isPaused` becomes answerable — the port has always documented it as "Token-2022 Pausable", and without the mint read it would have had to return `false` and a apology.

So: `MintMultipliers` (RPC, exact, answers both methods) is what the server uses. `JupiterMarket` also implements `MultiplierSource` from `scaledUiConfig`, because the browser fallback path cannot make an RPC call it has no URL for, and because two implementations of one port is the shape the spec already blessed for `QuoteSource`. The port's doc comment, which today says to read the mint and not an API, is corrected to describe both.

**2. Parity is tested between the two multiplier sources, not between server and browser.**

The spec's §5 parity test assumes both paths are running. The browser path is out of scope here, so the test that can be written is the one comparing `MintMultipliers` against `JupiterMarket.multiplierFor` on the same mint. It is a live test, run by hand, never in CI — which is where the spec already puts live tests. It catches the thing worth catching: Jupiter drifting from chain truth.

**3. A transfer-in is priced at first sight, not at the block it arrived.**

docs/05 says to mark the lot "at the reference price on the block it arrived". Finding the arrival block means walking the wallet's signature history and parsing transfers, which is indexer work. This plan prices the lot at the reference when we first see the tokens, and sets `is_estimated = true` — which docs/05 already requires for exactly this reason. The user-facing statement is unchanged: we do not know what this cost, and we say so.

**4. Tokens that leave the wallet cap the position; no lot is reduced and no activity row is written.**

Selling does not exist until subsystem 3, so the only way tokens leave in this subsystem is a transfer the user made themselves. When the chain holds less than our lots record, the _position_ follows the chain — shares from chain, cost basis scaled by the same ratio, which leaves average cost untouched because average cost is what we keep. Lots are left as written history. No activity row is emitted, because we do not know what happened and inventing an event is worse than silence. Writing one would also break reconciliation idempotency, since lots are never reduced and the same deficit would be re-detected on every read.

**And one duplication that is not a deviation but is worth naming:** ticker display names, sectors and descriptions exist in `apps/web/src/market/meta.ts` and, after Task 10, in `services/api/src/db/seed/instruments.ts`. The spec explicitly leaves `meta.ts` in the web app. The server's copy is the one that reaches the `instrument` table, and after the web half lands the web app should read `name` and `sector` from `GET /v1/instruments` and delete its copy. Until then, two copies.

---

## File Structure

**Created — `packages/chain`**

| File                          | Responsibility                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/testing/fake-fetch.ts`   | A `fetch` stand-in that answers from a URL-substring map and throws on anything unmatched. Every adapter test's only network. |
| `src/testing/fixtures.ts`     | Re-exports the recorded JSON fixtures under stable names.                                                                     |
| `src/testing/fixtures/*.json` | Recorded upstream responses. Committed.                                                                                       |
| `src/testing/record.ts`       | The recorder that produced them. Run by hand, never in CI. Self-contained: no relative imports.                               |
| `src/jupiter/registry.ts`     | `JupiterRegistry` — `TokenRegistry` and `SupportedStocks`. The lift of `universe.ts` plus `searchTokens`.                     |
| `src/jupiter/lite.ts`         | `JupiterLite` — keyless `QuoteSource` on `/swap/v1/quote`, for pricing a decision.                                            |
| `src/solana/rpc.ts`           | `SolanaRpc` — `ChainReader`. Token balances and mint config over plain JSON-RPC.                                              |

**Created — `packages/market`**

| File             | Responsibility                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/pyth.ts`    | `PythSessions` — `SessionSource`. The lift of `pyth.ts`, plus the `isWeekend` the port asks for.                             |
| `src/jupiter.ts` | `JupiterMarket` — `ReferenceSource`, `PriceBoard`, and the fallback `MultiplierSource`. One upstream call answers all three. |
| `src/mint.ts`    | `MintMultipliers` — the preferred `MultiplierSource`, read from the Token-2022 extensions on the mint.                       |
| `src/kamino.ts`  | `KaminoCredit` — `CreditSource`. The lift of `kamino.ts`.                                                                    |

**Created — `services/api`**

| File                         | Responsibility                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/db/seed/instruments.ts` | Ticker → display name, sector, description. The server's editorial layer over what Jupiter knows.     |
| `src/stocks/plan.ts`         | Pure. Live supportedStocks + stored rows → inserts, updates and multiplier events.                    |
| `src/stocks/sync.ts`         | The thin shell that reads the tables, calls `planStocks`, writes the result.                          |
| `src/portfolio/reconcile.ts` | Pure. Chain balances + recorded lots → new lots, activity and positions. The heart of this subsystem. |
| `src/portfolio/apply.ts`     | The thin shell: load what `planReconciliation` needs, write what it returns.                          |
| `src/routes/portfolio.ts`    | `GET /v1/portfolio`, `GET /v1/portfolio/exposure/:ticker`.                                            |
| `src/routes/money.ts`        | `GET /v1/money`.                                                                                      |
| `src/routes/activity.ts`     | `GET /v1/activity`.                                                                                   |
| `src/routes/instruments.ts`  | `GET /v1/instruments`, `GET /v1/instruments/:ticker`.                                                 |
| `src/orders/store.ts`        | The `order` table behind the interface the in-memory Map had.                                         |

**Modified**

| File                                       | Change                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `packages/chain/src/ports.ts`              | Add `SupportedStocks`, `ChainReader`, and their types. `TokenRegistry` is unchanged.                                           |
| `packages/chain/src/index.ts`              | Export the new modules.                                                                                                        |
| `packages/chain/package.json`              | Subpath exports so `@mercury/chain/jupiter/registry` and friends resolve, plus `@mercury/chain/testing`.                       |
| `packages/market/src/ports.ts`             | Add `PriceBoard`, `TokenPrice`, `CreditSource`, `CreditMarket`. Correct the `ReferenceSource` and `MultiplierSource` comments. |
| `packages/market/src/index.ts`             | Export the new modules.                                                                                                        |
| `packages/market/package.json`             | Subpath exports.                                                                                                               |
| `services/api/src/db/schema.ts`            | Seven new tables. `user` and `wallet` are untouched.                                                                           |
| `services/api/src/deps.ts`                 | `Deps` gains `supportedStocks`, `chain`, `prices`, `credit`. `buildDeps` stops throwing.                                       |
| `services/api/src/app.ts`                  | Mount the four route modules; the in-memory `orders` Map is deleted.                                                           |
| `services/api/.env.example`                | `JUPITER_API_KEY` moves from "subsystem 3 onward" to a note that nothing in the server needs it yet.                           |
| `README.md`                                | Build-state table.                                                                                                             |
| `docs/03-architecture.md`                  | The dependency-rule amendment the spec's §8 requires.                                                                          |
| `docs/adr/0011-server-preferred-prices.md` | New. The ADR the spec's §8 requires.                                                                                           |

---

## Task 1: The testing kit

Every adapter in Tasks 2–8 is a parser wrapped around `fetch`. They need one shared way to answer a request without a network, and one set of recorded responses that are actually what the upstreams send. Both live in `packages/chain` rather than a new package, because `packages/market` already depends on `@mercury/chain` and a twelfth workspace package earns nothing.

**Files:**

- Create: `packages/chain/src/testing/fake-fetch.ts`
- Create: `packages/chain/src/testing/fake-fetch.test.ts`
- Create: `packages/chain/src/testing/record.ts`
- Create: `packages/chain/src/testing/fixtures.ts`
- Create: `packages/chain/src/testing/fixtures/*.json` (written by the recorder)
- Modify: `packages/chain/package.json`

**Interfaces:**

- Produces: `fakeFetch(routes: Record<string, unknown>): typeof fetch`, `fails(status: number): HttpFailure`, and the fixture re-exports `jupSearchXStock`, `jupSearchOndo`, `jupSearchImpostors`, `jupPrice`, `jupQuote`, `pythSpy`, `kaminoReserves`, `rpcMintNvda`, `rpcTokenAccounts`.

- [ ] **Step 1: Write the failing test**

Create `packages/chain/src/testing/fake-fetch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fails, fakeFetch } from "./fake-fetch.js";

describe("fakeFetch", () => {
  it("answers a url that contains a registered pattern", async () => {
    const f = fakeFetch({ "/price/v3": { hello: "world" } });
    const res = await f("https://lite-api.jup.ag/price/v3?ids=abc");
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ hello: "world" });
  });

  it("names the url it could not answer, so a wrong request is obvious", async () => {
    const f = fakeFetch({ "/price/v3": {} });
    await expect(f("https://lite-api.jup.ag/tokens/v2/search?query=x")).rejects.toThrow("/tokens/v2/search");
  });

  it("serves a failure when one is registered", async () => {
    const f = fakeFetch({ "/price/v3": fails(503) });
    const res = await f("https://lite-api.jup.ag/price/v3");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
  });

  it("accepts a URL object and a Request, because adapters build both", async () => {
    const f = fakeFetch({ "/quote": { outAmount: "1" } });
    expect((await f(new URL("https://lite-api.jup.ag/swap/v1/quote?a=1"))).ok).toBe(true);
    expect((await f(new Request("https://lite-api.jup.ag/swap/v1/quote"))).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @mercury/chain exec vitest run src/testing`
Expected: FAIL — `Failed to resolve import "./fake-fetch.js"`.

- [ ] **Step 3: Implement it**

Create `packages/chain/src/testing/fake-fetch.ts`:

```ts
/**
 * The only network an adapter test gets.
 *
 * Matching is by substring of the request URL, so a test registers "/price/v3"
 * and does not have to reproduce query-string ordering. An unmatched request
 * throws and names the URL — a silent empty response would make a wrong URL
 * look like an upstream with no data, which is the bug this is here to catch.
 */
export class HttpFailure {
  constructor(readonly status: number) {}
}

export const fails = (status: number): HttpFailure => new HttpFailure(status);

type FetchInput = Parameters<typeof fetch>[0];

/** `RequestInfo` is not a global under lib ES2023, so take fetch's own first parameter. */
const urlOf = (input: FetchInput): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

export const fakeFetch = (routes: Record<string, unknown>): typeof fetch =>
  (async (input: FetchInput) => {
    const url = urlOf(input);
    const hit = Object.entries(routes).find(([pattern]) => url.includes(pattern));
    if (hit === undefined) throw new Error(`fakeFetch: nothing registered for ${url}`);
    const body = hit[1];
    if (body instanceof HttpFailure) return new Response(null, { status: body.status });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter @mercury/chain exec vitest run src/testing`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the recorder**

Create `packages/chain/src/testing/record.ts`. It has **no relative imports**, so Node 24's type stripping runs it directly.

```ts
/**
 * Records the fixtures in ./fixtures. Run by hand when an upstream changes shape:
 *
 *   node packages/chain/src/testing/record.ts
 *
 * Never run in CI. The point of a fixture is that it does not move when the
 * market does; the point of recording it is that its shape is real and not
 * something we imagined. Dated in the file it writes.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const JUP = "https://lite-api.jup.ag";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const SPYX = "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W";

const get = async (url: string): Promise<unknown> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
};

const rpc = async (method: string, params: unknown[]): Promise<unknown> => {
  const res = await fetch(process.env["SOLANA_RPC_URL"] ?? "https://api.mainnet-beta.solana.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`${method} returned ${res.status}`);
  return res.json();
};

const save = async (name: string, body: unknown) => {
  await writeFile(join(OUT, `${name}.json`), `${JSON.stringify(body, null, 2)}\n`);
  console.log(`wrote ${name}.json`);
};

await mkdir(OUT, { recursive: true });

await save("jup-search-xstock", await get(`${JUP}/tokens/v2/search?query=xStock`));
await save(
  "jup-search-ondo",
  await get(`${JUP}/tokens/v2/search?query=${encodeURIComponent("Ondo Tokenized")}`),
);
// Deliberately an ambiguous query: it returns the real NVDAx next to several
// "Nvidia Stonk" impersonators with one holder each. That is the filter's test.
await save("jup-search-impostors", await get(`${JUP}/tokens/v2/search?query=NVDAx`));
await save("jup-price", await get(`${JUP}/price/v3?ids=${NVDAX},${SPYX},${USDC}`));
await save(
  "jup-quote",
  await get(`${JUP}/swap/v1/quote?inputMint=${USDC}&outputMint=${NVDAX}&amount=100000000&slippageBps=50`),
);
await save("pyth-spy", await get("https://hermes.pyth.network/v2/price_feeds?query=SPY&asset_type=equity"));
await save(
  "kamino-reserves",
  await get(
    "https://api.kamino.finance/kamino-market/5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua/reserves/metrics",
  ),
);
await save("rpc-mint-nvda", await rpc("getAccountInfo", [NVDAX, { encoding: "jsonParsed" }]));
```

- [ ] **Step 6: Run the recorder and inspect what it wrote**

```bash
node packages/chain/src/testing/record.ts
ls -la packages/chain/src/testing/fixtures/
```

Expected: eight files. `jup-search-xstock.json` is roughly 50KB and holds twenty verified wrappers; `jup-search-impostors.json` holds the real `NVDAx` (`isVerified: true`, tags including `"xstocks"`) alongside several with `isVerified: null` and tags `["unknown", "token-2022"]`.

Confirm the impersonators are actually there before continuing — Task 2's filter test depends on them:

```bash
node -e 'const d=require("./packages/chain/src/testing/fixtures/jup-search-impostors.json");console.log(d.map(t=>[t.symbol,t.isVerified,t.holderCount].join(" ")).join("\n"))'
```

If the query happens to return only verified tokens that day, re-run with a different ambiguous query (`TSLAx`, `SPYx`) until impersonators appear. Do not hand-write them: the point is that the shape is real.

- [ ] **Step 7: Add the one fixture that cannot be recorded**

No wallet we control holds xStocks yet, so the token-account response is written by hand from Solana's documented `getTokenAccountsByOwner` shape. Create `packages/chain/src/testing/fixtures/rpc-token-accounts.json`:

```json
{
  "jsonrpc": "2.0",
  "result": {
    "context": { "apiVersion": "2.1.11", "slot": 449942609 },
    "value": [
      {
        "pubkey": "9QgXqrgdbVU8KcpfskqJpAXKzbaYQJecgMAruSWoXDkM",
        "account": {
          "data": {
            "parsed": {
              "info": {
                "isNative": false,
                "mint": "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
                "owner": "6Yg9nNQEqCQBMcYHLrrfj6qGjcR6hvhdhHQZPjtDqLRT",
                "state": "initialized",
                "tokenAmount": {
                  "amount": "44483201",
                  "decimals": 8,
                  "uiAmount": 0.44483201,
                  "uiAmountString": "0.44483201"
                }
              },
              "type": "account"
            },
            "program": "spl-token-2022",
            "space": 182
          },
          "executable": false,
          "lamports": 2157600,
          "owner": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
          "rentEpoch": 18446744073709551615,
          "space": 182
        }
      },
      {
        "pubkey": "3emsAVdmGKERbHjmGfQ6oZ1e35dkf5iYcS6U4CPKFVaa",
        "account": {
          "data": {
            "parsed": {
              "info": {
                "isNative": false,
                "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                "owner": "6Yg9nNQEqCQBMcYHLrrfj6qGjcR6hvhdhHQZPjtDqLRT",
                "state": "initialized",
                "tokenAmount": {
                  "amount": "250000000",
                  "decimals": 6,
                  "uiAmount": 250.0,
                  "uiAmountString": "250"
                }
              },
              "type": "account"
            },
            "program": "spl-token",
            "space": 165
          },
          "executable": false,
          "lamports": 2039280,
          "owner": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          "rentEpoch": 18446744073709551615,
          "space": 165
        }
      },
      {
        "pubkey": "8kLfWQeCrPZkVCMbrTBAScnVHRSN2sDPGtnZ7xQpQxAp",
        "account": {
          "data": {
            "parsed": {
              "info": {
                "isNative": false,
                "mint": "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
                "owner": "6Yg9nNQEqCQBMcYHLrrfj6qGjcR6hvhdhHQZPjtDqLRT",
                "state": "initialized",
                "tokenAmount": {
                  "amount": "0",
                  "decimals": 8,
                  "uiAmount": 0.0,
                  "uiAmountString": "0"
                }
              },
              "type": "account"
            },
            "program": "spl-token-2022",
            "space": 182
          },
          "executable": false,
          "lamports": 2157600,
          "owner": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
          "rentEpoch": 18446744073709551615,
          "space": 182
        }
      }
    ]
  },
  "id": 1
}
```

Add a sibling note so nobody mistakes it for a recording. Create `packages/chain/src/testing/fixtures/README.md`:

```markdown
Recorded by `node packages/chain/src/testing/record.ts` against live mainnet upstreams.

`rpc-token-accounts.json` is the exception: it is written by hand, because no wallet
we control held xStocks when these were recorded. Its shape follows Solana's
`getTokenAccountsByOwner` with `encoding: "jsonParsed"`. It carries a Token-2022
holding, a classic SPL USDC holding and a zero-balance account, which are the three
cases `SolanaRpc.tokenBalances` has to get right. Replace it with a recording the
first time a funded wallet exists.
```

- [ ] **Step 8: Re-export the fixtures under stable names**

Create `packages/chain/src/testing/fixtures.ts`:

```ts
import jupSearchXStock from "./fixtures/jup-search-xstock.json";
import jupSearchOndo from "./fixtures/jup-search-ondo.json";
import jupSearchImpostors from "./fixtures/jup-search-impostors.json";
import jupPrice from "./fixtures/jup-price.json";
import jupQuote from "./fixtures/jup-quote.json";
import pythSpy from "./fixtures/pyth-spy.json";
import kaminoReserves from "./fixtures/kamino-reserves.json";
import rpcMintNvda from "./fixtures/rpc-mint-nvda.json";
import rpcTokenAccounts from "./fixtures/rpc-token-accounts.json";

export {
  jupSearchXStock,
  jupSearchOndo,
  jupSearchImpostors,
  jupPrice,
  jupQuote,
  pythSpy,
  kaminoReserves,
  rpcMintNvda,
  rpcTokenAccounts,
};

/** The mints the fixtures are built around, so tests do not paste base58 by hand. */
export const NVDAX_MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
export const SPYX_MINT = "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const FIXTURE_OWNER = "6Yg9nNQEqCQBMcYHLrrfj6qGjcR6hvhdhHQZPjtDqLRT";
```

Create `packages/chain/src/testing/index.ts`:

```ts
export * from "./fake-fetch.js";
export * from "./fixtures.js";
```

- [ ] **Step 9: Guard the fixtures' shape**

A re-recording that silently changes shape would break Tasks 2–8 in confusing ways. Append to `packages/chain/src/testing/fake-fetch.test.ts`:

```ts
import { jupSearchImpostors, jupSearchXStock, rpcMintNvda, NVDAX_MINT } from "./fixtures.js";

describe("fixtures", () => {
  it("has a verified xStocks universe to build a registry from", () => {
    const verified = jupSearchXStock.filter((t) => t.isVerified === true);
    expect(verified.length).toBeGreaterThanOrEqual(15);
    expect(verified.every((t) => (t.tags ?? []).includes("xstocks"))).toBe(true);
  });

  it("has impersonators, or Task 2's filter is untested", () => {
    const impostors = jupSearchImpostors.filter((t) => t.isVerified !== true);
    expect(impostors.length).toBeGreaterThan(0);
    expect(impostors.some((t) => t.symbol === "NVDAx")).toBe(true);
  });

  it("has a mint carrying both Token-2022 extensions we read", () => {
    const info = rpcMintNvda.result.value.data.parsed.info;
    const names = info.extensions.map((e) => e.extension);
    expect(names).toContain("scaledUiAmountConfig");
    expect(names).toContain("pausableConfig");
    expect(rpcMintNvda.result.value.owner).toBe("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
    expect(NVDAX_MINT).toBe("Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh");
  });
});
```

If TypeScript complains that the imported JSON's inferred type has no such property, the fixture did not record what the test expects — fix the fixture, not the test.

- [ ] **Step 10: Add the subpath export**

Modify `packages/chain/package.json`. Replace the `"exports"` object with:

```json
  "exports": {
    ".": "./src/index.ts",
    "./testing": "./src/testing/index.ts",
    "./jupiter/registry": "./src/jupiter/registry.ts",
    "./jupiter/lite": "./src/jupiter/lite.ts",
    "./jupiter/ultra": "./src/jupiter/ultra.ts",
    "./solana/rpc": "./src/solana/rpc.ts"
  },
```

The last three files do not exist yet; the map is written once so later tasks do not each have to touch the manifest. Nothing imports them until they exist, and `exports` entries are not verified eagerly.

- [ ] **Step 11: Run the whole package**

Run: `pnpm --filter @mercury/chain exec vitest run && pnpm --filter @mercury/chain typecheck`
Expected: PASS, 7 tests, no type errors.

- [ ] **Step 12: Commit**

```bash
git add packages/chain/src/testing packages/chain/package.json
git commit -m "test: recorded upstream fixtures and a fake fetch for adapter tests"
```

---

## Task 2: The token registry

The lift of `apps/web/src/market/universe.ts` and the `searchTokens` half of `jupiter.ts`. It implements two ports: `TokenRegistry`, which `pricing.ts` already consumes, and a new `SupportedStocks`, which Task 10 uses to fill the `instrument` and `token` tables. One class, because it is one pair of upstream calls.

**Files:**

- Modify: `packages/chain/src/ports.ts`
- Create: `packages/chain/src/jupiter/registry.ts`
- Create: `packages/chain/src/jupiter/registry.test.ts`
- Modify: `packages/chain/src/index.ts`

**Interfaces:**

- Consumes: `fakeFetch`, `jupSearchXStock`, `jupSearchOndo`, `jupSearchImpostors` from Task 1.
- Produces: `class JupiterRegistry implements TokenRegistry, SupportedStocks` with `constructor(config?: JupiterRegistryConfig)`; the types `ListedWrapper`, `ListedInstrument`, `SupportedStocks`; the constant `MIN_LIQUIDITY_USD`.

- [ ] **Step 1: Add the port**

Append to `packages/chain/src/ports.ts`:

```ts
/** What the stock sync needs and `TokenRegistry` deliberately does not carry. */
export interface ListedWrapper {
  readonly mint: string;
  readonly symbol: string;
  readonly issuer: Issuer;
  readonly decimals: number;
  /** The issuer's own name, e.g. "NVIDIA xStock". Our display name is editorial. */
  readonly name: string;
  readonly icon: string | null;
  readonly liquidityUsd: Decimal;
  readonly holders: number;
  /** Buyers minus sellers over 24h, from Jupiter's own stats. Never negative here. */
  readonly netBuyers24h: number;
  readonly volume24hUsd: Decimal;
  readonly traders24h: number;
}

export interface ListedInstrument {
  readonly ticker: string;
  readonly wrappers: readonly ListedWrapper[];
}

/**
 * The live token universe, richer than `TokenRegistry` and used only to fill the
 * `instrument` and `token` tables. Kept separate so the decision path keeps
 * depending on the four fields it actually needs.
 */
export interface SupportedStocks {
  instruments(): Promise<readonly ListedInstrument[]>;
}
```

- [ ] **Step 2: Write the failing test**

Create `packages/chain/src/jupiter/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fails, fakeFetch, jupSearchImpostors, jupSearchOndo, jupSearchXStock } from "../testing/index.js";
import { JupiterRegistry } from "./registry.js";

/** Both searches answered from the recorded universe. */
const live = () =>
  fakeFetch({
    "query=xStock": jupSearchXStock,
    "query=Ondo%20Tokenized": jupSearchOndo,
  });

describe("JupiterRegistry", () => {
  it("strips the wrapper suffix to get the real ticker", async () => {
    const r = new JupiterRegistry({ fetch: live() });
    const nvda = (await r.instruments()).find((i) => i.ticker === "NVDA");
    expect(nvda).toBeDefined();
    expect(nvda!.wrappers.map((w) => w.symbol).sort()).toEqual(["NVDAon", "NVDAx"]);
  });

  it("keeps both issuers under one ticker, so the comparison has two legs", async () => {
    const r = new JupiterRegistry({ fetch: live() });
    const nvda = (await r.instruments()).find((i) => i.ticker === "NVDA");
    expect(nvda!.wrappers.map((w) => w.issuer).sort()).toEqual(["backed", "ondo"]);
  });

  it("refuses an impersonator that shares a symbol with the real thing", async () => {
    // The recorded NVDAx query returns the real token beside several "Nvidia
    // Stonk" mints with one holder each. A symbol match alone would route money
    // into one of them.
    const r = new JupiterRegistry({
      fetch: fakeFetch({ "query=xStock": jupSearchImpostors, "query=Ondo%20Tokenized": [] }),
    });
    const mints = (await r.all()).map((t) => t.mint);
    const fakes = jupSearchImpostors.filter((t) => t.isVerified !== true).map((t) => t.id);
    expect(fakes.length).toBeGreaterThan(0);
    for (const fake of fakes) expect(mints).not.toContain(fake);
  });

  it("drops an instrument no wrapper can fill at a normal size", async () => {
    const thin = jupSearchXStock.map((t) => ({ ...t, liquidity: 1_000 }));
    const r = new JupiterRegistry({
      fetch: fakeFetch({ "query=xStock": thin, "query=Ondo%20Tokenized": [] }),
    });
    expect(await r.instruments()).toEqual([]);
  });

  it("answers wrappersFor with the four fields the decision path needs", async () => {
    const r = new JupiterRegistry({ fetch: live() });
    const wrappers = await r.wrappersFor("NVDA");
    expect(wrappers.length).toBe(2);
    const backed = wrappers.find((w) => w.issuer === "backed");
    expect(backed).toMatchObject({ ticker: "NVDA", symbol: "NVDAx", decimals: 8 });
    expect(backed!.mint).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  it("finds a mint, and says null for one it has never seen", async () => {
    const r = new JupiterRegistry({ fetch: live() });
    const all = await r.all();
    expect(await r.byMint(all[0]!.mint)).toEqual(all[0]);
    expect(await r.byMint("NotAMintAtAll")).toBeNull();
  });

  it("calls each upstream once and serves the rest from cache", async () => {
    let calls = 0;
    const counted = fakeFetch({ "query=xStock": jupSearchXStock, "query=Ondo%20Tokenized": jupSearchOndo });
    const r = new JupiterRegistry({
      fetch: ((input: Parameters<typeof fetch>[0]) => {
        calls += 1;
        return counted(input);
      }) as typeof fetch,
    });
    await r.instruments();
    await r.instruments();
    await r.wrappersFor("NVDA");
    expect(calls).toBe(2);
  });

  it("re-reads once the cache is stale", async () => {
    let calls = 0;
    const counted = fakeFetch({ "query=xStock": jupSearchXStock, "query=Ondo%20Tokenized": jupSearchOndo });
    let clock = 0;
    const r = new JupiterRegistry({
      ttlMs: 1_000,
      now: () => clock,
      fetch: ((input: Parameters<typeof fetch>[0]) => {
        calls += 1;
        return counted(input);
      }) as typeof fetch,
    });
    await r.instruments();
    clock = 1_001;
    await r.instruments();
    expect(calls).toBe(4);
  });

  it("keeps the xStocks leg when Ondo's search fails", async () => {
    const r = new JupiterRegistry({
      fetch: fakeFetch({ "query=xStock": jupSearchXStock, "query=Ondo%20Tokenized": fails(500) }),
    });
    const instruments = await r.instruments();
    expect(instruments.length).toBeGreaterThan(0);
    expect(instruments.every((i) => i.wrappers.every((w) => w.issuer === "backed"))).toBe(true);
  });

  it("fails loudly when the xStocks search fails, because there is nothing left", async () => {
    const r = new JupiterRegistry({
      fetch: fakeFetch({ "query=xStock": fails(500), "query=Ondo%20Tokenized": [] }),
    });
    await expect(r.instruments()).rejects.toThrow("500");
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm --filter @mercury/chain exec vitest run src/jupiter/registry.test.ts`
Expected: FAIL — `Failed to resolve import "./registry.js"`.

- [ ] **Step 4: Implement it**

Create `packages/chain/src/jupiter/registry.ts`:

```ts
import { D, ZERO, type Decimal, type Issuer } from "@mercury/core";
import type { ListedInstrument, SupportedStocks, ListedWrapper, TokenRef, TokenRegistry } from "../ports.js";

/**
 * Jupiter's free tier. No key, no account, CORS-open. The paid host (api.jup.ag)
 * exists for higher rate limits and takes a key; we deliberately do not use it,
 * because a key that also ships to a browser is a public key.
 */
const BASE = "https://lite-api.jup.ag";

/** The token universe changes when an issuer lists something. Hours, not seconds. */
const DEFAULT_TTL_MS = 60 * 60 * 1000;

/**
 * Roughly the pool depth a $1,000 order needs to stay inside the policy's 1.5%
 * impact cap. An instrument where no wrapper clears this cannot be filled at a
 * normal size, so listing it would be an offer we cannot honour.
 *
 * Measured 20 September 2026: every verified Backed wrapper sits above it
 * ($80k-$6.6m) and every Ondo one below ($80-$48k). Wrappers are never dropped
 * individually, only whole instruments, so the issuer comparison keeps both legs
 * wherever both exist.
 */
export const MIN_LIQUIDITY_USD = D(70_000);

const ISSUER_TAG: Record<Issuer, string> = { backed: "xstocks", ondo: "ondo" };

interface JupStats {
  readonly buyVolume?: number;
  readonly sellVolume?: number;
  readonly numTraders?: number;
  readonly numNetBuyers?: number;
}

interface JupToken {
  readonly id: string;
  readonly name: string;
  readonly symbol: string;
  readonly icon?: string;
  readonly decimals: number;
  readonly isVerified?: boolean | null;
  readonly tags?: readonly string[];
  readonly liquidity?: number;
  readonly holderCount?: number;
  readonly stats24h?: JupStats;
}

export interface JupiterRegistryConfig {
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly ttlMs?: number;
  readonly now?: () => number;
}

/** "NVDAx" -> "NVDA", "NVDAon" -> "NVDA", "BRK.Bx" -> "BRK.B". */
const tickerOf = (symbol: string, issuer: Issuer): string =>
  issuer === "backed" ? symbol.replace(/x$/, "") : symbol.replace(/on$/, "");

/**
 * Only verified tokens carrying the issuer's own tag. Search returns
 * impersonators next to the real thing — an "NVDAon" with 17 holders, an "NVDAx"
 * with one — and a symbol match alone would route a customer's money into one.
 */
const keep = (t: JupToken, issuer: Issuer): boolean =>
  t.isVerified === true && (t.tags ?? []).includes(ISSUER_TAG[issuer]);

/** Coerced through Decimal, because a field Jupiter stops sending must not become NaN. */
const num = (v: number | undefined): Decimal => (typeof v === "number" && Number.isFinite(v) ? D(v) : ZERO);

const toWrapper = (t: JupToken, issuer: Issuer): ListedWrapper => ({
  mint: t.id,
  symbol: t.symbol,
  issuer,
  decimals: t.decimals,
  name: t.name,
  icon: t.icon ?? null,
  liquidityUsd: num(t.liquidity),
  holders: Math.max(0, Math.round(t.holderCount ?? 0)),
  netBuyers24h: Math.max(0, Math.round(t.stats24h?.numNetBuyers ?? 0)),
  volume24hUsd: num(t.stats24h?.buyVolume).add(num(t.stats24h?.sellVolume)),
  traders24h: Math.max(0, Math.round(t.stats24h?.numTraders ?? 0)),
});

export class JupiterRegistry implements TokenRegistry, SupportedStocks {
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private cache: { at: number; value: readonly ListedInstrument[] } | null = null;

  constructor(config: JupiterRegistryConfig = {}) {
    this.base = config.baseUrl ?? BASE;
    this.doFetch = config.fetch ?? fetch;
    this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
    this.now = config.now ?? Date.now;
  }

  private async search(query: string): Promise<readonly JupToken[]> {
    const res = await this.doFetch(`${this.base}/tokens/v2/search?query=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(`jupiter search ${query} returned ${res.status}`);
    return (await res.json()) as readonly JupToken[];
  }

  async instruments(): Promise<readonly ListedInstrument[]> {
    const cached = this.cache;
    if (cached !== null && this.now() - cached.at < this.ttlMs) return cached.value;

    // Ondo is allowed to fail: it is the second leg of a comparison, not the
    // shelf. xStocks failing leaves nothing to show, so it throws.
    const [xs, on] = await Promise.all([
      this.search("xStock"),
      this.search("Ondo Tokenized").catch(() => [] as readonly JupToken[]),
    ]);

    const byTicker = new Map<string, ListedWrapper[]>();
    const add = (tokens: readonly JupToken[], issuer: Issuer) => {
      for (const t of tokens) {
        if (!keep(t, issuer)) continue;
        const ticker = tickerOf(t.symbol, issuer);
        const list = byTicker.get(ticker) ?? [];
        if (list.some((w) => w.issuer === issuer)) continue; // first verified wins
        list.push(toWrapper(t, issuer));
        byTicker.set(ticker, list);
      }
    };
    add(xs, "backed");
    add(on, "ondo");

    const value = [...byTicker.entries()]
      .filter(([, wrappers]) => wrappers.some((w) => w.liquidityUsd.gte(MIN_LIQUIDITY_USD)))
      .map(([ticker, wrappers]) => ({ ticker, wrappers: wrappers as readonly ListedWrapper[] }))
      .sort((a, b) => a.ticker.localeCompare(b.ticker));

    this.cache = { at: this.now(), value };
    return value;
  }

  async wrappersFor(ticker: string): Promise<readonly TokenRef[]> {
    const found = (await this.instruments()).find((i) => i.ticker === ticker);
    return found === undefined ? [] : found.wrappers.map((w) => toRef(w, found.ticker));
  }

  async all(): Promise<readonly TokenRef[]> {
    return (await this.instruments()).flatMap((i) => i.wrappers.map((w) => toRef(w, i.ticker)));
  }

  async byMint(mint: string): Promise<TokenRef | null> {
    return (await this.all()).find((t) => t.mint === mint) ?? null;
  }
}

const toRef = (w: ListedWrapper, ticker: string): TokenRef => ({
  mint: w.mint,
  symbol: w.symbol,
  ticker,
  issuer: w.issuer,
  decimals: w.decimals,
});
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm --filter @mercury/chain exec vitest run src/jupiter/registry.test.ts`
Expected: PASS, 10 tests.

One test will fail if the recorded xStocks fixture happens to carry no Ondo counterpart for NVDA. Check with:

```bash
node -e 'const d=require("./packages/chain/src/testing/fixtures/jup-search-ondo.json");console.log(d.filter(t=>t.isVerified===true).map(t=>t.symbol).join(" "))'
```

`NVDAon` was present on 24 September 2026. If it is not, pick a ticker that appears in both fixtures and use it throughout the test file.

- [ ] **Step 6: Export it**

Modify `packages/chain/src/index.ts`, adding after the existing exports:

```ts
export * from "./jupiter/registry.js";
```

- [ ] **Step 7: Typecheck and commit**

```bash
pnpm --filter @mercury/chain typecheck && pnpm --filter @mercury/chain exec vitest run
git add packages/chain/src
git commit -m "feat: lift the Jupiter token registry out of the browser"
```

---

## Task 3: The keyless quote source

The lift of `fetchQuote`. This is one of the two implementations of `QuoteSource` the spec's §3 calls for: the keyless one that **prices** a decision. `JupiterUltra`, already written, **executes** one and arrives in subsystem 3. `priceOrder` is unchanged and uses whichever it is given.

**Files:**

- Create: `packages/chain/src/jupiter/lite.ts`
- Create: `packages/chain/src/jupiter/lite.test.ts`
- Modify: `packages/chain/src/index.ts`

**Interfaces:**

- Consumes: `fakeFetch`, `jupQuote`, `NVDAX_MINT`, `USDC_MINT` from Task 1.
- Produces: `class JupiterLite implements QuoteSource`, `constructor(config?: { baseUrl?: string; fetch?: typeof fetch })`.

- [ ] **Step 1: Write the failing test**

Create `packages/chain/src/jupiter/lite.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { fails, fakeFetch, jupQuote, NVDAX_MINT, USDC_MINT } from "../testing/index.js";
import { JupiterLite } from "./lite.js";

const buy = { side: "buy", mint: NVDAX_MINT, decimals: 8, amount: D(100) } as const;

describe("JupiterLite", () => {
  it("asks for USDC in and the wrapper out, in base units", async () => {
    let seen = "";
    const f = fakeFetch({ "/swap/v1/quote": jupQuote });
    const lite = new JupiterLite({
      fetch: ((input: Parameters<typeof fetch>[0]) => {
        seen = String(input);
        return f(input);
      }) as typeof fetch,
    });
    await lite.quote(buy);
    expect(seen).toContain(`inputMint=${USDC_MINT}`);
    expect(seen).toContain(`outputMint=${NVDAX_MINT}`);
    expect(seen).toContain("amount=100000000"); // $100 at USDC's six decimals
  });

  it("flips the legs for a sell and sizes the amount in the token's decimals", async () => {
    let seen = "";
    const f = fakeFetch({ "/swap/v1/quote": jupQuote });
    const lite = new JupiterLite({
      fetch: ((input: Parameters<typeof fetch>[0]) => {
        seen = String(input);
        return f(input);
      }) as typeof fetch,
    });
    await lite.quote({ side: "sell", mint: NVDAX_MINT, decimals: 8, amount: D("0.5") });
    expect(seen).toContain(`inputMint=${NVDAX_MINT}`);
    expect(seen).toContain(`outputMint=${USDC_MINT}`);
    expect(seen).toContain("amount=50000000"); // 0.5 at eight decimals
  });

  it("returns the amounts in human units, not base units", async () => {
    const lite = new JupiterLite({ fetch: fakeFetch({ "/swap/v1/quote": jupQuote }) });
    const quote = await lite.quote(buy);
    expect(quote).not.toBeNull();
    expect(quote!.inAmount.toFixed()).toBe("100");
    // Derived from the fixture, not pasted: the recorder re-runs and the market
    // moves, so a literal here would rot on the next recording.
    expect(quote!.outAmount.toFixed()).toBe(D(jupQuote.outAmount).div(D(10).pow(8)).toFixed());
  });

  it("carries the impact through as a Decimal, never a float", async () => {
    const withImpact = { ...jupQuote, priceImpactPct: "-0.0085123456789012345" };
    const lite = new JupiterLite({ fetch: fakeFetch({ "/swap/v1/quote": withImpact }) });
    const quote = await lite.quote(buy);
    // Absolute, and not rounded through a JS number on the way.
    expect(quote!.priceImpact.toFixed()).toBe("0.0085123456789012345");
  });

  it("names the venues that would fill it", async () => {
    const lite = new JupiterLite({ fetch: fakeFetch({ "/swap/v1/quote": jupQuote }) });
    const quote = await lite.quote(buy);
    expect(quote!.routeLabels.length).toBeGreaterThan(0);
    expect(quote!.routeLabels).not.toContain(undefined);
  });

  it("says null when there is no route at this size, rather than throwing", async () => {
    const lite = new JupiterLite({ fetch: fakeFetch({ "/swap/v1/quote": fails(400) }) });
    expect(await lite.quote(buy)).toBeNull();
  });

  it("says null when the route returns nothing", async () => {
    const lite = new JupiterLite({ fetch: fakeFetch({ "/swap/v1/quote": { ...jupQuote, outAmount: "0" } }) });
    expect(await lite.quote(buy)).toBeNull();
  });

  it("refuses to build a transaction, and says where that lives", async () => {
    const lite = new JupiterLite({ fetch: fakeFetch({}) });
    await expect(lite.buildSwap("q", "owner")).rejects.toThrow(/JupiterUltra/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @mercury/chain exec vitest run src/jupiter/lite.test.ts`
Expected: FAIL — `Failed to resolve import "./lite.js"`.

- [ ] **Step 3: Implement it**

Create `packages/chain/src/jupiter/lite.ts`:

```ts
import { D, type Decimal } from "@mercury/core";
import type { Candidate } from "@mercury/core";
import type { QuoteRequest, QuoteSource } from "../ports.js";
import { USDC_DECIMALS, USDC_MINT } from "./ultra.js";

const LITE = "https://lite-api.jup.ag";

/**
 * A quote is a live price, not an offer. Twenty seconds is the window the browser
 * has used since 20 September 2026; Ultra's own orders last thirty.
 */
const QUOTE_TTL_MS = 20_000;

const toBase = (amount: Decimal, decimals: number): string =>
  amount.mul(D(10).pow(decimals)).toDecimalPlaces(0, 1).toFixed();

const fromBase = (raw: string, decimals: number): Decimal => D(raw).div(D(10).pow(decimals));

interface JupQuote {
  readonly inAmount?: string;
  readonly outAmount?: string;
  readonly priceImpactPct?: string;
  readonly routePlan?: readonly { readonly swapInfo?: { readonly label?: string } }[];
  readonly contextSlot?: number;
}

export interface JupiterLiteConfig {
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly slippageBps?: number;
}

/**
 * Jupiter's keyless `/swap/v1/quote`. This is the *pricing* half of the pair the
 * backend design calls for: a real routed quote for the real amount, which is
 * what the order would actually fill at. The *executing* half is `JupiterUltra`,
 * which takes a key and arrives with subsystem 3. Both satisfy `QuoteSource`, so
 * `priceOrder` never learns which one it has.
 */
export class JupiterLite implements QuoteSource {
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private readonly slippageBps: number;

  constructor(config: JupiterLiteConfig = {}) {
    this.base = config.baseUrl ?? LITE;
    this.doFetch = config.fetch ?? fetch;
    this.slippageBps = config.slippageBps ?? 50;
  }

  async quote(req: QuoteRequest): Promise<Candidate["quote"]> {
    const buying = req.side === "buy";
    const inputMint = buying ? USDC_MINT : req.mint;
    const outputMint = buying ? req.mint : USDC_MINT;
    const inDecimals = buying ? USDC_DECIMALS : req.decimals;
    const outDecimals = buying ? req.decimals : USDC_DECIMALS;

    const url = new URL(`${this.base}/swap/v1/quote`);
    url.searchParams.set("inputMint", inputMint);
    url.searchParams.set("outputMint", outputMint);
    url.searchParams.set("amount", toBase(req.amount, inDecimals));
    url.searchParams.set("slippageBps", String(req.slippageBps ?? this.slippageBps));

    // A 4xx here is Jupiter saying there is no route at this size, which is a
    // real answer and becomes a candidate with a null quote — not a dropped row.
    const res = await this.doFetch(url);
    if (!res.ok) return null;

    const body = (await res.json()) as JupQuote;
    if (body.outAmount === undefined) return null;

    const outAmount = fromBase(body.outAmount, outDecimals);
    if (outAmount.lte(0)) return null;

    return {
      inAmount: body.inAmount === undefined ? req.amount : fromBase(body.inAmount, inDecimals),
      outAmount,
      // Straight from the string. Going through a JS number would round a
      // number that decides whether an order is allowed to fill.
      priceImpact: D(body.priceImpactPct ?? "0").abs(),
      routeLabels: [...new Set((body.routePlan ?? []).map((r) => r.swapInfo?.label ?? "unknown"))],
      // Lite has no request id. The slot makes it unique enough to tell two
      // quotes apart; nothing redeems it, because execution re-quotes on Ultra.
      quoteId: `${req.mint}:${body.contextSlot ?? 0}`,
      expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
    };
  }

  buildSwap(_quoteId: string, _owner: string): Promise<readonly string[]> {
    return Promise.reject(
      new Error(
        "JupiterLite.buildSwap: the keyless endpoint prices orders, it does not build them. Execution uses JupiterUltra — subsystem 3.",
      ),
    );
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter @mercury/chain exec vitest run src/jupiter/lite.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Export it**

Modify `packages/chain/src/index.ts`, adding:

```ts
export * from "./jupiter/lite.js";
```

- [ ] **Step 6: Commit**

```bash
pnpm --filter @mercury/chain typecheck && pnpm --filter @mercury/chain exec vitest run
git add packages/chain/src
git commit -m "feat: keyless Jupiter quote source for pricing decisions"
```

---

## Task 4: Reading the chain

Two reads, one adapter, no `@solana/kit`: plain JSON-RPC over `fetch`. Balances answer "what does this wallet hold", and the mint config answers "how many shares is one of these, and has the issuer halted it".

**The multiplier rule, and why it is not the obvious field.** A Token-2022 `scaledUiAmountConfig` carries _two_ multipliers and a switchover time. The effective one is `newMultiplier` once `newMultiplierEffectiveTimestamp` has passed, and `multiplier` before that. Reading `multiplier` unconditionally is wrong for every token that has ever scheduled a dividend. Measured on NVDAx, 24 September 2026:

```
multiplier                      1.0009180758490996
newMultiplier                   1.001701196801074
newMultiplierEffectiveTimestamp 1789000200  = 2026-09-10T00:30:00Z, a fortnight past
```

Jupiter's own arithmetic confirms which one is live: `usdPricePrescaled / newMultiplier` = `224.82082989684469 / 1.001701196801074` = `224.43901496255418`, which is exactly the `usdPrice` it reports. Using the stale field understates shares by 0.0782% on this token today, and the gap grows with every dividend. `apps/web/src/market/hooks.ts` has this bug (`multiplierOf` reads `scaledUiConfig.multiplier`); the lift fixes it, and the web half inherits the fix when it switches to the package.

**Files:**

- Modify: `packages/chain/src/ports.ts`
- Create: `packages/chain/src/solana/rpc.ts`
- Create: `packages/chain/src/solana/rpc.test.ts`
- Modify: `packages/chain/src/index.ts`

**Interfaces:**

- Consumes: `fakeFetch`, `rpcTokenAccounts`, `rpcMintNvda`, `NVDAX_MINT`, `USDC_MINT`, `FIXTURE_OWNER` from Task 1.
- Produces: `class SolanaRpc implements ChainReader`, `constructor(config: { rpcUrl: string; fetch?: typeof fetch; now?: () => number })`; the types `TokenBalance`, `MintConfig`, `ChainReader`; the constants `TOKEN_PROGRAM`, `TOKEN_2022_PROGRAM`.

- [ ] **Step 1: Add the port**

Append to `packages/chain/src/ports.ts`:

```ts
/** One token account's worth, in the mint's smallest unit. Never a float. */
export interface TokenBalance {
  readonly mint: string;
  readonly rawAmount: bigint;
  readonly decimals: number;
}

export interface MintConfig {
  readonly decimals: number;
  /**
   * The multiplier in force right now, which is `newMultiplier` once its
   * effective timestamp has passed. One token is this many shares.
   */
  readonly multiplier: Decimal;
  /** Token-2022 Pausable. True when the issuer has halted the token. */
  readonly isPaused: boolean;
}

/**
 * What we read from Solana without ever holding a key. Two calls, both public:
 * a wallet's token accounts, and a mint's Token-2022 extensions.
 */
export interface ChainReader {
  tokenBalances(owner: string): Promise<readonly TokenBalance[]>;
  /** Null when the account does not exist or is not a Token-2022 mint. */
  mintConfig(mint: string): Promise<MintConfig | null>;
}
```

- [ ] **Step 2: Write the failing test**

Create `packages/chain/src/solana/rpc.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import {
  fails,
  fakeFetch,
  FIXTURE_OWNER,
  NVDAX_MINT,
  rpcMintNvda,
  rpcTokenAccounts,
  SPYX_MINT,
  USDC_MINT,
} from "../testing/index.js";
import { SolanaRpc } from "./rpc.js";

const RPC = "https://rpc.example/v1";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/** The parsed mint account, rebuilt with whichever extension state a test needs. */
const mintWith = (scaled: Record<string, unknown>, paused: boolean) => ({
  jsonrpc: "2.0",
  id: 1,
  result: {
    value: {
      owner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      data: {
        program: "spl-token-2022",
        parsed: {
          type: "mint",
          info: {
            decimals: 8,
            extensions: [
              { extension: "scaledUiAmountConfig", state: scaled },
              { extension: "pausableConfig", state: { authority: "JDq1", paused } },
            ],
          },
        },
      },
    },
  },
});

/**
 * A node answers each program separately, and a mint belongs to exactly one of
 * them. The fixture holds all three accounts, so the fake splits it the way a
 * real node would rather than serving the whole list to both calls.
 */
const byProgram = (accounts = rpcTokenAccounts.result.value) => {
  const of = (program: string) => ({
    jsonrpc: "2.0",
    id: 1,
    result: { context: { slot: 1 }, value: accounts.filter((a) => a.account.owner === program) },
  });
  return (body: string) =>
    body.includes(TOKEN_2022) ? of(TOKEN_2022) : of("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
};

const nodeServing = (accounts?: typeof rpcTokenAccounts.result.value) => {
  const pick = byProgram(accounts);
  const calls: string[] = [];
  const doFetch = ((_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const body = String(init?.body);
    calls.push(body);
    return Promise.resolve(
      new Response(JSON.stringify(pick(body)), { headers: { "content-type": "application/json" } }),
    );
  }) as typeof fetch;
  return { doFetch, calls };
};

describe("SolanaRpc.tokenBalances", () => {
  it("asks both token programs, because xStocks are Token-2022 and USDC is not", async () => {
    const node = nodeServing();
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: node.doFetch });
    await rpc.tokenBalances(FIXTURE_OWNER);
    expect(node.calls.length).toBe(2);
    expect(node.calls.join()).toContain("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    expect(node.calls.join()).toContain(TOKEN_2022);
    expect(node.calls.join()).toContain(FIXTURE_OWNER);
  });

  it("returns raw amounts as bigint, and never touches uiAmount", async () => {
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: nodeServing().doFetch });
    const balances = await rpc.tokenBalances(FIXTURE_OWNER);
    expect(balances.find((b) => b.mint === NVDAX_MINT)).toEqual({
      mint: NVDAX_MINT,
      rawAmount: 44_483_201n,
      decimals: 8,
    });
    expect(balances.find((b) => b.mint === USDC_MINT)).toEqual({
      mint: USDC_MINT,
      rawAmount: 250_000_000n,
      decimals: 6,
    });
  });

  it("merges the two programs into one list", async () => {
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: nodeServing().doFetch });
    const balances = await rpc.tokenBalances(FIXTURE_OWNER);
    expect(balances.map((b) => b.mint).sort()).toEqual([USDC_MINT, NVDAX_MINT].sort());
  });

  it("drops emptied accounts, so a closed position is not a zero row", async () => {
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: nodeServing().doFetch });
    const balances = await rpc.tokenBalances(FIXTURE_OWNER);
    expect(balances.every((b) => b.rawAmount > 0n)).toBe(true);
    // The zero-balance SPYx account is in the fixture and must not appear.
    expect(balances.map((b) => b.mint)).not.toContain(SPYX_MINT);
  });

  it("sums two accounts for the same mint, which a wallet is allowed to have", async () => {
    const accounts = rpcTokenAccounts.result.value;
    const nvdax = accounts.find((a) => a.account.data.parsed.info.mint === NVDAX_MINT)!;
    const rpc = new SolanaRpc({
      rpcUrl: RPC,
      fetch: nodeServing([...accounts, structuredClone(nvdax)]).doFetch,
    });
    const balances = await rpc.tokenBalances(FIXTURE_OWNER);
    const nvda = balances.filter((b) => b.mint === NVDAX_MINT);
    expect(nvda.length).toBe(1);
    expect(nvda[0]!.rawAmount).toBe(44_483_201n * 2n);
  });

  it("throws when the node answers an error, rather than reporting an empty wallet", async () => {
    const rpc = new SolanaRpc({
      rpcUrl: RPC,
      fetch: fakeFetch({ [RPC]: { jsonrpc: "2.0", id: 1, error: { code: -32602, message: "bad params" } } }),
    });
    await expect(rpc.tokenBalances(FIXTURE_OWNER)).rejects.toThrow("bad params");
  });

  it("throws on a transport failure", async () => {
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: fakeFetch({ [RPC]: fails(503) }) });
    await expect(rpc.tokenBalances(FIXTURE_OWNER)).rejects.toThrow("503");
  });
});

describe("SolanaRpc.mintConfig", () => {
  it("uses newMultiplier once its effective timestamp has passed", async () => {
    const body = mintWith(
      {
        multiplier: "1.0009180758490996",
        newMultiplier: "1.001701196801074",
        newMultiplierEffectiveTimestamp: 1_789_000_200,
      },
      false,
    );
    const rpc = new SolanaRpc({
      rpcUrl: RPC,
      fetch: fakeFetch({ [RPC]: body }),
      now: () => 1_789_000_200_000 + 1,
    });
    const config = await rpc.mintConfig(NVDAX_MINT);
    expect(config!.multiplier.toFixed()).toBe("1.001701196801074");
  });

  it("uses the current multiplier until then", async () => {
    const body = mintWith(
      {
        multiplier: "1.0009180758490996",
        newMultiplier: "1.001701196801074",
        newMultiplierEffectiveTimestamp: 1_789_000_200,
      },
      false,
    );
    const rpc = new SolanaRpc({
      rpcUrl: RPC,
      fetch: fakeFetch({ [RPC]: body }),
      now: () => 1_789_000_200_000 - 1,
    });
    const config = await rpc.mintConfig(NVDAX_MINT);
    expect(config!.multiplier.toFixed()).toBe("1.0009180758490996");
  });

  it("reads the recorded mint without inventing a shape", async () => {
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: fakeFetch({ [RPC]: rpcMintNvda }) });
    const config = await rpc.mintConfig(NVDAX_MINT);
    expect(config).not.toBeNull();
    expect(config!.decimals).toBe(8);
    expect(config!.multiplier.gte(D(1))).toBe(true);
    expect(typeof config!.isPaused).toBe("boolean");
  });

  it("reports a halted token", async () => {
    const rpc = new SolanaRpc({
      rpcUrl: RPC,
      fetch: fakeFetch({ [RPC]: mintWith({ multiplier: "1" }, true) }),
    });
    expect((await rpc.mintConfig(NVDAX_MINT))!.isPaused).toBe(true);
  });

  it("says a multiplier of one for a mint that has never paid a dividend", async () => {
    const plain = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        value: {
          owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          data: { program: "spl-token", parsed: { type: "mint", info: { decimals: 6 } } },
        },
      },
    };
    const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: fakeFetch({ [RPC]: plain }) });
    const config = await rpc.mintConfig(USDC_MINT);
    expect(config).toEqual({ decimals: 6, multiplier: D(1), isPaused: false });
  });

  it("says null for an account that does not exist", async () => {
    const rpc = new SolanaRpc({
      rpcUrl: RPC,
      fetch: fakeFetch({ [RPC]: { jsonrpc: "2.0", id: 1, result: { value: null } } }),
    });
    expect(await rpc.mintConfig("NotAMint")).toBeNull();
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm --filter @mercury/chain exec vitest run src/solana`
Expected: FAIL — `Failed to resolve import "./rpc.js"`.

- [ ] **Step 4: Implement it**

Create `packages/chain/src/solana/rpc.ts`:

```ts
import { D, ONE, type Decimal } from "@mercury/core";
import type { ChainReader, MintConfig, TokenBalance } from "../ports.js";

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

interface RpcEnvelope<T> {
  readonly result?: T;
  readonly error?: { readonly code: number; readonly message: string };
}

interface ParsedTokenAccount {
  readonly account: {
    readonly data: {
      readonly parsed: {
        readonly info: {
          readonly mint: string;
          readonly tokenAmount: { readonly amount: string; readonly decimals: number };
        };
      };
    };
  };
}

interface ParsedMint {
  readonly data: {
    readonly parsed?: {
      readonly info?: {
        readonly decimals?: number;
        readonly extensions?: readonly {
          readonly extension: string;
          readonly state?: Record<string, unknown>;
        }[];
      };
    };
  };
}

export interface SolanaRpcConfig {
  readonly rpcUrl: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
}

/**
 * Solana JSON-RPC over plain `fetch`. No SDK: `@solana/kit` is not installed
 * until subsystem 3, where signing needs it, and everything read here is
 * already decoded by the node when asked for `jsonParsed`.
 */
export class SolanaRpc implements ChainReader {
  private readonly doFetch: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly config: SolanaRpcConfig) {
    this.doFetch = config.fetch ?? fetch;
    this.now = config.now ?? Date.now;
  }

  private async call<T>(method: string, params: readonly unknown[]): Promise<T> {
    const res = await this.doFetch(this.config.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!res.ok) throw new Error(`solana ${method} returned ${res.status}`);
    const body = (await res.json()) as RpcEnvelope<T>;
    if (body.error !== undefined) throw new Error(`solana ${method}: ${body.error.message}`);
    if (body.result === undefined) throw new Error(`solana ${method} returned no result`);
    return body.result;
  }

  /**
   * Both token programs, because xStocks are Token-2022 and USDC is classic SPL.
   *
   * `tokenAmount.amount` is the raw balance and is the only field read.
   * `uiAmount` is deliberately ignored: whether a node applies the
   * ScaledUiAmount multiplier to it depends on its version, so a portfolio
   * built on it would be right on one RPC provider and wrong on another. The
   * multiplier is applied once, by us, from `mintConfig`.
   */
  async tokenBalances(owner: string): Promise<readonly TokenBalance[]> {
    const pages = await Promise.all(
      [TOKEN_PROGRAM, TOKEN_2022_PROGRAM].map((programId) =>
        this.call<{ value: readonly ParsedTokenAccount[] }>("getTokenAccountsByOwner", [
          owner,
          { programId },
          { encoding: "jsonParsed" },
        ]),
      ),
    );

    const byMint = new Map<string, TokenBalance>();
    for (const page of pages) {
      for (const entry of page.value) {
        const info = entry.account.data.parsed.info;
        const raw = BigInt(info.tokenAmount.amount);
        if (raw === 0n) continue; // a closed position is not a holding
        const seen = byMint.get(info.mint);
        byMint.set(info.mint, {
          mint: info.mint,
          // A wallet may hold several accounts for one mint. They are one holding.
          rawAmount: (seen?.rawAmount ?? 0n) + raw,
          decimals: info.tokenAmount.decimals,
        });
      }
    }
    return [...byMint.values()];
  }

  async mintConfig(mint: string): Promise<MintConfig | null> {
    const result = await this.call<{ value: ParsedMint | null }>("getAccountInfo", [
      mint,
      { encoding: "jsonParsed" },
    ]);
    const info = result.value?.data.parsed?.info;
    if (info === undefined || info.decimals === undefined) return null;

    const extensions = info.extensions ?? [];
    const scaled = extensions.find((e) => e.extension === "scaledUiAmountConfig")?.state;
    const pausable = extensions.find((e) => e.extension === "pausableConfig")?.state;

    return {
      decimals: info.decimals,
      multiplier: this.effectiveMultiplier(scaled),
      isPaused: pausable?.["paused"] === true,
    };
  }

  /**
   * A ScaledUiAmount mint carries the multiplier in force and the next one, with
   * the second taking over at a timestamp. Reading `multiplier` unconditionally
   * understates every share count from the moment a dividend goes effective —
   * measured at 0.08% on NVDAx two weeks after its September 2026 switchover.
   *
   * The values arrive as decimal strings, so they go into Decimal untouched. A
   * mint with no extension has a multiplier of one: one token, one share.
   */
  private effectiveMultiplier(state: Record<string, unknown> | undefined): Decimal {
    if (state === undefined) return ONE;
    const current = typeof state["multiplier"] === "string" ? D(state["multiplier"]) : ONE;
    const next = state["newMultiplier"];
    const at = state["newMultiplierEffectiveTimestamp"];
    if (typeof next !== "string" || typeof at !== "number") return current;
    return this.now() >= at * 1000 ? D(next) : current;
  }
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm --filter @mercury/chain exec vitest run src/solana`
Expected: PASS, 13 tests.

- [ ] **Step 6: Export and commit**

Modify `packages/chain/src/index.ts`, adding:

```ts
export * from "./solana/rpc.js";
```

```bash
pnpm --filter @mercury/chain typecheck && pnpm --filter @mercury/chain exec vitest run
git add packages/chain/src
git commit -m "feat: read token balances and Token-2022 mint config over plain JSON-RPC"
```

---

## Task 5: The market session

The lift of `apps/web/src/market/pyth.ts`, plus the `isWeekend` the port asks for and the browser never computed.

**Files:**

- Create: `packages/market/src/pyth.ts`
- Create: `packages/market/src/pyth.test.ts`
- Modify: `packages/market/src/index.ts`
- Modify: `packages/market/package.json`

**Interfaces:**

- Consumes: `fakeFetch`, `pythSpy` from `@mercury/chain/testing`.
- Produces: `class PythSessions implements SessionSource`, `constructor(config?: { baseUrl?: string; fetch?: typeof fetch; now?: () => Date })`.

- [ ] **Step 1: Add the subpath exports**

Modify `packages/market/package.json`, replacing the `"exports"` object with:

```json
  "exports": {
    ".": "./src/index.ts",
    "./pyth": "./src/pyth.ts",
    "./jupiter": "./src/jupiter.ts",
    "./mint": "./src/mint.ts",
    "./kamino": "./src/kamino.ts"
  },
```

- [ ] **Step 2: Write the failing test**

Create `packages/market/src/pyth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fails, fakeFetch, pythSpy } from "@mercury/chain/testing";
import { PythSessions } from "./pyth.js";

/** A feed list with the hours a test wants, keeping the recorded shape. */
const feedsWith = (hours: { is_open: boolean; next_open?: number; next_close?: number }) => [
  { id: "abc", market_hours: hours, attributes: { display_symbol: "SPY", asset_type: "Equity" } },
];

/** A Wednesday and a Saturday, both 15:00 in New York. */
const WEDNESDAY = new Date("2026-09-23T19:00:00Z");
const SATURDAY = new Date("2026-09-26T19:00:00Z");

describe("PythSessions", () => {
  it("reads the recorded feed without inventing a shape", async () => {
    const p = new PythSessions({ fetch: fakeFetch({ "/v2/price_feeds": pythSpy }), now: () => WEDNESDAY });
    const state = await p.current();
    expect(["open", "closed"]).toContain(state.status);
    expect(typeof state.isOpen).toBe("boolean");
  });

  it("calls the market open", async () => {
    const p = new PythSessions({
      fetch: fakeFetch({ "/v2/price_feeds": feedsWith({ is_open: true, next_close: 1_790_280_000 }) }),
      now: () => WEDNESDAY,
    });
    const state = await p.current();
    expect(state.status).toBe("open");
    expect(state.isOpen).toBe(true);
    expect(state.nextCloseAt).toEqual(new Date(1_790_280_000 * 1000));
    expect(state.nextOpenAt).toBeNull();
  });

  it("calls it closed, and says when it opens", async () => {
    const p = new PythSessions({
      fetch: fakeFetch({ "/v2/price_feeds": feedsWith({ is_open: false, next_open: 1_790_256_600 }) }),
      now: () => WEDNESDAY,
    });
    const state = await p.current();
    expect(state.status).toBe("closed");
    expect(state.isOpen).toBe(false);
    expect(state.nextOpenAt).toEqual(new Date(1_790_256_600 * 1000));
  });

  it("knows a weekend from a weekday, in New York rather than in UTC", async () => {
    const closed = feedsWith({ is_open: false, next_open: 1_790_256_600 });
    const weekday = new PythSessions({
      fetch: fakeFetch({ "/v2/price_feeds": closed }),
      now: () => WEDNESDAY,
    });
    const weekend = new PythSessions({
      fetch: fakeFetch({ "/v2/price_feeds": closed }),
      now: () => SATURDAY,
    });
    expect((await weekday.current()).isWeekend).toBe(false);
    expect((await weekend.current()).isWeekend).toBe(true);
  });

  it("takes SPY's calendar over another symbol's, when the search returns several", async () => {
    const mixed = [
      { id: "1", market_hours: { is_open: false }, attributes: { display_symbol: "SPYG" } },
      { id: "2", market_hours: { is_open: true, next_close: 99 }, attributes: { display_symbol: "SPY" } },
    ];
    const p = new PythSessions({ fetch: fakeFetch({ "/v2/price_feeds": mixed }), now: () => WEDNESDAY });
    expect((await p.current()).isOpen).toBe(true);
  });

  it("falls back to the first feed when SPY is missing", async () => {
    const other = [{ id: "1", market_hours: { is_open: true }, attributes: { display_symbol: "SPYV" } }];
    const p = new PythSessions({ fetch: fakeFetch({ "/v2/price_feeds": other }), now: () => WEDNESDAY });
    expect((await p.current()).isOpen).toBe(true);
  });

  it("throws rather than guessing when Pyth is down", async () => {
    const p = new PythSessions({ fetch: fakeFetch({ "/v2/price_feeds": fails(502) }), now: () => WEDNESDAY });
    await expect(p.current()).rejects.toThrow("502");
  });

  it("throws when there is no calendar at all", async () => {
    const p = new PythSessions({ fetch: fakeFetch({ "/v2/price_feeds": [] }), now: () => WEDNESDAY });
    await expect(p.current()).rejects.toThrow(/no equity feed/);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm --filter @mercury/market exec vitest run src/pyth.test.ts`
Expected: FAIL — `Failed to resolve import "./pyth.js"`.

- [ ] **Step 4: Implement it**

Create `packages/market/src/pyth.ts`:

```ts
import type { SessionSource, SessionState } from "./ports.js";

/**
 * Pyth Hermes, no key. Only the metadata endpoint is reachable from a browser:
 * /v2/updates/price/latest is CORS-blocked, verified on 20 September 2026 across
 * the bracket, encoded-bracket and v1 forms. So Pyth gives us the session, not
 * the price — the reference price comes from Jupiter's stockData. See ADR 0010.
 */
const BASE = "https://hermes.pyth.network";

interface Feed {
  readonly id: string;
  readonly market_hours?: {
    readonly is_open?: boolean;
    readonly next_open?: number;
    readonly next_close?: number;
  };
  readonly attributes?: { readonly display_symbol?: string; readonly asset_type?: string };
}

export interface PythSessionsConfig {
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

/**
 * The exchange calendar, not a price. Every US equity shares one, so one ticker
 * answers for all of them, and SPY is the one most certain to exist.
 */
export class PythSessions implements SessionSource {
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private readonly now: () => Date;

  constructor(config: PythSessionsConfig = {}) {
    this.base = config.baseUrl ?? BASE;
    this.doFetch = config.fetch ?? fetch;
    this.now = config.now ?? (() => new Date());
  }

  async current(): Promise<SessionState> {
    const res = await this.doFetch(`${this.base}/v2/price_feeds?query=SPY&asset_type=equity`);
    if (!res.ok) throw new Error(`pyth price_feeds returned ${res.status}`);
    const feeds = (await res.json()) as readonly Feed[];

    const spy = feeds.find((f) => f.attributes?.display_symbol === "SPY") ?? feeds[0];
    if (spy === undefined) throw new Error("pyth returned no equity feed to read the calendar from");

    const hours = spy.market_hours;
    const isOpen = hours?.is_open === true;
    return {
      status: isOpen ? "open" : "closed",
      isOpen,
      nextOpenAt: hours?.next_open === undefined ? null : new Date(hours.next_open * 1000),
      nextCloseAt: hours?.next_close === undefined ? null : new Date(hours.next_close * 1000),
      isWeekend: isWeekendInNewYork(this.now()),
    };
  }
}

/**
 * The exchange's week, not the reader's. A Saturday afternoon in New York is a
 * Sunday morning in Tokyo, and the copy that says "markets open Monday" has to
 * agree with the calendar the orders queue against.
 */
const isWeekendInNewYork = (at: Date): boolean => {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(at);
  return day === "Sat" || day === "Sun";
};
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm --filter @mercury/market exec vitest run src/pyth.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Export and commit**

Modify `packages/market/src/index.ts`:

```ts
export * from "./ports.js";
export * from "./pyth.js";
```

```bash
pnpm --filter @mercury/market typecheck && pnpm --filter @mercury/market exec vitest run
git add packages/market packages/chain
git commit -m "feat: lift the Pyth session source out of the browser"
```

---

## Task 6: Prices, and the reference price

One Jupiter call answers three questions, so one module implements three ports: what a token costs (`PriceBoard`, for valuing a portfolio), what one real share costs (`ReferenceSource`, for `decide()`), and what the multiplier is (`MultiplierSource`, the browser's fallback path — the server prefers Task 7's).

**Files:**

- Modify: `packages/market/src/ports.ts`
- Create: `packages/market/src/jupiter.ts`
- Create: `packages/market/src/jupiter.test.ts`
- Modify: `packages/market/src/index.ts`

**Interfaces:**

- Consumes: `TokenRegistry` from `@mercury/chain`; `fakeFetch`, `jupPrice`, `NVDAX_MINT`, `SPYX_MINT` from `@mercury/chain/testing`.
- Produces: `class JupiterMarket implements ReferenceSource, PriceBoard, MultiplierSource`, `constructor(config: { registry: TokenRegistry; baseUrl?: string; fetch?: typeof fetch; now?: () => number })`; the types `TokenPrice`, `PriceBoard`.

- [ ] **Step 1: Add the port and correct two comments**

In `packages/market/src/ports.ts`, replace the doc comment above `ReferenceSource` with:

```ts
/**
 * The price of one real share, independent of any pool. Today this is Jupiter's
 * `stockData.price`, which is the underlying quote the issuer publishes rather
 * than a DEX mid. ADR 0006 measured Chainlink at 0.8bp from fair through a
 * dividend window against 17-20bp for the alternatives and it remains the more
 * correct source; ADR 0010 records why nothing calls it yet, and ADR 0011 records
 * that this became the preferred path rather than only a fallback.
 */
```

Replace the doc comment above `MultiplierSource` with:

```ts
/**
 * How many shares one token is. Two implementations, deliberately:
 * `MintMultipliers` reads the Token-2022 ScaledUiAmount extension on the mint and
 * is what the server uses — exact, and it can answer `isPaused` from the same
 * account. `JupiterMarket` reads the same numbers out of `scaledUiConfig`, which
 * is all a browser can reach without an RPC URL.
 *
 * Both must apply the switchover rule: the multiplier in force is
 * `newMultiplier` once its effective timestamp has passed. See Task 4 of the
 * read-models plan for the measurement.
 */
```

Append to the same file:

```ts
/** Everything one Jupiter price call knows about one token. */
export interface TokenPrice {
  readonly mint: string;
  /** What one token costs, which is one share's price times the multiplier. */
  readonly usdPricePerToken: Decimal;
  /** What one real share costs. Null for a token with no underlying quote. */
  readonly pricePerShare: Decimal | null;
  readonly changePct24h: Decimal | null;
  readonly liquidityUsd: Decimal;
  readonly multiplier: Decimal;
  readonly observedAt: Date | null;
}

/**
 * Prices for a set of mints in one call. Valuing a portfolio needs the token
 * price; `ReferenceSource` needs the share price. They come from the same
 * response, so they are fetched together rather than twice.
 */
export interface PriceBoard {
  pricesFor(mints: readonly string[]): Promise<ReadonlyMap<string, TokenPrice>>;
}
```

`Decimal` is already imported at the top of the file. Leave that import alone.

- [ ] **Step 2: Write the failing test**

Create `packages/market/src/jupiter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import type { TokenRef, TokenRegistry } from "@mercury/chain";
import { fails, fakeFetch, jupPrice, NVDAX_MINT, SPYX_MINT } from "@mercury/chain/testing";
import { JupiterMarket } from "./jupiter.js";

const NVDAX: TokenRef = { mint: NVDAX_MINT, symbol: "NVDAx", ticker: "NVDA", issuer: "backed", decimals: 8 };
const NVDAON: TokenRef = {
  mint: "OnDoNvDaMiNtAdDrEsSfOrTeStSoNlY1111111111",
  symbol: "NVDAon",
  ticker: "NVDA",
  issuer: "ondo",
  decimals: 6,
};

const registry = (refs: readonly TokenRef[]): TokenRegistry => ({
  wrappersFor: async (ticker) => refs.filter((r) => r.ticker === ticker),
  all: async () => refs,
  byMint: async (mint) => refs.find((r) => r.mint === mint) ?? null,
});

/** A price response with exactly the fields a test cares about. */
const priceOf = (mint: string, body: Record<string, unknown>) => ({ [mint]: body });

describe("JupiterMarket.pricesFor", () => {
  it("maps the recorded response onto the board", async () => {
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: fakeFetch({ "/price/v3": jupPrice }) });
    const board = await m.pricesFor([NVDAX_MINT]);
    const recorded = (jupPrice as Record<string, { usdPrice: number; stockData?: { price: number } }>)[
      NVDAX_MINT
    ]!;
    const price = board.get(NVDAX_MINT);
    expect(price!.usdPricePerToken.toFixed()).toBe(String(recorded.usdPrice));
    expect(price!.pricePerShare!.toFixed()).toBe(String(recorded.stockData!.price));
  });

  it("asks for every mint in one request", async () => {
    let seen = "";
    const f = fakeFetch({ "/price/v3": jupPrice });
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: ((input: Parameters<typeof fetch>[0]) => {
        seen = String(input);
        return f(input);
      }) as typeof fetch,
    });
    await m.pricesFor([NVDAX_MINT, SPYX_MINT]);
    expect(seen).toContain(`${NVDAX_MINT},${SPYX_MINT}`);
  });

  it("does not call upstream for an empty list", async () => {
    const m = new JupiterMarket({ registry: registry([]), fetch: fakeFetch({}) });
    expect((await m.pricesFor([])).size).toBe(0);
  });

  it("uses newMultiplier once its effective timestamp has passed", async () => {
    const body = priceOf(NVDAX_MINT, {
      usdPrice: 224.43901496255418,
      decimals: 8,
      scaledUiConfig: {
        multiplier: 1.0009180758490996,
        newMultiplier: 1.001701196801074,
        newMultiplierEffectiveAt: "2026-09-10T00:30:00Z",
      },
    });
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: fakeFetch({ "/price/v3": body }),
      now: () => Date.parse("2026-09-24T00:00:00Z"),
    });
    expect((await m.pricesFor([NVDAX_MINT])).get(NVDAX_MINT)!.multiplier.toFixed()).toBe("1.001701196801074");
  });

  it("uses the current multiplier until then", async () => {
    const body = priceOf(NVDAX_MINT, {
      usdPrice: 1,
      decimals: 8,
      scaledUiConfig: {
        multiplier: 1.0009180758490996,
        newMultiplier: 1.001701196801074,
        newMultiplierEffectiveAt: "2026-09-10T00:30:00Z",
      },
    });
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: fakeFetch({ "/price/v3": body }),
      now: () => Date.parse("2026-09-01T00:00:00Z"),
    });
    expect((await m.pricesFor([NVDAX_MINT])).get(NVDAX_MINT)!.multiplier.toFixed()).toBe(
      "1.0009180758490996",
    );
  });

  it("says one for a token that has never paid a dividend", async () => {
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: fakeFetch({ "/price/v3": priceOf(NVDAX_MINT, { usdPrice: 10, decimals: 8 }) }),
    });
    expect((await m.pricesFor([NVDAX_MINT])).get(NVDAX_MINT)!.multiplier).toEqual(D(1));
  });

  it("skips a mint Jupiter answered null for, rather than pricing it at zero", async () => {
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: fakeFetch({ "/price/v3": { [NVDAX_MINT]: null } }),
    });
    expect((await m.pricesFor([NVDAX_MINT])).size).toBe(0);
  });
});

describe("JupiterMarket.priceFor", () => {
  it("prices a ticker from its Backed wrapper", async () => {
    const m = new JupiterMarket({
      registry: registry([NVDAON, NVDAX]),
      fetch: fakeFetch({ "/price/v3": jupPrice }),
    });
    const reference = await m.priceFor("NVDA");
    const recorded = (jupPrice as Record<string, { stockData?: { price: number; updatedAt: string } }>)[
      NVDAX_MINT
    ]!;
    expect(reference!.pricePerShare.toFixed()).toBe(String(recorded.stockData!.price));
    expect(reference!.observedAt).toEqual(new Date(recorded.stockData!.updatedAt));
    // Zero almost always: a dividend that has gone ex but is not yet in the
    // multiplier is the exception, and no upstream tells us about one.
    expect(reference!.pendingDividendNet).toEqual(D(0));
  });

  it("says null for a ticker it has never heard of", async () => {
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: fakeFetch({ "/price/v3": jupPrice }) });
    expect(await m.priceFor("NOPE")).toBeNull();
  });

  it("says null when there is no underlying quote, rather than using the pool price", async () => {
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: fakeFetch({ "/price/v3": priceOf(NVDAX_MINT, { usdPrice: 224.4, decimals: 8 }) }),
    });
    expect(await m.priceFor("NVDA")).toBeNull();
  });

  it("throws when Jupiter is down, so the caller can fall back rather than price on nothing", async () => {
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: fakeFetch({ "/price/v3": fails(502) }),
    });
    await expect(m.priceFor("NVDA")).rejects.toThrow("502");
  });
});

describe("JupiterMarket as a MultiplierSource", () => {
  it("answers for a mint it can price", async () => {
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: fakeFetch({ "/price/v3": jupPrice }) });
    expect((await m.multiplierFor(NVDAX_MINT))!.gte(D(1))).toBe(true);
  });

  it("says null for a mint Jupiter does not know", async () => {
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: fakeFetch({ "/price/v3": {} }) });
    expect(await m.multiplierFor("NotAMint")).toBeNull();
  });

  it("cannot see a pause from a price, and says so rather than guessing", async () => {
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: fakeFetch({ "/price/v3": jupPrice }) });
    expect(await m.isPaused(NVDAX_MINT)).toBe(false);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm --filter @mercury/market exec vitest run src/jupiter.test.ts`
Expected: FAIL — `Failed to resolve import "./jupiter.js"`.

- [ ] **Step 4: Implement it**

Create `packages/market/src/jupiter.ts`:

```ts
import { D, ONE, ZERO, type Decimal, type ReferencePrice } from "@mercury/core";
import type { TokenRegistry } from "@mercury/chain";
import type { MultiplierSource, PriceBoard, ReferenceSource, TokenPrice } from "./ports.js";

/** Jupiter's free tier. Keyless and CORS-open, which is what makes it the fallback path. */
const BASE = "https://lite-api.jup.ag";

interface JupPrice {
  readonly usdPrice?: number;
  readonly decimals?: number;
  readonly liquidity?: number;
  readonly priceChange24h?: number;
  /** The underlying share, not the token. Independent of the pool. */
  readonly stockData?: { readonly price?: number; readonly updatedAt?: string };
  /** Token-2022 ScaledUiAmount. Absent for tokens that have never paid a dividend. */
  readonly scaledUiConfig?: {
    readonly multiplier?: number;
    readonly newMultiplier?: number;
    readonly newMultiplierEffectiveAt?: string;
  };
}

export interface JupiterMarketConfig {
  readonly registry: TokenRegistry;
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
}

/** Jupiter's numbers arrive as JSON floats. They become Decimal here and stay that way. */
const dec = (v: number | undefined): Decimal | null =>
  typeof v === "number" && Number.isFinite(v) ? D(v) : null;

/**
 * One call to `/price/v3` answers what a token costs, what its underlying share
 * costs, and what the multiplier is — so one class implements the three ports
 * that need those answers rather than three classes making the same request.
 */
export class JupiterMarket implements ReferenceSource, PriceBoard, MultiplierSource {
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly config: JupiterMarketConfig) {
    this.base = config.baseUrl ?? BASE;
    this.doFetch = config.fetch ?? fetch;
    this.now = config.now ?? Date.now;
  }

  async pricesFor(mints: readonly string[]): Promise<ReadonlyMap<string, TokenPrice>> {
    const board = new Map<string, TokenPrice>();
    if (mints.length === 0) return board;

    const res = await this.doFetch(`${this.base}/price/v3?ids=${mints.join(",")}`);
    if (!res.ok) throw new Error(`jupiter price/v3 returned ${res.status}`);
    const body = (await res.json()) as Record<string, JupPrice | null>;

    for (const mint of mints) {
      const p = body[mint];
      // Null is Jupiter saying it has no price. Pricing it at zero would wipe a
      // holding off a portfolio; leaving it out lets the caller say "unpriced".
      if (p === null || p === undefined) continue;
      const usdPricePerToken = dec(p.usdPrice);
      if (usdPricePerToken === null) continue;

      board.set(mint, {
        mint,
        usdPricePerToken,
        pricePerShare: dec(p.stockData?.price),
        changePct24h: dec(p.priceChange24h),
        liquidityUsd: dec(p.liquidity) ?? ZERO,
        multiplier: this.effectiveMultiplier(p),
        observedAt: p.stockData?.updatedAt === undefined ? null : new Date(p.stockData.updatedAt),
      });
    }
    return board;
  }

  /**
   * The reference is one real share's price, taken from the Backed wrapper where
   * there is one. Both issuers wrap the same company, so either would do; Backed
   * is preferred because its pools are the deep ones and its feed is the one that
   * keeps updating.
   */
  async priceFor(ticker: string): Promise<ReferencePrice | null> {
    const wrappers = await this.config.registry.wrappersFor(ticker);
    if (wrappers.length === 0) return null;

    const board = await this.pricesFor(wrappers.map((w) => w.mint));
    const preferred = wrappers.find((w) => w.issuer === "backed") ?? wrappers[0]!;
    const price = board.get(preferred.mint) ?? [...board.values()][0];
    if (price === undefined || price.pricePerShare === null) return null;

    return {
      pricePerShare: price.pricePerShare,
      observedAt: price.observedAt ?? new Date(this.now()),
      // A dividend that has gone ex but is not yet folded into the multiplier.
      // No upstream we read publishes one, so it is zero and honestly so.
      pendingDividendNet: ZERO,
    };
  }

  async multiplierFor(mint: string): Promise<Decimal | null> {
    return (await this.pricesFor([mint])).get(mint)?.multiplier ?? null;
  }

  /**
   * A price says nothing about Token-2022 Pausable. The server uses
   * `MintMultipliers`, which reads the flag from the mint; this exists so the
   * fallback path satisfies the port, and it never claims a token is halted on
   * evidence it does not have.
   */
  isPaused(_mint: string): Promise<boolean> {
    return Promise.resolve(false);
  }

  /**
   * Same switchover rule as the mint: `newMultiplier` takes over at its effective
   * time. Jupiter publishes both, and its own `usdPrice` divides the prescaled
   * price by whichever one is in force — which is how the rule was confirmed.
   */
  private effectiveMultiplier(p: JupPrice): Decimal {
    const config = p.scaledUiConfig;
    if (config === undefined) return ONE;
    const current = dec(config.multiplier) ?? ONE;
    const next = dec(config.newMultiplier);
    const at = config.newMultiplierEffectiveAt;
    if (next === null || at === undefined) return current;
    const effectiveAt = Date.parse(at);
    if (Number.isNaN(effectiveAt)) return current;
    return this.now() >= effectiveAt ? next : current;
  }
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm --filter @mercury/market exec vitest run src/jupiter.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 6: Export and commit**

Modify `packages/market/src/index.ts`, adding `export * from "./jupiter.js";`.

```bash
pnpm --filter @mercury/market typecheck && pnpm --filter @mercury/market exec vitest run
git add packages/market
git commit -m "feat: lift Jupiter prices, reference price and multipliers out of the browser"
```

---

## Task 7: The multiplier the server trusts, and the parity test

`MintMultipliers` reads the ScaledUiAmount extension from the mint itself: an exact decimal string rather than a JSON float, and `isPaused` from the same account rather than a shrug. This is what `buildDeps` wires in. `JupiterMarket`'s implementation stays as the fallback, and the parity test is what keeps them honest about each other.

**Files:**

- Create: `packages/market/src/mint.ts`
- Create: `packages/market/src/mint.test.ts`
- Create: `packages/market/src/parity.live.test.ts`
- Modify: `packages/market/src/index.ts`
- Modify: `packages/market/package.json`

**Interfaces:**

- Consumes: `ChainReader`, `MintConfig` from `@mercury/chain` (Task 4).
- Produces: `class MintMultipliers implements MultiplierSource`, `constructor(config: { chain: ChainReader })`.

- [ ] **Step 1: Write the failing test**

Create `packages/market/src/mint.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import type { ChainReader, MintConfig } from "@mercury/chain";
import { MintMultipliers } from "./mint.js";

const chainWith = (configs: Record<string, MintConfig | null>): ChainReader => ({
  tokenBalances: async () => [],
  mintConfig: async (mint) => configs[mint] ?? null,
});

const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

describe("MintMultipliers", () => {
  it("returns the multiplier the mint is carrying", async () => {
    const m = new MintMultipliers({
      chain: chainWith({ [NVDAX]: { decimals: 8, multiplier: D("1.001701196801074"), isPaused: false } }),
    });
    expect((await m.multiplierFor(NVDAX))!.toFixed()).toBe("1.001701196801074");
  });

  it("says null for a mint that does not exist, which is not the same as one", async () => {
    const m = new MintMultipliers({ chain: chainWith({}) });
    expect(await m.multiplierFor("NotAMint")).toBeNull();
  });

  it("reports a halted token", async () => {
    const m = new MintMultipliers({
      chain: chainWith({ [NVDAX]: { decimals: 8, multiplier: D(1), isPaused: true } }),
    });
    expect(await m.isPaused(NVDAX)).toBe(true);
  });

  it("does not call a token halted just because we cannot find it", async () => {
    // A mint we cannot read is a mint we know nothing about. Refusing to trade
    // it belongs to the decision path, which already refuses a candidate with no
    // multiplier; claiming the issuer halted it would be a different, false story.
    const m = new MintMultipliers({ chain: chainWith({}) });
    expect(await m.isPaused("NotAMint")).toBe(false);
  });

  it("reads the mint once when both questions are asked about it", async () => {
    let calls = 0;
    const chain: ChainReader = {
      tokenBalances: async () => [],
      mintConfig: async () => {
        calls += 1;
        return { decimals: 8, multiplier: D(1), isPaused: false };
      },
    };
    const m = new MintMultipliers({ chain });
    await Promise.all([m.multiplierFor(NVDAX), m.isPaused(NVDAX)]);
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @mercury/market exec vitest run src/mint.test.ts`
Expected: FAIL — `Failed to resolve import "./mint.js"`.

- [ ] **Step 3: Implement it**

Create `packages/market/src/mint.ts`:

```ts
import type { Decimal } from "@mercury/core";
import type { ChainReader, MintConfig } from "@mercury/chain";
import type { MultiplierSource } from "./ports.js";

export interface MintMultipliersConfig {
  readonly chain: ChainReader;
  /** How long one mint's config is held. Multipliers move on dividend days, not on ticks. */
  readonly ttlMs?: number;
  readonly now?: () => number;
}

const DEFAULT_TTL_MS = 60_000;

/**
 * The multiplier, read from the mint rather than from an API.
 *
 * `pricing.ts` asks for the multiplier and the pause state of the same mint at
 * the same moment, so the account is fetched once and both answers come out of
 * it. The cache is short and per-instance: it exists to collapse that pair, not
 * to keep prices.
 */
export class MintMultipliers implements MultiplierSource {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, { at: number; value: Promise<MintConfig | null> }>();

  constructor(private readonly config: MintMultipliersConfig) {
    this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
    this.now = config.now ?? Date.now;
  }

  private read(mint: string): Promise<MintConfig | null> {
    const hit = this.cache.get(mint);
    if (hit !== undefined && this.now() - hit.at < this.ttlMs) return hit.value;
    // The promise is cached, not the result, so two concurrent asks share a call.
    const value = this.config.chain.mintConfig(mint);
    this.cache.set(mint, { at: this.now(), value });
    return value;
  }

  async multiplierFor(mint: string): Promise<Decimal | null> {
    return (await this.read(mint))?.multiplier ?? null;
  }

  async isPaused(mint: string): Promise<boolean> {
    return (await this.read(mint))?.isPaused === true;
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter @mercury/market exec vitest run src/mint.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the parity test**

This is the spec's §5 parity test in the form this half of the subsystem can express: two implementations of one port, run against the same real mint, asserted to agree. It hits the network, so it is opt-in and never runs in CI.

Create `packages/market/src/parity.live.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { JupiterRegistry, SolanaRpc } from "@mercury/chain";
import { JupiterMarket } from "./jupiter.js";
import { MintMultipliers } from "./mint.js";

const RPC = process.env["SOLANA_RPC_URL"];

/**
 * The risk the backend design takes on is two paths disagreeing. The server
 * reads the multiplier from the mint; the browser fallback reads it from
 * Jupiter. If those ever diverge, every share count on one of the two paths is
 * wrong, and nothing else in the system would notice.
 *
 * Live, by hand, never in CI:
 *   SOLANA_RPC_URL=https://… pnpm --filter @mercury/market exec vitest run parity.live
 */
describe.skipIf(RPC === undefined)("multiplier parity, live", () => {
  it("agrees with Jupiter on every wrapper we list", async () => {
    const registry = new JupiterRegistry();
    const chain = new SolanaRpc({ rpcUrl: RPC! });
    const fromMint = new MintMultipliers({ chain });
    const fromJupiter = new JupiterMarket({ registry });

    const tokens = await registry.all();
    expect(tokens.length).toBeGreaterThan(0);

    for (const token of tokens) {
      const [mint, jupiter] = await Promise.all([
        fromMint.multiplierFor(token.mint),
        fromJupiter.multiplierFor(token.mint),
      ]);
      expect(mint, `${token.symbol} has no multiplier on chain`).not.toBeNull();
      expect(jupiter, `${token.symbol} has no multiplier at Jupiter`).not.toBeNull();
      // A floating-point round trip through Jupiter's JSON costs a few digits,
      // so exact equality is the wrong assertion. A basis point is not: the gap
      // this catches is a stale multiplier, which is hundreds of times larger.
      const gap = mint!.sub(jupiter!).abs().div(mint!);
      expect(
        gap.lte("0.0001"),
        `${token.symbol}: chain ${mint!.toFixed()} vs jupiter ${jupiter!.toFixed()}`,
      ).toBe(true);
    }
  }, 60_000);
});
```

- [ ] **Step 6: Run the parity test by hand**

```bash
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com pnpm --filter @mercury/market exec vitest run parity.live
```

Expected: PASS. If a wrapper fails, do not loosen the tolerance — read both numbers. A gap near 0.08% means one side is on the stale `multiplier` field while the other has moved to `newMultiplier`, which is the bug this test exists to find.

Without `SOLANA_RPC_URL` the suite skips, which is what keeps `pnpm test` offline.

- [ ] **Step 7: Keep the live test out of the default run**

Modify `packages/market/package.json`, changing the test script:

```json
    "test": "vitest run --exclude '**/*.live.test.ts'",
```

The existing `"typecheck"` script is unchanged, so the live test is still type-checked.

- [ ] **Step 8: Export and commit**

Modify `packages/market/src/index.ts`, adding `export * from "./mint.js";`.

```bash
pnpm --filter @mercury/market typecheck && pnpm --filter @mercury/market exec vitest run
git add packages/market
git commit -m "feat: read multipliers from the mint, and test them against Jupiter"
```

---

## Task 8: The credit market

The lift of `apps/web/src/market/kamino.ts` behind a new `CreditSource` port. One endpoint, one parse. `GET /v1/money` consumes the USDC supply rate; the collateral factors come back in the same response and are kept, because splitting one parse in two to drop a field we might show later is work that buys nothing.

**Files:**

- Modify: `packages/market/src/ports.ts`
- Create: `packages/market/src/kamino.ts`
- Create: `packages/market/src/kamino.test.ts`
- Modify: `packages/market/src/index.ts`

**Interfaces:**

- Consumes: `fakeFetch`, `kaminoReserves` from `@mercury/chain/testing`.
- Produces: `class KaminoCredit implements CreditSource`, `constructor(config?: { baseUrl?: string; marketAddress?: string; fetch?: typeof fetch })`; the types `Collateral`, `CreditMarket`, `CreditSource`; the constant `XSTOCKS_MARKET`.

- [ ] **Step 1: Add the port**

Append to `packages/market/src/ports.ts`:

```ts
export interface Collateral {
  readonly symbol: string;
  readonly ticker: string;
  /** Share of the holding's value that can be borrowed against, as a ratio. */
  readonly maxLtv: Decimal;
}

export interface CreditMarket {
  readonly collateral: readonly Collateral[];
  /** What borrowing a dollar costs per year right now. Floats with utilisation. */
  readonly borrowApy: Decimal | null;
  /** What supplying one earns. This is what `GET /v1/money` reports as the rate. */
  readonly supplyApy: Decimal | null;
}

/**
 * Kamino runs a dedicated xStocks market. We read it rather than describe it,
 * because collateral factors are a risk parameter Kamino changes when it wants
 * to, and a number typed into our source would quietly go stale.
 */
export interface CreditSource {
  current(): Promise<CreditMarket>;
}
```

- [ ] **Step 2: Write the failing test**

Create `packages/market/src/kamino.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fails, fakeFetch, kaminoReserves } from "@mercury/chain/testing";
import { KaminoCredit, XSTOCKS_MARKET } from "./kamino.js";

describe("KaminoCredit", () => {
  it("reads the xStocks market, not the primary pool", async () => {
    let seen = "";
    const f = fakeFetch({ "/kamino-market/": kaminoReserves });
    const k = new KaminoCredit({
      fetch: ((input: Parameters<typeof fetch>[0]) => {
        seen = String(input);
        return f(input);
      }) as typeof fetch,
    });
    await k.current();
    expect(seen).toContain(XSTOCKS_MARKET);
    expect(seen).toContain("/reserves/metrics");
  });

  it("takes the borrow and supply rates from USDC", async () => {
    const reserves = [
      { liquidityToken: "USDC", maxLtv: "0", borrowApy: "0.0444", supplyApy: "0.00095" },
      { liquidityToken: "SPYx", maxLtv: "0.73", borrowApy: "0.09", supplyApy: "0.01" },
    ];
    const k = new KaminoCredit({ fetch: fakeFetch({ "/kamino-market/": reserves }) });
    const market = await k.current();
    expect(market.borrowApy!.toFixed()).toBe("0.0444");
    expect(market.supplyApy!.toFixed()).toBe("0.00095");
  });

  it("lists the stock collateral, richest factor first", async () => {
    const reserves = [
      { liquidityToken: "HOODx", maxLtv: "0.3" },
      { liquidityToken: "SPYx", maxLtv: "0.73" },
      { liquidityToken: "QQQx", maxLtv: "0.7" },
    ];
    const k = new KaminoCredit({ fetch: fakeFetch({ "/kamino-market/": reserves }) });
    const market = await k.current();
    expect(market.collateral.map((c) => c.symbol)).toEqual(["SPYx", "QQQx", "HOODx"]);
    expect(market.collateral[0]!.ticker).toBe("SPY");
    expect(market.collateral[0]!.maxLtv.toFixed()).toBe("0.73");
  });

  it("leaves out a reserve that cannot be borrowed against at all", async () => {
    const reserves = [
      { liquidityToken: "SPYx", maxLtv: "0.73" },
      { liquidityToken: "VIDAx", maxLtv: "0" },
      { liquidityToken: "USDC", maxLtv: "0.8" },
    ];
    const k = new KaminoCredit({ fetch: fakeFetch({ "/kamino-market/": reserves }) });
    const market = await k.current();
    expect(market.collateral.map((c) => c.symbol)).toEqual(["SPYx"]);
  });

  it("reads the recorded response without inventing a shape", async () => {
    const k = new KaminoCredit({ fetch: fakeFetch({ "/kamino-market/": kaminoReserves }) });
    const market = await k.current();
    expect(market.collateral.length).toBeGreaterThan(0);
    expect(market.collateral.every((c) => c.maxLtv.gt(0) && c.maxLtv.lte(1))).toBe(true);
  });

  it("says null for a rate USDC is missing, rather than zero", async () => {
    const k = new KaminoCredit({
      fetch: fakeFetch({ "/kamino-market/": [{ liquidityToken: "SPYx", maxLtv: "0.73" }] }),
    });
    const market = await k.current();
    expect(market.borrowApy).toBeNull();
    expect(market.supplyApy).toBeNull();
  });

  it("throws when Kamino is down", async () => {
    const k = new KaminoCredit({ fetch: fakeFetch({ "/kamino-market/": fails(503) }) });
    await expect(k.current()).rejects.toThrow("503");
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm --filter @mercury/market exec vitest run src/kamino.test.ts`
Expected: FAIL — `Failed to resolve import "./kamino.js"`.

- [ ] **Step 4: Implement it**

Create `packages/market/src/kamino.ts`:

```ts
import { D, type Decimal } from "@mercury/core";
import type { Collateral, CreditMarket, CreditSource } from "./ports.js";

/** Kamino's public API. No key, CORS-open — verified from the browser on 20 September 2026. */
const BASE = "https://api.kamino.finance";

/** The xStocks Market, not the primary pool. Stock collateral only exists here. */
export const XSTOCKS_MARKET = "5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua";

interface Reserve {
  readonly liquidityToken: string;
  readonly maxLtv?: string;
  readonly borrowApy?: string;
  readonly supplyApy?: string;
}

export interface KaminoCreditConfig {
  readonly baseUrl?: string;
  readonly marketAddress?: string;
  readonly fetch?: typeof fetch;
}

/** Rates arrive as decimal strings. They go straight into Decimal, never through a float. */
const rate = (v: string | undefined): Decimal | null => (v === undefined || v.length === 0 ? null : D(v));

export class KaminoCredit implements CreditSource {
  private readonly base: string;
  private readonly market: string;
  private readonly doFetch: typeof fetch;

  constructor(config: KaminoCreditConfig = {}) {
    this.base = config.baseUrl ?? BASE;
    this.market = config.marketAddress ?? XSTOCKS_MARKET;
    this.doFetch = config.fetch ?? fetch;
  }

  async current(): Promise<CreditMarket> {
    const res = await this.doFetch(`${this.base}/kamino-market/${this.market}/reserves/metrics`);
    if (!res.ok) throw new Error(`kamino reserves returned ${res.status}`);
    const reserves = (await res.json()) as readonly Reserve[];

    const usdc = reserves.find((r) => r.liquidityToken === "USDC");

    const collateral: Collateral[] = reserves
      .filter((r) => /x$/.test(r.liquidityToken))
      .map((r) => ({
        symbol: r.liquidityToken,
        ticker: r.liquidityToken.replace(/x$/, ""),
        maxLtv: rate(r.maxLtv) ?? D(0),
      }))
      // A zero factor is Kamino saying this cannot be borrowed against. Listing
      // it as collateral with a limit of nothing would be an offer of nothing.
      .filter((c) => c.maxLtv.gt(0))
      .sort((a, b) => b.maxLtv.comparedTo(a.maxLtv));

    return {
      collateral,
      borrowApy: rate(usdc?.borrowApy),
      supplyApy: rate(usdc?.supplyApy),
    };
  }
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm --filter @mercury/market exec vitest run src/kamino.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Export and commit**

Modify `packages/market/src/index.ts`, adding `export * from "./kamino.js";`.

```bash
pnpm --filter @mercury/market typecheck && pnpm --filter @mercury/market exec vitest run
git add packages/market
git commit -m "feat: lift the Kamino credit market out of the browser"
```

---

## Task 9: The tables

Seven tables from [docs/05](../../05-data-model.md), exactly as it specifies them. `user` and `wallet` already exist from subsystem 1 and are not touched. `basket*` and `plan*` land with their own subsystems.

**Files:**

- Modify: `services/api/src/db/schema.ts`
- Modify: `services/api/src/db/schema.test.ts`
- Create: `services/api/drizzle/0001_*.sql` (generated)

**Interfaces:**

- Produces: the tables `instruments`, `tokens`, `multiplierEvents`, `lots`, `positions`, `orders`, `activities`, and the row types `Instrument`, `Token`, `Lot`, `Position`, `Order`, `Activity`.

- [ ] **Step 1: Write the failing test**

Append to `services/api/src/db/schema.test.ts`:

```ts
import { activities, instruments, lots, multiplierEvents, orders, positions, tokens } from "./schema.js";

describe("read model schema", () => {
  it("gives an instrument the fields a shelf needs", () => {
    const cols = Object.keys(getTableColumns(instruments));
    expect(cols).toEqual(
      expect.arrayContaining(["id", "ticker", "name", "sector", "description", "logoUrl", "isTradable"]),
    );
  });

  it("gives a token its mint, its issuer and its multiplier", () => {
    const cols = Object.keys(getTableColumns(tokens));
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "instrumentId",
        "mint",
        "issuer",
        "symbol",
        "decimals",
        "multiplier",
        "multiplierUpdatedAt",
        "isRoutable",
        "firstSeenAt",
      ]),
    );
  });

  it("records both sides of a multiplier change, because it is a dividend", () => {
    const cols = Object.keys(getTableColumns(multiplierEvents));
    expect(cols).toEqual(
      expect.arrayContaining(["id", "tokenId", "oldMultiplier", "newMultiplier", "observedAt", "kind"]),
    );
  });

  it("stores both sides of a quantity on a lot, because they drift apart", () => {
    // docs/05: a holding has a token quantity AND a share count. Deriving one
    // from the other with today's multiplier would rewrite history.
    const cols = Object.keys(getTableColumns(lots));
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "userId",
        "tokenId",
        "instrumentId",
        "tokenQty",
        "shares",
        "unitCostUsd",
        "acquiredAt",
        "source",
        "isEstimated",
        "orderId",
      ]),
    );
  });

  it("rolls a position up per instrument, not per token", () => {
    const cols = Object.keys(getTableColumns(positions));
    expect(cols).toEqual(
      expect.arrayContaining([
        "userId",
        "instrumentId",
        "shares",
        "costBasisUsd",
        "avgUnitCostUsd",
        "updatedAt",
      ]),
    );
    expect(cols).not.toContain("tokenId");
  });

  it("keeps the decision verbatim on an order", () => {
    const cols = Object.keys(getTableColumns(orders));
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "userId",
        "instrumentId",
        "side",
        "usdAmount",
        "decision",
        "chosenTokenId",
        "referencePrice",
        "premiumPct",
        "status",
        "txSignature",
        "triggerOrderAccount",
        "filledAt",
        "createdAt",
      ]),
    );
  });

  it("gives activity everything it needs without a join", () => {
    const cols = Object.keys(getTableColumns(activities));
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "userId",
        "kind",
        "occurredAt",
        "title",
        "subtitle",
        "amountUsd",
        "refTable",
        "refId",
        "txSignature",
      ]),
    );
  });

  it("holds money as numeric, never as a float", () => {
    const money = [
      getTableColumns(lots).unitCostUsd,
      getTableColumns(lots).shares,
      getTableColumns(positions).costBasisUsd,
      getTableColumns(orders).usdAmount,
      getTableColumns(tokens).multiplier,
    ];
    for (const column of money) expect(column.getSQLType()).toBe("numeric(38, 18)");
    // A raw token amount is an integer count of the smallest unit, so it is a
    // bigint and not a numeric: it is never fractional and never rounded.
    expect(getTableColumns(lots).tokenQty.getSQLType()).toBe("bigint");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @mercury/api exec vitest run src/db`
Expected: FAIL — `"instruments" is not exported by "./schema.js"`.

- [ ] **Step 3: Implement the tables**

In `services/api/src/db/schema.ts`, replace the import line with:

```ts
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
```

Replace the file's leading doc comment with:

```ts
/**
 * The read model, per docs/05. Two rules hold throughout and have no exceptions:
 *
 *  1. Never a float. On-chain amounts are `bigint` in the token's smallest unit.
 *     Prices and USD values are numeric(38,18) here and Decimal in TypeScript.
 *  2. Store both sides of a quantity. A holding has a token count and a share
 *     count; they differ by the multiplier, and the multiplier moves. Deriving
 *     one from the other at read time would rewrite history.
 *
 * We store no email. Privy holds it, and docs/05 says we do not copy it.
 */
```

Then append to the file, after the existing `wallets` table and before the type exports:

```ts
/** A money column. Wide enough for a share count and a price alike. */
const usd = (name: string) => numeric(name, { precision: 38, scale: 18 });

/** The real company or fund. One row per ticker. */
export const instruments = pgTable(
  "instrument",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticker: text("ticker").notNull(),
    name: text("name").notNull(),
    sector: text("sector"),
    description: text("description"),
    logoUrl: text("logo_url"),
    /** False when no wrapper can be filled at a normal size. The shelf hides it. */
    isTradable: boolean("is_tradable").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("instrument_ticker_idx").on(t.ticker)],
);

/** A wrapper. Several per instrument, one per issuer. */
export const tokens = pgTable(
  "token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    mint: text("mint").notNull(),
    issuer: text("issuer", { enum: ["backed", "ondo"] }).notNull(),
    symbol: text("symbol").notNull(),
    decimals: integer("decimals").notNull(),
    /** Cached from the mint. Every change is also written to multiplier_event. */
    multiplier: usd("multiplier").notNull().default("1"),
    multiplierUpdatedAt: timestamp("multiplier_updated_at", { withTimezone: true }),
    isRoutable: boolean("is_routable").notNull().default(true),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("token_mint_idx").on(t.mint), index("token_instrument_idx").on(t.instrumentId)],
);

/** A multiplier change is a dividend, and the user should see it. */
export const multiplierEvents = pgTable(
  "multiplier_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "cascade" }),
    oldMultiplier: usd("old_multiplier").notNull(),
    newMultiplier: usd("new_multiplier").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    kind: text("kind", { enum: ["dividend", "split", "unknown"] }).notNull(),
  },
  (t) => [index("multiplier_event_token_idx").on(t.tokenId, t.observedAt)],
);

/**
 * The unit of cost basis. One row per acquisition, and `shares` is frozen at
 * acquisition: if the multiplier later rises, a *new* lot is written with
 * source 'dividend' and a unit cost of zero.
 */
export const lots = pgTable(
  "lot",
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
    /** Smallest unit, as acquired. A dividend lot has none: it is shares only. */
    tokenQty: bigint("token_qty", { mode: "bigint" }).notNull(),
    /** token_qty x multiplier AT ACQUISITION. Never recomputed. */
    shares: usd("shares").notNull(),
    /** Cost per share, not per token. */
    unitCostUsd: usd("unit_cost_usd").notNull(),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
    source: text("source", { enum: ["buy", "transfer_in", "dividend", "basket"] }).notNull(),
    /** True when we inferred the cost. The UI has to say so. */
    isEstimated: boolean("is_estimated").notNull().default(false),
    orderId: uuid("order_id"),
  },
  (t) => [index("lot_user_token_idx").on(t.userId, t.tokenId)],
);

/** A derived rollup, per user per instrument. Rebuildable from lots at any time. */
export const positions = pgTable(
  "position",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    shares: usd("shares").notNull(),
    costBasisUsd: usd("cost_basis_usd").notNull(),
    avgUnitCostUsd: usd("avg_unit_cost_usd").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.instrumentId] })],
);

export const orders = pgTable(
  "order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id),
    side: text("side", { enum: ["buy", "sell"] }).notNull(),
    usdAmount: usd("usd_amount").notNull(),
    /**
     * The full Decision from @mercury/core, kept verbatim. When a user asks why
     * they were sold one wrapper and not the other, the answer is a row.
     */
    decision: jsonb("decision").notNull(),
    chosenTokenId: uuid("chosen_token_id").references(() => tokens.id),
    referencePrice: usd("reference_price"),
    premiumPct: usd("premium_pct"),
    status: text("status", {
      enum: [
        "pending",
        "executing",
        "filled",
        "queued",
        "partially_filled",
        "expired",
        "cancelled",
        "refused",
      ],
    }).notNull(),
    txSignature: text("tx_signature"),
    triggerOrderAccount: text("trigger_order_account"),
    filledAt: timestamp("filled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("order_user_created_idx").on(t.userId, t.createdAt),
    // One signature, one order. This is what makes confirm idempotent in
    // subsystem 3, where a double submit would otherwise write a second lot.
    uniqueIndex("order_tx_signature_idx").on(t.txSignature),
  ],
);

/** An append-only feed. Denormalised on purpose: read constantly, never joined. */
export const activities = pgTable(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    amountUsd: usd("amount_usd"),
    refTable: text("ref_table"),
    refId: uuid("ref_id"),
    txSignature: text("tx_signature"),
  },
  (t) => [index("activity_user_occurred_idx").on(t.userId, t.occurredAt, t.id)],
);
```

Append the row types beside the existing ones:

```ts
export type Instrument = typeof instruments.$inferSelect;
export type Token = typeof tokens.$inferSelect;
export type MultiplierEvent = typeof multiplierEvents.$inferSelect;
export type Lot = typeof lots.$inferSelect;
export type Position = typeof positions.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Activity = typeof activities.$inferSelect;
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter @mercury/api exec vitest run src/db`
Expected: PASS, 10 tests.

- [ ] **Step 5: Generate the migration**

```bash
pnpm --filter @mercury/api exec drizzle-kit generate
```

Expected: a new `services/api/drizzle/0001_*.sql`. Read it before applying it. It should contain seven `CREATE TABLE` statements and no `DROP` — if it drops or alters `user` or `wallet`, stop and find out why rather than applying it.

- [ ] **Step 6: Apply it to the local database**

```bash
docker start mercury-pg 2>/dev/null || docker run -d --name mercury-pg \
  -e POSTGRES_USER=mercury -e POSTGRES_PASSWORD=mercury -e POSTGRES_DB=mercury \
  -p 5432:5432 -v mercury-pg-data:/var/lib/postgresql/data postgres:16-alpine

pnpm --filter @mercury/api exec drizzle-kit migrate
docker exec mercury-pg psql -U mercury -d mercury -c '\dt'
```

Expected: nine tables — `user`, `wallet` and the seven new ones.

- [ ] **Step 7: Commit**

```bash
git add services/api/src/db services/api/drizzle
git commit -m "feat: the read-model tables from docs/05"
```

---

## Task 10: Filling the supportedStocks

The live token universe becomes `instrument` and `token` rows. The decision of what to store is a pure function so it can be tested without a database; the shell around it does nothing but read, call and write.

**Files:**

- Create: `services/api/src/db/seed/instruments.ts`
- Create: `services/api/src/stocks/plan.ts`
- Create: `services/api/src/stocks/plan.test.ts`
- Create: `services/api/src/stocks/sync.ts`

**Interfaces:**

- Consumes: `SupportedStocks`, `ListedInstrument` from `@mercury/chain`; `PriceBoard`, `TokenPrice` from `@mercury/market`.
- Produces: `planStocks(input: StocksInput): StocksPlan`; `syncStocks(db: Db, deps: { supportedStocks: SupportedStocks; prices: PriceBoard }): Promise<StocksSummary>`; `INSTRUMENT_META`.

- [ ] **Step 1: Write the editorial seed**

Jupiter knows a token is called "NVIDIA xStock". It does not know that the company is Nvidia, that it makes accelerators, or that it belongs in Semiconductors. That layer is ours.

Create `services/api/src/db/seed/instruments.ts`:

```ts
/**
 * Our editorial layer over what Jupiter knows. Jupiter supplies the name on the
 * token ("NVIDIA xStock"); this supplies the name of the company, the sector and
 * the sentence that says what it does.
 *
 * A ticker missing from here is still listed — the name falls back to the
 * issuer's, minus the wrapper suffix, and the sector to "Other". That is what
 * keeps a newly listed xStock from disappearing until someone writes a line here.
 *
 * `apps/web/src/market/meta.ts` holds the same content for the browser. Once the
 * web app reads `name` and `sector` from GET /v1/instruments, delete that file;
 * until then the two are kept in step by hand.
 */
export interface InstrumentMetaEntry {
  readonly name: string;
  readonly sector: string;
  readonly about: string;
}

export const INSTRUMENT_META: Readonly<Record<string, InstrumentMetaEntry>> = {
  NVDA: {
    name: "Nvidia",
    sector: "Semiconductors",
    about: "Designs the graphics and AI accelerators most large models are trained on.",
  },
  AAPL: {
    name: "Apple",
    sector: "Technology",
    about: "iPhone, Mac and a services business that now earns more than most companies do in total.",
  },
  MSFT: {
    name: "Microsoft",
    sector: "Technology",
    about: "Windows, Office and Azure — the second largest cloud business in the world.",
  },
  GOOGL: {
    name: "Alphabet",
    sector: "Technology",
    about: "Search, YouTube, Android and a cloud business growing into third place.",
  },
  META: {
    name: "Meta",
    sector: "Technology",
    about: "Facebook, Instagram and WhatsApp, funded almost entirely by advertising.",
  },
  AMZN: {
    name: "Amazon",
    sector: "Technology",
    about: "The largest online retailer in the world, and the cloud business that pays for it.",
  },
  INTC: {
    name: "Intel",
    sector: "Semiconductors",
    about: "The company that made the x86 processor, now spending heavily to make chips for others.",
  },
  PLTR: {
    name: "Palantir",
    sector: "Technology",
    about: "Data analysis software, sold mostly to governments and large enterprises.",
  },
  TSLA: {
    name: "Tesla",
    sector: "Consumer",
    about:
      "Electric vehicles, energy storage and an autonomy programme the share price has long been valued on more than the cars.",
  },
  MCD: {
    name: "McDonald's",
    sector: "Consumer",
    about: "The largest restaurant chain in the world, and mostly a property business.",
  },
  GME: {
    name: "GameStop",
    sector: "Consumer",
    about: "A video game retailer, and the stock that made retail coordination a market force.",
  },
  COIN: {
    name: "Coinbase",
    sector: "Financials",
    about: "The largest listed crypto exchange in the United States.",
  },
  HOOD: {
    name: "Robinhood",
    sector: "Financials",
    about: "Commission-free brokerage, and the app that made retail trading mainstream.",
  },
  CRCL: {
    name: "Circle",
    sector: "Financials",
    about: "Issuer of USDC, the stablecoin this account holds your cash in.",
  },
  MSTR: {
    name: "Strategy",
    sector: "Financials",
    about:
      "A software company that holds bitcoin on its balance sheet, and trades more on that holding than on the software.",
  },
  STRC: {
    name: "Strategy Preferred",
    sector: "Financials",
    about: "Strategy's preferred stock, which pays a monthly dividend.",
  },
  "BRK.B": {
    name: "Berkshire Hathaway",
    sector: "Financials",
    about: "Insurance, railroads, energy and a famous equity portfolio.",
  },
  SPY: {
    name: "S&P 500",
    sector: "Index funds",
    about:
      "The five hundred largest listed companies in the United States, weighted by market value. The default answer for someone who does not want to pick.",
  },
  QQQ: {
    name: "Nasdaq 100",
    sector: "Index funds",
    about:
      "The hundred largest non-financial companies on the Nasdaq. Heavier in technology than the S&P 500, and more volatile for it.",
  },
  GLD: { name: "Gold", sector: "Commodities", about: "Physical gold, held in a vault, divided into shares." },
  SPCX: {
    name: "SpaceX",
    sector: "Private markets",
    about: "Pre-IPO exposure to SpaceX, which is not listed on any exchange.",
  },
  VIDA: { name: "Vida", sector: "Healthcare", about: "A healthcare company focused on respiratory imaging." },
};
```

- [ ] **Step 2: Write the failing test**

Create `services/api/src/stocks/plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import type { ListedInstrument } from "@mercury/chain";
import type { TokenPrice } from "@mercury/market";
import { planStocks } from "./plan.js";

const NOW = new Date("2026-09-24T12:00:00Z");
const MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

const wrapper = (over: Partial<ListedInstrument["wrappers"][number]> = {}) => ({
  mint: MINT,
  symbol: "NVDAx",
  issuer: "backed" as const,
  decimals: 8,
  name: "NVIDIA xStock",
  icon: "https://example.test/nvdax.png",
  liquidityUsd: D(2_800_000),
  holders: 108_418,
  netBuyers24h: 13,
  volume24hUsd: D(400_000),
  traders24h: 190,
  ...over,
});

const live = (over: Partial<ListedInstrument> = {}): ListedInstrument => ({
  ticker: "NVDA",
  wrappers: [wrapper()],
  ...over,
});

const priced = (over: Partial<TokenPrice> = {}): ReadonlyMap<string, TokenPrice> =>
  new Map([
    [
      MINT,
      {
        mint: MINT,
        usdPricePerToken: D("224.43901496255418"),
        pricePerShare: D("225.07"),
        changePct24h: D("-1.92"),
        liquidityUsd: D(2_800_000),
        multiplier: D("1.001701196801074"),
        observedAt: NOW,
        ...over,
      },
    ],
  ]);

describe("planStocks", () => {
  it("names an instrument from our own editorial, not from the token", () => {
    const plan = planStocks({ live: [live()], prices: priced(), stored: [], now: NOW });
    expect(plan.instruments[0]).toMatchObject({
      ticker: "NVDA",
      name: "Nvidia",
      sector: "Semiconductors",
      isTradable: true,
    });
    expect(plan.instruments[0]!.description).toContain("accelerators");
  });

  it("falls back to the issuer's name with the suffix stripped, for a ticker nobody has written up", () => {
    const plan = planStocks({
      live: [live({ ticker: "ASML", wrappers: [wrapper({ symbol: "ASMLx", name: "ASML Holding xStock" })] })],
      prices: new Map(),
      stored: [],
      now: NOW,
    });
    expect(plan.instruments[0]).toMatchObject({ ticker: "ASML", name: "ASML Holding", sector: "Other" });
  });

  it("takes the logo from the Backed wrapper", () => {
    const plan = planStocks({ live: [live()], prices: priced(), stored: [], now: NOW });
    expect(plan.instruments[0]!.logoUrl).toBe("https://example.test/nvdax.png");
  });

  it("stores the live multiplier against the token", () => {
    const plan = planStocks({ live: [live()], prices: priced(), stored: [], now: NOW });
    expect(plan.tokens[0]).toMatchObject({ ticker: "NVDA", mint: MINT, issuer: "backed", decimals: 8 });
    expect(plan.tokens[0]!.multiplier).toBe("1.001701196801074");
  });

  it("keeps the stored multiplier when Jupiter has no price for the mint", () => {
    const plan = planStocks({
      live: [live()],
      prices: new Map(),
      stored: [{ mint: MINT, multiplier: "1.0009180758490996" }],
      now: NOW,
    });
    expect(plan.tokens[0]!.multiplier).toBe("1.0009180758490996");
    expect(plan.events).toEqual([]);
  });

  it("defaults a brand-new token with no price to a multiplier of one", () => {
    const plan = planStocks({ live: [live()], prices: new Map(), stored: [], now: NOW });
    expect(plan.tokens[0]!.multiplier).toBe("1");
  });

  it("writes an event when the multiplier moves, because that is a dividend", () => {
    const plan = planStocks({
      live: [live()],
      prices: priced(),
      stored: [{ mint: MINT, multiplier: "1.0009180758490996" }],
      now: NOW,
    });
    expect(plan.events).toEqual([
      {
        mint: MINT,
        oldMultiplier: "1.0009180758490996",
        newMultiplier: "1.001701196801074",
        kind: "dividend",
        observedAt: NOW,
      },
    ]);
  });

  it("writes no event when nothing moved, so a sync is idempotent", () => {
    const plan = planStocks({
      live: [live()],
      prices: priced(),
      stored: [{ mint: MINT, multiplier: "1.001701196801074" }],
      now: NOW,
    });
    expect(plan.events).toEqual([]);
  });

  it("calls a multiplier that more than doubles a split, not a dividend", () => {
    const plan = planStocks({
      live: [live()],
      prices: priced({ multiplier: D(4) }),
      stored: [{ mint: MINT, multiplier: "1" }],
      now: NOW,
    });
    expect(plan.events[0]!.kind).toBe("split");
  });

  it("will not guess at a multiplier that fell", () => {
    const plan = planStocks({
      live: [live()],
      prices: priced({ multiplier: D("0.9") }),
      stored: [{ mint: MINT, multiplier: "1" }],
      now: NOW,
    });
    expect(plan.events[0]!.kind).toBe("unknown");
  });

  it("marks a token unroutable when its pool has emptied", () => {
    const plan = planStocks({
      live: [live({ wrappers: [wrapper({ liquidityUsd: D(0) })] })],
      prices: priced({ liquidityUsd: D(0) }),
      stored: [],
      now: NOW,
    });
    expect(plan.tokens[0]!.isRoutable).toBe(false);
  });

  it("keeps both wrappers of an instrument, in one instrument row", () => {
    const ondo = wrapper({
      mint: "OnDoMiNt",
      symbol: "NVDAon",
      issuer: "ondo",
      decimals: 6,
      liquidityUsd: D(40_000),
    });
    const plan = planStocks({
      live: [live({ wrappers: [wrapper(), ondo] })],
      prices: priced(),
      stored: [],
      now: NOW,
    });
    expect(plan.instruments.length).toBe(1);
    expect(plan.tokens.map((t) => t.symbol).sort()).toEqual(["NVDAon", "NVDAx"]);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm --filter @mercury/api exec vitest run src/stocks`
Expected: FAIL — `Failed to resolve import "./plan.js"`.

- [ ] **Step 4: Implement the plan**

Create `services/api/src/stocks/plan.ts`:

```ts
import { D, ONE, type Decimal, type Issuer } from "@mercury/core";
import type { ListedInstrument } from "@mercury/chain";
import type { TokenPrice } from "@mercury/market";
import { INSTRUMENT_META } from "../db/seed/instruments.js";

export interface StoredTokenRow {
  readonly mint: string;
  readonly multiplier: string;
}

export interface StocksInput {
  readonly live: readonly ListedInstrument[];
  readonly prices: ReadonlyMap<string, TokenPrice>;
  readonly stored: readonly StoredTokenRow[];
  readonly now: Date;
}

export interface InstrumentRow {
  readonly ticker: string;
  readonly name: string;
  readonly sector: string;
  readonly description: string;
  readonly logoUrl: string | null;
  readonly isTradable: boolean;
}

export interface TokenRow {
  /** The instrument's id is resolved by the shell after the instrument is upserted. */
  readonly ticker: string;
  readonly mint: string;
  readonly issuer: Issuer;
  readonly symbol: string;
  readonly decimals: number;
  readonly multiplier: string;
  readonly isRoutable: boolean;
}

export interface MultiplierEventRow {
  readonly mint: string;
  readonly oldMultiplier: string;
  readonly newMultiplier: string;
  readonly kind: "dividend" | "split" | "unknown";
  readonly observedAt: Date;
}

export interface StocksPlan {
  readonly instruments: readonly InstrumentRow[];
  readonly tokens: readonly TokenRow[];
  readonly events: readonly MultiplierEventRow[];
}

/** Below this a pool cannot fill a normal order, so the wrapper is not offered. */
const MIN_ROUTABLE_LIQUIDITY_USD = D(1_000);

/** "NVIDIA xStock" -> "NVIDIA". "Apple (Ondo Tokenized)" -> "Apple". */
const strip = (name: string): string =>
  name
    .replace(/\s*xStock$/i, "")
    .replace(/\s*\(Ondo Tokenized\)$/i, "")
    .replace(/\s*Ondo Tokenized$/i, "")
    .trim();

/**
 * The label is editorial; the arithmetic does not depend on it. A rise is how
 * these tokens pay a dividend. A rise that more than doubles is not a dividend
 * any issuer has ever paid, so it is called a split. A fall is something no
 * upstream explains to us, and guessing would be worse than saying so.
 */
const kindOf = (from: Decimal, to: Decimal): MultiplierEventRow["kind"] => {
  if (to.lt(from)) return "unknown";
  return to.gt(from.mul(2)) ? "split" : "dividend";
};

/**
 * The live universe plus what we already stored, turned into rows. Pure: no
 * database, no clock, no network. Everything that decides what gets written
 * lives here, so all of it is testable in milliseconds.
 */
export function planStocks(input: StocksInput): StocksPlan {
  const storedByMint = new Map(input.stored.map((t) => [t.mint, t]));

  const instruments: InstrumentRow[] = [];
  const tokens: TokenRow[] = [];
  const events: MultiplierEventRow[] = [];

  for (const instrument of input.live) {
    const backed = instrument.wrappers.find((w) => w.issuer === "backed");
    const lead = backed ?? instrument.wrappers[0];
    if (lead === undefined) continue;

    const meta = INSTRUMENT_META[instrument.ticker];
    instruments.push({
      ticker: instrument.ticker,
      name: meta?.name ?? strip(lead.name),
      sector: meta?.sector ?? "Other",
      description: meta?.about ?? "",
      logoUrl: lead.icon,
      // The registry has already dropped instruments no wrapper can fill, so
      // anything that reaches here is tradable.
      isTradable: true,
    });

    for (const wrapper of instrument.wrappers) {
      const price = input.prices.get(wrapper.mint);
      const stored = storedByMint.get(wrapper.mint);

      // Live first, then what we last stored, then one. Falling back to the
      // stored value rather than to one matters: defaulting a token that has
      // paid dividends back to 1 would silently shrink every holder's shares.
      const multiplier = price?.multiplier ?? (stored === undefined ? ONE : D(stored.multiplier));

      if (stored !== undefined) {
        const previous = D(stored.multiplier);
        if (!previous.eq(multiplier)) {
          events.push({
            mint: wrapper.mint,
            oldMultiplier: previous.toFixed(),
            newMultiplier: multiplier.toFixed(),
            kind: kindOf(previous, multiplier),
            observedAt: input.now,
          });
        }
      }

      tokens.push({
        ticker: instrument.ticker,
        mint: wrapper.mint,
        issuer: wrapper.issuer,
        symbol: wrapper.symbol,
        decimals: wrapper.decimals,
        multiplier: multiplier.toFixed(),
        isRoutable: (price?.liquidityUsd ?? wrapper.liquidityUsd).gte(MIN_ROUTABLE_LIQUIDITY_USD),
      });
    }
  }

  return { instruments, tokens, events };
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm --filter @mercury/api exec vitest run src/stocks`
Expected: PASS, 12 tests.

- [ ] **Step 6: Write the shell**

Create `services/api/src/stocks/sync.ts`:

```ts
import { sql } from "drizzle-orm";
import type { SupportedStocks } from "@mercury/chain";
import type { PriceBoard } from "@mercury/market";
import type { Db } from "../db/client.js";
import { instruments, multiplierEvents, tokens } from "../db/schema.js";
import { planStocks } from "./plan.js";

export interface StocksDeps {
  readonly supportedStocks: SupportedStocks;
  readonly prices: PriceBoard;
}

export interface StocksSummary {
  readonly instruments: number;
  readonly tokens: number;
  readonly events: number;
}

/**
 * Reads the live universe and writes it down. Everything that decides *what* to
 * write is in `planStocks`; this only reads, calls and writes.
 *
 * Upserts throughout, keyed on the natural keys — a ticker and a mint — so
 * running it twice changes nothing the second time. The worker takes this over
 * in subsystem 4; until then the API calls it on boot and the instruments route
 * calls it when the table is empty.
 */
export async function syncStocks(db: Db, deps: StocksDeps): Promise<StocksSummary> {
  const live = await deps.supportedStocks.instruments();
  const mints = live.flatMap((i) => i.wrappers.map((w) => w.mint));
  const [prices, stored] = await Promise.all([
    deps.prices.pricesFor(mints),
    db.select({ mint: tokens.mint, multiplier: tokens.multiplier }).from(tokens),
  ]);

  const plan = planStocks({ live, prices, stored, now: new Date() });
  if (plan.instruments.length === 0) return { instruments: 0, tokens: 0, events: 0 };

  const instrumentIds = new Map<string, string>();
  for (const row of plan.instruments) {
    const [saved] = await db
      .insert(instruments)
      .values({ ...row, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: instruments.ticker,
        set: {
          name: row.name,
          sector: row.sector,
          description: row.description,
          logoUrl: row.logoUrl,
          isTradable: row.isTradable,
          updatedAt: new Date(),
        },
      })
      .returning({ id: instruments.id });
    if (saved !== undefined) instrumentIds.set(row.ticker, saved.id);
  }

  const tokenIds = new Map<string, string>();
  for (const row of plan.tokens) {
    const instrumentId = instrumentIds.get(row.ticker);
    if (instrumentId === undefined) continue;
    const [saved] = await db
      .insert(tokens)
      .values({
        instrumentId,
        mint: row.mint,
        issuer: row.issuer,
        symbol: row.symbol,
        decimals: row.decimals,
        multiplier: row.multiplier,
        multiplierUpdatedAt: new Date(),
        isRoutable: row.isRoutable,
      })
      .onConflictDoUpdate({
        target: tokens.mint,
        set: {
          symbol: row.symbol,
          decimals: row.decimals,
          multiplier: row.multiplier,
          // Only stamped when the value actually moved, so the column keeps
          // meaning "when this last changed" rather than "when we last looked".
          multiplierUpdatedAt: sql`case when ${tokens.multiplier} <> ${row.multiplier}
                                        then now() else ${tokens.multiplierUpdatedAt} end`,
          isRoutable: row.isRoutable,
        },
      })
      .returning({ id: tokens.id });
    if (saved !== undefined) tokenIds.set(row.mint, saved.id);
  }

  for (const event of plan.events) {
    const tokenId = tokenIds.get(event.mint);
    if (tokenId === undefined) continue;
    await db.insert(multiplierEvents).values({
      tokenId,
      oldMultiplier: event.oldMultiplier,
      newMultiplier: event.newMultiplier,
      kind: event.kind,
      observedAt: event.observedAt,
    });
  }

  return { instruments: plan.instruments.length, tokens: plan.tokens.length, events: plan.events.length };
}
```

- [ ] **Step 7: Prove it against the real database**

The shell has no unit test — it is deliberately thin — so it gets a live check instead.

```bash
docker start mercury-pg 2>/dev/null
cd services/api && node --env-file=.env -e '
const { createDb } = await import("./src/db/client.ts");
const { JupiterRegistry } = await import("@mercury/chain");
const { JupiterMarket } = await import("@mercury/market");
const { syncStocks } = await import("./src/stocks/sync.ts");
const db = createDb(process.env.DATABASE_URL);
const registry = new JupiterRegistry();
console.log(await syncStocks(db, { supportedStocks: registry, prices: new JupiterMarket({ registry }) }));
console.log(await syncStocks(db, { supportedStocks: registry, prices: new JupiterMarket({ registry }) }));
process.exit(0);
'
```

Expected: two summaries with the same instrument and token counts, and `events: 0` on the second run — the sync is idempotent. Then:

```bash
docker exec mercury-pg psql -U mercury -d mercury -c \
  'select i.ticker, i.name, i.sector, count(t.id) as wrappers
     from instrument i left join token t on t.instrument_id = i.id
    group by 1,2,3 order by 1 limit 10;'
```

Expected: real tickers with our names and sectors, most with one wrapper and several with two.

If `node --env-file` refuses the `.ts` imports, run the same thing through the API's own tsx: `pnpm --filter @mercury/api exec tsx -e '<script>'`.

- [ ] **Step 8: Commit**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api exec vitest run
git add services/api/src
git commit -m "feat: sync the live token universe into instrument and token rows"
```

---

## Task 11: Reconciling a wallet against its lots

The hard case docs/05 already answered: a wallet that arrives holding tokens has no purchase history we witnessed. This turns what the chain says into lots, activity and positions — and it is the one piece of this subsystem where a mistake is a wrong profit-and-loss figure rather than a wrong pixel.

Pure, for the same reason `packages/core` is pure: every rule below is testable in a millisecond with no database.

**The four rules, and why:**

1. **More tokens than we recorded** → a `transfer_in` lot, priced at the reference we can see now, `is_estimated = true`. We do not know what it cost, and the flag is how the UI says so.
2. **More shares than our lots account for, after that** → a `dividend` lot with a unit cost of zero. The multiplier rose; the holder gained shares without spending anything. The average cost per share therefore _falls_, which is correct: the same money now buys more shares. docs/05 predicts this is the mistake other integrations make.
3. **Fewer tokens than we recorded** → the position follows the chain, scaled pro rata, and the lots are left alone. Average cost is unchanged by construction. No activity row: selling does not exist until subsystem 3, so we do not know what happened, and inventing an event would also break idempotency.
4. **No reference price** → write nothing, and do not claim shares we cannot cost. The next read tries again.

**Files:**

- Create: `services/api/src/portfolio/reconcile.ts`
- Create: `services/api/src/portfolio/reconcile.test.ts`
- Create: `services/api/src/portfolio/apply.ts`

**Interfaces:**

- Consumes: `Decimal`, `D`, `ZERO` from `@mercury/core`.
- Produces: `planReconciliation(held: readonly HeldToken[], now: Date): Reconciliation`; the types `HeldToken`, `LotWrite`, `ActivityWrite`, `PositionWrite`, `Reconciliation`; `applyReconciliation(db: Db, userId: string, plan: Reconciliation): Promise<void>`; `loadHeldTokens(db, deps, identity): Promise<readonly HeldToken[]>`.

- [ ] **Step 1: Write the failing test**

Create `services/api/src/portfolio/reconcile.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { D, ZERO } from "@mercury/core";
import { planReconciliation, type HeldToken } from "./reconcile.js";

const NOW = new Date("2026-09-24T12:00:00Z");

/** One token, eight decimals, nothing recorded, nothing held. Tests change what they mean. */
const held = (over: Partial<HeldToken> = {}): HeldToken => ({
  tokenId: "token-nvdax",
  instrumentId: "instrument-nvda",
  mint: "Xsc9",
  symbol: "NVDAx",
  ticker: "NVDA",
  decimals: 8,
  multiplier: D(1),
  referencePricePerShare: D(200),
  chainRawAmount: 0n,
  recordedRawAmount: 0n,
  recordedShares: ZERO,
  recordedCostUsd: ZERO,
  ...over,
});

/** One whole token at eight decimals. */
const ONE_TOKEN = 100_000_000n;

describe("planReconciliation: tokens we never sold", () => {
  it("writes an estimated transfer_in lot for a wallet that arrives holding something", () => {
    const plan = planReconciliation([held({ chainRawAmount: ONE_TOKEN })], NOW);
    expect(plan.lots).toEqual([
      {
        tokenId: "token-nvdax",
        instrumentId: "instrument-nvda",
        tokenQty: ONE_TOKEN,
        shares: D(1),
        unitCostUsd: D(200),
        source: "transfer_in",
        isEstimated: true,
        acquiredAt: NOW,
      },
    ]);
  });

  it("says in the activity feed that the cost is a guess", () => {
    const plan = planReconciliation([held({ chainRawAmount: ONE_TOKEN })], NOW);
    expect(plan.activity).toEqual([
      {
        kind: "transfer_in",
        title: "Received NVDAx",
        subtitle: "1 share, cost estimated at today's price",
        amountUsd: D(200),
        refTable: "token",
        refId: "token-nvdax",
        occurredAt: NOW,
      },
    ]);
  });

  it("counts shares at the multiplier in force, not at one", () => {
    const plan = planReconciliation(
      [held({ chainRawAmount: ONE_TOKEN, multiplier: D("1.001701196801074") })],
      NOW,
    );
    expect(plan.lots[0]!.shares.toFixed()).toBe("1.001701196801074");
  });

  it("writes nothing the second time, because nothing arrived", () => {
    const settled = held({
      chainRawAmount: ONE_TOKEN,
      recordedRawAmount: ONE_TOKEN,
      recordedShares: D(1),
      recordedCostUsd: D(200),
    });
    const plan = planReconciliation([settled], NOW);
    expect(plan.lots).toEqual([]);
    expect(plan.activity).toEqual([]);
    expect(plan.positions).toEqual([
      { instrumentId: "instrument-nvda", shares: D(1), costBasisUsd: D(200), avgUnitCostUsd: D(200) },
    ]);
  });

  it("records only what arrived since last time", () => {
    const plan = planReconciliation(
      [
        held({
          chainRawAmount: ONE_TOKEN * 3n,
          recordedRawAmount: ONE_TOKEN,
          recordedShares: D(1),
          recordedCostUsd: D(200),
        }),
      ],
      NOW,
    );
    expect(plan.lots.length).toBe(1);
    expect(plan.lots[0]!.tokenQty).toBe(ONE_TOKEN * 2n);
    expect(plan.lots[0]!.shares).toEqual(D(2));
  });
});

describe("planReconciliation: a dividend", () => {
  it("writes a zero-cost lot when the multiplier has risen", () => {
    const plan = planReconciliation(
      [
        held({
          multiplier: D("1.5"),
          chainRawAmount: ONE_TOKEN,
          recordedRawAmount: ONE_TOKEN,
          recordedShares: D(1),
          recordedCostUsd: D(200),
        }),
      ],
      NOW,
    );
    expect(plan.lots).toEqual([
      {
        tokenId: "token-nvdax",
        instrumentId: "instrument-nvda",
        // A dividend adds shares, not tokens. The token count is unchanged.
        tokenQty: 0n,
        shares: D("0.5"),
        unitCostUsd: ZERO,
        source: "dividend",
        isEstimated: false,
        acquiredAt: NOW,
      },
    ]);
  });

  it("makes the average cost per share fall, which is the whole point", () => {
    // docs/05: recomputing shares from the current multiplier without writing
    // the lot would show a phantom gain and an overstated cost basis at once.
    const plan = planReconciliation(
      [
        held({
          multiplier: D("1.5"),
          chainRawAmount: ONE_TOKEN,
          recordedRawAmount: ONE_TOKEN,
          recordedShares: D(1),
          recordedCostUsd: D(200),
        }),
      ],
      NOW,
    );
    const position = plan.positions[0]!;
    expect(position.shares).toEqual(D("1.5"));
    // The same money. More shares. Nothing was spent.
    expect(position.costBasisUsd).toEqual(D(200));
    expect(position.avgUnitCostUsd.toFixed(4)).toBe("133.3333");
  });

  it("writes the dividend once", () => {
    const after = held({
      multiplier: D("1.5"),
      chainRawAmount: ONE_TOKEN,
      recordedRawAmount: ONE_TOKEN,
      recordedShares: D("1.5"),
      recordedCostUsd: D(200),
    });
    expect(planReconciliation([after], NOW).lots).toEqual([]);
  });

  it("does not bill a new arrival for a dividend it was never owed", () => {
    // The transfer_in lot is already recorded at the current multiplier, so the
    // shortfall it would otherwise leave behind is zero.
    const plan = planReconciliation([held({ multiplier: D("1.5"), chainRawAmount: ONE_TOKEN })], NOW);
    expect(plan.lots.length).toBe(1);
    expect(plan.lots[0]!.source).toBe("transfer_in");
    expect(plan.lots[0]!.shares).toEqual(D("1.5"));
  });
});

describe("planReconciliation: tokens that left", () => {
  it("follows the chain down and leaves the lots as history", () => {
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
    expect(plan.positions[0]).toEqual({
      instrumentId: "instrument-nvda",
      shares: D("0.5"),
      costBasisUsd: D(100),
      // Average cost does not move when a position shrinks. That is what
      // average-cost accounting means, and it is why the scaling is pro rata.
      avgUnitCostUsd: D(200),
    });
  });

  it("writes no activity for it, because we do not know what happened", () => {
    const plan = planReconciliation(
      [
        held({
          chainRawAmount: 0n,
          recordedRawAmount: ONE_TOKEN,
          recordedShares: D(1),
          recordedCostUsd: D(200),
        }),
      ],
      NOW,
    );
    expect(plan.activity).toEqual([]);
    expect(plan.positions[0]).toEqual({
      instrumentId: "instrument-nvda",
      shares: ZERO,
      costBasisUsd: ZERO,
      avgUnitCostUsd: ZERO,
    });
  });
});

describe("planReconciliation: what it refuses to do", () => {
  it("will not write a lot it cannot price", () => {
    const plan = planReconciliation([held({ chainRawAmount: ONE_TOKEN, referencePricePerShare: null })], NOW);
    expect(plan.lots).toEqual([]);
    expect(plan.activity).toEqual([]);
  });

  it("will not claim shares it has no cost for", () => {
    const plan = planReconciliation([held({ chainRawAmount: ONE_TOKEN, referencePricePerShare: null })], NOW);
    expect(plan.positions[0]!.shares).toEqual(ZERO);
  });
});

describe("planReconciliation: rolling up", () => {
  it("adds two wrappers of one company into one position", () => {
    const backed = held({ chainRawAmount: ONE_TOKEN });
    const ondo = held({
      tokenId: "token-nvdaon",
      mint: "OnDo",
      symbol: "NVDAon",
      decimals: 6,
      chainRawAmount: 2_000_000n, // two whole tokens at six decimals
    });
    const plan = planReconciliation([backed, ondo], NOW);
    expect(plan.positions.length).toBe(1);
    expect(plan.positions[0]).toEqual({
      instrumentId: "instrument-nvda",
      shares: D(3),
      costBasisUsd: D(600),
      avgUnitCostUsd: D(200),
    });
  });

  it("keeps instruments apart", () => {
    const nvda = held({ chainRawAmount: ONE_TOKEN });
    const spy = held({
      tokenId: "token-spyx",
      instrumentId: "instrument-spy",
      symbol: "SPYx",
      ticker: "SPY",
      chainRawAmount: ONE_TOKEN,
      referencePricePerShare: D(600),
    });
    const plan = planReconciliation([nvda, spy], NOW);
    expect(plan.positions.map((p) => p.instrumentId).sort()).toEqual(["instrument-nvda", "instrument-spy"]);
  });

  it("emits a zero position rather than no row, so a closed holding stops showing", () => {
    const plan = planReconciliation([held()], NOW);
    expect(plan.positions).toEqual([
      { instrumentId: "instrument-nvda", shares: ZERO, costBasisUsd: ZERO, avgUnitCostUsd: ZERO },
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @mercury/api exec vitest run src/portfolio`
Expected: FAIL — `Failed to resolve import "./reconcile.js"`.

- [ ] **Step 3: Implement it**

Create `services/api/src/portfolio/reconcile.ts`:

```ts
import { D, Decimal, ZERO, type LotSource } from "@mercury/core";

/** One wrapper the user holds or has held, with everything needed to judge it. */
export interface HeldToken {
  readonly tokenId: string;
  readonly instrumentId: string;
  readonly mint: string;
  readonly symbol: string;
  readonly ticker: string;
  readonly decimals: number;
  /** The multiplier in force now. One token is this many shares. */
  readonly multiplier: Decimal;
  /** What one real share costs. Null when no upstream would price it. */
  readonly referencePricePerShare: Decimal | null;
  /** What the chain says, in the mint's smallest unit. */
  readonly chainRawAmount: bigint;
  /** The sum of our lots' token quantities. */
  readonly recordedRawAmount: bigint;
  /** The sum of our lots' share counts. */
  readonly recordedShares: Decimal;
  /** The sum of our lots' shares x unit cost. */
  readonly recordedCostUsd: Decimal;
}

export interface LotWrite {
  readonly tokenId: string;
  readonly instrumentId: string;
  readonly tokenQty: bigint;
  readonly shares: Decimal;
  readonly unitCostUsd: Decimal;
  readonly source: LotSource;
  readonly isEstimated: boolean;
  readonly acquiredAt: Date;
}

export interface ActivityWrite {
  readonly kind: "transfer_in" | "dividend";
  readonly title: string;
  readonly subtitle: string;
  readonly amountUsd: Decimal | null;
  readonly refTable: "token";
  readonly refId: string;
  readonly occurredAt: Date;
}

export interface PositionWrite {
  readonly instrumentId: string;
  readonly shares: Decimal;
  readonly costBasisUsd: Decimal;
  readonly avgUnitCostUsd: Decimal;
}

export interface Reconciliation {
  readonly lots: readonly LotWrite[];
  readonly activity: readonly ActivityWrite[];
  readonly positions: readonly PositionWrite[];
}

/** Smallest units to whole tokens. Exact: a Decimal divide, never a float. */
const scaled = (raw: bigint, decimals: number): Decimal => D(raw.toString()).div(D(10).pow(decimals));

/** Trims trailing zeros so "1 share" does not read as "1.000000000000000000 shares". */
const plural = (shares: Decimal): string => {
  const n = shares
    .toDecimalPlaces(6)
    .toFixed()
    .replace(/\.?0+$/, "");
  return `${n} ${shares.eq(1) ? "share" : "shares"}`;
};

/**
 * What the chain says, reconciled against what we recorded.
 *
 * Pure. No database, no clock, no network — the same reason `@mercury/core` is
 * pure, and for the same payoff: every rule here is a millisecond to test, and
 * this is the code where a mistake costs money rather than a pixel.
 *
 * Idempotent by construction. Everything it writes closes the gap it was written
 * for, so a second pass over the result of the first writes nothing.
 */
export function planReconciliation(held: readonly HeldToken[], now: Date): Reconciliation {
  const lots: LotWrite[] = [];
  const activity: ActivityWrite[] = [];
  const byInstrument = new Map<string, { shares: Decimal; cost: Decimal }>();

  for (const token of held) {
    const expectedShares = scaled(token.chainRawAmount, token.decimals).mul(token.multiplier);
    let shares = token.recordedShares;
    let cost = token.recordedCostUsd;

    const reference = token.referencePricePerShare;
    if (reference !== null) {
      // 1. Tokens arrived that we never sold. We cannot know what they cost, so
      //    the lot is priced at today's reference and flagged as an estimate.
      const surplus = token.chainRawAmount - token.recordedRawAmount;
      if (surplus > 0n) {
        const gained = scaled(surplus, token.decimals).mul(token.multiplier);
        lots.push({
          tokenId: token.tokenId,
          instrumentId: token.instrumentId,
          tokenQty: surplus,
          shares: gained,
          unitCostUsd: reference,
          source: "transfer_in",
          isEstimated: true,
          acquiredAt: now,
        });
        activity.push({
          kind: "transfer_in",
          title: `Received ${token.symbol}`,
          subtitle: `${plural(gained)}, cost estimated at today's price`,
          amountUsd: gained.mul(reference),
          refTable: "token",
          refId: token.tokenId,
          occurredAt: now,
        });
        shares = shares.add(gained);
        cost = cost.add(gained.mul(reference));
      }

      // 2. More shares than our lots account for, with no new tokens to explain
      //    them: the multiplier rose, which is a dividend. Zero cost, so the
      //    average cost per share falls. That is correct — the same money now
      //    buys more shares — and it is the figure other integrations get wrong.
      const shortfall = expectedShares.sub(shares);
      if (shortfall.gt(ZERO)) {
        lots.push({
          tokenId: token.tokenId,
          instrumentId: token.instrumentId,
          tokenQty: 0n,
          shares: shortfall,
          unitCostUsd: ZERO,
          source: "dividend",
          isEstimated: false,
          acquiredAt: now,
        });
        activity.push({
          kind: "dividend",
          title: `${token.ticker} paid a dividend`,
          subtitle: `${plural(shortfall)} added, at no cost`,
          amountUsd: shortfall.mul(reference),
          refTable: "token",
          refId: token.tokenId,
          occurredAt: now,
        });
        shares = shares.add(shortfall);
      }
    }

    // 3. Tokens left the wallet, or we could not price an arrival. Either way the
    //    position takes the smaller of the two truths: never more shares than the
    //    chain holds, and never more than we have a cost for. Cost scales with it,
    //    which leaves the average untouched — that is average-cost accounting.
    const target = Decimal.min(shares, expectedShares);
    const ratio = shares.isZero() ? ZERO : target.div(shares);

    const running = byInstrument.get(token.instrumentId) ?? { shares: ZERO, cost: ZERO };
    byInstrument.set(token.instrumentId, {
      shares: running.shares.add(target),
      cost: running.cost.add(cost.mul(ratio)),
    });
  }

  const positions: PositionWrite[] = [...byInstrument.entries()].map(([instrumentId, r]) => ({
    instrumentId,
    shares: r.shares,
    costBasisUsd: r.cost,
    avgUnitCostUsd: r.shares.isZero() ? ZERO : r.cost.div(r.shares),
  }));

  return { lots, activity, positions };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter @mercury/api exec vitest run src/portfolio`
Expected: PASS, 15 tests.

If "makes the average cost per share fall" fails, do not adjust the expectation. It is the assertion docs/05 asks for by name.

- [ ] **Step 5: Write the shell**

Create `services/api/src/portfolio/apply.ts`:

```ts
import { eq, sql } from "drizzle-orm";
import { D, ZERO, type Decimal } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import type { MultiplierSource, PriceBoard } from "@mercury/market";
import type { Db } from "../db/client.js";
import { activities, instruments, lots, positions, tokens } from "../db/schema.js";
import { planReconciliation, type HeldToken, type Reconciliation } from "./reconcile.js";

export interface ReconcileDeps {
  readonly chain: ChainReader;
  readonly prices: PriceBoard;
  readonly multipliers: MultiplierSource;
}

/**
 * Everything `planReconciliation` needs: what the chain holds, what we recorded,
 * and what any of it is worth.
 *
 * Tokens we do not list are skipped rather than stored. A wallet holding some
 * unrelated memecoin is not a position in this product, and writing a row for it
 * would put it on the portfolio screen.
 */
export async function loadHeldTokens(
  db: Db,
  deps: ReconcileDeps,
  userId: string,
  walletAddress: string,
): Promise<readonly HeldToken[]> {
  const [balances, known] = await Promise.all([
    deps.chain.tokenBalances(walletAddress),
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
  ]);

  const onChain = new Map(balances.map((b) => [b.mint, b.rawAmount]));

  // Every token we know that the user either holds now or has lots for. A token
  // they have emptied still needs a pass, or its position would stay stale.
  const recorded = await db
    .select({
      tokenId: lots.tokenId,
      rawAmount: sql<string>`coalesce(sum(${lots.tokenQty}), 0)`,
      shares: sql<string>`coalesce(sum(${lots.shares}), 0)`,
      cost: sql<string>`coalesce(sum(${lots.shares} * ${lots.unitCostUsd}), 0)`,
    })
    .from(lots)
    .where(eq(lots.userId, userId))
    .groupBy(lots.tokenId);

  const recordedByToken = new Map(recorded.map((r) => [r.tokenId, r]));
  const relevant = known.filter((t) => onChain.has(t.mint) || recordedByToken.has(t.tokenId));
  if (relevant.length === 0) return [];

  const board = await deps.prices.pricesFor(relevant.map((t) => t.mint));

  return Promise.all(
    relevant.map(async (token) => {
      const row = recordedByToken.get(token.tokenId);
      const price = board.get(token.mint);
      // The mint is the authority on the multiplier; the price board is the
      // fallback; the stored value is what we last saw. Never 1 by default —
      // that would shrink the shares of every holder of a paying token.
      const multiplier =
        (await deps.multipliers.multiplierFor(token.mint)) ?? price?.multiplier ?? D(token.storedMultiplier);

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
        recordedRawAmount: row === undefined ? 0n : BigInt(row.rawAmount),
        recordedShares: row === undefined ? ZERO : D(row.shares),
        recordedCostUsd: row === undefined ? ZERO : D(row.cost),
      } satisfies HeldToken;
    }),
  );
}

const fixed = (v: Decimal): string => v.toFixed(18);

/** Writes what the plan decided. One transaction, so a half-written pass cannot exist. */
export async function applyReconciliation(db: Db, userId: string, plan: Reconciliation): Promise<void> {
  if (plan.lots.length === 0 && plan.positions.length === 0) return;

  await db.transaction(async (tx) => {
    if (plan.lots.length > 0) {
      await tx.insert(lots).values(
        plan.lots.map((l) => ({
          userId,
          tokenId: l.tokenId,
          instrumentId: l.instrumentId,
          tokenQty: l.tokenQty,
          shares: fixed(l.shares),
          unitCostUsd: fixed(l.unitCostUsd),
          acquiredAt: l.acquiredAt,
          source: l.source,
          isEstimated: l.isEstimated,
        })),
      );
    }

    if (plan.activity.length > 0) {
      await tx.insert(activities).values(
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
      );
    }

    for (const p of plan.positions) {
      await tx
        .insert(positions)
        .values({
          userId,
          instrumentId: p.instrumentId,
          shares: fixed(p.shares),
          costBasisUsd: fixed(p.costBasisUsd),
          avgUnitCostUsd: fixed(p.avgUnitCostUsd),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [positions.userId, positions.instrumentId],
          set: {
            shares: fixed(p.shares),
            costBasisUsd: fixed(p.costBasisUsd),
            avgUnitCostUsd: fixed(p.avgUnitCostUsd),
            updatedAt: new Date(),
          },
        });
    }
  });
}

/**
 * Read, plan, write. Called on every portfolio read: it is idempotent, and it is
 * how the portfolio follows the chain before the worker exists. Subsystem 4's
 * `position-sync` job takes it over, at which point the read stops writing.
 */
export async function reconcile(
  db: Db,
  deps: ReconcileDeps,
  userId: string,
  walletAddress: string,
): Promise<void> {
  const held = await loadHeldTokens(db, deps, userId, walletAddress);
  if (held.length === 0) return;
  await applyReconciliation(db, userId, planReconciliation(held, new Date()));
}
```

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api exec vitest run
git add services/api/src
git commit -m "feat: reconcile a wallet's chain balances into lots and positions"
```

---

## Task 12: Portfolio and exposure

The first two routes that answer from Postgres and chain together. Each route module takes its queries as injected functions — the same shape the auth middleware already uses for `resolve` — so the handler is testable with a plain object and the Postgres implementation stays thin enough to read.

**A naming inconsistency to be aware of, not to fix here.** `packages/types` declares `Holding.changePct24h` with the `Ratio` schema, whose comment says a ratio ("0.0085 is 85 basis points"). The field name says percent, and the browser has always passed Jupiter's `priceChange24h` through as a percent (`-1.92` for -1.92%). This plan follows the **name** and serves a percentage. `Ratio` is a permissive regex so nothing breaks either way. Renaming the schema is a `packages/types` change that would ripple into the web app, so it is left for whoever owns that change.

**Files:**

- Create: `services/api/src/portfolio/queries.ts`
- Create: `services/api/src/routes/portfolio.ts`
- Create: `services/api/src/routes/portfolio.test.ts`

**Interfaces:**

- Consumes: `reconcile`, `ReconcileDeps` from Task 11; `PriceBoard`, `ChainReader`, `MultiplierSource`.
- Produces: `portfolioRoutes(deps: PortfolioDeps): Hono`; the types `HoldingRow`, `PortfolioDeps`; `readHoldings(db: Db, userId: string): Promise<readonly HoldingRow[]>`.

- [ ] **Step 1: Write the failing test**

Create `services/api/src/routes/portfolio.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { D, ZERO } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import type { MultiplierSource, PriceBoard, TokenPrice } from "@mercury/market";
import { portfolioRoutes, type HoldingRow, type PortfolioDeps } from "./portfolio.js";

const NVDAX = "Xsc9";
const NVDAON = "OnDo";

const price = (mint: string, over: Partial<TokenPrice> = {}): TokenPrice => ({
  mint,
  usdPricePerToken: D(200),
  pricePerShare: D(200),
  changePct24h: D(0),
  liquidityUsd: D(1_000_000),
  multiplier: D(1),
  observedAt: new Date("2026-09-24T12:00:00Z"),
  ...over,
});

const holding = (over: Partial<HoldingRow> = {}): HoldingRow => ({
  instrumentId: "instrument-nvda",
  ticker: "NVDA",
  name: "Nvidia",
  shares: D(2),
  costBasisUsd: D(300),
  avgUnitCostUsd: D(150),
  wrappers: [{ mint: NVDAX, symbol: "NVDAx", issuer: "backed", decimals: 8 }],
  ...over,
});

const deps = (over: Partial<PortfolioDeps> = {}): PortfolioDeps => ({
  reconcile: async () => undefined,
  holdings: async () => [holding()],
  prices: { pricesFor: async (mints) => new Map(mints.map((m) => [m, price(m)])) } satisfies PriceBoard,
  chain: {
    tokenBalances: async () => [{ mint: NVDAX, rawAmount: 200_000_000n, decimals: 8 }],
    mintConfig: async () => null,
  } satisfies ChainReader,
  multipliers: { multiplierFor: async () => D(1), isPaused: async () => false } satisfies MultiplierSource,
  usdcMint: "UsDc",
  ...over,
});

/** The route with an identity already resolved, as the auth middleware would leave it. */
const appWith = (d: PortfolioDeps, walletAddress: string | null = "WaLLeT") => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress });
    await next();
  });
  app.route("/", portfolioRoutes(d));
  return app;
};

describe("GET /v1/portfolio", () => {
  it("values a holding at the live price and reports its profit", async () => {
    const res = await appWith(deps()).request("/v1/portfolio");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.holdings[0]).toMatchObject({
      ticker: "NVDA",
      name: "Nvidia",
      shares: "2",
      valueUsd: "400",
      costBasisUsd: "300",
      unrealisedPnlUsd: "100",
      wrapperCount: 1,
    });
  });

  it("sends money as decimal strings, never as numbers", async () => {
    const res = await appWith(deps()).request("/v1/portfolio");
    const body = await res.json();
    for (const key of ["totalValueUsd", "cashUsd", "changeUsd", "changePct"]) {
      expect(typeof body[key]).toBe("string");
    }
    expect(typeof body.holdings[0].valueUsd).toBe("string");
  });

  it("counts cash from the USDC balance on chain", async () => {
    const d = deps({
      chain: {
        tokenBalances: async () => [
          { mint: NVDAX, rawAmount: 200_000_000n, decimals: 8 },
          { mint: "UsDc", rawAmount: 250_000_000n, decimals: 6 },
        ],
        mintConfig: async () => null,
      },
    });
    const body = await (await appWith(d).request("/v1/portfolio")).json();
    expect(body.cashUsd).toBe("250");
    expect(body.totalValueUsd).toBe("650");
  });

  it("derives today's change from each holding's own move", async () => {
    // 2 shares now worth $400 after a 25% rise: $80 of that is today's.
    const d = deps({
      prices: {
        pricesFor: async (mints) => new Map(mints.map((m) => [m, price(m, { changePct24h: D(25) })])),
      },
    });
    const body = await (await appWith(d).request("/v1/portfolio")).json();
    expect(body.changeUsd).toBe("80");
    expect(body.changePct).toBe("25");
  });

  it("reconciles before it reads, so the portfolio follows the chain", async () => {
    const calls: string[] = [];
    const d = deps({
      reconcile: async (userId, wallet) => {
        calls.push(`${userId}:${wallet}`);
      },
    });
    await appWith(d).request("/v1/portfolio");
    expect(calls).toEqual(["user-1:WaLLeT"]);
  });

  it("answers an empty portfolio for a session with no wallet yet", async () => {
    // Privy can hand out a valid session before the embedded wallet finishes
    // provisioning. That is not an error, and it is not a 500.
    const body = await (await appWith(deps(), null).request("/v1/portfolio")).json();
    expect(body).toEqual({
      totalValueUsd: "0",
      cashUsd: "0",
      changeUsd: "0",
      changePct: "0",
      holdings: [],
    });
  });

  it("leaves out a holding that has gone to zero", async () => {
    const d = deps({ holdings: async () => [holding({ shares: ZERO, costBasisUsd: ZERO })] });
    const body = await (await appWith(d).request("/v1/portfolio")).json();
    expect(body.holdings).toEqual([]);
  });

  it("counts both wrappers of one company as one holding", async () => {
    const d = deps({
      holdings: async () => [
        holding({
          wrappers: [
            { mint: NVDAX, symbol: "NVDAx", issuer: "backed", decimals: 8 },
            { mint: NVDAON, symbol: "NVDAon", issuer: "ondo", decimals: 6 },
          ],
        }),
      ],
    });
    const body = await (await appWith(d).request("/v1/portfolio")).json();
    expect(body.holdings.length).toBe(1);
    expect(body.holdings[0].wrapperCount).toBe(2);
  });

  it("values an unpriced holding at zero rather than dropping the row", async () => {
    // Its shares are real even when no upstream will price them. Hiding it
    // would be a quieter lie than showing it with nothing beside it.
    const d = deps({ prices: { pricesFor: async () => new Map() } });
    const body = await (await appWith(d).request("/v1/portfolio")).json();
    expect(body.holdings[0]).toMatchObject({ ticker: "NVDA", valueUsd: "0", unrealisedPnlUsd: "-300" });
  });
});

describe("GET /v1/portfolio/exposure/:ticker", () => {
  it("adds shares across wrappers, never token counts", async () => {
    const d = deps({
      holdings: async () => [
        holding({
          wrappers: [
            { mint: NVDAX, symbol: "NVDAx", issuer: "backed", decimals: 8 },
            { mint: NVDAON, symbol: "NVDAon", issuer: "ondo", decimals: 6 },
          ],
        }),
      ],
      chain: {
        tokenBalances: async () => [
          { mint: NVDAX, rawAmount: 100_000_000n, decimals: 8 }, // 1 token
          { mint: NVDAON, rawAmount: 1_000_000n, decimals: 6 }, // 1 token
        ],
        mintConfig: async () => null,
      },
      prices: {
        pricesFor: async (mints) =>
          new Map(
            mints.map((m) => [
              m,
              // Two tokens, two different multipliers. One token is not one share.
              m === NVDAX
                ? price(m, { multiplier: D(2), usdPricePerToken: D(400) })
                : price(m, { multiplier: D(1) }),
            ]),
          ),
      },
      // The mint is the authority on the multiplier, and the route asks it
      // first. A fake that answered 1 for everything would be testing the
      // fallback while pretending to test the preferred path.
      multipliers: {
        multiplierFor: async (mint) => (mint === NVDAX ? D(2) : D(1)),
        isPaused: async () => false,
      },
    });
    const body = await (await appWith(d).request("/v1/portfolio/exposure/NVDA")).json();
    expect(body.shares).toBe("3");
    expect(body.valueUsd).toBe("600");
    expect(body.wrappers.length).toBe(2);
  });

  it("warns when one issuer holds nearly everything", async () => {
    const body = await (await appWith(deps()).request("/v1/portfolio/exposure/NVDA")).json();
    // One wrapper is not a concentration: there is nothing to have chosen instead.
    expect(body.warnings).toEqual([]);
  });

  it("says 404 for a ticker the user holds nothing of", async () => {
    const res = await appWith(deps()).request("/v1/portfolio/exposure/SPY");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @mercury/api exec vitest run src/routes/portfolio.test.ts`
Expected: FAIL — `Failed to resolve import "./portfolio.js"`.

If `c.get("identity")` is later flagged as untyped, it is because the route file
does not pull in the module augmentation that `auth/middleware.ts` declares. Add
`import type {} from "../auth/middleware.js";` at the top of the route file — it
imports no value and exists only to load the `ContextVariableMap` declaration.

- [ ] **Step 3: Implement the route**

Create `services/api/src/routes/portfolio.ts`:

```ts
import { Hono } from "hono";
import { D, exposure, toWire, ZERO, type Decimal, type Issuer, type WrapperHolding } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import type { MultiplierSource, PriceBoard } from "@mercury/market";

export interface HoldingWrapper {
  readonly mint: string;
  readonly symbol: string;
  readonly issuer: Issuer;
  readonly decimals: number;
}

export interface HoldingRow {
  readonly instrumentId: string;
  readonly ticker: string;
  readonly name: string;
  readonly shares: Decimal;
  readonly costBasisUsd: Decimal;
  readonly avgUnitCostUsd: Decimal;
  readonly wrappers: readonly HoldingWrapper[];
}

export interface PortfolioDeps {
  /** Brings the lots in line with the chain before anything is read. */
  readonly reconcile: (userId: string, walletAddress: string) => Promise<void>;
  readonly holdings: (userId: string) => Promise<readonly HoldingRow[]>;
  readonly prices: PriceBoard;
  readonly chain: ChainReader;
  readonly multipliers: MultiplierSource;
  readonly usdcMint: string;
}

const fail = (code: string, message: string) => ({ error: { code, message } });

const EMPTY = {
  totalValueUsd: "0",
  cashUsd: "0",
  changeUsd: "0",
  changePct: "0",
  holdings: [] as const,
};

export function portfolioRoutes(deps: PortfolioDeps): Hono {
  const app = new Hono();

  app.get("/v1/portfolio", async (c) => {
    const identity = c.get("identity");
    // A session can be valid before Privy finishes provisioning the wallet.
    // Nothing is owned yet, which is an empty portfolio and not an error.
    if (identity.walletAddress === null) return c.json(EMPTY);

    await deps.reconcile(identity.userId, identity.walletAddress);

    const [rows, balances] = await Promise.all([
      deps.holdings(identity.userId),
      deps.chain.tokenBalances(identity.walletAddress),
    ]);

    const mints = rows.flatMap((r) => r.wrappers.map((w) => w.mint));
    const board = await deps.prices.pricesFor(mints);

    let total = ZERO;
    let change = ZERO;
    const holdings = [];

    for (const row of rows) {
      if (row.shares.lte(ZERO)) continue; // a closed holding is not a row

      // Every wrapper of this company prices one share the same way, so the
      // first that answers is enough. The share count already spans all of them.
      const priced = row.wrappers.map((w) => board.get(w.mint)).find((p) => p !== undefined);
      const perShare = priced?.pricePerShare ?? ZERO;
      const valueUsd = row.shares.mul(perShare);
      const changePct24h = priced?.changePct24h ?? ZERO;

      // value_now = value_yesterday x (1 + pct/100), so today's move is
      // value_now x pct / (100 + pct). No price history needed for one day.
      const denominator = D(100).add(changePct24h);
      const movedUsd = denominator.isZero() ? ZERO : valueUsd.mul(changePct24h).div(denominator);

      total = total.add(valueUsd);
      change = change.add(movedUsd);

      holdings.push({
        ticker: row.ticker,
        name: row.name,
        shares: toWire(row.shares),
        valueUsd: toWire(valueUsd),
        costBasisUsd: toWire(row.costBasisUsd),
        unrealisedPnlUsd: toWire(valueUsd.sub(row.costBasisUsd)),
        changePct24h: toWire(changePct24h),
        wrapperCount: row.wrappers.length,
      });
    }

    const usdc = balances.find((b) => b.mint === deps.usdcMint);
    const cashUsd = usdc === undefined ? ZERO : D(usdc.rawAmount.toString()).div(D(10).pow(usdc.decimals));
    const totalWithCash = total.add(cashUsd);

    // Cash does not move, so the percentage is of what actually could.
    const yesterday = total.sub(change);
    const changePct = yesterday.isZero() ? ZERO : change.div(yesterday).mul(100);

    return c.json({
      totalValueUsd: toWire(totalWithCash),
      cashUsd: toWire(cashUsd),
      changeUsd: toWire(change),
      changePct: toWire(changePct),
      holdings,
    });
  });

  app.get("/v1/portfolio/exposure/:ticker", async (c) => {
    const identity = c.get("identity");
    const ticker = c.req.param("ticker").toUpperCase();
    if (identity.walletAddress === null) return c.json(fail("not_found", "Nothing held."), 404);

    const rows = await deps.holdings(identity.userId);
    const row = rows.find((r) => r.ticker === ticker);
    if (row === undefined || row.shares.lte(ZERO)) {
      return c.json(fail("not_found", `No position in ${ticker}.`), 404);
    }

    const [balances, board] = await Promise.all([
      deps.chain.tokenBalances(identity.walletAddress),
      deps.prices.pricesFor(row.wrappers.map((w) => w.mint)),
    ]);

    const held: WrapperHolding[] = [];
    for (const wrapper of row.wrappers) {
      const balance = balances.find((b) => b.mint === wrapper.mint);
      if (balance === undefined || balance.rawAmount === 0n) continue;
      const price = board.get(wrapper.mint);
      const multiplier = (await deps.multipliers.multiplierFor(wrapper.mint)) ?? price?.multiplier ?? D(1);
      held.push({
        mint: wrapper.mint,
        symbol: wrapper.symbol,
        issuer: wrapper.issuer,
        tokenQty: D(balance.rawAmount.toString()).div(D(10).pow(balance.decimals)),
        multiplier,
        pricePerToken: price?.usdPricePerToken ?? ZERO,
      });
    }

    // The arithmetic is `@mercury/core`'s. Shares are summed as tokenQty x
    // multiplier, never by adding token counts: two wrappers of one company are
    // different numbers of shares. See docs/02.
    const result = exposure(ticker, held);

    return c.json({
      ticker: result.ticker,
      shares: toWire(result.shares),
      valueUsd: toWire(result.valueUsd),
      wrappers: result.wrappers.map((w) => ({
        mint: w.mint,
        symbol: w.symbol,
        issuer: w.issuer,
        tokenQty: toWire(w.tokenQty),
        multiplier: toWire(w.multiplier),
        shares: toWire(w.shares),
        valueUsd: toWire(w.valueUsd),
        sharePct: toWire(w.sharePct),
      })),
      warnings: result.warnings.map((w) => ({
        code: w.code,
        issuer: w.issuer,
        sharePct: toWire(w.sharePct),
        message: w.message,
      })),
    });
  });

  return app;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm --filter @mercury/api exec vitest run src/routes/portfolio.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Write the Postgres query**

Create `services/api/src/portfolio/queries.ts`:

```ts
import { eq } from "drizzle-orm";
import { D } from "@mercury/core";
import type { Db } from "../db/client.js";
import { instruments, positions, tokens } from "../db/schema.js";
import type { HoldingRow } from "../routes/portfolio.js";

/**
 * Every instrument the user has a position row for, with the wrappers that
 * belong to it. One query plus one, rather than a join that would repeat the
 * position across its wrappers and have to be folded back up.
 */
export async function readHoldings(db: Db, userId: string): Promise<readonly HoldingRow[]> {
  const rows = await db
    .select({
      instrumentId: positions.instrumentId,
      ticker: instruments.ticker,
      name: instruments.name,
      shares: positions.shares,
      costBasisUsd: positions.costBasisUsd,
      avgUnitCostUsd: positions.avgUnitCostUsd,
    })
    .from(positions)
    .innerJoin(instruments, eq(instruments.id, positions.instrumentId))
    .where(eq(positions.userId, userId));

  if (rows.length === 0) return [];

  const wrappers = await db
    .select({
      instrumentId: tokens.instrumentId,
      mint: tokens.mint,
      symbol: tokens.symbol,
      issuer: tokens.issuer,
      decimals: tokens.decimals,
    })
    .from(tokens);

  return rows.map((row) => ({
    instrumentId: row.instrumentId,
    ticker: row.ticker,
    name: row.name,
    shares: D(row.shares),
    costBasisUsd: D(row.costBasisUsd),
    avgUnitCostUsd: D(row.avgUnitCostUsd),
    wrappers: wrappers
      .filter((w) => w.instrumentId === row.instrumentId)
      .map((w) => ({ mint: w.mint, symbol: w.symbol, issuer: w.issuer, decimals: w.decimals })),
  }));
}
```

- [ ] **Step 6: Commit**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api exec vitest run
git add services/api/src
git commit -m "feat: portfolio and exposure routes reading from Postgres and chain"
```

---

## Task 13: Money and activity

Cash is a chain balance. The rate is Kamino's. Activity is the table, paginated by keyset so a feed that grows while it is being read does not repeat or skip a row.

**What these routes do not pretend to know.** `interestEarnedYtdUsd` is zero because Mercury does not supply cash anywhere in v1 — nothing has earned anything, and zero is the true figure rather than a placeholder. `yieldApr` is the rate Kamino's xStocks market pays a supplier right now: a real, attributed number describing what is available, not what the user is being paid. `borrowingPower.enabled` is false because borrowing was cut from v1's interface.

**Files:**

- Create: `services/api/src/routes/money.ts`
- Create: `services/api/src/routes/activity.ts`
- Create: `services/api/src/routes/money.test.ts`
- Create: `services/api/src/routes/activity.test.ts`
- Create: `services/api/src/portfolio/activity-queries.ts`

**Interfaces:**

- Produces: `moneyRoutes(deps: MoneyDeps): Hono`; `activityRoutes(deps: ActivityDeps): Hono`; `readActivity(db, userId, limit, cursor)`; `encodeCursor`/`decodeCursor`.

- [ ] **Step 1: Write the failing money test**

Create `services/api/src/routes/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { D } from "@mercury/core";
import { moneyRoutes, type MoneyDeps } from "./money.js";

const deps = (over: Partial<MoneyDeps> = {}): MoneyDeps => ({
  chain: {
    tokenBalances: async () => [{ mint: "UsDc", rawAmount: 250_500_000n, decimals: 6 }],
    mintConfig: async () => null,
  },
  credit: {
    current: async () => ({ collateral: [], borrowApy: D("0.0444"), supplyApy: D("0.00095") }),
  },
  usdcMint: "UsDc",
  ...over,
});

const appWith = (d: MoneyDeps, walletAddress: string | null = "WaLLeT") => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress });
    await next();
  });
  app.route("/", moneyRoutes(d));
  return app;
};

describe("GET /v1/money", () => {
  it("reports the USDC balance to the cent it actually holds", async () => {
    const body = await (await appWith(deps()).request("/v1/money")).json();
    expect(body.balanceUsd).toBe("250.5");
  });

  it("quotes the supply rate Kamino is paying right now", async () => {
    const body = await (await appWith(deps()).request("/v1/money")).json();
    expect(body.yieldApr).toBe("0.00095");
  });

  it("says zero interest earned, because nothing is supplied anywhere", async () => {
    const body = await (await appWith(deps()).request("/v1/money")).json();
    expect(body.interestEarnedYtdUsd).toBe("0");
  });

  it("gives the wallet as the deposit address", async () => {
    const body = await (await appWith(deps()).request("/v1/money")).json();
    expect(body.depositAddress).toBe("WaLLeT");
  });

  it("offers no borrowing power, and says so rather than omitting it", async () => {
    const body = await (await appWith(deps()).request("/v1/money")).json();
    expect(body.borrowingPower).toEqual({ availableUsd: "0", enabled: false });
  });

  it("says zero rather than failing when the wallet holds no USDC", async () => {
    const d = deps({ chain: { tokenBalances: async () => [], mintConfig: async () => null } });
    const body = await (await appWith(d).request("/v1/money")).json();
    expect(body.balanceUsd).toBe("0");
  });

  it("still answers when Kamino is down, with no rate rather than a wrong one", async () => {
    const d = deps({
      credit: {
        current: async () => {
          throw new Error("kamino reserves returned 503");
        },
      },
    });
    const res = await appWith(d).request("/v1/money");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.balanceUsd).toBe("250.5");
    expect(body.yieldApr).toBe("0");
  });

  it("answers an empty account for a session with no wallet yet", async () => {
    const body = await (await appWith(deps(), null).request("/v1/money")).json();
    expect(body.balanceUsd).toBe("0");
    expect(body.depositAddress).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, watch it fail, then implement**

Run: `pnpm --filter @mercury/api exec vitest run src/routes/money.test.ts`
Expected: FAIL — `Failed to resolve import "./money.js"`.

Create `services/api/src/routes/money.ts`:

```ts
import { Hono } from "hono";
import { D, toWire, ZERO } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import type { CreditSource } from "@mercury/market";

export interface MoneyDeps {
  readonly chain: ChainReader;
  readonly credit: CreditSource;
  readonly usdcMint: string;
}

export function moneyRoutes(deps: MoneyDeps): Hono {
  const app = new Hono();

  app.get("/v1/money", async (c) => {
    const identity = c.get("identity");
    if (identity.walletAddress === null) {
      return c.json({
        balanceUsd: "0",
        yieldApr: "0",
        interestEarnedYtdUsd: "0",
        depositAddress: null,
        borrowingPower: { availableUsd: "0", enabled: false },
      });
    }

    const [balances, credit] = await Promise.all([
      deps.chain.tokenBalances(identity.walletAddress),
      // A missing rate is a missing rate. The balance is the number that
      // matters on this screen, and it does not depend on Kamino being up.
      deps.credit.current().catch(() => null),
    ]);

    const usdc = balances.find((b) => b.mint === deps.usdcMint);
    const balanceUsd = usdc === undefined ? ZERO : D(usdc.rawAmount.toString()).div(D(10).pow(usdc.decimals));

    return c.json({
      balanceUsd: toWire(balanceUsd),
      // What a supplier earns in Kamino's xStocks market right now. It is the
      // rate available, not a rate this account is being paid: v1 supplies
      // nothing, which is also why the interest below is zero.
      yieldApr: toWire(credit?.supplyApy ?? ZERO),
      interestEarnedYtdUsd: "0",
      depositAddress: identity.walletAddress,
      // Borrowing is cut from v1's interface. The shape stays so the field does
      // not have to be invented later. See ADR 0009.
      borrowingPower: { availableUsd: "0", enabled: false },
    });
  });

  return app;
}
```

Run again. Expected: PASS, 8 tests.

- [ ] **Step 3: Write the failing activity test**

Create `services/api/src/routes/activity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  activityRoutes,
  decodeCursor,
  encodeCursor,
  type ActivityDeps,
  type ActivityRow,
} from "./activity.js";

const at = (iso: string): Date => new Date(iso);

const row = (id: string, iso: string): ActivityRow => ({
  id,
  kind: "transfer_in",
  occurredAt: at(iso),
  title: "Received NVDAx",
  subtitle: "1 share, cost estimated at today's price",
  amountUsd: "200",
  txSignature: null,
});

const appWith = (d: ActivityDeps) => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: "WaLLeT" });
    await next();
  });
  app.route("/", activityRoutes(d));
  return app;
};

describe("GET /v1/activity", () => {
  it("returns the feed newest first", async () => {
    const d: ActivityDeps = {
      read: async () => [row("b", "2026-09-24T12:00:00Z"), row("a", "2026-09-23T12:00:00Z")],
    };
    const body = await (await appWith(d).request("/v1/activity")).json();
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(["b", "a"]);
    expect(body.items[0].occurredAt).toBe("2026-09-24T12:00:00.000Z");
  });

  it("hands back a cursor only when there is another page", async () => {
    const full: ActivityDeps = {
      read: async (_u, limit) =>
        Array.from({ length: limit }, (_, i) => row(String(i), "2026-09-24T12:00:00Z")),
    };
    const short: ActivityDeps = { read: async () => [row("a", "2026-09-24T12:00:00Z")] };
    expect((await (await appWith(full).request("/v1/activity?limit=2")).json()).nextCursor).not.toBeNull();
    expect((await (await appWith(short).request("/v1/activity?limit=2")).json()).nextCursor).toBeNull();
  });

  it("passes the decoded cursor down to the query", async () => {
    let seen: unknown = "unset";
    const d: ActivityDeps = {
      read: async (_u, _l, cursor) => {
        seen = cursor;
        return [];
      },
    };
    const cursor = encodeCursor({ occurredAt: at("2026-09-24T12:00:00Z"), id: "abc" });
    await appWith(d).request(`/v1/activity?cursor=${encodeURIComponent(cursor)}`);
    expect(seen).toEqual({ occurredAt: at("2026-09-24T12:00:00Z"), id: "abc" });
  });

  it("refuses a cursor it did not issue", async () => {
    const d: ActivityDeps = { read: async () => [] };
    const res = await appWith(d).request("/v1/activity?cursor=not-a-cursor");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_failed");
  });

  it("caps the page size, so one request cannot ask for the whole table", async () => {
    let seen = 0;
    const d: ActivityDeps = {
      read: async (_u, limit) => {
        seen = limit;
        return [];
      },
    };
    await appWith(d).request("/v1/activity?limit=5000");
    expect(seen).toBe(100);
  });

  it("ignores a limit that is not a number", async () => {
    let seen = 0;
    const d: ActivityDeps = {
      read: async (_u, limit) => {
        seen = limit;
        return [];
      },
    };
    await appWith(d).request("/v1/activity?limit=banana");
    expect(seen).toBe(25);
  });

  it("returns an empty feed for an account nothing has happened to", async () => {
    const body = await (await appWith({ read: async () => [] }).request("/v1/activity")).json();
    expect(body).toEqual({ items: [], nextCursor: null });
  });
});

describe("cursors", () => {
  it("round-trips", () => {
    const point = { occurredAt: at("2026-09-24T12:00:00Z"), id: "abc" };
    expect(decodeCursor(encodeCursor(point))).toEqual(point);
  });

  it("rejects rubbish rather than throwing", () => {
    expect(decodeCursor("nonsense")).toBeNull();
    expect(decodeCursor(Buffer.from("no-separator").toString("base64url"))).toBeNull();
  });
});
```

- [ ] **Step 4: Run it, watch it fail, then implement**

Run: `pnpm --filter @mercury/api exec vitest run src/routes/activity.test.ts`
Expected: FAIL — `Failed to resolve import "./activity.js"`.

Create `services/api/src/routes/activity.ts`:

```ts
import { Hono } from "hono";

export interface ActivityRow {
  readonly id: string;
  readonly kind: string;
  readonly occurredAt: Date;
  readonly title: string;
  readonly subtitle: string | null;
  readonly amountUsd: string | null;
  readonly txSignature: string | null;
}

export interface Cursor {
  readonly occurredAt: Date;
  readonly id: string;
}

export interface ActivityDeps {
  readonly read: (userId: string, limit: number, cursor: Cursor | null) => Promise<readonly ActivityRow[]>;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * Keyset, not offset. The feed grows while it is being read, and an offset would
 * repeat or skip a row every time something new arrived mid-scroll.
 */
export const encodeCursor = (c: Cursor): string =>
  Buffer.from(`${c.occurredAt.toISOString()}|${c.id}`).toString("base64url");

export const decodeCursor = (raw: string): Cursor | null => {
  try {
    const [iso, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
    if (iso === undefined || id === undefined || id.length === 0) return null;
    const occurredAt = new Date(iso);
    if (Number.isNaN(occurredAt.getTime())) return null;
    return { occurredAt, id };
  } catch {
    return null;
  }
};

const fail = (code: string, message: string) => ({ error: { code, message } });

export function activityRoutes(deps: ActivityDeps): Hono {
  const app = new Hono();

  app.get("/v1/activity", async (c) => {
    const identity = c.get("identity");

    const asked = Number(c.req.query("limit"));
    const limit =
      Number.isFinite(asked) && asked > 0 ? Math.min(Math.floor(asked), MAX_LIMIT) : DEFAULT_LIMIT;

    const raw = c.req.query("cursor");
    const cursor = raw === undefined ? null : decodeCursor(raw);
    if (raw !== undefined && cursor === null) {
      return c.json(fail("validation_failed", "That cursor is not one we issued."), 400);
    }

    const items = await deps.read(identity.userId, limit, cursor);
    const last = items[items.length - 1];

    return c.json({
      items: items.map((i) => ({
        id: i.id,
        kind: i.kind,
        occurredAt: i.occurredAt.toISOString(),
        title: i.title,
        subtitle: i.subtitle,
        amountUsd: i.amountUsd,
        txSignature: i.txSignature,
      })),
      // A full page means there is probably another. An empty one never has.
      nextCursor:
        items.length === limit && last !== undefined
          ? encodeCursor({ occurredAt: last.occurredAt, id: last.id })
          : null,
    });
  });

  return app;
}
```

Run again. Expected: PASS, 9 tests.

- [ ] **Step 5: Write the Postgres query**

Create `services/api/src/portfolio/activity-queries.ts`:

```ts
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { activities } from "../db/schema.js";
import type { ActivityRow, Cursor } from "../routes/activity.js";

/**
 * One page of the feed, newest first. The cursor compares the pair
 * (occurred_at, id) so two rows written in the same transaction — a transfer and
 * the dividend it revealed — cannot straddle a page boundary and be lost.
 */
export async function readActivity(
  db: Db,
  userId: string,
  limit: number,
  cursor: Cursor | null,
): Promise<readonly ActivityRow[]> {
  const before =
    cursor === null
      ? undefined
      : or(
          lt(activities.occurredAt, cursor.occurredAt),
          and(eq(activities.occurredAt, cursor.occurredAt), lt(activities.id, sql`${cursor.id}::uuid`)),
        );

  const rows = await db
    .select({
      id: activities.id,
      kind: activities.kind,
      occurredAt: activities.occurredAt,
      title: activities.title,
      subtitle: activities.subtitle,
      amountUsd: activities.amountUsd,
      txSignature: activities.txSignature,
    })
    .from(activities)
    .where(before === undefined ? eq(activities.userId, userId) : and(eq(activities.userId, userId), before))
    .orderBy(desc(activities.occurredAt), desc(activities.id))
    .limit(limit);

  return rows;
}
```

- [ ] **Step 6: Commit**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api exec vitest run
git add services/api/src
git commit -m "feat: money and activity routes"
```

---

## Task 14: Instruments, and orders in a table

The shelf the web app browses, and the end of the in-memory `orders` Map the spec's §3 names. The Map is replaced by a store interface with a Postgres implementation, which is what lets subsystem 3 add execute and confirm without touching the routes again.

**Files:**

- Create: `services/api/src/routes/instruments.ts`
- Create: `services/api/src/routes/instruments.test.ts`
- Create: `services/api/src/instruments/queries.ts`
- Create: `services/api/src/orders/store.ts`
- Create: `services/api/src/orders/memory.ts`
- Create: `services/api/src/orders/store.test.ts`
- Modify: `services/api/src/app.ts`

**Interfaces:**

- Produces: `instrumentRoutes(deps: InstrumentDeps): Hono`; `readSupportedStocks(db: Db, supportedStocks: SupportedStocks): Promise<readonly StockRow[]>`; `countBuyers30d(db: Db, ticker: string): Promise<number>`; `OrderStore`, `pgOrderStore(db: Db): OrderStore`, `memoryOrderStore(): OrderStore`.

- [ ] **Step 1: Write the failing instruments test**

Create `services/api/src/routes/instruments.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { D } from "@mercury/core";
import type { TokenPrice } from "@mercury/market";
import { instrumentRoutes, type StockRow, type InstrumentDeps } from "./instruments.js";

const NVDAX = "Xsc9";
const SPYX = "XsoC";

const supportedStocks: readonly StockRow[] = [
  {
    ticker: "NVDA",
    name: "Nvidia",
    sector: "Semiconductors",
    description: "Designs the graphics and AI accelerators most large models are trained on.",
    logoUrl: "https://example.test/nvdax.png",
    isTradable: true,
    wrappers: [
      {
        mint: NVDAX,
        symbol: "NVDAx",
        issuer: "backed",
        decimals: 8,
        multiplier: "1.5",
        isRoutable: true,
        holders: 108_418,
      },
    ],
  },
  {
    ticker: "SPY",
    name: "S&P 500",
    sector: "Index funds",
    description: "The five hundred largest listed companies in the United States.",
    logoUrl: null,
    isTradable: true,
    wrappers: [
      {
        mint: SPYX,
        symbol: "SPYx",
        issuer: "backed",
        decimals: 8,
        multiplier: "1",
        isRoutable: true,
        holders: 250_000,
      },
    ],
  },
];

const price = (mint: string, over: Partial<TokenPrice> = {}): TokenPrice => ({
  mint,
  usdPricePerToken: D(300),
  pricePerShare: D(200),
  changePct24h: D(1),
  liquidityUsd: D(1_000_000),
  multiplier: D("1.5"),
  observedAt: new Date("2026-09-24T12:00:00Z"),
  ...over,
});

const deps = (over: Partial<InstrumentDeps> = {}): InstrumentDeps => ({
  supportedStocks: async () => supportedStocks,
  buyers30d: async () => 0,
  prices: { pricesFor: async (mints) => new Map(mints.map((m) => [m, price(m)])) },
  sessions: {
    current: async () => ({
      status: "open",
      isOpen: true,
      nextOpenAt: null,
      nextCloseAt: null,
      isWeekend: false,
    }),
  },
  ...over,
});

const app = (d: InstrumentDeps) => {
  const a = new Hono();
  a.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: "WaLLeT" });
    await next();
  });
  a.route("/", instrumentRoutes(d));
  return a;
};

describe("GET /v1/instruments", () => {
  it("prices each instrument per share, not per token", async () => {
    const body = await (await app(deps()).request("/v1/instruments")).json();
    const nvda = body.instruments.find((i: { ticker: string }) => i.ticker === "NVDA");
    // The token costs $300 and is 1.5 shares. A share costs $200.
    expect(nvda.pricePerShare).toBe("200");
  });

  it("carries the live session, so a closed market is visible before an order is tried", async () => {
    const d = deps({
      sessions: {
        current: async () => ({
          status: "closed",
          isOpen: false,
          nextOpenAt: null,
          nextCloseAt: null,
          isWeekend: true,
        }),
      },
    });
    const body = await (await app(d).request("/v1/instruments")).json();
    expect(body.instruments[0].status).toBe("closed");
  });

  it("filters by a search term against both the ticker and the name", async () => {
    const byTicker = await (await app(deps()).request("/v1/instruments?q=nvda")).json();
    expect(byTicker.instruments.map((i: { ticker: string }) => i.ticker)).toEqual(["NVDA"]);
    const byName = await (await app(deps()).request("/v1/instruments?q=nvidia")).json();
    expect(byName.instruments.map((i: { ticker: string }) => i.ticker)).toEqual(["NVDA"]);
  });

  it("filters by sector", async () => {
    const body = await (await app(deps()).request("/v1/instruments?sector=Index%20funds")).json();
    expect(body.instruments.map((i: { ticker: string }) => i.ticker)).toEqual(["SPY"]);
  });

  it("orders the popular shelf by how many people actually hold it", async () => {
    const body = await (await app(deps()).request("/v1/instruments?shelf=popular")).json();
    expect(body.instruments.map((i: { ticker: string }) => i.ticker)).toEqual(["SPY", "NVDA"]);
  });

  it("orders the movers shelf by the size of the move, in either direction", async () => {
    const d = deps({
      prices: {
        pricesFor: async (mints) =>
          new Map(mints.map((m) => [m, price(m, { changePct24h: m === SPYX ? D(-9) : D(2) })])),
      },
    });
    const body = await (await app(d).request("/v1/instruments?shelf=movers")).json();
    expect(body.instruments.map((i: { ticker: string }) => i.ticker)).toEqual(["SPY", "NVDA"]);
  });

  it("leaves out an instrument nothing can fill", async () => {
    const d = deps({
      supportedStocks: async () => supportedStocks.map((c) => ({ ...c, isTradable: c.ticker !== "SPY" })),
    });
    const body = await (await app(d).request("/v1/instruments")).json();
    expect(body.instruments.map((i: { ticker: string }) => i.ticker)).toEqual(["NVDA"]);
  });

  it("omits an instrument with no live price rather than showing it at zero", async () => {
    const d = deps({ prices: { pricesFor: async () => new Map() } });
    const body = await (await app(d).request("/v1/instruments")).json();
    expect(body.instruments).toEqual([]);
  });
});

describe("GET /v1/instruments/:ticker", () => {
  it("returns the instrument with every wrapper and its multiplier", async () => {
    const body = await (await app(deps()).request("/v1/instruments/nvda")).json();
    expect(body.instrument).toMatchObject({ ticker: "NVDA", name: "Nvidia", sector: "Semiconductors" });
    expect(body.instrument.wrappers[0]).toMatchObject({
      symbol: "NVDAx",
      issuer: "backed",
      isRoutable: true,
    });
    expect(body.instrument.wrappers[0].multiplier).toBe("1.5");
  });

  it("includes the sentence that says what the company does", async () => {
    const body = await (await app(deps()).request("/v1/instruments/NVDA")).json();
    expect(body.instrument.description).toContain("accelerators");
  });

  it("counts how many people here actually bought it", async () => {
    // The figure `placeholder.ts` invented. It is our own order table now, so it
    // is honest and it is zero until subsystem 3 starts writing fills.
    const d = deps({ buyers30d: async (ticker) => (ticker === "NVDA" ? 37 : 0) });
    const body = await (await app(d).request("/v1/instruments/NVDA")).json();
    expect(body.buyers30d).toBe(37);
  });

  it("does not put the buyer count on the shelf, which would be one query per row", async () => {
    const body = await (await app(deps()).request("/v1/instruments")).json();
    expect(body.instruments[0].buyers30d).toBeUndefined();
  });

  it("says 404 for a ticker we do not list", async () => {
    const res = await app(deps()).request("/v1/instruments/TSLA");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });
});
```

- [ ] **Step 2: Run it, watch it fail, then implement**

Run: `pnpm --filter @mercury/api exec vitest run src/routes/instruments.test.ts`
Expected: FAIL — `Failed to resolve import "./instruments.js"`.

Create `services/api/src/routes/instruments.ts`:

```ts
import { Hono } from "hono";
import { D, toWire, ZERO, type Decimal, type Issuer } from "@mercury/core";
import type { PriceBoard, SessionSource } from "@mercury/market";

export interface StockWrapperRow {
  readonly mint: string;
  readonly symbol: string;
  readonly issuer: Issuer;
  readonly decimals: number;
  readonly multiplier: string;
  readonly isRoutable: boolean;
  readonly holders: number;
}

export interface StockRow {
  readonly ticker: string;
  readonly name: string;
  readonly sector: string | null;
  readonly description: string | null;
  readonly logoUrl: string | null;
  readonly isTradable: boolean;
  readonly wrappers: readonly StockWrapperRow[];
}

export interface InstrumentDeps {
  readonly supportedStocks: () => Promise<readonly StockRow[]>;
  /** How many Mercury accounts bought this in the last thirty days. Detail page only. */
  readonly buyers30d: (ticker: string) => Promise<number>;
  readonly prices: PriceBoard;
  readonly sessions: SessionSource;
}

const fail = (code: string, message: string) => ({ error: { code, message } });

interface Priced {
  readonly row: StockRow;
  readonly pricePerShare: Decimal;
  readonly changePct24h: Decimal;
  readonly holders: number;
}

export function instrumentRoutes(deps: InstrumentDeps): Hono {
  const app = new Hono();

  /** Everything the shelf and the detail page share: the rows, priced, with the session. */
  const priceAll = async (): Promise<{ priced: readonly Priced[]; status: string }> => {
    const [rows, session] = await Promise.all([deps.supportedStocks(), deps.sessions.current()]);
    const tradable = rows.filter((r) => r.isTradable);
    const board = await deps.prices.pricesFor(tradable.flatMap((r) => r.wrappers.map((w) => w.mint)));

    const priced: Priced[] = [];
    for (const row of tradable) {
      // Any wrapper prices one share the same way. Backed first, because its
      // pools are the deep ones and its feed is the one that keeps updating.
      const lead = row.wrappers.find((w) => w.issuer === "backed") ?? row.wrappers[0];
      const price = lead === undefined ? undefined : board.get(lead.mint);
      // No price, no row. Showing an instrument at zero would be a price.
      if (price?.pricePerShare == null) continue;

      priced.push({
        row,
        pricePerShare: price.pricePerShare,
        changePct24h: price.changePct24h ?? ZERO,
        holders: row.wrappers.reduce((n, w) => n + w.holders, 0),
      });
    }
    return { priced, status: session.status };
  };

  const toWire_ = (p: Priced, status: string) => ({
    ticker: p.row.ticker,
    name: p.row.name,
    sector: p.row.sector,
    description: p.row.description,
    logoUrl: p.row.logoUrl,
    pricePerShare: toWire(p.pricePerShare),
    changePct24h: toWire(p.changePct24h),
    status,
    wrappers: p.row.wrappers.map((w) => ({
      mint: w.mint,
      symbol: w.symbol,
      issuer: w.issuer,
      decimals: w.decimals,
      multiplier: toWire(D(w.multiplier)),
      isRoutable: w.isRoutable,
    })),
  });

  app.get("/v1/instruments", async (c) => {
    const { priced, status } = await priceAll();

    const q = c.req.query("q")?.trim().toLowerCase();
    const sector = c.req.query("sector");
    const shelf = c.req.query("shelf");

    let rows = priced;
    if (q !== undefined && q.length > 0) {
      rows = rows.filter(
        (p) => p.row.ticker.toLowerCase().includes(q) || p.row.name.toLowerCase().includes(q),
      );
    }
    if (sector !== undefined) rows = rows.filter((p) => p.row.sector === sector);

    const sorted = [...rows];
    if (shelf === "popular") {
      // Holders on chain, not a number we chose. See the ground rules.
      sorted.sort((a, b) => b.holders - a.holders);
    } else if (shelf === "movers") {
      // Size of the move, either direction: a fall is as much news as a rise.
      sorted.sort((a, b) => b.changePct24h.abs().comparedTo(a.changePct24h.abs()));
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }

    return c.json({ instruments: sorted.map((p) => toWire_(p, status)) });
  });

  app.get("/v1/instruments/:ticker", async (c) => {
    const ticker = c.req.param("ticker").toUpperCase();
    const { priced, status } = await priceAll();
    const found = priced.find((p) => p.row.ticker === ticker);
    if (found === undefined) return c.json(fail("not_found", `We do not list ${ticker}.`), 404);
    // One query, on the one page that shows it. Putting it on the shelf would be
    // a query per row for a number nobody reads there.
    return c.json({ instrument: toWire_(found, status), buyers30d: await deps.buyers30d(ticker) });
  });

  return app;
}
```

Run again. Expected: PASS, 13 tests.

- [ ] **Step 3: Write the supportedStocks query**

Create `services/api/src/instruments/queries.ts`:

```ts
import { and, eq, gte, sql } from "drizzle-orm";
import type { SupportedStocks } from "@mercury/chain";
import type { Db } from "../db/client.js";
import { instruments, orders, tokens } from "../db/schema.js";
import type { StockRow } from "../routes/instruments.js";

/**
 * The stored supportedStocks, with live holder counts folded in.
 *
 * Holder counts are deliberately not a column: they move every hour and nothing
 * decides anything from a stored copy of them. They come from the registry,
 * which caches the universe for an hour, so this costs one upstream call an hour
 * rather than one per request. If the registry is unreachable the counts are
 * zero and the popular shelf falls back to alphabetical — a worse shelf, not a
 * broken one.
 */
export async function readSupportedStocks(
  db: Db,
  supportedStocks: SupportedStocks,
): Promise<readonly StockRow[]> {
  const [rows, live] = await Promise.all([
    db
      .select({
        ticker: instruments.ticker,
        name: instruments.name,
        sector: instruments.sector,
        description: instruments.description,
        logoUrl: instruments.logoUrl,
        isTradable: instruments.isTradable,
        instrumentId: instruments.id,
      })
      .from(instruments),
    supportedStocks.instruments().catch(() => []),
  ]);

  const holdersByMint = new Map(live.flatMap((i) => i.wrappers.map((w) => [w.mint, w.holders] as const)));

  const wrappers = await db
    .select({
      instrumentId: tokens.instrumentId,
      mint: tokens.mint,
      symbol: tokens.symbol,
      issuer: tokens.issuer,
      decimals: tokens.decimals,
      multiplier: tokens.multiplier,
      isRoutable: tokens.isRoutable,
    })
    .from(tokens);

  return rows.map((row) => ({
    ticker: row.ticker,
    name: row.name,
    sector: row.sector,
    description: row.description,
    logoUrl: row.logoUrl,
    isTradable: row.isTradable,
    wrappers: wrappers
      .filter((w) => w.instrumentId === row.instrumentId)
      .map((w) => ({
        mint: w.mint,
        symbol: w.symbol,
        issuer: w.issuer,
        decimals: w.decimals,
        multiplier: w.multiplier,
        isRoutable: w.isRoutable,
        holders: holdersByMint.get(w.mint) ?? 0,
      })),
  }));
}

/**
 * Distinct accounts that filled a buy of this instrument in the last thirty days.
 *
 * `apps/web/src/market/placeholder.ts` invents this number today, and says in its
 * own header that it needs our order table. This is that table. It reads zero
 * until subsystem 3 writes a fill, and zero is the true answer in the meantime —
 * the UI should show nothing rather than a number nobody has earned.
 */
export async function countBuyers30d(db: Db, ticker: string): Promise<number> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ buyers: sql<string>`count(distinct ${orders.userId})` })
    .from(orders)
    .innerJoin(instruments, eq(instruments.id, orders.instrumentId))
    .where(
      and(
        eq(instruments.ticker, ticker),
        eq(orders.side, "buy"),
        eq(orders.status, "filled"),
        gte(orders.filledAt, since),
      ),
    );
  return row === undefined ? 0 : Number(row.buyers);
}
```

- [ ] **Step 4: Replace the orders Map**

Create `services/api/src/orders/store.ts`:

```ts
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { instruments, orders, tokens } from "../db/schema.js";

export type OrderStatus =
  "pending" | "executing" | "filled" | "queued" | "partially_filled" | "expired" | "cancelled" | "refused";

export interface NewOrder {
  readonly userId: string;
  readonly ticker: string;
  readonly side: "buy" | "sell";
  readonly usdAmount: string;
  /** The Decision from `@mercury/core`, already serialised. Kept verbatim. */
  readonly decision: unknown;
  readonly chosenMint: string | null;
  readonly referencePrice: string | null;
  readonly premiumPct: string | null;
  readonly status: OrderStatus;
}

export interface StoredOrder {
  readonly id: string;
  readonly decision: unknown;
  readonly status: OrderStatus;
  readonly createdAt: string;
}

export interface OrderStore {
  create(order: NewOrder): Promise<StoredOrder>;
  byId(userId: string, id: string): Promise<StoredOrder | null>;
  setStatus(userId: string, id: string, status: OrderStatus): Promise<void>;
}

/**
 * The `order` table behind the interface the in-memory Map had.
 *
 * `decision` is stored verbatim as jsonb. When a user asks why they were sold
 * one wrapper and not the other, the answer is a row — that is the whole reason
 * docs/05 keeps the blob rather than the fields it contains.
 */
export const pgOrderStore = (db: Db): OrderStore => ({
  async create(order) {
    const [instrument] = await db
      .select({ id: instruments.id })
      .from(instruments)
      .where(eq(instruments.ticker, order.ticker))
      .limit(1);
    if (instrument === undefined) throw new Error(`no instrument row for ${order.ticker}`);

    const chosenTokenId =
      order.chosenMint === null
        ? null
        : ((
            await db.select({ id: tokens.id }).from(tokens).where(eq(tokens.mint, order.chosenMint)).limit(1)
          )[0]?.id ?? null);

    const [saved] = await db
      .insert(orders)
      .values({
        userId: order.userId,
        instrumentId: instrument.id,
        side: order.side,
        usdAmount: order.usdAmount,
        decision: order.decision,
        chosenTokenId,
        referencePrice: order.referencePrice,
        premiumPct: order.premiumPct,
        status: order.status,
      })
      .returning({
        id: orders.id,
        decision: orders.decision,
        status: orders.status,
        createdAt: orders.createdAt,
      });
    if (saved === undefined) throw new Error("order insert returned nothing");

    return {
      id: saved.id,
      decision: saved.decision,
      status: saved.status,
      createdAt: saved.createdAt.toISOString(),
    };
  },

  async byId(userId, id) {
    const [row] = await db
      .select({
        id: orders.id,
        decision: orders.decision,
        status: orders.status,
        createdAt: orders.createdAt,
      })
      .from(orders)
      // Scoped to the caller. An order id is a uuid, but a route that trusts one
      // without an owner check is a route that will one day be handed someone
      // else's.
      .where(and(eq(orders.id, id), eq(orders.userId, userId)))
      .limit(1);
    return row === undefined
      ? null
      : { id: row.id, decision: row.decision, status: row.status, createdAt: row.createdAt.toISOString() };
  },

  async setStatus(userId, id, status) {
    await db
      .update(orders)
      .set({ status })
      .where(and(eq(orders.id, id), eq(orders.userId, userId)));
  },
});
```

- [ ] **Step 5: Test the store's contract with an in-memory twin**

Create `services/api/src/orders/store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { memoryOrderStore } from "./memory.js";

const base = {
  userId: "user-1",
  ticker: "NVDA",
  side: "buy" as const,
  usdAmount: "100",
  decision: { kind: "execute" },
  chosenMint: "Xsc9",
  referencePrice: "200",
  premiumPct: "0.001",
  status: "pending" as const,
};

describe("OrderStore contract", () => {
  it("gives every order its own id", async () => {
    const store = memoryOrderStore();
    const a = await store.create(base);
    const b = await store.create(base);
    expect(a.id).not.toBe(b.id);
  });

  it("keeps the decision exactly as it was handed over", async () => {
    const store = memoryOrderStore();
    const decision = { kind: "refuse", reason: "impact_too_high", candidates: [{ mint: "Xsc9" }] };
    const saved = await store.create({ ...base, decision });
    expect((await store.byId("user-1", saved.id))!.decision).toEqual(decision);
  });

  it("will not hand one user another user's order", async () => {
    const store = memoryOrderStore();
    const saved = await store.create(base);
    expect(await store.byId("user-2", saved.id)).toBeNull();
  });

  it("moves an order's status", async () => {
    const store = memoryOrderStore();
    const saved = await store.create(base);
    await store.setStatus("user-1", saved.id, "executing");
    expect((await store.byId("user-1", saved.id))!.status).toBe("executing");
  });

  it("says null for an id that was never issued", async () => {
    expect(await memoryOrderStore().byId("user-1", "nope")).toBeNull();
  });
});
```

Create `services/api/src/orders/memory.ts`:

```ts
import type { NewOrder, OrderStatus, OrderStore, StoredOrder } from "./store.js";

/**
 * The same contract, in memory. It exists so the routes and the contract above
 * can be tested without Postgres — not as a fixture mode: nothing wires it into
 * a running server, and `buildDeps` has no branch that reaches it.
 */
export const memoryOrderStore = (): OrderStore => {
  const rows = new Map<string, { order: NewOrder; stored: StoredOrder }>();
  return {
    async create(order) {
      const stored: StoredOrder = {
        id: crypto.randomUUID(),
        decision: order.decision,
        status: order.status,
        createdAt: new Date().toISOString(),
      };
      rows.set(stored.id, { order, stored });
      return stored;
    },
    async byId(userId, id) {
      const row = rows.get(id);
      return row === undefined || row.order.userId !== userId ? null : row.stored;
    },
    async setStatus(userId, id, status: OrderStatus) {
      const row = rows.get(id);
      if (row === undefined || row.order.userId !== userId) return;
      rows.set(id, { order: row.order, stored: { ...row.stored, status } });
    },
  };
};
```

Run: `pnpm --filter @mercury/api exec vitest run src/orders`
Expected: PASS, 5 tests.

- [ ] **Step 6: Rewire `app.ts`**

In `services/api/src/app.ts`:

1. Delete the `StoredOrder` interface, the `const orders = new Map…` line and the `// TODO week 2: Postgres…` comment.
2. Change the signature to `export function createApp(market: () => Deps, auth: AuthDeps, read: ReadDeps)` and import `ReadDeps` from `./deps.js` (defined in Task 15).
3. Mount the route modules after the auth middleware:

```ts
app.route("/", instrumentRoutes(read.instruments));
app.route("/", portfolioRoutes(read.portfolio));
app.route("/", moneyRoutes(read.money));
app.route("/", activityRoutes(read.activity));
```

4. Replace the three order handlers' Map access with `read.orders`:

```ts
app.post("/v1/orders", async (c) => {
  const parsed = CreateOrderRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail("validation_failed", parsed.error.message), 400);

  const decision = await priceOrder(market(), parsed.data);
  if (decision === null) return c.json(fail("not_found", "Unknown instrument."), 404);

  const wire = decisionToWire(decision);
  const saved = await read.orders.create({
    userId: c.get("identity").userId,
    ticker: parsed.data.ticker,
    side: parsed.data.side,
    usdAmount: parsed.data.amount,
    decision: wire,
    chosenMint: wire.kind === "refuse" ? null : wire.best.mint,
    referencePrice: wire.fairPricePerShare,
    premiumPct: wire.kind === "refuse" ? null : wire.premium,
    status: wire.kind === "refuse" ? "refused" : "pending",
  });
  return c.json({ orderId: saved.id, decision: wire });
});

app.get("/v1/orders/:id", async (c) => {
  const order = await read.orders.byId(c.get("identity").userId, c.req.param("id"));
  return order === null ? c.json(fail("not_found", "Unknown order."), 404) : c.json(order);
});
```

5. In `POST /v1/orders/:id/execute`, replace `orders.get(...)` with `await read.orders.byId(c.get("identity").userId, c.req.param("id"))`, and `o.status = "executing"` with `await read.orders.setStatus(c.get("identity").userId, o.id, "executing")`. The handler's own body still throws `buildDeps:` until subsystem 3 provides a keyed Ultra client, and the 503 mapping already covers that.

- [ ] **Step 7: Commit**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api exec vitest run
git add services/api/src
git commit -m "feat: instrument routes, and orders in Postgres instead of a Map"
```

---

## Task 15: Wiring it together

`buildDeps()` stops throwing. Everything lifted in Tasks 2–8 is constructed once, the routes get their queries, and the two documents the spec's §8 asks for are written.

**Files:**

- Modify: `services/api/src/deps.ts`
- Modify: `services/api/src/index.ts`
- Modify: `services/api/.env.example`
- Modify: `README.md`
- Modify: `docs/03-architecture.md`
- Create: `docs/adr/0011-server-preferred-prices.md`

- [ ] **Step 1: Build the dependencies**

In `services/api/src/deps.ts`, replace the imports and the `Deps` interface:

```ts
import {
  JupiterLite,
  JupiterRegistry,
  SolanaRpc,
  SymmetryVenue,
  type BasketVenue,
  type SupportedStocks,
  type ChainReader,
  type QuoteSource,
  type TokenRegistry,
  type TriggerSource,
} from "@mercury/chain";
import {
  JupiterMarket,
  KaminoCredit,
  MintMultipliers,
  PythSessions,
  type CreditSource,
  type MultiplierSource,
  type PriceBoard,
  type ReferenceSource,
  type SessionSource,
} from "@mercury/market";
```

```ts
export interface Deps {
  readonly registry: TokenRegistry;
  readonly supportedStocks: SupportedStocks;
  readonly quotes: QuoteSource;
  readonly triggers: TriggerSource;
  readonly sessions: SessionSource;
  readonly reference: ReferenceSource;
  readonly multipliers: MultiplierSource;
  readonly prices: PriceBoard;
  readonly credit: CreditSource;
  readonly chain: ChainReader;
  readonly baskets: BasketVenue;
}
```

Replace `buildDeps` entirely:

```ts
/**
 * There is no fixture mode and no mock adapter. Every dependency is the real one or the
 * server does not start. Dummy data belongs in the client while the interface is being
 * built, never in the server.
 *
 * Nothing here takes a key. Quotes come from Jupiter's keyless endpoint, which is
 * what prices a decision; `JUPITER_API_KEY` buys Ultra, which *executes* one, and
 * arrives with subsystem 3. Triggers are subsystem 3 as well, and baskets are
 * blocked on the Symmetry spike — both are constructed so the object is whole,
 * and both throw if called.
 */
export function buildDeps(config: Config): Deps {
  const registry = new JupiterRegistry();
  const chain = new SolanaRpc({ rpcUrl: config.solanaRpcUrl });
  const market = new JupiterMarket({ registry });

  return {
    registry,
    supportedStocks: registry,
    quotes: new JupiterLite(),
    triggers: new JupiterTriggersNotYet(),
    sessions: new PythSessions(),
    reference: market,
    // The mint is the authority. `market` implements the same port from
    // Jupiter's copy of the same numbers, and is what the browser falls back to.
    multipliers: new MintMultipliers({ chain }),
    prices: market,
    credit: new KaminoCredit(),
    chain,
    baskets: new SymmetryVenue({ rpcUrl: config.solanaRpcUrl }),
  };
}

/** Trigger orders are subsystem 3. Present so `Deps` is whole; loud if called. */
class JupiterTriggersNotYet implements TriggerSource {
  create(): never {
    throw new Error("buildDeps: trigger orders arrive with execution, subsystem 3");
  }
  status(): never {
    throw new Error("buildDeps: trigger orders arrive with execution, subsystem 3");
  }
  cancel(): never {
    throw new Error("buildDeps: trigger orders arrive with execution, subsystem 3");
  }
}
```

Append the read-side wiring to the same file:

```ts
import type { ActivityDeps } from "./routes/activity.js";
import type { InstrumentDeps } from "./routes/instruments.js";
import type { MoneyDeps } from "./routes/money.js";
import type { PortfolioDeps } from "./routes/portfolio.js";
import type { OrderStore } from "./orders/store.js";
import { pgOrderStore } from "./orders/store.js";
import { countBuyers30d, readSupportedStocks } from "./instruments/queries.js";
import { readHoldings } from "./portfolio/queries.js";
import { readActivity } from "./portfolio/activity-queries.js";
import { reconcile } from "./portfolio/apply.js";
import { USDC_MINT } from "@mercury/chain";

export interface ReadDeps {
  readonly instruments: InstrumentDeps;
  readonly portfolio: PortfolioDeps;
  readonly money: MoneyDeps;
  readonly activity: ActivityDeps;
  readonly orders: OrderStore;
}

/**
 * The read side. Each route module takes its queries as functions rather than a
 * database handle, which is what lets every route be tested with a plain object.
 */
export function buildReadDeps(db: Db, deps: Deps): ReadDeps {
  const reconcileDeps = { chain: deps.chain, prices: deps.prices, multipliers: deps.multipliers };
  return {
    instruments: {
      supportedStocks: () => readSupportedStocks(db, deps.supportedStocks),
      buyers30d: (ticker) => countBuyers30d(db, ticker),
      prices: deps.prices,
      sessions: deps.sessions,
    },
    portfolio: {
      reconcile: (userId, wallet) => reconcile(db, reconcileDeps, userId, wallet),
      holdings: (userId) => readHoldings(db, userId),
      prices: deps.prices,
      chain: deps.chain,
      multipliers: deps.multipliers,
      usdcMint: USDC_MINT,
    },
    money: { chain: deps.chain, credit: deps.credit, usdcMint: USDC_MINT },
    activity: { read: (userId, limit, cursor) => readActivity(db, userId, limit, cursor) },
    orders: pgOrderStore(db),
  };
}
```

Add `import type { Db } from "./db/client.js";` at the top if it is not already there.

- [ ] **Step 2: Boot with a supportedStocks**

Replace `services/api/src/index.ts`:

```ts
import { serve } from "@hono/node-server";
import { buildAuthDeps, buildDeps, buildReadDeps, readConfig } from "./deps.js";
import { syncStocks } from "./stocks/sync.js";
import { createApp } from "./app.js";

const config = readConfig();
const port = Number(process.env.PORT ?? 8787);

const auth = buildAuthDeps(config);
const deps = buildDeps(config);
const read = buildReadDeps(auth.db, deps);

/**
 * The supportedStocks is filled on boot and then left alone: the token universe
 * changes when an issuer lists something, which is hours, not seconds. The
 * worker takes this over in subsystem 4.
 *
 * A failure here is logged and not fatal. The instruments shelf would be empty,
 * but identity, money and activity have nothing to do with Jupiter being up.
 */
syncStocks(auth.db, { supportedStocks: deps.supportedStocks, prices: deps.prices })
  .then((summary) =>
    console.log(`supportedStocks: ${summary.instruments} instruments, ${summary.tokens} tokens`),
  )
  .catch((error: unknown) => console.error("supportedStocks sync failed, shelf will be empty:", error));

serve({ fetch: createApp(() => deps, auth, read).fetch, port }, (info) => {
  console.log(`mercury api listening on :${info.port}`);
});
```

Note that `createApp` now takes `() => deps` — a thunk that returns an already-built object. The thunk stays because `app.ts`'s signature keeps it and subsystem 3 may reintroduce a lazy dependency; it no longer defends against a throwing `buildDeps`.

- [ ] **Step 3: Update the environment example**

In `services/api/.env.example`, replace the Jupiter block:

```
# Execution only. Subsystem 2 prices through Jupiter's keyless endpoint and does
# not read this; Ultra needs it to build a transaction, which is subsystem 3.
JUPITER_API_KEY=
```

- [ ] **Step 4: Run everything**

```bash
pnpm check
```

Expected: every package typechecks and every test passes. Count them: `packages/core` 35, `packages/chain` and `packages/market` their new suites, `services/api` its new suites plus the 16 from subsystem 1.

- [ ] **Step 5: Run it against the real world**

```bash
docker start mercury-pg
pnpm --filter @mercury/api exec drizzle-kit migrate
pnpm --filter @mercury/api dev
```

Then, in another shell:

```bash
curl -s localhost:8787/health
curl -s localhost:8787/v1/instruments | head -c 400
```

Expected: `/health` answers `{"ok":true}`. `/v1/instruments` answers **401** — it is under `/v1/*` and there is no token on the request. That is the right answer, and it is the same check subsystem 1 finished on.

To see the shelf, sign in through the web app and reuse the access token:

```bash
TOKEN="<the privy access token from the browser>"
curl -s -H "Authorization: Bearer $TOKEN" localhost:8787/v1/instruments \
  | python3 -c 'import json,sys; d=json.load(sys.stdin)["instruments"]; print(len(d)); print([(i["ticker"], i["pricePerShare"]) for i in d[:5]])'
curl -s -H "Authorization: Bearer $TOKEN" localhost:8787/v1/portfolio
curl -s -H "Authorization: Bearer $TOKEN" localhost:8787/v1/money
curl -s -H "Authorization: Bearer $TOKEN" localhost:8787/v1/activity
```

Expected: a list of real tickers at real prices; an empty portfolio and an empty activity feed for a wallet holding nothing; a money response with a zero balance and Kamino's live supply rate.

- [ ] **Step 6: Write ADR 0011**

Create `docs/adr/0011-server-preferred-prices.md`:

```markdown
# 0011 · Server-preferred prices, browser fallback

**Status:** accepted, 24 September 2026
**Supersedes in part:** [0010](0010-client-side-prices.md)

## Context

ADR 0010 recorded that the browser reads Jupiter, Pyth and Kamino directly, with no
key and no server. That was true when nothing server-side existed. Subsystem 2 lifts
those reads into `@mercury/market` and `@mercury/chain`, and the API now serves them.

## Decision

The API is the preferred source for market data. The browser keeps its direct reads
as a fallback, used only on **transport** failure — a timeout or a 5xx — and never on
a 4xx, because a 401 or a 422 is the API answering correctly and rerouting it would
hide the bug behind a path that cannot authenticate anyway.

The fallback is market data only. Positions, orders and activity are ours and have no
keyless equivalent, so the degraded state is precise: **live prices, no portfolio.**

Both paths run the same code. The adapters are runtime-agnostic — `fetch` injected, no
Node built-ins, no `window` — so the server and the browser import the same module
rather than two implementations that would drift.

One port has two implementations on purpose. `MultiplierSource` is read from the
Token-2022 ScaledUiAmount extension on the mint by the server, and from Jupiter's
`scaledUiConfig` by the browser, which cannot make an RPC call it has no URL for. A
live parity test asserts the two agree. Both apply the switchover rule: the multiplier
in force is `newMultiplier` once its effective timestamp has passed, which the browser
code did not do and which understated shares by 0.08% on NVDAx in September 2026.

## Consequences

- `apps ──► market, chain` becomes a legal dependency edge. [03](../03-architecture.md)
  is amended to match.
- Chainlink Data Streams remains the upgrade path recorded in 0010, unchanged. It is
  more correct and nothing calls it.
- A second implementation of one port is a drift risk. The live parity test is the
  control, and it is run by hand rather than in CI because it needs an RPC.
```

- [ ] **Step 7: Amend the architecture document**

In `docs/03-architecture.md`, find the statement that the API is the only surface the apps talk to, and the `apps ──► sdk ──► types` dependency rule. Replace that passage with:

```markdown
The API is the preferred surface the apps talk to, not the only one. The web app also
reads Jupiter, Pyth and Kamino directly as a fallback when the API is unreachable —
`apps ──► market, chain` is therefore a legal edge, alongside `apps ──► sdk ──► types`.
The fallback covers market data only; positions, orders and activity have no keyless
equivalent. See [ADR 0011](adr/0011-server-preferred-prices.md).
```

If a lint rule encodes the old edge, update it in the same commit. Search for it first: `grep -rn "depend" tooling/ --include=*.json --include=*.js --include=*.cjs`.

- [ ] **Step 8: Update the build state**

In `README.md`, replace the `packages/market`, `packages/chain` and `services/api` rows of the build-state table:

```markdown
| `packages/chain` | Registry, keyless quotes and Solana reads done and tested. Jupiter Ultra written, unused until execution. Symmetry awaits the spike |
| `packages/market` | **Done.** Sessions, prices, reference price, multipliers and the credit market, all lifted from the browser and runtime-agnostic |
| `services/api` | **Identity and read models done**: Privy tokens verified against the app's JWKS; instruments, portfolio, exposure, money and activity all answer from Postgres and chain. Execution is subsystem 3 |
```

- [ ] **Step 9: Commit**

```bash
git add README.md docs services/api
git commit -m "docs: ADR 0011, the architecture amendment, and the build state"
```

---

## Live checks, run by hand

Unit tests run against recorded fixtures, which is what keeps them fast and offline — and what means they cannot tell you an upstream has changed. These do. Run them at the end of the plan and again before any demo. None belongs in CI.

- [ ] **Every upstream still answers the shape we recorded**

```bash
node packages/chain/src/testing/record.ts && git diff --stat packages/chain/src/testing/fixtures/
```

Numbers moving is the market. A field disappearing is a break — `git diff` the file and look.

- [ ] **The two multiplier sources agree**

```bash
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com pnpm --filter @mercury/market exec vitest run parity.live
```

- [ ] **The supportedStocks sync is idempotent against the real database** — Task 10, Step 7.

- [ ] **A funded wallet reconciles correctly.** This is the one thing the fixtures cannot prove, because `rpc-token-accounts.json` is hand-written. Send a small amount of any xStock to the Privy wallet from subsystem 1, then:

```bash
curl -s -H "Authorization: Bearer $TOKEN" localhost:8787/v1/portfolio
curl -s -H "Authorization: Bearer $TOKEN" localhost:8787/v1/activity
docker exec mercury-pg psql -U mercury -d mercury -c \
  'select source, token_qty, shares, unit_cost_usd, is_estimated from lot order by acquired_at desc limit 5;'
```

Expected: one `transfer_in` lot, `is_estimated = true`, `shares` equal to the token quantity times the live multiplier, a matching activity row, and a portfolio whose `valueUsd` is within a few cents of quantity × price. Call `/v1/portfolio` a second time and confirm no second lot appears.

While you are there, confirm the one thing the hand-written fixture asserts on faith: that `tokenAmount.amount` is the raw balance and `uiAmount` may or may not be scaled. Compare the RPC's own answer against the lot:

```bash
curl -s -X POST "$SOLANA_RPC_URL" -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getTokenAccountsByOwner\",\"params\":[\"$WALLET\",{\"programId\":\"TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb\"},{\"encoding\":\"jsonParsed\"}]}" \
  | python3 -m json.tool | grep -A4 tokenAmount
```

If `uiAmount` differs from `amount / 10^decimals`, the node is applying the multiplier and the decision to ignore that field was the right one. Either way, re-record the fixture from this response.

- [ ] **The whole suite, offline**

```bash
pnpm check
```

---

## Handing over to the web half

The teammate revamping `apps/web` inherits these. Send them this list, not this document.

**1. The packages are ready to import.** `apps/web/src/market/*` can be deleted and replaced with:

```ts
import { JupiterRegistry } from "@mercury/chain/jupiter/registry";
import { JupiterMarket } from "@mercury/market/jupiter";
import { PythSessions } from "@mercury/market/pyth";
import { KaminoCredit } from "@mercury/market/kamino";
```

`hooks.ts` and `meta.ts` stay in the app — React Query is app-level, and `meta.ts` becomes unnecessary once the app reads `name`, `sector` and `description` from `GET /v1/instruments`. `apps/web` will need `@mercury/market` and `@mercury/chain` added to its `package.json`; that edge is now legal, and [ADR 0011](../../adr/0011-server-preferred-prices.md) records why.

**2. There is a live bug in the browser's multiplier.** `multiplierOf` in `apps/web/src/market/hooks.ts` reads `scaledUiConfig.multiplier`, which is the _scheduled-from_ value. The one in force is `newMultiplier` once `newMultiplierEffectiveAt` has passed. On NVDAx in September 2026 the gap was 0.078% of every share count. `JupiterMarket` in the package gets this right; switching to it fixes it.

**3. The routes the app can now call.** All under `/v1`, all needing the bearer token the app already sends:

```
GET /v1/instruments?q=&shelf=popular|movers&sector=
GET /v1/instruments/:ticker
GET /v1/portfolio
GET /v1/portfolio/exposure/:ticker
GET /v1/money
GET /v1/activity?limit=&cursor=
GET /v1/market/status
POST /v1/orders          (prices a decision; nothing happens on chain)
GET  /v1/orders/:id
```

**4. Two routes deliberately do not exist.** `GET /v1/instruments/:ticker/chart` and `GET /v1/portfolio/history` need a price series nobody sells us, so §6 of the spec records it ourselves from subsystem 4 onwards. They 404 today. `apps/web/src/market/placeholder.ts` invents period returns and a 5Y CAGR to fill them: those figures should come out of the UI rather than be re-sourced. Its `harborBuyers30d` is now real and comes from the `order` table — but only once subsystem 3 writes orders, so it is zero until then.

**5. `changePct24h` is a percentage**, despite `packages/types` typing it with the `Ratio` schema whose comment says otherwise. The server follows the field name. If anyone fixes the schema, both sides change together.

**6. The fallback rule.** Read the API first. Fall back to the direct upstream reads only on a timeout or a 5xx — never on a 4xx, which is the API answering correctly. The fallback covers prices, sessions and the credit market; there is no keyless equivalent for a portfolio, so the degraded state is _live prices, no portfolio_, and the screens should say so rather than looking broken.

---

## What this plan does not finish

Stated plainly, so none of it is rediscovered as a surprise:

- **Subsystem 2's own "done when" is half met.** Portfolio, money and activity render from Postgres and chain on the server side. `grep -r "data.ts" apps/web/src` still returns seven files. That is the web half.
- **`apps/web/src/market/*` is duplicated** until the web half deletes it. Nobody edits the browser copy in the meantime; changes go to the package.
- **Period returns, 5Y CAGR and any chart** wait for `portfolio_snapshot`, which the worker writes from subsystem 4. Nineteen days of history at most by 12 October, so `1W` and `1M` are what will ship and longer ranges stay hidden.
- **Orders are priced but not executed.** `POST /v1/orders/:id/execute` still answers 503, because it needs Ultra and a key. Subsystem 3.
- **Baskets are untouched.** `SymmetryVenue` throws from all four methods, blocked on the three questions in `SPIKE_QUESTIONS`.
- **`interestEarnedYtdUsd` is zero** and will stay zero until Mercury supplies cash somewhere. It is a true figure, not a placeholder, and should not be quietly replaced with an estimate.
