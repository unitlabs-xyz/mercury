import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Nothing in the eager graph may import the admin surface.
 *
 * It is a page three people will ever open, and it is paid for by every user
 * who never sees it. The main chunk is already 2.5 MB. The same mistake
 * shipped 806 lines of sample fixtures to production once already, and it was
 * invisible until somebody grepped the built bundle.
 *
 * `App.tsx` is the boundary: every route there is lazy, and this asserts that
 * the admin one stays that way.
 */
const app = readFileSync(fileURLToPath(new URL("../../App.tsx", import.meta.url)), "utf8");

describe("the admin route", () => {
  it("is loaded lazily, like every other route", () => {
    expect(app).toMatch(/const Admin = lazy\(\(\) => import\("\.\/app\/admin\/Admin"\)/);
  });

  it("is never imported eagerly", () => {
    const eager = [...app.matchAll(/^import .*from "(\.\/app\/[^"]+)"/gm)].map((m) => m[1]!);

    expect(eager.filter((path) => path.includes("admin"))).toEqual([]);
  });

  it("is reached from the account menu by a hook and a link, not an import", () => {
    /* The entry has to live somewhere eager to be clickable. A component
       imported for the menu would pull the whole surface into the main chunk
       and still pass the two tests above. */
    const menu = readFileSync(fileURLToPath(new URL("../AccountMenu.tsx", import.meta.url)), "utf8");

    const imports = [...menu.matchAll(/^import .*from "([^"]+)"/gm)].map((m) => m[1]!);

    expect(imports.filter((path) => path.includes("admin/Admin"))).toEqual([]);
    expect(imports.filter((path) => path.includes("admin/panels"))).toEqual([]);
    /* It does import the hook, and that is the intent: `useAdmin.ts` is the
       one admin module that is eager on purpose, because the menu cannot ask
       the question without it. */
    expect(imports).toContain("./admin/useAdmin");
  });

  it("keeps the one eager admin module clear of the page", () => {
    /* `useAdmin.ts` rides in the main chunk because AccountMenu needs it. So
       it is the seam: an import of the panels or the page from here would put
       the whole surface back in the eager graph, and every test above would
       still pass. */
    const hooks = readFileSync(fileURLToPath(new URL("./useAdmin.ts", import.meta.url)), "utf8");

    const imports = [...hooks.matchAll(/from "([^"]+)"/gm)].map((m) => m[1]!);

    expect(imports.filter((path) => path.includes("panels") || path.includes("Admin"))).toEqual([]);
    /* And nothing that would be a charting dependency. The main chunk is
       already 2.5 MB. */
    expect(imports.filter((path) => /chart|recharts|d3|victory|plot/i.test(path))).toEqual([]);
  });
});
