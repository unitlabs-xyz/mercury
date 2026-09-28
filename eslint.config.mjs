import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * One flat config for the whole workspace.
 *
 * Deliberately *not* type-aware. Type-aware linting would duplicate what
 * `pnpm -r typecheck` already does, on every file, more slowly — and the
 * typecheck job is the one that actually gates a merge. This config is for the
 * things tsc does not say: unused code, sloppy promises, and the dependency
 * direction docs/03 specifies.
 */
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/build/**",
      "**/.expo/**",
      // Astro writes these. apps/landing is its own bun project outside the
      // pnpm workspace, but it still sits in this repo, so `eslint .` walks it.
      "**/.astro/**",
      // Recorded upstream responses and generated migrations. Neither is source.
      "packages/chain/src/testing/fixtures/**",
      "services/api/drizzle/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // `any` is allowed, but it has to be argued for in a comment — see the
      // ground rules in the README. A lint error cannot read a comment, so
      // this warns rather than fails and the reviewer makes the call.
      "@typescript-eslint/no-explicit-any": "warn",
      // An underscore says "deliberately unused", which is how the ports
      // declare the parameters their implementation does not need.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "no-console": ["error", { allow: ["warn", "error", "log"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
    },
  },

  /**
   * The dependency direction from docs/03, which that document has always said
   * was "enforced by lint rules". Until now nothing enforced it.
   *
   *   apps ──► sdk ──► types
   *   apps ──► market, chain ──► types      (the ADR 0011 fallback edge)
   *   services ──► core ──► types
   *   services ──► chain, market ──► types
   *
   * The rule that matters most is the last one: `core` performs no I/O, and it
   * stays that way by never being able to import something that does.
   */
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@mercury/chain*", "@mercury/market*", "@mercury/sdk*", "@mercury/api*"],
              message:
                "packages/core performs no I/O. It takes data in and returns decisions — that is what makes the execution engine testable without a network. See docs/03.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/types/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@mercury/*"],
              message: "packages/types is the leaf of the dependency graph. It imports nothing of ours.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@mercury/api*"],
              message:
                "An app talks to the API over HTTP through @mercury/sdk, never by importing the server. See docs/03.",
            },
          ],
        },
      ],
    },
  },

  /**
   * The rules of hooks, for every component in the apps.
   *
   * A hook called conditionally, or after an early return, breaks at runtime
   * and typecheck cannot see it: hook state is matched by call order, so a
   * skipped call silently hands a component another hook's state. This is the
   * one class of React bug with no compile-time signal at all, which is why it
   * is an error rather than a warning.
   */
  {
    files: ["apps/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      // Exhaustive deps warns rather than fails: a stale closure is a real bug,
      // but so is a dependency added only to quiet a linter, and the difference
      // needs a reader.
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  /** Metro and Babel configs are CommonJS by necessity — Expo loads them that way. */
  {
    files: ["**/*.config.js", "**/*.config.cjs", "**/babel.config.js"],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },

  /** Tests reach for shapes that production code should not. */
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/testing/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },

  // Last, so it wins: turns off everything that fights Prettier.
  prettier,
);
