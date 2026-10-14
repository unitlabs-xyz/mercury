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
    // A guard against this test passing because it read nothing.
    expect(dirs).toEqual(expect.arrayContaining(["services/api", "packages/core", "packages/keys"]));
  });

  it.each(dirs)("copies the manifest of %s before installing", (dir) => {
    expect(dockerfile).toContain(`COPY ${dir}/package.json ${dir}/`);
  });

  it.each(dirs)("copies the source of %s into the image", (dir) => {
    const parent = dir.split("/")[0]!;
    const copied =
      dockerfile.includes(`COPY ${dir}/ ${dir}/`) || dockerfile.includes(`COPY ${parent}/ ${parent}/`);
    expect(copied).toBe(true);
  });
});
