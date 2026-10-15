import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "../db/testing.js";
import { ADMIN_STATEMENT_TIMEOUT_MS, withTimeout } from "./timeout.js";

/** PGlite answers `{ rows }`; postgres.js answers the array. Both measured. */
const rowsOf = (result: unknown): readonly unknown[] =>
  Array.isArray(result) ? result : ((result as { rows?: readonly unknown[] }).rows ?? []);

const shown = async (reader: { execute: (q: never) => Promise<unknown> }): Promise<string> => {
  const r = await reader.execute(sql`show statement_timeout` as never);
  return (rowsOf(r)[0] as { statement_timeout: string }).statement_timeout;
};

describe("withTimeout", () => {
  it("applies the timeout inside the query", async () => {
    /* The assertion that pins the design. The plan put this in route
       middleware, where `SET LOCAL` does nothing: measured, `show
       statement_timeout` still answers "0" after it. */
    const db = await testDb();

    const inside = await withTimeout(db, (reader) => shown(reader));

    expect(inside).toBe("10s");
  });

  it("leaves nothing behind on the connection", async () => {
    /* The other half. A plain `SET` would persist on whichever pooled
       connection served this request and apply to somebody's trade later. */
    const db = await testDb();

    await withTimeout(db, (reader) => shown(reader));

    expect(await shown(db)).toBe("0");
  });

  it("hands the query a reader with no write path", async () => {
    /* `Reader` is Pick<Db, "select" | "execute">, so this is a type-level
       guarantee; the runtime check is that what arrives really does read. */
    const db = await testDb();

    const answer = await withTimeout(db, async (reader) => rowsOf(await reader.execute(sql`select 1 as n`)));

    expect(answer).toHaveLength(1);
  });

  it("is a whole number of milliseconds, because it is interpolated as text", () => {
    expect(Number.isInteger(ADMIN_STATEMENT_TIMEOUT_MS)).toBe(true);
    expect(ADMIN_STATEMENT_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
