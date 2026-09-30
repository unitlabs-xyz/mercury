import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_FOLDER } from "./migrate.js";

/**
 * The folder, not the migrator.
 *
 * `migrate()` is drizzle's and `testDb()` runs this same folder against a real
 * Postgres on every test run, so that the SQL applies cleanly to an empty
 * database is already proven many times over. What is not proven anywhere else
 * is that `applyMigrations` can find the folder from where it sits, and that
 * the journal and the files agree — the two ways boot-time migration fails
 * silently in a container, where the answer is a server that starts against an
 * old schema.
 */
describe("MIGRATIONS_FOLDER", () => {
  it("resolves from the module rather than the working directory", () => {
    // Absolute is the assertion that bites. A relative "./drizzle" also exists
    // when the tests run — their working directory is this package — and then
    // fails in the container, whose working directory is /app/services/api only
    // by a line in the Dockerfile that has no reason to stay put.
    expect(isAbsolute(MIGRATIONS_FOLDER)).toBe(true);
    expect(existsSync(MIGRATIONS_FOLDER)).toBe(true);
    expect(existsSync(join(MIGRATIONS_FOLDER, "meta", "_journal.json"))).toBe(true);
  });

  it("has the file behind every entry the journal claims", () => {
    const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8")) as {
      entries: { tag: string }[];
    };
    expect(journal.entries.length).toBeGreaterThan(0);
    for (const entry of journal.entries) {
      expect(existsSync(join(MIGRATIONS_FOLDER, `${entry.tag}.sql`))).toBe(true);
    }
  });

  it("has no .sql the journal does not name, which would never be applied", () => {
    const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8")) as {
      entries: { tag: string }[];
    };
    const named = new Set(journal.entries.map((e) => `${e.tag}.sql`));
    const onDisk = readdirSync(MIGRATIONS_FOLDER).filter((f) => f.endsWith(".sql"));
    expect([...onDisk].sort()).toEqual([...named].sort());
  });
});
