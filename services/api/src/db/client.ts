import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { withQuerySpans } from "../telemetry/query-span.js";

export type Db = ReturnType<typeof createDb>;

/**
 * One pool per process, and there is one process.
 *
 * The client is wrapped before Drizzle ever sees it, because Drizzle issues
 * every query as `client.unsafe(...)` on this object — a wrapper on the handle
 * Drizzle returns would catch only raw `db.execute` calls and miss every
 * select, insert and findFirst in the service. See telemetry/query-span.ts,
 * which also explains why Drizzle's own OpenTelemetry spans are not an option.
 *
 * With telemetry off this costs one property lookup per query: `getTracer`
 * hands back the API's no-op tracer and its spans do nothing.
 */
export const createDb = (url: string) => drizzle(withQuerySpans(postgres(url, { max: 10 })), { schema });
