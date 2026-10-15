/**
 * A span per database query.
 *
 * Hand-written, and the reasons are worth recording because two plausible
 * alternatives both look like they already work.
 *
 * **Drizzle appears to have this, and does not.** Its postgres-js session is
 * full of `tracer.startActiveSpan("drizzle.driver.execute", …)`, and
 * `@opentelemetry/api` is an optional peer dependency, so it reads as a
 * feature you switch on by installing the package. It is dead code in 0.45.3:
 * `tracing.js` declares `let otel;`, guards every span behind `if (!otel)
 * return fn();`, and nothing in the shipped package ever assigns `otel`. The
 * spans cannot fire, with or without the peer installed.
 *
 * **OpenTelemetry has no instrumentation for this driver.** The official
 * `@opentelemetry/instrumentation-pg` covers the `pg` package; this service
 * uses postgres.js, and nothing on npm covers it. Swapping the driver to gain
 * a span would be a change across eighteen tables and the whole test suite.
 *
 * So: a Proxy, and on the right method. Drizzle does not route queries
 * through any `execute` on the handle it hands out — its postgres-js session
 * issues every one of them as `client.unsafe(query, params)`, sometimes
 * followed by `.values()`, and transactions through `client.begin`. A wrapper
 * on `db.execute` would have caught only the handful of raw `db.execute(sql…)`
 * calls and missed every `select`, `insert` and `findFirst` in the service —
 * passing its own tests while recording almost nothing.
 *
 * The span carries the statement's shape and never its parameters. The shape
 * answers "which query was slow"; the parameters are an address, an email, an
 * amount — the user's, and not ours to put in a trace store.
 */
import { SpanStatusCode, trace, type Tracer } from "@opentelemetry/api";

/**
 * The postgres.js client, in the one shape this needs.
 *
 * Structural rather than imported: postgres.js's own type is a large callable
 * interface, and narrowing to what is used keeps the Proxy's return type
 * honest.
 */
export interface UnsafeClient {
  unsafe(query: string, params?: readonly unknown[], options?: unknown): unknown;
}

/**
 * `select … from "order" …` becomes `db select order`.
 *
 * The verb and the table, never the text. A span named with the whole
 * statement is a distinct name per distinct query — unbounded cardinality in
 * Tempo, and a flame graph nobody can read.
 */
export const operationOf = (sql: string): string => {
  const verb = /^\s*(select|insert|update|delete|with|begin|commit|rollback)\b/i
    .exec(sql)?.[1]
    ?.toLowerCase();
  if (verb === undefined) return "db query";
  const table = /\b(?:from|into|update|join)\s+"?([a-z_][a-z0-9_]*)"?/i.exec(sql)?.[1]?.toLowerCase();
  return table === undefined ? `db ${verb}` : `db ${verb} ${table}`;
};

/** How much of a statement to keep, for the one that turned out to be slow. */
const MAX_STATEMENT = 300;

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";

/**
 * Wrap a postgres.js client so every query it runs opens a span.
 *
 * Only `unsafe` is intercepted; everything else passes through as itself,
 * which is what keeps `begin`, `end`, `listen` and the tagged-template call
 * working untouched.
 *
 * The span ends when the query settles. postgres.js queries are lazy — a
 * `Query` executes on its first `then` — so attaching a handler here starts
 * the query at this moment rather than at the caller's `await`. For drizzle
 * that is the same moment: its session awaits inline, as every call site in
 * `postgres-js/session.js` does. The caller still receives the original
 * object, so `.values()` and the rest behave as before.
 */
export const withQuerySpans = <T extends UnsafeClient>(
  client: T,
  tracer: Tracer = trace.getTracer("mercury-api"),
): T =>
  new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (property !== "unsafe" || typeof value !== "function") return value;

      return (query: string, ...rest: readonly unknown[]) => {
        const span = tracer.startSpan(operationOf(query));
        span.setAttribute("db.system", "postgresql");
        span.setAttribute(
          "db.statement",
          query.length > MAX_STATEMENT ? `${query.slice(0, MAX_STATEMENT - 1)}…` : query,
        );

        let answer: unknown;
        try {
          answer = (value as (...a: readonly unknown[]) => unknown).apply(target, [query, ...rest]);
        } catch (error: unknown) {
          /* A synchronous throw is a malformed call rather than a failed
             query, and the span still has to close. */
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : "query failed",
          });
          span.end();
          throw error;
        }

        if (!isThenable(answer)) {
          /* Not a query object: nothing to wait for, so nothing to time. */
          span.end();
          return answer;
        }

        answer.then(
          () => span.end(),
          (error: unknown) => {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error instanceof Error ? error.message : "query failed",
            });
            span.end();
          },
        );
        return answer;
      };
    },
  });
