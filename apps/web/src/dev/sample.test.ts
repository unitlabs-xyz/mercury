import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The sample fixtures must not reach a production bundle.
 *
 * They did. `SAMPLE` was written as `import.meta.env["VITE_SAMPLE"]`, and
 * because Vite only substitutes a member expression, the constant never folded
 * to `false` and Rollup could not drop anything that depended on it. A
 * production build of this app carried all 806 lines of fixtures — a holding
 * called "Bald Founder Index", a basket called "Not Insider Trading", a ticker
 * IITMAGCA — in its main chunk, readable by anyone who opened devtools on the
 * live beta, underneath a comment claiming the bundler had dropped them.
 *
 * The real guard is building and grepping `dist`, which is too slow to be a
 * unit test. This is the cheap one that catches the regression at its cause:
 * the shape of the expression. Both are worth having, and this one runs on
 * every commit.
 */
const source = readFileSync(fileURLToPath(new URL("./sample.ts", import.meta.url)), "utf8");

/* Lines that are comments, so the prose explaining the trap is not read as the trap. */
const code = source
  .split("\n")
  .filter((line) => {
    const t = line.trim();
    return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
  })
  .join("\n");

describe("the sample-mode flag", () => {
  it("is read as a member expression, which is what lets Vite fold it away", () => {
    expect(code).toContain("import.meta.env.VITE_SAMPLE");
  });

  it("is never read with bracket access, which silently ships every fixture below it", () => {
    /* The whole defect in one assertion. If this fails, the fixtures are in
       the bundle again and nothing else will say so. */
    expect(code).not.toMatch(/import\.meta\.env\[\s*["']VITE_SAMPLE["']\s*\]/);
  });

  it("gates the login bypass on DEV as well, so a deployed sample build still signs you in", () => {
    /* `import.meta.env.DEV` is a member expression too, and it is what keeps a
       deployed preview from becoming an open door. */
    expect(code).toMatch(/SAMPLE_NO_LOGIN\s*=\s*SAMPLE\s*&&\s*import\.meta\.env\.DEV/);
  });
});
