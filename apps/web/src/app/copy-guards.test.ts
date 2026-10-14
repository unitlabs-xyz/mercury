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
    /* Text between tags, which is most of the copy in the app and none of it
       quoted. Left out at first, which made two of these guards pass by not
       being able to see "Company cap" or "Partial read" at all. */
    for (const m of line.matchAll(/>\s*([A-Z][^<>{}]*\s[^<>{}]*?)\s*</g)) {
      out.push(m[1] ?? "");
    }
    /* A tag's text can also stand alone on its own line, between the tag
       above it and the one below. */
    if (/^[A-Z][^<>{}"`]*\s[^<>{}"`]*$/.test(t)) out.push(t);
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

/*
 * Words the app knows and the reader does not.
 *
 * Each of these named something real and named it the way the system does.
 * "Smart account" is the Glider account a basket's tokens sit in — nobody
 * arriving from a brokerage app has met the phrase. "In-kind withdrawal" sat
 * directly beside "Exit to USDC" as if the two were an even pair of choices,
 * one plain and one from a settlement desk. "Partial read" is a database word
 * for a value that may be low. "Company cap" was market cap, renamed into
 * something ambiguous. "Portfolio status" is the name of a query.
 *
 * "Portfolio" is the hardest of them and the reason this list is not just a
 * glossary: the primary nav tab is called Portfolio and means everything the
 * account owns, while the basket sheets used the same word for one Glider
 * account inside it — so "Set up your portfolio" on a basket sheet meant
 * something quite different from the tab of the same name. One object, one
 * name: a basket account.
 */
const JARGON: readonly (readonly [RegExp, string])[] = [
  [/smart[- ]account/i, "say basket account"],
  [/\bin[- ]kind\b/i, "say as assets"],
  [/partial read/i, "say what could not be read"],
  [/company cap/i, "say market cap"],
  [/portfolio status/i, "say basket account"],
];

describe("words the reader does not have", () => {
  it.each(JARGON)("does not reach a screen: %s (%s)", (pattern) => {
    const found = copyFiles().flatMap(({ file, copy }) =>
      copy.filter((s) => pattern.test(s)).map((s) => `${relative(".", file)}: ${s}`),
    );

    expect(found).toEqual([]);
  });

  it("does not call a basket account a portfolio, which is the tab's name", () => {
    /* Scoped to the basket surfaces: the Portfolio tab and its own panels are
       entitled to the word, and this is about the sheets that borrowed it. */
    const baskets = copyFiles().filter(
      ({ file }) => file.startsWith("app/baskets/") || file === "app/Basket.tsx",
    );
    const found = baskets.flatMap(({ file, copy }) =>
      copy.filter((s) => /\bportfolios?\b/i.test(s)).map((s) => `${relative(".", file)}: ${s}`),
    );

    expect(found).toEqual([]);
  });
});
