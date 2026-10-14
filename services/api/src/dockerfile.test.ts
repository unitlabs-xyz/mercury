import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The image installs only the workspace packages whose manifests it copies
 * before `pnpm install`. A package the API imports but the Dockerfile does not
 * name is linked without its own dependencies, so the image builds, the
 * container starts, and the first import fails.
 *
 * That is what happened on 13 October 2026: `@mercury/keys` became a
 * dependency, its manifest was never copied, and every deploy after it rolled
 * back on `Cannot find package '@solana/kit' imported from
 * /app/packages/keys/src/svm.ts`. CI was green throughout, because nothing in
 * CI reads the Dockerfile. This does.
 *
 * The other direction broke it again on 14 October, and in a way no single
 * branch could see. One branch added this COPY line while `@mercury/keys`
 * existed; another deleted the package. Both merged cleanly — they touch
 * different files — and the merged Dockerfile copied a manifest that was no
 * longer there, so the build failed at `COPY` before any code ran. Nothing was
 * wrong with either change on its own, which is why the check has to run over
 * both ends of the list rather than one.
 */
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const WORKSPACE_DIRS = ["packages", "tooling", "services"];

interface Manifest {
  readonly name: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

/** Every workspace package, by name, with the directory it lives in. */
const workspace = (): ReadonlyMap<string, { readonly dir: string; readonly manifest: Manifest }> => {
  const found = new Map<string, { dir: string; manifest: Manifest }>();
  for (const parent of WORKSPACE_DIRS) {
    for (const child of readdirSync(join(ROOT, parent))) {
      const path = join(ROOT, parent, child, "package.json");
      if (!existsSync(path)) continue;
      const manifest = JSON.parse(readFileSync(path, "utf8")) as Manifest;
      found.set(manifest.name, { dir: `${parent}/${child}`, manifest });
    }
  }
  return found;
};

/**
 * The API and every workspace package it reaches, dev dependencies included:
 * the image installs without `--prod`, because tsx is what runs it.
 */
const closureOf = (name: string): readonly string[] => {
  const all = workspace();
  const seen = new Set<string>();
  const visit = (pkg: string) => {
    const entry = all.get(pkg);
    if (entry === undefined || seen.has(entry.dir)) return;
    seen.add(entry.dir);
    const deps = { ...entry.manifest.dependencies, ...entry.manifest.devDependencies };
    for (const [dep, version] of Object.entries(deps)) if (version.startsWith("workspace:")) visit(dep);
  };
  visit(name);
  return [...seen].sort();
};

const dockerfile = readFileSync(join(ROOT, "services/api/Dockerfile"), "utf8");

describe("services/api/Dockerfile", () => {
  const dirs = closureOf("@mercury/api");

  it("finds the packages the API depends on", () => {
    /*
     * A guard against this test passing because it read nothing. Deliberately
     * only names packages the API cannot function without: naming an
     * incidental one made this test fail the day that package was deleted,
     * which is noise rather than a finding.
     */
    expect(dirs).toEqual(expect.arrayContaining(["services/api", "packages/core", "packages/chain"]));
    expect(dirs.length).toBeGreaterThan(3);
  });

  it.each(dirs)("copies the manifest of %s before installing", (dir) => {
    expect(dockerfile).toContain(`COPY ${dir}/package.json ${dir}/`);
  });

  /**
   * Every manifest the Dockerfile copies belongs to a package that exists and
   * that the API actually reaches.
   *
   * This is the check that was missing. A `COPY` for a deleted package fails
   * the build at that line, before any code runs, with a message about a
   * checksum rather than about a package — and the branch that deleted the
   * package never saw the line, because it was added on another one.
   */
  it("names no manifest that is not in the closure", () => {
    const named = [...dockerfile.matchAll(/^COPY (\S+)\/package\.json \1\/$/gm)].map((m) => m[1]!);

    expect(named.length).toBeGreaterThan(0);

    /* Named but not reachable from the API: a line left behind by a deletion. */
    expect(named.filter((dir) => !dirs.includes(dir))).toEqual([]);

    /* And named but not on disk at all, which is the one that fails the build. */
    expect(named.filter((dir) => !existsSync(join(ROOT, dir, "package.json")))).toEqual([]);
  });

  it.each(dirs)("copies the source of %s into the image", (dir) => {
    const parent = dir.split("/")[0]!;
    const copied =
      dockerfile.includes(`COPY ${dir}/ ${dir}/`) || dockerfile.includes(`COPY ${parent}/ ${parent}/`);
    expect(copied).toBe(true);
  });
});
