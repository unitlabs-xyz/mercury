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

/** Everything this app is allowed to ship to a browser. */
const ALLOWED_RUNTIME = [
  "@mercury/view", // usd(), so money reads the same here as in the product
  "@privy-io/react-auth", // email sign-in, which is how the API knows who is asking
  "@tanstack/react-query", // the five reads
  "react",
  "react-dom",
];

/**
 * What must never appear. Named individually so a failure says why, rather
 * than only that an allowlist was violated.
 */
const BANNED = [
  /^@reown\//, // AppKit
  /^wagmi$/,
  /^viem$/,
  /^@solana/, // kit, web3.js, the program clients
  /^@relayprotocol\//,
  /^react-router/, // one page, nowhere to navigate to
  /^@mercury\/(chain|core|market|sdk)$/, // chain and execution code
];

describe("the admin app's dependencies", () => {
  it("ships nothing but the five it needs", () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual([...ALLOWED_RUNTIME].sort());
  });

  it("carries no wallet, chain or routing stack", () => {
    const all = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)];

    const offenders = all.filter((name) => BANNED.some((pattern) => pattern.test(name)));

    expect(offenders).toEqual([]);
  });

  it("does not reach into the customer app", () => {
    /* An app that imports another app's source is not a separate app, and it
       is also the path by which the wallet stack comes back: one component
       from apps/web that happens to import a Privy wallet hook. */
    const sources = ["App.tsx", "Dashboard.tsx", "panels.tsx", "ui.tsx", "useAdmin.ts", "api.ts"].map(
      (name) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8"),
    );

    for (const source of sources) {
      expect(source).not.toMatch(/from "[^"]*apps\/web/);
      expect(source).not.toMatch(/@mercury\/(chain|core|market|sdk)/);
    }
  });
});
