/**
 * Money, formatted the way the product formats it.
 *
 * Copied from `@mercury/view`'s `usd` rather than imported, and the reason is
 * a measurement: `@mercury/view`'s entry re-exports `order`, `send` and
 * `decision`, which pull in `@mercury/core` and the Solana libraries, and its
 * `exports` map has only `"."` so there is no subpath to reach this one
 * function through. Importing it dragged the chain graph into this app and
 * broke Vite's dependency pre-bundling outright: `Missing
 * "./program-client-core" specifier in "@solana/kit"`.
 *
 * Three lines are not worth that. What they *are* worth is the risk of
 * drifting from the product, so `money.test.ts` imports the real `usd` and
 * asserts this one agrees with it across a table of values — including the
 * cases that distinguish implementations. A test may import the heavy graph;
 * a bundle may not.
 *
 * `usdCompact` is deliberately not carried over. Its rounding is subtle
 * enough that a copy would be a liability, and an internal dashboard is
 * better off reading the exact figure than "$1.8M".
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Never parsed into a number and back by the caller: it takes the string. */
export const usd = (v: string | number | null | undefined): string =>
  v === null || v === undefined || v === "" ? "—" : money.format(Number(v));
