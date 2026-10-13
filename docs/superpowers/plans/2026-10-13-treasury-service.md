# Treasury Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One service that holds a private key per VM family, derives its address, and reports the addresses to the API — so no address is ever configuration, and no address can be one we have no key for.

**Architecture:** A node-only `packages/keys` with three pure derivations — secp256k1 + keccak for EVM, ed25519 for Solana, secp256k1 + hash160 + bech32 for Bitcoin p2wpkh — and a `services/treasury` that parses its keys at boot, derives once, holds the addresses in memory and serves them on one authenticated internal route. Receiving refunds needs nothing running; sending is deferred, so nothing here signs anything yet.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), pnpm 10.33.2 workspaces + Turborepo, Vitest, Hono, `@noble/curves`, `@noble/hashes`, `@scure/btc-signer`, `@solana/kit`.

**Spec:** `docs/superpowers/specs/2026-10-13-any-token-funding-design.md` §8

**ADR:** `docs/adr/0015-treasury-service.md`

**Blocks:** Task 6 of `docs/superpowers/plans/2026-10-13-relay-funding-phase-1.md`, and nothing else. Tasks 1–5 of that plan can run in parallel with this.

## Global Constraints

- **A key never leaves this service.** Not in a response, not in a log, not in an error message, not in a health check. No route returns key material, and there is a test that asserts it.
- **No address is ever configuration.** Every address this system uses for a refund or a recovery is derived from a key held here. If a plan step has you typing an address into a config file, the step is wrong.
- **This service has no public ingress.** It is reachable on the internal network only, and the API authenticates with a shared secret compared in constant time.
- **It fails to boot on a bad key.** Unlike the API, there is no useful degraded mode: a treasury with no keys reports no addresses and the API hides funding anyway, so a loud boot failure is strictly clearer than a quiet half-start.
- **Derivation is tested against an independent tool**, never against a value this codebase produced. A derivation that agrees only with itself is a derivation that can be confidently wrong.
- `packages/keys` is **node-only** and must never appear in `apps/web`'s dependency graph. `packages/chain` is imported by the web app; this is why the derivations do not live there.
- Bitcoin addresses are **p2wpkh** (`bc1q…`). Relay's own native BTC identifier is bech32 v0, and BTC addresses are case-sensitive.
- Conventional commits (`feat` / `fix` / `refactor` / `chore`).
- `vitest` does not typecheck. Run `pnpm -r typecheck` **and** `pnpm -r test` before every commit.

## Facts established by reading the repo (do not re-derive)

- `pnpm-workspace.yaml` already globs `services/*` and `packages/*`. Neither a new service nor a new package needs a workspace change.
- `services/api` pins `@solana/kit 2.3.0`. Match it exactly — two kit versions in one install is a class of bug nobody enjoys.
- `services/api/src/relay/signer.ts:35` already has `parseSecretKey`, which accepts all three formats people actually store a Solana key in: a `solana-keygen` JSON array, base58 64 bytes, and a bare 32-byte seed. It is tested in `signer.test.ts`. **Move it, do not rewrite it** — Task 2.
- None of `@noble/curves`, `@noble/hashes`, `@scure/btc-signer`, `viem` or `ethers` is installed anywhere in the workspace today. All are new direct dependencies of `packages/keys`.
- `viem` is deliberately **not** among them. Deriving an address needs a curve and a hash; building a transaction needs viem, and building transactions is what settling will do. Add it then.

---

### Task 1: EVM derivation

**Files:**

- Create: `packages/keys/package.json`
- Create: `packages/keys/tsconfig.json`
- Create: `packages/keys/src/evm.ts`
- Create: `packages/keys/src/evm.test.ts`
- Create: `packages/keys/vitest.config.ts`

**Interfaces:**

- Produces: `evmAddressFrom(raw: string): string` — a checksummed `0x…` address.

- [ ] **Step 1: Scaffold the package**

Copy the shape of `packages/chain/package.json` — same `exports` style, same scripts, `workspace:*` for internal deps. Name it `@mercury/keys`.

```json
{
  "name": "@mercury/keys",
  "private": true,
  "type": "module",
  "exports": {
    "./evm": "./src/evm.ts",
    "./svm": "./src/svm.ts",
    "./bvm": "./src/bvm.ts"
  },
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": {
    "@noble/curves": "^1.9.0",
    "@noble/hashes": "^1.8.0",
    "@scure/btc-signer": "^1.5.0",
    "@solana/kit": "2.3.0"
  }
}
```

No root `"."` export, on purpose. A caller names the curve it wants, so an import can never pull all three signing stacks in because it only needed one.

- [ ] **Step 2: Generate the test vector with an independent tool**

Do **not** write a vector from memory, and do not generate one with the code under test. Use `cast` (Foundry) or any established wallet, and record the exact command in the test file so the next person can re-check it:

```bash
# A throwaway key. Record both values in the test.
cast wallet address --private-key 0x0000000000000000000000000000000000000000000000000000000000000001
```

Generate a second vector from a random key the same way. Two vectors, because one can agree with a coincidence.

- [ ] **Step 3: Write the failing test**

```ts
// packages/keys/src/evm.test.ts
import { describe, expect, it } from "vitest";
import { evmAddressFrom } from "./evm.js";

/*
 * Vectors from Foundry, not from this code:
 *   cast wallet address --private-key <key>
 * A derivation checked against itself is a derivation that can be confidently
 * wrong, and being wrong here means refunds sent to an address nobody holds.
 */
const VECTORS: readonly { readonly key: string; readonly address: string }[] = [
  { key: "0x" + "0".repeat(63) + "1", address: "<paste from cast>" },
  { key: "<a second random key>", address: "<paste from cast>" },
];

describe("evmAddressFrom", () => {
  it.each(VECTORS)("derives $address", ({ key, address }) => {
    expect(evmAddressFrom(key)).toBe(address);
  });

  it("accepts a key with no 0x prefix", () => {
    const [first] = VECTORS;
    expect(evmAddressFrom(first!.key.slice(2))).toBe(first!.address);
  });

  it("returns a checksummed address, not lowercase", () => {
    const [first] = VECTORS;
    /* EIP-55: a lowercase address is valid but no tool displays one, and an
       operator comparing ours against Etherscan should see the same string. */
    expect(evmAddressFrom(first!.key)).not.toBe(first!.address.toLowerCase());
  });

  it("refuses a key of the wrong length rather than deriving something", () => {
    expect(() => evmAddressFrom("0xdeadbeef")).toThrow(/32 bytes/i);
  });

  it("refuses a key that is not hex", () => {
    expect(() => evmAddressFrom("0x" + "z".repeat(64))).toThrow(/hex/i);
  });

  it("refuses an empty key without a confusing message", () => {
    expect(() => evmAddressFrom("   ")).toThrow(/empty/i);
  });

  it("never puts the key in the error it throws", () => {
    const key = "0x" + "ab".repeat(20); // too short on purpose
    try {
      evmAddressFrom(key);
      throw new Error("should have refused");
    } catch (err) {
      expect((err as Error).message).not.toContain("abab");
    }
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `cd packages/keys && pnpm vitest run src/evm.test.ts`
Expected: FAIL — cannot resolve `./evm.js`.

- [ ] **Step 5: Write the derivation**

```ts
// packages/keys/src/evm.ts
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";

/**
 * An Ethereum address from the key that spends it.
 *
 * The last twenty bytes of the keccak hash of the uncompressed public key,
 * minus its `0x04` tag. Checksummed per EIP-55, because an operator comparing
 * this against a block explorer should be reading the same string.
 *
 * It exists so that no refund address is ever configuration. A configured
 * address can be one we hold no key for and nothing would catch it; a derived
 * one cannot be.
 */

const hexToBytes = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    /* Never the input in the message: this function is only ever called on a key. */
    if (Number.isNaN(byte)) throw new Error("The EVM key is not hex.");
    out[i] = byte;
  }
  return out;
};

/** EIP-55: a nibble is uppercase when the corresponding hash nibble is 8 or more. */
const checksum = (lower: string): string => {
  const hash = Buffer.from(keccak_256(new TextEncoder().encode(lower))).toString("hex");
  return (
    "0x" + [...lower].map((ch, i) => (Number.parseInt(hash[i]!, 16) >= 8 ? ch.toUpperCase() : ch)).join("")
  );
};

export const evmAddressFrom = (raw: string): string => {
  const text = raw.trim().replace(/^0x/i, "");
  if (text.length === 0) throw new Error("The EVM key is empty.");
  if (text.length !== 64) throw new Error(`The EVM key is ${text.length / 2} bytes; expected 32 bytes.`);

  const pub = secp256k1.getPublicKey(hexToBytes(text), false).slice(1);
  return checksum(Buffer.from(keccak_256(pub)).toString("hex").slice(-40));
};
```

- [ ] **Step 6: Run the tests and commit**

```bash
cd packages/keys && pnpm vitest run src/evm.test.ts
cd ../.. && pnpm -r typecheck
git add packages/keys
git commit -m "feat(keys): derive an EVM address from the key that spends it"
```

---

### Task 2: Solana derivation, moved rather than rewritten

`parseSecretKey` already exists and already handles the three formats people store a Solana key in. Moving it is the work; writing a second one is the mistake.

**Files:**

- Create: `packages/keys/src/svm.ts`
- Create: `packages/keys/src/svm.test.ts`
- Modify: `services/api/src/relay/signer.ts` (import from `@mercury/keys/svm`, delete the local copy)
- Modify: `services/api/src/relay/signer.test.ts` (its `parseSecretKey` cases move with it)
- Modify: `services/api/package.json` (add `@mercury/keys`)

**Interfaces:**

- Produces: `parseSolanaSecretKey(raw: string): Uint8Array`, `svmAddressFrom(raw: string): Promise<string>`.
- Consumed by: `services/api/src/relay/signer.ts`, which keeps behaving exactly as it does today.

- [ ] **Step 1: Move `parseSecretKey` verbatim**

Copy `services/api/src/relay/signer.ts:35-62` into `packages/keys/src/svm.ts` as `parseSolanaSecretKey`, **including its docstring** — the one explaining why all three formats are accepted, which is the institutional memory of a deploy that failed on an undocumented format. Move its tests out of `signer.test.ts` into `svm.test.ts` unchanged.

- [ ] **Step 2: Add the derivation beside it**

```ts
// packages/keys/src/svm.ts — after parseSolanaSecretKey
import { createKeyPairSignerFromBytes, createKeyPairSignerFromPrivateKeyBytes } from "@solana/kit";

/**
 * A Solana address from the key that spends it.
 *
 * Async because ed25519 keys go through WebCrypto here, which is a promise.
 * The 64-byte form carries the public key already and the 32-byte seed does
 * not, which is the whole of the branch.
 */
export const svmAddressFrom = async (raw: string): Promise<string> => {
  const bytes = parseSolanaSecretKey(raw);
  const signer =
    bytes.length === 64
      ? await createKeyPairSignerFromBytes(bytes)
      : await createKeyPairSignerFromPrivateKeyBytes(bytes);
  return signer.address;
};
```

- [ ] **Step 3: Write the failing test**

Vectors from `solana-keygen`, recorded with the command:

```bash
solana-keygen new --no-bip39-passphrase -o /tmp/throwaway.json
solana-keygen pubkey /tmp/throwaway.json
cat /tmp/throwaway.json   # the JSON array form
```

Required cases:

1. The JSON-array key derives the address `solana-keygen pubkey` reported.
2. The same key as base58 64 bytes derives the same address.
3. A 32-byte seed derives an address, and the same seed twice derives the same one.
4. All of `parseSecretKey`'s existing refusals still refuse, with the same messages — these are moved tests and must pass unchanged.
5. The error for a malformed key does not contain the key.

- [ ] **Step 4: Repoint the API and prove nothing changed**

In `services/api/src/relay/signer.ts`, import `parseSolanaSecretKey` from `@mercury/keys/svm`, re-export it as `parseSecretKey` if anything else imports that name, and delete the local implementation. `keypairRelaySigner` is otherwise untouched.

Run the API's full suite. **`signer.test.ts` must pass without edits beyond the moved cases** — if it needs changing, the move was not verbatim and sponsorship behaviour has shifted.

```bash
cd services/api && pnpm vitest run src/relay/
```

- [ ] **Step 5: Typecheck, test, commit**

```bash
pnpm -r typecheck && pnpm -r test
git add packages/keys services/api
git commit -m "refactor(keys): move Solana key parsing out of the API and derive beside it"
```

---

### Task 3: Bitcoin derivation

The one with a format decision in it. p2wpkh, per ADR 0015.

**Files:**

- Create: `packages/keys/src/bvm.ts`
- Create: `packages/keys/src/bvm.test.ts`

**Interfaces:**

- Produces: `bvmAddressFrom(raw: string): string` — a `bc1q…` p2wpkh address.

- [ ] **Step 1: Confirm the library's surface before writing against it**

`@scure/btc-signer`'s export names are the one thing in this plan not read from an installed package. Install it, then check:

```bash
cd packages/keys && pnpm add @scure/btc-signer
node -e "const s=require('@scure/btc-signer'); console.log(Object.keys(s).filter(k=>/p2wpkh|WIF|NETWORK/i.test(k)))"
```

Expect `p2wpkh` and `WIF`. If the names differ, follow the installed version — not this plan.

- [ ] **Step 2: Generate vectors independently**

A WIF and its p2wpkh address, from Bitcoin Core or any established wallet, recorded with the command used. Two vectors.

```bash
# e.g. with Bitcoin Core
bitcoin-cli getnewaddress "" bech32
bitcoin-cli dumpprivkey <address>
```

- [ ] **Step 3: Write the failing test**

```ts
// packages/keys/src/bvm.test.ts
import { describe, expect, it } from "vitest";
import { bvmAddressFrom } from "./bvm.js";

/* Vectors from Bitcoin Core, not from this code. See ADR 0015 on why p2wpkh. */
const VECTORS: readonly { readonly key: string; readonly address: string }[] = [
  { key: "<WIF from bitcoin-cli dumpprivkey>", address: "<the bech32 address>" },
  { key: "<a second WIF>", address: "<its address>" },
];

describe("bvmAddressFrom", () => {
  it.each(VECTORS)("derives $address", ({ key, address }) => {
    expect(bvmAddressFrom(key)).toBe(address);
  });

  it("derives a mainnet p2wpkh address", () => {
    const [first] = VECTORS;
    expect(bvmAddressFrom(first!.key)).toMatch(/^bc1q[02-9ac-hj-np-z]{38}$/);
  });

  it("accepts a raw 32-byte hex key as well as a WIF", () => {
    /* Operators store these both ways. Accepting one format is a deploy that
       fails on the other, which is the lesson parseSolanaSecretKey records. */
    expect(bvmAddressFrom("0x" + "11".repeat(32))).toMatch(/^bc1q/);
  });

  it("is case-exact, because Bitcoin addresses are", () => {
    const [first] = VECTORS;
    expect(bvmAddressFrom(first!.key)).not.toBe(first!.address.toUpperCase());
  });

  it("refuses a testnet WIF rather than silently deriving a mainnet address", () => {
    /* A testnet key producing a confident mainnet address is a refund sent to
       an address nobody holds the key for — exactly what ADR 0015 exists to
       prevent. Use a real tb1/testnet WIF here. */
    expect(() => bvmAddressFrom("<a testnet WIF>")).toThrow(/mainnet/i);
  });

  it("refuses an empty or malformed key without echoing it", () => {
    expect(() => bvmAddressFrom("  ")).toThrow(/empty/i);
    try {
      bvmAddressFrom("Lzzzzzzzzzz");
      throw new Error("should have refused");
    } catch (err) {
      expect((err as Error).message).not.toContain("zzz");
    }
  });
});
```

- [ ] **Step 4: Run it and watch it fail, then write the derivation**

```ts
// packages/keys/src/bvm.ts
import { p2wpkh, WIF } from "@scure/btc-signer";
import { secp256k1 } from "@noble/curves/secp256k1";

/**
 * A Bitcoin address from the key that spends it, as p2wpkh.
 *
 * `bc1q…`, segwit v0, which is the format Relay's own tooling speaks — their
 * native BTC identifier in `GET /chains` is bech32 v0. Taproot would also work
 * and buys nothing here, and the choice is not an implementation detail: BTC
 * addresses are case-sensitive and a refund sent to the wrong format is not
 * recoverable.
 *
 * Both input formats are accepted for the reason `parseSolanaSecretKey`
 * records — a deploy that fails on a format nobody documented costs more than
 * a branch.
 */
export const bvmAddressFrom = (raw: string): string => {
  const text = raw.trim();
  if (text.length === 0) throw new Error("The Bitcoin key is empty.");

  let priv: Uint8Array;
  if (/^(0x)?[0-9a-f]{64}$/i.test(text)) {
    priv = Uint8Array.from(Buffer.from(text.replace(/^0x/i, ""), "hex"));
  } else {
    try {
      /* Mainnet only. A testnet WIF decoded against mainnet would produce a
         plausible address for a key that cannot spend from it. */
      priv = WIF().decode(text);
    } catch {
      throw new Error("The Bitcoin key is neither 32 bytes of hex nor a mainnet WIF.");
    }
  }

  const { address } = p2wpkh(secp256k1.getPublicKey(priv, true));
  if (address === undefined) throw new Error("The Bitcoin key did not produce an address.");
  return address;
};
```

Check how the installed `WIF` distinguishes networks and make the testnet case throw with "mainnet" in the message, as the test requires. If `WIF()` accepts a testnet key silently, compare the decoded network explicitly rather than trusting it.

- [ ] **Step 5: Run, typecheck, commit**

```bash
cd packages/keys && pnpm vitest run
cd ../.. && pnpm -r typecheck
git add packages/keys
git commit -m "feat(keys): derive a Bitcoin p2wpkh address from the key that spends it"
```

---

### Task 4: The service

One route, one secret, no key in any response.

**Files:**

- Create: `services/treasury/package.json`
- Create: `services/treasury/tsconfig.json`
- Create: `services/treasury/vitest.config.ts`
- Create: `services/treasury/src/config.ts`
- Create: `services/treasury/src/config.test.ts`
- Create: `services/treasury/src/app.ts`
- Create: `services/treasury/src/app.test.ts`
- Create: `services/treasury/src/index.ts`
- Create: `services/treasury/Dockerfile`
- Create: `services/treasury/.env.example`

**Interfaces:**

- Consumes: `@mercury/keys/{evm,svm,bvm}`.
- Produces: `GET /addresses` → `{ evm, svm, bvm }`; `GET /health` → `{ ok: true }`.

- [ ] **Step 1: Write the failing config test**

```ts
// services/treasury/src/config.test.ts
import { describe, expect, it } from "vitest";
import { readTreasuryConfig } from "./config.js";

const env = (over: Record<string, string | undefined> = {}) => ({
  TREASURY_SECRET: "shared",
  TREASURY_KEY_EVM: "0x" + "0".repeat(63) + "1",
  TREASURY_KEY_SVM: "<a valid solana key>",
  TREASURY_KEY_BVM: "0x" + "11".repeat(32),
  ...over,
});

describe("readTreasuryConfig", () => {
  it("derives all three addresses", async () => {
    const config = await readTreasuryConfig(env());
    expect(config.addresses.evm).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(config.addresses.bvm).toMatch(/^bc1q/);
    expect(config.addresses.svm).toHaveLength(44);
  });

  it.each(["TREASURY_KEY_EVM", "TREASURY_KEY_SVM", "TREASURY_KEY_BVM", "TREASURY_SECRET"])(
    "refuses to start without %s",
    async (missing) => {
      await expect(readTreasuryConfig(env({ [missing]: undefined }))).rejects.toThrow(missing);
    },
  );

  it("names the variable but never its value when a key is malformed", async () => {
    const secret = "0xnotakey";
    await expect(readTreasuryConfig(env({ TREASURY_KEY_EVM: secret }))).rejects.toThrow(/TREASURY_KEY_EVM/);
    await readTreasuryConfig(env({ TREASURY_KEY_EVM: secret })).catch((err: Error) => {
      expect(err.message).not.toContain("notakey");
    });
  });

  it("does not keep the keys once the addresses are derived", async () => {
    const config = await readTreasuryConfig(env());
    /* A key in a field is a key in a heap dump, a log line and an error report.
       Derivation is the only thing v1 does, so nothing needs them afterwards. */
    expect(JSON.stringify(config)).not.toContain("1111");
  });
});
```

- [ ] **Step 2: Write the config**

Derive at boot, keep the addresses, **drop the keys**. A loud failure naming the variable and never its value.

```ts
// services/treasury/src/config.ts
import { evmAddressFrom } from "@mercury/keys/evm";
import { svmAddressFrom } from "@mercury/keys/svm";
import { bvmAddressFrom } from "@mercury/keys/bvm";

export interface TreasuryConfig {
  readonly secret: string;
  readonly addresses: { readonly evm: string; readonly svm: string; readonly bvm: string };
}

const required = (env: Record<string, string | undefined>, name: string): string => {
  const value = env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is not set. The treasury cannot start without it.`);
  }
  return value;
};

/**
 * Keys in, addresses out, and the keys are not kept.
 *
 * There is no degraded mode worth having. A treasury that starts without a key
 * reports an address it cannot spend from, or no address at all — and the API
 * would hide funding either way, so a quiet half-start buys nothing and hides
 * the cause. It fails here, loudly, naming the variable.
 *
 * `catch` and rethrow, because a derivation error from a curve library can
 * carry the input it was given, and the input is a private key.
 */
export const readTreasuryConfig = async (
  env: Record<string, string | undefined>,
): Promise<TreasuryConfig> => {
  const secret = required(env, "TREASURY_SECRET");
  const derive = async <T>(name: string, from: (raw: string) => T | Promise<T>): Promise<T> => {
    const raw = required(env, name);
    try {
      return await from(raw);
    } catch {
      throw new Error(`${name} is not a key this service can read.`);
    }
  };

  return {
    secret,
    addresses: {
      evm: await derive("TREASURY_KEY_EVM", evmAddressFrom),
      svm: await derive("TREASURY_KEY_SVM", svmAddressFrom),
      bvm: await derive("TREASURY_KEY_BVM", bvmAddressFrom),
    },
  };
};
```

- [ ] **Step 3: Write the failing app test**

The security cases are the point of this file.

```ts
// services/treasury/src/app.test.ts — required cases
//
// 1. GET /addresses with the right secret returns all three addresses.
// 2. GET /addresses with a wrong secret returns 401 and no body beyond a code.
// 3. GET /addresses with no secret header returns 401.
// 4. GET /health needs no secret and reveals no address — a health check is
//    the one route something unauthenticated may reach, so it says `ok` and
//    nothing else.
// 5. No response from any route contains any key material. Boot the app with
//    known keys, request every route with and without auth, and assert no
//    response body contains a substring of any key.
// 6. The secret comparison is length-safe: a secret of a different length
//    returns 401 rather than throwing.
//
// Write these out in full. Case 5 is the one that would be embarrassing to
// discover in production, and it is three lines.
```

- [ ] **Step 4: Write the app**

```ts
// services/treasury/src/app.ts
import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { TreasuryConfig } from "./config.js";

/** Constant-time, and length-safe: `timingSafeEqual` throws on a mismatch. */
const sameSecret = (sent: string | undefined, expected: string): boolean => {
  if (sent === undefined) return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * The treasury's whole surface.
 *
 * Two routes, and the larger one returns three strings. That is deliberate: a
 * service that holds spendable keys should be small enough to read in one
 * sitting, and every route added to it has to justify itself against the fact
 * that a bug here reaches the refund float.
 *
 * Nothing signs. Settling is a later decision and will not be a route that
 * signs on request — see ADR 0015.
 */
export const createTreasuryApp = (config: TreasuryConfig) => {
  const app = new Hono();

  /* No secret, and nothing about the keys. Something unauthenticated may reach
     this, so it says `ok` and stops. */
  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/addresses", (c) => {
    if (!sameSecret(c.req.header("x-treasury-secret"), config.secret)) {
      /* A code and nothing else. An unauthenticated caller learns whether the
         service is up, which `/health` already tells them, and no more. */
      return c.json({ error: { code: "unauthorized" } }, 401);
    }
    return c.json({ addresses: config.addresses });
  });

  app.notFound((c) => c.json({ error: { code: "not_found" } }, 404));
  return app;
};
```

- [ ] **Step 5: Entrypoint, Dockerfile, env example**

`index.ts` reads the config, serves on `PORT`, and logs the three derived addresses at boot — addresses are public and an operator checking them against a block explorer is exactly the point.

`.env.example`:

```sh
# services/treasury/.env.example
#
# PRIVATE KEYS. This service exists so that these live in one place and no
# address is ever configuration — a configured address can be one we hold no
# key for, and nothing would catch it. See ADR 0015.
#
# Never commit a value here. Never copy one into another service.
TREASURY_KEY_EVM=
TREASURY_KEY_SVM=
TREASURY_KEY_BVM=

# Shared with services/api, which uses it to ask for addresses.
TREASURY_SECRET=
PORT=8080
```

Dockerfile: copy `apps/web/Dockerfile`'s workspace-aware structure. **No public port mapping** in the Coolify service definition — internal network only.

- [ ] **Step 6: Verify and commit**

```bash
pnpm check
```

```bash
git add services/treasury
git commit -m "feat(treasury): hold the refund keys and serve their addresses"
```

---

### Task 5: Prove the derived addresses are the right ones

The step this whole service exists for. If a derived address is wrong, every refund goes somewhere nobody can spend from, and no test inside this repo would know.

- [ ] **Step 1: Cross-check every address against an independent tool**

Boot the treasury with the real keys. For each address it logs:

| family | check against                                                                      |
| ------ | ---------------------------------------------------------------------------------- |
| EVM    | `cast wallet address --private-key <key>`, and the address on Etherscan            |
| SVM    | `solana-keygen pubkey <keyfile>`, and the account on Solscan                       |
| BVM    | `bitcoin-cli getaddressinfo <address>`, or an established wallet importing the WIF |

All three must match exactly, character for character. A BTC address matching except in case is **not** a match.

- [ ] **Step 2: Prove you can spend from each one**

Send a trivial amount in and move it out again, by hand, with the key. This is the only test that proves the key and the address belong together — derivation agreeing with a second tool shows the maths is right, not that the key in the environment is the key you think it is.

Do this before any `refundTo` points at these addresses.

- [ ] **Step 3: Confirm the API gets them**

With the treasury running, boot the API with `TREASURY_URL` and `TREASURY_SECRET` and confirm it fetches all three at startup and mounts the funding routes. Then stop the treasury, restart the API, and confirm the funding routes are **not** mounted and `/v1/money/fund/sources` 404s.

- [ ] **Step 4: Confirm the treasury is not reachable from outside**

From outside the internal network, `GET /addresses` and `GET /health` must both fail to connect. If either answers, the service definition has a public port and that is the finding.

- [ ] **Step 5: Record the addresses where an operator can find them**

Not in the repo. In whatever runbook or password manager the keys live in, beside them, so the next person can check an address without deriving it.

---

## What is deliberately not in this service yet

- **Nothing signs.** No transaction building, no UTXO selection, no fee estimation. Receiving a refund needs none of it: an address receives whether or not this is running.
- **No settling.** Who a refund belongs to, who approves returning it, and whether that is automatic — a separate decision and its own ADR. When it arrives it must not be a route that signs on request.
- **The relayer key stays in the API.** It should move here eventually, but `relay/signer.ts` and `relay/builds.ts` are deliberately coupled and separating them across a network boundary means the build record moves too. A refactor of working sponsorship, not part of this.
- **No key rotation.** Changing a key changes the derived address, which means a `refundTo` already minted into a live Relay quote points at the old one. Rotation therefore needs a plan for in-flight deposits, and that plan does not exist.
