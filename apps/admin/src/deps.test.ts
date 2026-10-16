import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * This app's dependency list, asserted as an allowlist.
 *
 * Not a size guard, and it is worth being exact about that, because the
 * obvious assumption is wrong. This app builds to 2,576 kB against the
 * customer app's 2,555 kB: `@privy-io/react-auth` ships the wallet stack
 * transitively, so using Privy at all costs the same here as there. Measured,
 * not assumed. On an internal page three people open, that is an acceptable
 * price for reusing the product's auth and adding no new credential; on the
 * customer app it would not be.
 *
 * What this guards is the app's *scope*. The dashboard reads five aggregates
 * and renders them. The moment it imports chain code, execution code, or a
 * component out of `apps/web`, it stops being a separate app and starts being
 * a second copy of the product that happens to have different screens — and
 * nothing would look wrong: it would render, the tests would pass, and the
 * coupling would only surface when a change to the customer app broke the
 * dashboard or the other way round.
 *
 * So this is an allowlist rather than a ban-list. A new dependency fails here
 * until somebody adds it deliberately, which is the review prompt — "does an
 * internal dashboard need this?" — asked at the only moment it is cheap to
 * answer.
 */
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

/**
 * React and react-dom must be the exact same version, and pinned.
 *
 * Found at runtime and nowhere else: with `^19.0.0` on both, pnpm resolved
 * react to 19.2.3 and react-dom to 19.3.0, and react-dom throws
 * "Incompatible React versions" on the first render — a blank page. `pnpm
 * build` succeeded, `tsc` was clean, and all nineteen tests passed, because
 * nothing in any of them renders a component.
 *
 * A range is what allowed it, so the assertion is that there is no range.
 */
const EXACT = /^\d+\.\d+\.\d+$/;

/** Everything this app is allowed to ship to a browser. */
const ALLOWED_RUNTIME = [
  "@privy-io/react-auth", // email sign-in, which is how the API knows who is asking
  "@tanstack/react-query", // the five reads
  "react",
  "react-dom",
  /*
   * Declared, and never imported by anything in src/.
   *
   * Privy's graph requires it — `@privy-io/react-auth` → `x402` → `wagmi` →
   * `@wagmi/connectors` → `@base-org/account` → `@coinbase/cdp-sdk` →
   * `@solana/kit` — and left to resolve on its own this app got 5.5.1, which
   * has no `./program-client-core` export and breaks Vite's dependency
   * pre-bundling outright. `apps/web` gets 8.3.0 because it declares it.
   *
   * A root `pnpm.overrides` entry would have been the tidier fix and is not
   * available: `services/api` pins `@solana/kit` to 2.3.0, so the workspace
   * deliberately runs two majors and forcing one would break the API's chain
   * code. So it is declared here, at the version that works, with no import
   * anywhere in src/ — which the last test in this file asserts.
   */
  "@solana/kit",
];

/**
 * What must never be *declared* here. Named individually so a failure says
 * why, rather than only that an allowlist was violated.
 *
 * **This is not a claim that the wallet stack is absent from the bundle, and
 * it would be dishonest to read it that way.** `@privy-io/react-auth` pulls
 * in wagmi, `@wagmi/connectors`, `@base-org/account`, `@coinbase/cdp-sdk`,
 * x402 and Solana transitively — traced with `pnpm why`. Using Privy means
 * having that graph, here exactly as in `apps/web`, and no test can change
 * it. What this keeps out is code this app would have to choose to add.
 */
const BANNED = [
  /^@reown\//, // AppKit
  /^wagmi$/,
  /^viem$/,
  /^@relayprotocol\//,
  /^react-router/, // one page, nowhere to navigate to
  /^@mercury\/(chain|core|market|sdk)$/, // chain and execution code
];

/**
 * `@mercury/view` is a devDependency on purpose, not an oversight.
 *
 * Its entry re-exports `order`, `send` and `decision`, which pull in
 * `@mercury/core` and the Solana libraries, and its `exports` map has only
 * `"."` — so importing `usd` from it dragged the chain graph in and broke
 * Vite's dependency pre-bundling: `Missing "./program-client-core" specifier
 * in "@solana/kit"`. `money.ts` carries its own copy and `money.test.ts` pins
 * it against the real one. A test may import the heavy graph; a bundle may
 * not.
 */
const TEST_ONLY = ["@mercury/view"];

describe("the admin app's dependencies", () => {
  it("declares nothing but what it needs", () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual([...ALLOWED_RUNTIME].sort());
  });

  it("keeps @mercury/view out of the runtime graph", () => {
    for (const name of TEST_ONLY) {
      expect(Object.keys(pkg.dependencies)).not.toContain(name);
      expect(Object.keys(pkg.devDependencies)).toContain(name);
    }
  });

  it("declares no wallet, routing or chain-logic package it could have avoided", () => {
    /* Runtime declarations only. A devDependency is not shipped, and
       `@mercury/view` is one deliberately — see TEST_ONLY above. */
    const offenders = Object.keys(pkg.dependencies).filter((name) =>
      BANNED.some((pattern) => pattern.test(name)),
    );

    expect(offenders).toEqual([]);
  });

  it("pins react and react-dom to one exact, identical version", () => {
    const react = pkg.dependencies["react"];
    const dom = pkg.dependencies["react-dom"];

    expect(react).toMatch(EXACT);
    expect(dom).toMatch(EXACT);
    expect(react).toBe(dom);
  });

  it("does not reach into the customer app", () => {
    /* An app that imports another app's source is not a separate app, and it
       is also the path by which the chain graph comes back: one component
       from apps/web that happens to import a wallet hook.

       Import statements only, not the file text — the first version of this
       matched the prose in `money.ts` explaining why @mercury/core is not
       imported, which is a test failing on its own documentation. */
    const shipped = [
      "App.tsx",
      "Dashboard.tsx",
      "panels.tsx",
      "ui.tsx",
      "useAdmin.ts",
      "api.ts",
      "auth.ts",
      "money.ts",
      "main.tsx",
      "Sparkline.tsx",
    ];

    for (const name of shipped) {
      const source = readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
      const specifiers = [...source.matchAll(/^\s*import[^"']*["']([^"']+)["']/gm)].map((m) => m[1]!);

      expect(specifiers.filter((s) => s.includes("apps/web"))).toEqual([]);
      expect(specifiers.filter((s) => /@mercury\/(chain|core|market|sdk|view)/.test(s))).toEqual([]);
      /* The guarantee that makes declaring @solana/kit honest: it is pinned
         for Privy's benefit and this app's own code never touches chain
         libraries. */
      expect(specifiers.filter((s) => /^@solana/.test(s))).toEqual([]);
    }
  });
});
