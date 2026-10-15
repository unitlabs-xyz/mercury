import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A tripwire on Drizzle's own OpenTelemetry tracing.
 *
 * Drizzle's postgres-js session is written to emit spans — its source is full
 * of `tracer.startActiveSpan("drizzle.driver.execute", …)` — and
 * `@opentelemetry/api` is an optional peer dependency, so it reads as a
 * feature you switch on by installing the package. In 0.45.3 it is dead code:
 * `tracing.js` declares `let otel;`, guards every span behind `if (!otel)
 * return fn();`, and nothing in the shipped package assigns `otel`.
 *
 * That matters because of what those spans would carry:
 *
 *     span?.setAttributes({
 *       "drizzle.query.text": query,
 *       "drizzle.query.params": JSON.stringify(params),
 *     });
 *
 * Every parameter of every query — wallet addresses, emails, amounts — onto a
 * span, bound for a trace store with different retention and different access
 * than the database they came from. `telemetry/query-span.ts` deliberately
 * records the statement's shape and no parameters, and a Drizzle upgrade that
 * wired its own tracing up would undo that decision silently, in a diff that
 * only changed a version number.
 *
 * So this fails on the upgrade that makes it live, rather than being a span
 * processor that strips the attribute and leaves nobody any the wiser. The
 * failure is the point: somebody then decides whether to configure Drizzle's
 * tracing off, redact the attribute, or accept it.
 *
 * If this fails: read `drizzle-orm/tracing.js`, confirm whether `otel` is now
 * assigned, and if it is, either pass `@opentelemetry/api` nothing (check
 * their current switch) or add a span processor that deletes
 * `drizzle.query.params` before export. Then update this test to match.
 */
const require = createRequire(import.meta.url);

/*
 * Resolved from the entry point rather than from `package.json`, which
 * Drizzle's `exports` map does not expose — asking for it throws.
 */
const drizzleRoot = (): string | null => {
  try {
    return dirname(require.resolve("drizzle-orm"));
  } catch {
    return null;
  }
};

describe("Drizzle's own tracing", () => {
  it("is still inert, so no query parameters reach a span", () => {
    const root = drizzleRoot();
    expect(root).not.toBe(null);

    const tracing = join(root!, "tracing.js");
    expect(existsSync(tracing)).toBe(true);

    const source = readFileSync(tracing, "utf8");

    /* The guard that makes every span a no-op. */
    expect(source).toMatch(/if\s*\(\s*!otel\s*\)/);

    /* And nothing that would satisfy it. An assignment here — `otel =
       await import(...)`, or a parameter, or a setter — is the upgrade this
       test exists to catch. */
    expect(source).not.toMatch(/\botel\s*=[^=]/);
  });

  it("still carries the attribute this is guarding against", () => {
    /* If Drizzle stops recording parameters of its own accord, this test has
       no job left and should be deleted rather than left asserting something
       nobody depends on. */
    const root = drizzleRoot();
    const session = join(root!, "postgres-js", "session.js");
    expect(existsSync(session)).toBe(true);

    expect(readFileSync(session, "utf8")).toContain("drizzle.query.params");
  });
});
