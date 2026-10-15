# Telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The API container emits OpenTelemetry traces, metrics and logs — for HTTP requests, the eight background jobs, outbound calls and database queries — to a self-hosted Grafana LGTM stack, and carries a request id that joins a log line to a trace.

**Architecture:** One `src/telemetry/otel.ts` module started by `node --import` before the app loads, so auto-instrumentation can patch libraries before anything imports them. Telemetry degrades like every other optional capability in this service: no `OTEL_EXPORTER_OTLP_ENDPOINT` means the SDK never starts and the process carries no overhead. The jobs are instrumented at the single `every()` helper they all share.

**Tech Stack:** `@opentelemetry/sdk-node@0.223.0`, `@opentelemetry/auto-instrumentations-node@0.81.0`, `@opentelemetry/api@1.9.1`, `@opentelemetry/resources@2.12.0`, `@hono/otel@1.2.0`, Hono on Node 24 via tsx, Drizzle over postgres.js, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-15-observability-design.md`

## Global Constraints

- TypeScript strict, with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `verbatimModuleSyntax`. `exactOptionalPropertyTypes` means an optional property is omitted via object spread, never assigned `undefined`.
- `moduleResolution: "Bundler"`. Intra-package imports are written with a `.js` extension against `.ts` files (`./log.js`), as the rest of `services/api/src` does.
- Telemetry is OFF unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Tests run with it unset, and no test may require a collector.
- **Never** a span attribute, metric label or log field: email, Privy DID, wallet address, any public key, `Authorization` or `X-Privy-Identity-Token` headers, balances, portfolio totals, position sizes, P&L figures, or a transaction signature tied to a user.
- `user_id` (our own UUID) may go on a span. It must NOT go in a metric label — unbounded cardinality.
- Metric and span names are prefixed `mercury_` for our own instruments; names that OpenTelemetry semantic conventions define are left as the convention spells them.
- `pnpm check` (lint, format:check, typecheck, test) is green before every commit.
- Conventional commits; terse bodies. Commits end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- The Vercel deployment (`src/vercel.ts`) is dormant and out of scope. Do not add telemetry to it.

---

### Task 1: The OTel bootstrap

**Files:**

- Create: `services/api/src/telemetry/otel.ts`
- Create: `services/api/src/telemetry/otel.test.ts`
- Modify: `services/api/Dockerfile` (the `CMD` line)
- Modify: `services/api/src/dockerfile.test.ts` (add a case)
- Modify: `services/api/src/index.ts` (one boot announcement)
- Modify: `services/api/.env.example`

**Interfaces:**

- Produces: `startTelemetry(env?: NodeJS.ProcessEnv): Promise<boolean>` — starts the SDK and resolves `true`, or resolves `false` when unconfigured. `telemetryEndpoint(env?): string | null`.
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Write the failing test**

`services/api/src/telemetry/otel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { telemetryEndpoint } from "./otel.js";

describe("telemetryEndpoint", () => {
  it("is null when nothing is configured, which is how telemetry stays off", () => {
    /* Tests run without a collector, and so does a deployment that has not
       been given one. Both have to be a no-op rather than a connection
       refused on every span. */
    expect(telemetryEndpoint({})).toBe(null);
  });

  it("reads the standard OTel variable, so no Mercury-specific name exists", () => {
    expect(telemetryEndpoint({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://lgtm:4318" })).toBe("http://lgtm:4318");
  });

  it("treats an empty value as absent", () => {
    /* Coolify writes an empty string for a variable somebody cleared rather
       than removing the key. */
    expect(telemetryEndpoint({ OTEL_EXPORTER_OTLP_ENDPOINT: "" })).toBe(null);
    expect(telemetryEndpoint({ OTEL_EXPORTER_OTLP_ENDPOINT: "   " })).toBe(null);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd services/api && pnpm vitest run src/telemetry/otel.test.ts`
Expected: FAIL — cannot resolve `./otel.js`.

- [ ] **Step 3: Write the bootstrap**

`services/api/src/telemetry/otel.ts`:

```ts
/**
 * OpenTelemetry, started before the app it watches.
 *
 * Loaded with `node --import ./src/telemetry/otel.ts`, which is the whole
 * reason this file is separate from `index.ts`: auto-instrumentation works by
 * patching modules as they load, so anything imported before the SDK starts is
 * something the SDK never sees. The failure mode is silence — no error, no
 * spans, nothing saying the flag was dropped — which is why
 * `dockerfile.test.ts` asserts on the command line.
 *
 * Off unless configured, like every other optional capability in this service
 * (`relay`, `fund`, `notifier`, the Pyth feed). An unset endpoint means the SDK
 * never starts: no exporter retrying against a host that is not there, no
 * overhead, and one line at boot saying so. Tests run this way.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { defaultResource, resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from "@opentelemetry/semantic-conventions";

type Env = NodeJS.ProcessEnv;

/** Where telemetry goes, or nothing. The standard variable, not one of ours. */
export const telemetryEndpoint = (env: Env = process.env): string | null => {
  const value = env["OTEL_EXPORTER_OTLP_ENDPOINT"]?.trim();
  return value === undefined || value.length === 0 ? null : value;
};

/**
 * Metrics are pushed every thirty seconds.
 *
 * Nothing here changes faster than the slowest job's cadence worth watching,
 * and a shorter period is more writes for a graph nobody reads between them.
 */
const METRIC_PERIOD_MS = 30_000;

let sdk: NodeSDK | null = null;

export const startTelemetry = async (env: Env = process.env): Promise<boolean> => {
  if (telemetryEndpoint(env) === null) return false;

  sdk = new NodeSDK({
    resource: defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]: env["OTEL_SERVICE_NAME"] ?? "mercury-api",
        [ATTR_SERVICE_VERSION]: env["GIT_SHA"] ?? "dev",
        [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: env["NODE_ENV"] ?? "development",
      }),
    ),
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: METRIC_PERIOD_MS,
      }),
    ],
    logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter())],
    /*
     * `fs` off, deliberately. It spans every file read tsx performs, which on
     * this service is thousands per cold start and tells nobody anything.
     */
    instrumentations: [
      getNodeAutoInstrumentations({ "@opentelemetry/instrumentation-fs": { enabled: false } }),
    ],
  });

  sdk.start();

  /*
   * Flush on the way out. The container runs under tini, which forwards
   * SIGTERM, and a batch processor that has not flushed loses the spans from
   * the request that was being served when the deploy rolled.
   */
  const stop = () => void sdk?.shutdown().catch(() => undefined);
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  return true;
};

/* Started on import, because `--import` is how this file is loaded. */
await startTelemetry();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd services/api && pnpm vitest run src/telemetry/otel.test.ts`
Expected: PASS, 3 tests. The module-level `await startTelemetry()` is a no-op under test because the variable is unset.

- [ ] **Step 5: Add the flag to the Dockerfile**

In `services/api/Dockerfile`, replace the final `CMD` with:

```dockerfile
# `--import tsx` first, because the telemetry module is TypeScript and needs
# the transpiler already registered. Then telemetry, then the app: OTel patches
# libraries as they load, so anything imported before it starts goes
# uninstrumented — silently. src/dockerfile.test.ts asserts this order.
CMD ["node", "--import", "tsx", "--import", "./src/telemetry/otel.ts", "src/index.ts"]
```

- [ ] **Step 6: Assert the order in the Dockerfile test**

Append to `describe("services/api/Dockerfile", …)` in `services/api/src/dockerfile.test.ts`:

```ts
/**
 * Telemetry is loaded before the app, and tsx before telemetry.
 *
 * Both orderings are load-bearing and neither fails loudly. tsx after the
 * telemetry module means node cannot parse the TypeScript and the container
 * dies at boot, which at least says so. Telemetry after the app means
 * auto-instrumentation patches nothing, the server starts normally, and the
 * only symptom is an empty Grafana — which reads as a broken collector, and
 * sends whoever is debugging it to the wrong box.
 */
it("loads tsx, then telemetry, then the app", () => {
  const cmd = /^CMD \[(.+)\]$/m.exec(dockerfile)?.[1];
  expect(cmd).toBeDefined();

  const args = [...cmd!.matchAll(/"([^"]*)"/g)].map((m) => m[1]!);
  const tsx = args.indexOf("tsx");
  const telemetry = args.findIndex((a) => a.includes("telemetry/otel"));
  const entry = args.findIndex((a) => a.endsWith("index.ts"));

  expect(tsx).toBeGreaterThan(-1);
  expect(telemetry).toBeGreaterThan(tsx);
  expect(entry).toBeGreaterThan(telemetry);
});
```

- [ ] **Step 7: Announce it at boot**

In `services/api/src/index.ts`, after the existing `console.log("migrations: up to date")`, add:

```ts
/*
 * Said out loud for the reason the relayer and the Pyth feed are: a deployment
 * that believes it is reporting telemetry and is not looks exactly like one
 * whose collector is down, and the two are fixed in different places.
 */
console.log(
  telemetryEndpoint() === null
    ? "telemetry: off (OTEL_EXPORTER_OTLP_ENDPOINT unset)"
    : `telemetry: on, exporting to ${telemetryEndpoint()!}`,
);
```

with `import { telemetryEndpoint } from "./telemetry/otel.js";` added to the imports.

- [ ] **Step 8: Document the variables**

Append to `services/api/.env.example`:

```
# Telemetry. Unset means off: no SDK, no overhead, and the API says so at boot.
# Point this at the LGTM container's OTLP HTTP port on the private network.
OTEL_EXPORTER_OTLP_ENDPOINT=
# Optional. Defaults to mercury-api.
OTEL_SERVICE_NAME=
```

- [ ] **Step 9: Verify and commit**

Run: `cd /Users/sainathr19/Desktop/unit/mercury && pnpm check`
Expected: green.

```bash
git add services/api/src/telemetry services/api/Dockerfile services/api/src/dockerfile.test.ts services/api/src/index.ts services/api/.env.example services/api/package.json pnpm-lock.yaml
git commit -m "feat(api): start OpenTelemetry before the app, off unless configured"
```

---

### Task 2: The attribute deny-list

Done before the instrumentation that would use it, so no span is ever written without it.

**Files:**

- Create: `services/api/src/telemetry/attributes.ts`
- Create: `services/api/src/telemetry/attributes.test.ts`

**Interfaces:**

- Produces: `safeAttributes(input: Record<string, unknown>): Attributes` — drops banned keys and anything non-scalar. `BANNED: readonly RegExp[]`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

`services/api/src/telemetry/attributes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { safeAttributes } from "./attributes.js";

describe("safeAttributes", () => {
  it("keeps the attributes worth having", () => {
    expect(safeAttributes({ job: "position-sync", rows: 12, failed: false })).toEqual({
      job: "position-sync",
      rows: 12,
      failed: false,
    });
  });

  it.each([
    "email",
    "user_email",
    "privy_user_id",
    "privyUserId",
    "wallet_address",
    "walletAddress",
    "recipient_address",
    "authorization",
    "x-privy-identity-token",
    "tx_signature",
    "txSignature",
    "balance_usd",
    "total_usd",
    "portfolio_total",
    "realised_pnl_usd",
    "shares",
    "cost_basis_usd",
    "secret_key",
    "relayer_secret_key",
    "api_key",
  ])("refuses %s, whatever the instrumentation thought it was doing", (key) => {
    /* A rule kept by remembering it at each call site is a rule the next call
       site breaks. There are dozens, across this service and the packages it
       runs, and telemetry is a classic way to leak a database one attribute at
       a time. */
    expect(safeAttributes({ [key]: "anything", job: "ok" })).toEqual({ job: "ok" });
  });

  it("matches a banned name however it is cased or separated", () => {
    expect(safeAttributes({ WALLET_ADDRESS: "x" })).toEqual({});
    expect(safeAttributes({ "user.email": "x" })).toEqual({});
    expect(safeAttributes({ userEmail: "x" })).toEqual({});
  });

  it("allows user_id, which is ours and not a person's name for themselves", () => {
    /* Our own UUID, on our own infrastructure, and a trace without it cannot
       answer whose request this was. It is banned from metric labels by
       construction instead: nothing in metrics/ accepts an id. */
    expect(safeAttributes({ user_id: "6f1b…" })).toEqual({ user_id: "6f1b…" });
  });

  it("drops a value that is not a scalar, rather than stringifying it", () => {
    /* An object stringified into an attribute is how a whole order row, or a
       `decision` blob, reaches a log aggregator. */
    expect(safeAttributes({ order: { usdAmount: "100" }, job: "ok" })).toEqual({ job: "ok" });
    expect(safeAttributes({ when: new Date(), job: "ok" })).toEqual({ job: "ok" });
  });

  it("keeps an array of scalars, which OTel accepts", () => {
    expect(safeAttributes({ chains: ["base", "arbitrum"] })).toEqual({ chains: ["base", "arbitrum"] });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd services/api && pnpm vitest run src/telemetry/attributes.test.ts`
Expected: FAIL — cannot resolve `./attributes.js`.

- [ ] **Step 3: Write the implementation**

`services/api/src/telemetry/attributes.ts`:

```ts
/**
 * What is allowed to leave this process as telemetry.
 *
 * Mercury holds what people own and what they are worth, and an attribute is
 * the easiest way for that to end up somewhere it was never meant to be: a
 * span attribute, a metric label, a log field, each one a line in a store with
 * different retention and different access than the database. So the rule is a
 * function every instrumentation goes through, rather than a convention each
 * call site is trusted with.
 *
 * `user_id` is deliberately allowed. It is our own UUID, it never leaves our
 * own infrastructure, and a trace that cannot say whose request it was cannot
 * answer the question anybody actually asks. It is kept out of metric labels
 * by construction instead — nothing in `metrics.ts` takes an id — because
 * there it would be unbounded cardinality rather than a privacy problem.
 */
import type { Attributes, AttributeValue } from "@opentelemetry/api";

/**
 * Matched against the key with separators removed and everything lower-cased,
 * so `walletAddress`, `wallet_address`, `WALLET-ADDRESS` and `user.wallet.address`
 * are one pattern rather than four.
 */
const BANNED: readonly RegExp[] = [
  /email/,
  /privyuserid/,
  /address/,
  /publickey/,
  /authorization/,
  /identitytoken/,
  /bearer/,
  /cookie/,
  /secret/,
  /apikey/,
  /privatekey/,
  /mnemonic|seedphrase/,
  /signature/,
  /\busd\b|usd$/,
  /balance/,
  /pnl/,
  /^shares$|shares$/,
  /costbasis/,
  /portfolio(total|value)/,
];

const flat = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Allowed as-is: an exact key that a BANNED pattern would otherwise catch. */
const ALLOWED = new Set(["userid"]);

const scalar = (value: unknown): value is AttributeValue => {
  const ok = (v: unknown) => typeof v === "string" || typeof v === "number" || typeof v === "boolean";
  return ok(value) || (Array.isArray(value) && value.every(ok));
};

export const banned = (key: string): boolean => {
  const name = flat(key);
  if (ALLOWED.has(name)) return false;
  return BANNED.some((pattern) => pattern.test(name));
};

export const safeAttributes = (input: Readonly<Record<string, unknown>>): Attributes => {
  const out: Record<string, AttributeValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (banned(key) || !scalar(value)) continue;
    out[key] = value;
  }
  return out;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd services/api && pnpm vitest run src/telemetry/attributes.test.ts`
Expected: PASS. If `/\busd\b|usd$/` does not catch `balance_usd`, fix the pattern rather than the test.

- [ ] **Step 5: Mutation-test the guard**

Temporarily delete one pattern from `BANNED` (say `/address/`) and re-run. The `wallet_address` case must fail. Restore it. A guard that passes with its rule removed is not a guard.

- [ ] **Step 6: Commit**

Run: `cd /Users/sainathr19/Desktop/unit/mercury && pnpm check`

```bash
git add services/api/src/telemetry/attributes.ts services/api/src/telemetry/attributes.test.ts
git commit -m "feat(api): one gate for what telemetry may carry out of the process"
```

---

### Task 3: HTTP spans and a request id

**Files:**

- Create: `services/api/src/telemetry/request-id.ts`
- Create: `services/api/src/telemetry/request-id.test.ts`
- Modify: `services/api/src/app.ts`

**Interfaces:**

- Consumes: `safeAttributes` from Task 2.
- Produces: `requestId(): MiddlewareHandler` — sets `c.set("requestId", …)` and the `x-request-id` response header. Hono's `ContextVariableMap` gains `requestId: string`.

- [ ] **Step 1: Write the failing test**

`services/api/src/telemetry/request-id.test.ts`:

```ts
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { requestId } from "./request-id.js";

const appWith = () => {
  const app = new Hono();
  app.use("*", requestId());
  app.get("/x", (c) => c.json({ id: c.get("requestId") }));
  return app;
};

describe("requestId", () => {
  it("puts the same id on the context and the response header", async () => {
    /* The whole point: one value a person can read off a failed response and
       hand over, which finds the trace, the log lines and the queries. */
    const res = await appWith().request("/x");
    const body = (await res.json()) as { id: string };

    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("x-request-id")).toBe(body.id);
  });

  it("keeps an id a proxy already set, so one request is one id end to end", async () => {
    const res = await appWith().request("/x", { headers: { "x-request-id": "abc-123" } });

    expect(res.headers.get("x-request-id")).toBe("abc-123");
  });

  it("refuses a client-supplied id that is not shaped like one", async () => {
    /* Echoed into a log line and a response header, so it is caller-controlled
       output: a newline would forge a log entry and 8KB would be a free
       amplifier. Length and alphabet, then generate our own. */
    const res = await appWith().request("/x", {
      headers: { "x-request-id": "abc\ndef: forged" },
    });

    expect(res.headers.get("x-request-id")).not.toContain("\n");
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("refuses one that is merely too long", async () => {
    const res = await appWith().request("/x", { headers: { "x-request-id": "a".repeat(200) } });

    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd services/api && pnpm vitest run src/telemetry/request-id.test.ts`
Expected: FAIL — cannot resolve `./request-id.js`.

- [ ] **Step 3: Write the middleware**

`services/api/src/telemetry/request-id.ts`:

```ts
/**
 * One id per request, on the context, on the active span and in the response.
 *
 * This is the thing that makes a report usable. "It failed" becomes a value
 * somebody can paste, which finds the trace, every log line the request wrote
 * and every query it ran — across three stores that otherwise share no key.
 *
 * An inbound id is kept so that a value set by a proxy, or by the web app on a
 * retry, stays the same id end to end. It is validated first: this value is
 * echoed into a response header and into log lines, so an unchecked one is a
 * caller writing our logs. A newline forges an entry; eight kilobytes is a
 * free amplifier. Shape and length, or we mint our own.
 */
import { randomUUID } from "node:crypto";
import { trace } from "@opentelemetry/api";
import type { MiddlewareHandler } from "hono";

declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
  }
}

const HEADER = "x-request-id";

/** Hex, dashes and underscores only, and short enough to be a header. */
const WELL_FORMED = /^[A-Za-z0-9_-]{8,64}$/;

export const requestId = (generate: () => string = randomUUID): MiddlewareHandler => {
  return async (c, next) => {
    const given = c.req.header(HEADER);
    const id = given !== undefined && WELL_FORMED.test(given) ? given : generate();

    c.set("requestId", id);
    c.header(HEADER, id);
    /* On the span too, so Tempo can be searched by the id a person quoted. */
    trace.getActiveSpan()?.setAttribute("mercury.request_id", id);

    await next();
  };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd services/api && pnpm vitest run src/telemetry/request-id.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Mount both middlewares**

In `services/api/src/app.ts`, replace `app.use("*", cors());` with:

```ts
/*
 * Above cors(), so a request CORS turns away is still a request that was
 * counted and traced. A rejected preflight is exactly the kind of failure
 * that otherwise shows up as "the app is broken" and nothing in the logs.
 *
 * @hono/otel's default `http.route` is the Hono route pattern, which is what
 * this needs: `/v1/invest/:ticker` and never `/v1/invest/AAPL`. The second
 * would make every ticker its own time series, and the error-rate graph
 * unreadable by the time it mattered.
 *
 * Header capture is left off. It is opt-in in the library and would be a
 * standing invitation to record an Authorization header.
 */
app.use("*", httpInstrumentationMiddleware({ serviceName: "mercury-api" }));
app.use("*", requestId());
app.use("*", cors());
```

with these imports added:

```ts
import { httpInstrumentationMiddleware } from "@hono/otel";
import { requestId } from "./telemetry/request-id.js";
```

- [ ] **Step 6: Put the request id on the error path**

In `app.ts`, replace the body of `app.onError` with:

```ts
app.onError((err, c) => {
  if (err.message.startsWith("buildDeps:")) return c.json(NOT_READY, 503);
  /* The id in the log line and in the body, so the sentence a user reads and
       the line an engineer greps for are the same request. */
  const id = c.get("requestId");
  console.error(`request ${id} failed:`, err);
  return c.json({ ...fail("internal", "Something went wrong."), requestId: id }, 500);
});
```

- [ ] **Step 7: Check for duplicate spans**

Run the API with telemetry pointed at a throwaway collector (or `OTEL_TRACES_EXPORTER=console` and `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318`), make one request, and count the server spans. Node's HTTP auto-instrumentation creates inbound spans and so does `@hono/otel`.

If there are two, disable the HTTP instrumentation's server spans in `otel.ts`:

```ts
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        /* @hono/otel owns the server span; this would be a second one over the
           same request, with a path instead of a route pattern. */
        "@opentelemetry/instrumentation-http": { disableIncomingRequestInstrumentation: true },
      }),
    ],
```

Record what you found in the commit body, because the next person will ask.

- [ ] **Step 8: Verify and commit**

Run: `cd /Users/sainathr19/Desktop/unit/mercury && pnpm check`

```bash
git add services/api/src/telemetry services/api/src/app.ts
git commit -m "feat(api): a request id, and a span per request"
```

---

### Task 4: Structured logs with trace correlation

**Files:**

- Modify: `services/api/src/log.ts`
- Create: `services/api/src/log-json.test.ts`
- Modify: `services/api/src/index.ts` (call it)

**Interfaces:**

- Consumes: `errorLine` (already exported from `log.ts`), `safeAttributes` from Task 2.
- Produces: `jsonErrors(target?: Console, env?: Env): void` — replaces the console writers with ones that emit a single JSON object per line, carrying `trace_id` and `span_id` from the active context.

- [ ] **Step 1: Write the failing test**

`services/api/src/log-json.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { jsonErrors } from "./log.js";

const capture = () => {
  const lines: string[] = [];
  const target = {
    log: (...a: unknown[]) => lines.push(String(a[0])),
    info: (...a: unknown[]) => lines.push(String(a[0])),
    warn: (...a: unknown[]) => lines.push(String(a[0])),
    error: (...a: unknown[]) => lines.push(String(a[0])),
  };
  return { target, lines };
};

describe("jsonErrors", () => {
  it("does nothing unless telemetry is configured", () => {
    /* A person tailing the container gets log.ts's one-line format, which was
       written for exactly that and is better at it. JSON is for the collector. */
    const { target, lines } = capture();
    jsonErrors(target, {});

    target.log("migrations: up to date");

    expect(lines[0]).toBe("migrations: up to date");
  });

  it("emits one JSON object per line when it is", () => {
    const { target, lines } = capture();
    jsonErrors(target, { OTEL_EXPORTER_OTLP_ENDPOINT: "http://lgtm:4318" });

    target.log("migrations: up to date");

    expect(JSON.parse(lines[0]!)).toMatchObject({ level: "info", msg: "migrations: up to date" });
  });

  it("names the level the way a log store expects", () => {
    const { target, lines } = capture();
    jsonErrors(target, { OTEL_EXPORTER_OTLP_ENDPOINT: "x" });

    target.error("position-sync failed");
    target.warn("slow");

    expect(JSON.parse(lines[0]!).level).toBe("error");
    expect(JSON.parse(lines[1]!).level).toBe("warn");
  });

  it("reduces an Error to its one line rather than a stack", () => {
    /* The reasoning in log.ts holds in either format: a trace is a screenful
       of node_modules frames around the one sentence that says what broke. */
    const { target, lines } = capture();
    jsonErrors(target, { OTEL_EXPORTER_OTLP_ENDPOINT: "x" });

    target.error("job failed:", new TypeError("nope"));

    const line = JSON.parse(lines[0]!) as { msg: string };
    expect(line.msg).toBe("job failed: TypeError: nope");
    expect(line.msg).not.toContain("at ");
  });

  it("carries no trace id when there is no active span", () => {
    const { target, lines } = capture();
    jsonErrors(target, { OTEL_EXPORTER_OTLP_ENDPOINT: "x" });

    target.log("boot");

    expect(JSON.parse(lines[0]!).trace_id).toBeUndefined();
  });

  it("never throws on a value that will not serialise", () => {
    /* A log line that crashes the logger takes the process with it. */
    const { target, lines } = capture();
    jsonErrors(target, { OTEL_EXPORTER_OTLP_ENDPOINT: "x" });
    const looped: Record<string, unknown> = {};
    looped["self"] = looped;

    expect(() => target.log("cycle", looped)).not.toThrow();
    expect(lines).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd services/api && pnpm vitest run src/log-json.test.ts`
Expected: FAIL — `jsonErrors` is not exported.

- [ ] **Step 3: Add the JSON writer**

Append to `services/api/src/log.ts`:

```ts
/**
 * The same log lines as JSON, when there is a collector to read them.
 *
 * A second format rather than a replacement. `oneLineErrors` was written for a
 * person tailing the container and is better at that than any JSON could be,
 * so it stays the default; this takes over only where something is parsing.
 *
 * `trace_id` is the field that earns the whole telemetry stack. Without it a
 * log store answers "an error happened at 14:02"; with it, Grafana goes from
 * that line to the request it happened in and everything else that request
 * did. `span_id` narrows it to the handler.
 *
 * Level names are the ones log stores expect — `console.log` and
 * `console.info` are both `info`, because the distinction means nothing to
 * anything downstream.
 */
const LEVEL_NAMES: Readonly<Record<(typeof LEVELS)[number], string>> = {
  error: "error",
  warn: "warn",
  log: "info",
  info: "info",
};

/** One argument as text: an Error is its line, an object is JSON, anything else is itself. */
const part = (value: unknown): string => {
  if (value instanceof Error) return errorLine(value);
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    /* A cycle, or a BigInt. A log line that throws takes the process with it. */
    return String(value);
  }
};

export const jsonErrors = (target: Console = console, env: Env = process.env): void => {
  const endpoint = env["OTEL_EXPORTER_OTLP_ENDPOINT"]?.trim();
  if (endpoint === undefined || endpoint.length === 0) return;

  for (const level of LEVELS) {
    const write = target[level].bind(target);
    target[level] = (...args: unknown[]) => {
      const span = trace.getActiveSpan()?.spanContext();
      const line = {
        level: LEVEL_NAMES[level],
        msg: args.map(part).join(" "),
        ...(span === undefined ? {} : { trace_id: span.traceId, span_id: span.spanId }),
      };
      try {
        write(JSON.stringify(line));
      } catch {
        write(`{"level":"${LEVEL_NAMES[level]}","msg":"unserialisable log line"}`);
      }
    };
  }
};
```

with `import { trace } from "@opentelemetry/api";` added at the top of `log.ts`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd services/api && pnpm vitest run src/log-json.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Call it at boot**

In `services/api/src/index.ts`, immediately after `oneLineErrors();`:

```ts
/*
 * After oneLineErrors, so an Error still becomes its one line and then that
 * line becomes the `msg` field. The order is the whole behaviour: reversed,
 * the JSON writer would be wrapped by the one-line writer and every line
 * would be a JSON string inside a plain one.
 */
jsonErrors();
```

- [ ] **Step 6: Verify the composition by hand**

Run: `cd services/api && OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 node --import tsx -e 'import("./src/log.js").then(({oneLineErrors,jsonErrors})=>{oneLineErrors();jsonErrors();console.error("x:", new TypeError("y"))})'`
Expected: one line of JSON whose `msg` is `x: TypeError: y`, with no stack frames and no nested quoting.

- [ ] **Step 7: Verify and commit**

Run: `cd /Users/sainathr19/Desktop/unit/mercury && pnpm check`

```bash
git add services/api/src/log.ts services/api/src/log-json.test.ts services/api/src/index.ts
git commit -m "feat(api): log as JSON with the trace id when a collector is configured"
```

---

### Task 5: The background jobs

The highest-value task in this plan. Eight jobs, one helper, no instrumentation today.

**Files:**

- Create: `services/api/src/telemetry/metrics.ts`
- Create: `services/api/src/jobs/every.ts`
- Create: `services/api/src/jobs/every.test.ts`
- Modify: `services/api/src/index.ts` (delete the inline helper, import the new one)

**Interfaces:**

- Consumes: `safeAttributes` from Task 2.
- Produces:
  - `jobMetrics(): { runs: Counter; duration: Histogram; rows: Counter }` from `metrics.ts`
  - `every(name: string, ms: number, run: () => Promise<string | null>, deps?: EveryDeps): void` from `jobs/every.ts`, where `EveryDeps = { now?: () => number; setTimeout?: typeof setTimeout; log?: Console; tracer?: Tracer }`

- [ ] **Step 1: Write the failing test**

`services/api/src/jobs/every.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { every } from "./every.js";

/** A clock and a scheduler the test drives, so no test waits on a real tick. */
const harness = () => {
  const pending: (() => void)[] = [];
  const lines: string[] = [];
  let clock = 0;
  return {
    lines,
    tick: async () => {
      const next = pending.shift();
      next?.();
      await vi.waitFor(() => undefined);
    },
    advance: (ms: number) => (clock += ms),
    deps: {
      now: () => clock,
      setTimeout: ((fn: () => void) => {
        pending.push(fn);
        return { unref: () => undefined } as unknown as NodeJS.Timeout;
      }) as unknown as typeof setTimeout,
      log: {
        log: (...a: unknown[]) => lines.push(a.join(" ")),
        error: (...a: unknown[]) => lines.push(a.join(" ")),
        warn: () => undefined,
        info: () => undefined,
      } as unknown as Console,
    },
  };
};

describe("every", () => {
  it("runs the job immediately rather than waiting out the first interval", async () => {
    /* index.ts relies on this: a deploy takes the current hour's
       portfolio-snapshot at once instead of up to an hour later. */
    const h = harness();
    const run = vi.fn(async () => null);

    every("job", 1000, run, h.deps);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });

  it("says nothing when the job had nothing to say", async () => {
    /* position-sync runs every two seconds. A line per pass would bury the
       passes that matter, which is why the helper takes `string | null`. */
    const h = harness();

    every("quiet", 1000, async () => null, h.deps);
    await vi.waitFor(() => expect(h.lines).toEqual([]));
  });

  it("logs the note the job returned, prefixed with its name", async () => {
    const h = harness();

    every("stocks", 1000, async () => "41 instruments", h.deps);
    await vi.waitFor(() => expect(h.lines).toContain("stocks: 41 instruments"));
  });

  it("keeps the schedule after a failure, because an upstream being down is not a reason to stop", async () => {
    const h = harness();
    const run = vi.fn(async () => {
      throw new Error("jupiter 429");
    });

    every("prices", 1000, run, h.deps);
    await vi.waitFor(() => expect(h.lines.some((l) => l.includes("prices failed"))).toBe(true));
    await h.tick();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });

  it("never lets two passes overlap", async () => {
    /* The reason the next run is scheduled after the last one finishes and
       never on a fixed tick: a pass that overruns its interval must not have a
       second one start behind it and write the same rows twice. */
    const h = harness();
    let inFlight = 0;
    let overlapped = false;

    every(
      "slow",
      1,
      async () => {
        inFlight += 1;
        if (inFlight > 1) overlapped = true;
        await Promise.resolve();
        inFlight -= 1;
        return null;
      },
      h.deps,
    );

    for (let i = 0; i < 5; i += 1) await h.tick();
    expect(overlapped).toBe(false);
  });

  it("records a span per pass, named for the job", async () => {
    const spans: { name: string; ended: boolean; attributes: Record<string, unknown> }[] = [];
    const h = harness();
    const tracer = {
      startActiveSpan: <T>(name: string, fn: (span: unknown) => T): T => {
        const record = { name, ended: false, attributes: {} as Record<string, unknown> };
        spans.push(record);
        return fn({
          setAttribute: (k: string, v: unknown) => void (record.attributes[k] = v),
          setAttributes: (a: Record<string, unknown>) => void Object.assign(record.attributes, a),
          recordException: () => undefined,
          setStatus: () => undefined,
          end: () => void (record.ended = true),
        });
      },
    };

    every("stocks", 1000, async () => "done", { ...h.deps, tracer: tracer as never });
    await vi.waitFor(() => expect(spans).toHaveLength(1));
    expect(spans[0]!.name).toBe("job stocks");
    await vi.waitFor(() => expect(spans[0]!.ended).toBe(true));
  });

  it("ends the span even when the job throws", async () => {
    /* A span left open is a trace that never arrives, so a failing job would
       be invisible in exactly the case it matters. */
    const spans: { ended: boolean }[] = [];
    const h = harness();
    const tracer = {
      startActiveSpan: <T>(_name: string, fn: (span: unknown) => T): T => {
        const record = { ended: false };
        spans.push(record);
        return fn({
          setAttribute: () => undefined,
          setAttributes: () => undefined,
          recordException: () => undefined,
          setStatus: () => undefined,
          end: () => void (record.ended = true),
        });
      },
    };

    every(
      "boom",
      1000,
      async () => {
        throw new Error("nope");
      },
      { ...h.deps, tracer: tracer as never },
    );

    await vi.waitFor(() => expect(spans[0]?.ended).toBe(true));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd services/api && pnpm vitest run src/jobs/every.test.ts`
Expected: FAIL — cannot resolve `./every.js`.

- [ ] **Step 3: Write the metrics module**

`services/api/src/telemetry/metrics.ts`:

```ts
/**
 * The instruments this service records, created once.
 *
 * Lazily, and cached, because a meter asked for before the SDK starts is a
 * no-op meter that stays a no-op for the life of the process — and `index.ts`
 * imports this module at the top, which is before `startTelemetry` has
 * finished on a cold start.
 *
 * No instrument here takes an id as a label. A `user_id` label is unbounded
 * cardinality: one time series per account, growing with signups, and
 * Prometheus falls over long before the graph tells anybody anything. Ids
 * belong on spans, where Tempo indexes them and nothing multiplies.
 */
import { metrics, type Counter, type Histogram } from "@opentelemetry/api";

export interface JobMetrics {
  readonly runs: Counter;
  readonly duration: Histogram;
  readonly rows: Counter;
}

let cached: JobMetrics | null = null;

export const jobMetrics = (): JobMetrics => {
  if (cached !== null) return cached;
  const meter = metrics.getMeter("mercury-api");
  cached = {
    runs: meter.createCounter("mercury_job_runs_total", {
      description: "Background job passes, by job and outcome.",
    }),
    duration: meter.createHistogram("mercury_job_duration_seconds", {
      description: "How long a background job pass took.",
      unit: "s",
    }),
    rows: meter.createCounter("mercury_job_rows_written_total", {
      description: "Rows a background job wrote.",
    }),
  };
  return cached;
};

/** For tests, which must not share a cached no-op meter across files. */
export const resetMetrics = (): void => void (cached = null);
```

- [ ] **Step 4: Write the instrumented helper**

`services/api/src/jobs/every.ts`:

```ts
/**
 * A background job, on its own clock, reporting what it did.
 *
 * Moved out of `index.ts` and given its own tests, because this helper is the
 * whole of the background half of the system: eight jobs go through it, and
 * they are the only things that write a stock row, a lot, a position or a
 * snapshot. No request does.
 *
 * The scheduling behaviour is unchanged and load-bearing. The next run is
 * scheduled after the last one finishes, never on a fixed tick: a pass that
 * overruns its interval must not have a second one start behind it and write
 * the same rows twice. A failure is logged and the schedule continues — an
 * upstream being down is a reason to try again later, not to stop trying. And
 * the first pass runs immediately, which is what lets a deploy take the
 * current hour's portfolio snapshot rather than waiting up to an hour for it.
 *
 * What is new is that a pass now leaves a record. Before this, a failing
 * `position-sync` — every two seconds, the only writer of a position — was one
 * `console.error` line, and a pass that merely got slower was nothing at all.
 * The counters were already being computed and then formatted into a sentence
 * and thrown away.
 */
import { SpanStatusCode, trace, type Tracer } from "@opentelemetry/api";
import { errorLine } from "../log.js";
import { jobMetrics } from "../telemetry/metrics.js";

export interface EveryDeps {
  readonly now?: () => number;
  readonly setTimeout?: typeof setTimeout;
  readonly log?: Console;
  readonly tracer?: Tracer;
}

/**
 * Numbers a job's own return value already carries, pulled out of the note it
 * logs. The notes are written for a person — "12 rows across 3/4 wallets" — so
 * the shape is read from the counters the job functions return rather than
 * parsed back out of prose. `run` returns the note; the counts come from the
 * optional second return.
 */
export interface JobCounts {
  readonly written?: number;
  readonly failed?: number;
}

export type JobRun = () => Promise<string | null>;

export const every = (name: string, ms: number, run: JobRun, deps: EveryDeps = {}): void => {
  const now = deps.now ?? (() => Date.now());
  const schedule = deps.setTimeout ?? setTimeout;
  const log = deps.log ?? console;
  const tracer = deps.tracer ?? trace.getTracer("mercury-api");
  const { runs, duration } = jobMetrics();

  const tick = async (): Promise<void> => {
    await tracer.startActiveSpan(`job ${name}`, async (span) => {
      const started = now();
      span.setAttribute("mercury.job", name);
      try {
        const note = await run();
        span.setAttribute("mercury.job.quiet", note === null);
        if (note !== null) log.log(`${name}: ${note}`);
        runs.add(1, { job: name, outcome: "ok" });
      } catch (error: unknown) {
        /* The same line this logged before, so nothing a person greps for
           changed. The span is what is new. */
        log.error(`${name} failed:`, error);
        span.recordException(errorLine(error));
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorLine(error) });
        runs.add(1, { job: name, outcome: "failed" });
      } finally {
        /* In `finally`, because a span left open is a trace that never
           arrives — so a failing job would be invisible in the one case it
           matters. */
        duration.record((now() - started) / 1000, { job: name });
        span.end();
      }
    });

    schedule(() => void tick(), ms).unref();
  };

  void tick();
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd services/api && pnpm vitest run src/jobs/every.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Use it from index.ts**

In `services/api/src/index.ts`, delete the inline `const every = …` block (and its doc comment, which moves to `jobs/every.ts` — do not leave it orphaned above the next declaration). Add:

```ts
import { every } from "./jobs/every.js";
```

Leave the eight `every(...)` call sites and their doc comments exactly as they are. The table of jobs and cadences in `index.ts` stays there: it documents the schedule, not the helper.

- [ ] **Step 7: Verify nothing about the schedule changed**

Run: `cd services/api && pnpm vitest run` — the whole suite, because the jobs are what most of these tests exercise.
Expected: 837 tests pass, as before.

Then run the API locally with telemetry off and confirm the log is byte-identical in shape to before: `stocks: 41 instruments, 118 tokens`, nothing from the quiet passes.

- [ ] **Step 8: Verify and commit**

Run: `cd /Users/sainathr19/Desktop/unit/mercury && pnpm check`

```bash
git add services/api/src/jobs services/api/src/telemetry/metrics.ts services/api/src/index.ts
git commit -m "feat(api): a span and a duration for every background job pass"
```

---

### Task 6: Outbound calls and database queries

**Files:**

- Modify: `services/api/src/telemetry/otel.ts` (enable undici instrumentation)
- Create: `services/api/src/telemetry/query-span.ts`
- Create: `services/api/src/telemetry/query-span.test.ts`
- Modify: `services/api/src/db/client.ts`

**Interfaces:**

- Consumes: `safeAttributes` from Task 2.
- Produces: `withQuerySpans(db: Db, tracer?: Tracer): Db` — returns a handle whose queries each open a span.

- [ ] **Step 1: Enable fetch instrumentation**

Jupiter, Relay, Glider, Privy, Kamino, Pyth and the Solana RPC are all reached over `fetch`, which is undici. `getNodeAutoInstrumentations` includes `@opentelemetry/instrumentation-undici` already — confirm it is on and that a client span appears for one Jupiter call, then record the finding. No code change if it is already enabled.

Verify: start the API with a console trace exporter, hit `/v1/market/status`, and look for an `HTTP GET` client span with `server.address` naming the upstream.

- [ ] **Step 2: Write the failing test for query spans**

`services/api/src/telemetry/query-span.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { withQuerySpans } from "./query-span.js";

const recordingTracer = () => {
  const spans: { name: string; attributes: Record<string, unknown>; ended: boolean }[] = [];
  return {
    spans,
    tracer: {
      startActiveSpan: <T>(name: string, fn: (span: unknown) => T): T => {
        const record = { name, attributes: {} as Record<string, unknown>, ended: false };
        spans.push(record);
        return fn({
          setAttribute: (k: string, v: unknown) => void (record.attributes[k] = v),
          setAttributes: (a: Record<string, unknown>) => void Object.assign(record.attributes, a),
          recordException: () => undefined,
          setStatus: () => undefined,
          end: () => void (record.ended = true),
        });
      },
    } as never,
  };
};

describe("withQuerySpans", () => {
  it("opens a span per query and ends it", async () => {
    /* Without this a slow request is one flat 600ms span with nothing inside,
       and "which query" is the question anybody actually has. postgres.js has
       no OpenTelemetry instrumentation of its own — the official one is for
       `pg` — so this wrapper is the only way to get it. */
    const { spans, tracer } = recordingTracer();
    const inner = { execute: vi.fn(async () => [{ n: 1 }]) };
    const db = withQuerySpans(inner as never, tracer);

    await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute({
      sql: "select 1",
    });

    expect(spans).toHaveLength(1);
    expect(spans[0]!.ended).toBe(true);
  });

  it("names the span for the operation, not the whole statement", async () => {
    /* A span named with the full SQL is a span name per distinct query text,
       which is cardinality in Tempo and unreadable in a flame graph. */
    const { spans, tracer } = recordingTracer();
    const inner = { execute: vi.fn(async () => []) };
    const db = withQuerySpans(inner as never, tracer);

    await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute({
      sql: 'select "id" from "order" where "user_id" = $1',
    });

    expect(spans[0]!.name).toBe("db select order");
  });

  it("carries no parameter values", async () => {
    /* The parameters are the user's: an address, an email, an amount. The
       statement shape is what helps; the values are what leaks. */
    const { spans, tracer } = recordingTracer();
    const inner = { execute: vi.fn(async () => []) };
    const db = withQuerySpans(inner as never, tracer);

    await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute({
      sql: "select 1 where x = $1",
      params: ["someone@example.com"],
    });

    expect(JSON.stringify(spans[0]!.attributes)).not.toContain("example.com");
  });

  it("ends the span when the query throws", async () => {
    const { spans, tracer } = recordingTracer();
    const inner = {
      execute: vi.fn(async () => {
        throw new Error("deadlock detected");
      }),
    };
    const db = withQuerySpans(inner as never, tracer);

    await expect(
      (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute({ sql: "select 1" }),
    ).rejects.toThrow("deadlock");
    expect(spans[0]!.ended).toBe(true);
  });

  it("passes through anything that is not a query", async () => {
    /* Drizzle's handle carries `select`, `insert`, `$with` and more. Only the
       execution path is wrapped; everything else has to behave as before or
       every call site breaks. */
    const { tracer } = recordingTracer();
    const inner = { execute: vi.fn(), schema: { order: "table" } };
    const db = withQuerySpans(inner as never, tracer);

    expect((db as unknown as { schema: unknown }).schema).toEqual({ order: "table" });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd services/api && pnpm vitest run src/telemetry/query-span.test.ts`
Expected: FAIL — cannot resolve `./query-span.js`.

- [ ] **Step 4: Write the wrapper**

`services/api/src/telemetry/query-span.ts`:

```ts
/**
 * A span per database query.
 *
 * Hand-written because there is nothing to install. The driver here is
 * postgres.js, and OpenTelemetry's official Postgres instrumentation
 * (`@opentelemetry/instrumentation-pg`) covers the `pg` package only; no
 * equivalent for postgres.js exists on npm. The alternative was swapping the
 * driver across eighteen tables and 837 tests to gain a span, which is the
 * wrong trade.
 *
 * A Proxy over the Drizzle handle rather than a patched method, so the dozens
 * of call sites and every builder on the handle keep working untouched: only
 * `execute` is intercepted, and everything else passes through as itself.
 *
 * The span carries the statement's shape and never its parameters. The shape
 * is what answers "which query was slow"; the parameters are an address, an
 * email, an amount — the user's, and not ours to put in a trace store.
 */
import { SpanStatusCode, trace, type Tracer } from "@opentelemetry/api";
import type { Db } from "../db/client.js";

/** `select … from "order" …` becomes `select order`. Shape, not text. */
export const operationOf = (sql: string): string => {
  const verb = /^\s*(select|insert|update|delete|with)\b/i.exec(sql)?.[1]?.toLowerCase() ?? "query";
  const table = /\b(?:from|into|update|join)\s+"?([a-z_][a-z0-9_]*)"?/i.exec(sql)?.[1]?.toLowerCase() ?? null;
  return table === null ? `db ${verb}` : `db ${verb} ${table}`;
};

interface Query {
  readonly sql?: unknown;
}

export const withQuerySpans = (db: Db, tracer: Tracer = trace.getTracer("mercury-api")): Db =>
  new Proxy(db as object, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property !== "execute" || typeof value !== "function") return value;

      return (...args: unknown[]) => {
        const first = args[0] as Query | undefined;
        const sql = typeof first?.sql === "string" ? first.sql : "";
        return tracer.startActiveSpan(operationOf(sql), async (span) => {
          try {
            const answer: unknown = await (value as (...a: unknown[]) => unknown).apply(target, args);
            return answer;
          } catch (error: unknown) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error instanceof Error ? error.message : "query failed",
            });
            throw error;
          } finally {
            span.end();
          }
        });
      };
    },
  }) as Db;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd services/api && pnpm vitest run src/telemetry/query-span.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Apply it where the handle is built**

In `services/api/src/db/client.ts`, wrap the handle the factory returns in `withQuerySpans(...)`. With telemetry off, `trace.getTracer` returns a no-op tracer and the Proxy's only cost is one property lookup per `execute`.

Read `client.ts` first and keep its existing shape — do not change the exported signature.

- [ ] **Step 7: Verify the whole suite still passes against PGlite**

Run: `cd services/api && pnpm vitest run`
Expected: 837 tests pass. The funding store tests exercise real queries through this handle, so a wrapper that broke the handle fails loudly here.

- [ ] **Step 8: Verify and commit**

Run: `cd /Users/sainathr19/Desktop/unit/mercury && pnpm check`

```bash
git add services/api/src/telemetry services/api/src/db/client.ts
git commit -m "feat(api): spans for outbound calls and database queries"
```

---

### Task 7: LGTM on Coolify

**Files:**

- Create: `deploy/lgtm/README.md`
- Create: `deploy/lgtm/docker-compose.yml`
- Create: `deploy/lgtm/grafana/provisioning/dashboards/dashboards.yaml`
- Create: `deploy/lgtm/grafana/dashboards/api-health.json`
- Create: `deploy/lgtm/grafana/dashboards/jobs.json`
- Create: `deploy/lgtm/tempo-config.yaml`

- [ ] **Step 1: Write the compose file**

`deploy/lgtm/docker-compose.yml`:

```yaml
# Grafana, Prometheus, Tempo and Loki in one container, for Coolify.
#
# Grafana classifies this image as being for development, demo and testing,
# and points production users at Grafana Cloud. We run it anyway and the spec
# says why (docs/superpowers/specs/2026-10-15-observability-design.md): it is
# one deployable rather than five, losing traces is survivable where losing a
# portfolio snapshot is not, and the application only knows an OTLP endpoint —
# so moving to a managed backend later is an environment variable and no code.
services:
  lgtm:
    image: grafana/otel-lgtm:latest
    restart: unless-stopped
    environment:
      # Five seconds is the default and is tight for flushing to disk.
      LGTM_SHUTDOWN_TIMEOUT_SECONDS: "30"
      # Metrics for a quarter; logs for a month, because they are the bulk.
      PROMETHEUS_EXTRA_ARGS: "--storage.tsdb.retention.time=90d"
      LOKI_EXTRA_ARGS: "--limits.retention-period=720h"
      GF_SECURITY_ADMIN_PASSWORD: "${GRAFANA_ADMIN_PASSWORD:?set a password}"
      # Coolify terminates TLS and proxies to Grafana's port.
      GF_SERVER_ROOT_URL: "${GRAFANA_ROOT_URL:?set the public url}"
    volumes:
      # Every component writes under /data. Without this volume a Coolify
      # redeploy is a full history loss, which is the one failure that cannot
      # be repaired after the fact.
      - lgtm-data:/data
      - ./tempo-config.yaml:/otel-lgtm/tempo-config.yaml:ro
      - ./grafana/provisioning:/otel-lgtm/grafana/conf/provisioning:ro
      - ./grafana/dashboards:/var/lib/grafana/dashboards:ro
    ports:
      # Grafana only. The OTLP ports (4317 gRPC, 4318 HTTP) are deliberately
      # NOT published: the API reaches them over the Docker network, and an
      # open OTLP ingest is an invitation to fill the disk.
      - "3000:3000"

volumes:
  lgtm-data:
```

- [ ] **Step 2: Write the Tempo retention config**

`deploy/lgtm/tempo-config.yaml` — copy the image's default and set `compactor.compaction.block_retention: 336h` (two weeks; traces are the bulkiest and the least useful once old). Take the default from the running container:

```bash
docker run --rm --entrypoint cat grafana/otel-lgtm:latest /otel-lgtm/tempo-config.yaml > deploy/lgtm/tempo-config.yaml
```

Then edit the retention field. Do not hand-write this file: the image's config changes between versions and a partial one will not start.

- [ ] **Step 3: Provision the dashboards from the repo**

`deploy/lgtm/grafana/provisioning/dashboards/dashboards.yaml`:

```yaml
# Dashboards live in git, not in a container's volume.
#
# One clicked into a running Grafana is one you rebuild from memory after the
# next redeploy, and it cannot be reviewed in a pull request.
apiVersion: 1
providers:
  - name: mercury
    folder: Mercury
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    options:
      path: /var/lib/grafana/dashboards
```

- [ ] **Step 4: Build the two dashboards**

Build them in the Grafana UI first — it is far faster than writing JSON — then export each via Share → Export → "Export for sharing externally" and save the JSON into `deploy/lgtm/grafana/dashboards/`.

`api-health.json`, from `http.server.request.duration` (emitted by `@hono/otel`):

- request rate by `http.route`
- error rate: the share of requests with `http.response.status_code >= 500`, overall and by route
- p50/p95/p99 latency by route
- a table of the slowest routes over the range

`jobs.json`, from Task 5's instruments:

- `rate(mercury_job_runs_total{outcome="failed"}[5m])` by `job`
- p95 of `mercury_job_duration_seconds` by `job`
- **time since the last successful `portfolio-snapshot`** — the single most important panel on either dashboard, because that job's output is the only record of what an account used to be worth and cannot be backfilled
- last successful run per job, as a table

- [ ] **Step 5: Write the deployment notes**

`deploy/lgtm/README.md`, covering: the Coolify settings (Build Pack "Docker Compose", base directory `/deploy/lgtm`), `GRAFANA_ADMIN_PASSWORD` and `GRAFANA_ROOT_URL` as Coolify secrets, Grafana behind Coolify's TLS and authentication, the OTLP ports staying unpublished, and what to set `OTEL_EXPORTER_OTLP_ENDPOINT` to on the API service (the compose service name and port 4318 on the shared network).

State the memory cost plainly — between roughly 0.6 GB and 2 GB idle — and that the box already runs the API, the web container and Postgres. Check free memory before deploying.

- [ ] **Step 6: Verify end to end**

With the stack up and `OTEL_EXPORTER_OTLP_ENDPOINT` set on the API:

1. Make one request to `/health` and find its span in Tempo by the `x-request-id` the response carried.
2. From that trace, follow the trace-to-logs link to the request's log lines. If the link does not work, `trace_id` is missing from the JSON log — that is Task 4 and it is the field the whole stack is for.
3. Wait for one `prices` pass and confirm `mercury_job_duration_seconds` has a sample.
4. Stop the API and confirm the spans from the last request arrived — that is the `SIGTERM` flush in Task 1.

- [ ] **Step 7: Commit**

```bash
git add deploy/lgtm
git commit -m "feat(deploy): LGTM on Coolify, with dashboards in the repo"
```

---

## Self-review

**Spec coverage.** A1 → Task 1. A2 → Task 3. A3 → Task 5. A4 → Task 6 step 1. A5 → Task 6 steps 2-6. A6 → Task 4. A7 → Task 2. A8 → Task 7. Every section of Part A has a task.

**Ordering.** Task 2 (the deny-list) comes before every task that writes an attribute, so no instrumentation is ever added without it. Task 7 is last but its verification step is what proves Tasks 1-6 actually work; nothing before it can be called done on the strength of a passing unit test alone.

**Known open question, deliberately left to the implementer.** Task 3 step 7 — whether `@hono/otel` and Node's HTTP instrumentation both emit a server span — is an empirical question that cannot be answered from the types. The step says how to find out and what to do either way.

**Interfaces.** `safeAttributes` (Task 2) is consumed by Tasks 3, 4, 5, 6. `errorLine` is already exported from `log.ts`. `jobMetrics` (Task 5 step 3) is consumed by `every` (Task 5 step 4). `telemetryEndpoint` (Task 1) is consumed by `index.ts` and `jsonErrors` reads the same variable directly rather than importing it, so `log.ts` does not depend on the telemetry module.

**One thing this plan does not do.** `JobCounts` is declared in `jobs/every.ts` and not yet used: the jobs return a human-readable note, not a count, so `mercury_job_rows_written_total` has no source without changing eight job signatures. That is deliberate — the counter is created and left at zero rather than changing every job function in the same commit as the helper. A follow-up can thread the counts through.
