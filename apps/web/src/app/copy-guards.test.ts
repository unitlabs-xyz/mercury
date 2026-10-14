import { globSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Strings a person reads, as opposed to every string in the file.
 *
 * Deliberately conservative: comments, import paths and identifiers are not
 * copy, and a guard that cannot tell the difference is a guard that fails on
 * somebody else's variable name. A line is read for copy only outside a
 * comment and an import, and a string counts only if it reads like a phrase —
 * a space in it, and a capital at the front.
 */
const copyIn = (source: string): string[] => {
  const out: string[] = [];
  for (const line of source.split("\n")) {
    const t = line.trim();
    if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*")) continue;
    if (t.startsWith("import ") || t.startsWith("} from ") || t.includes('} from "')) continue;
    for (const m of line.matchAll(/"([A-Z][^"\\]*\s[^"\\]*)"|`([A-Z][^`\\$]*\s[^`\\$]*)`/g)) {
      out.push(m[1] ?? m[2] ?? "");
    }
  }
  return out;
};

const copyFiles = (): { file: string; copy: string[] }[] =>
  globSync("**/*.{ts,tsx}", { cwd: SRC })
    .filter((f) => !f.includes(".test.") && !f.startsWith("dev/"))
    .map((f) => ({ file: f, copy: copyIn(readFileSync(join(SRC, f), "utf8")) }));

/*
 * The yield is live data. It arrives on `/v1/money` as `yieldApr` and the
 * Money tab renders it; a screen that cannot read it must not quote it.
 *
 * The welcome dialog used to open with "It starts earning 4.1% the moment it
 * lands" — the first sentence a new account reads, and a promise the app
 * contradicts on the next tap as soon as the real rate is anything else.
 */
describe("onboarding copy", () => {
  it("quotes no rate it cannot read", () => {
    const welcome = readFileSync(join(SRC, "app/Welcome.tsx"), "utf8");
    const rates = copyIn(welcome).filter((s) => /\d\s?%/.test(s));

    expect(rates).toEqual([]);
  });
});

/*
 * "Catalogue" and its American half are out, by a standing instruction, and
 * the word had reached the screen: "Showing the last available catalog" on the
 * baskets page. Nobody calls a list of baskets a catalog, which is the better
 * reason.
 *
 * Scoped to copy because the identifier is a separate, wider rename that
 * touches five files and an open branch — see the PR. This guard holds the
 * line that matters first: the word does not come back in front of a user.
 */
describe("the word that is not ours", () => {
  it("appears in no string a person reads", () => {
    const found = copyFiles().flatMap(({ file, copy }) =>
      copy.filter((s) => /\bcatalog/i.test(s)).map((s) => `${relative(".", file)}: ${s}`),
    );

    expect(found).toEqual([]);
  });
});
