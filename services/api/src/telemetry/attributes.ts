/**
 * What is allowed to leave this process as telemetry.
 *
 * Mercury holds what people own and what they are worth, and an attribute is
 * the easiest route for that to reach somewhere it was never meant to be: a
 * span attribute, a metric label and a log field each land in a store with
 * different retention and different access than the database the value came
 * from. So the rule is a function that every instrumentation goes through,
 * rather than a convention each of dozens of call sites is trusted with.
 *
 * `user_id` is deliberately allowed. It is our own UUID, it never leaves our
 * own infrastructure, and a trace that cannot say whose request it was cannot
 * answer the question anybody actually asks. It is kept out of metric labels
 * by construction instead — nothing in `metrics.ts` accepts an id — because
 * there the problem is not privacy but one time series per account, growing
 * with signups, which takes Prometheus down long before the graph says
 * anything.
 */
import type { Attributes, AttributeValue } from "@opentelemetry/api";

/**
 * Matched against the key with separators stripped and everything lower-cased,
 * so `walletAddress`, `wallet_address`, `WALLET-ADDRESS` and
 * `user.wallet.address` are one pattern rather than four.
 *
 * Anchored where a bare fragment would be too eager. `address` unanchored also
 * catches `addressable`; `shares` unanchored also catches `shareholder`. A
 * guard that silently drops `rows_addressed` is a guard people route around,
 * so each pattern is written to catch the names this codebase actually uses —
 * see the test, which asserts both directions.
 */
const BANNED: readonly RegExp[] = [
  /email$|^email/,
  /privyuserid/,
  /address$/,
  /publickey$/,
  /^authorization$/,
  /identitytoken/,
  /^bearer$/,
  /^cookie$/,
  /secret/,
  /apikey$/,
  /privatekey$/,
  /^mnemonic$|seedphrase/,
  /signature$/,
  /usd$/,
  /balance/,
  /pnl$|pnlusd$/,
  /^shares$/,
  /costbasis/,
];

const flat = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, "");

const isScalar = (value: unknown): boolean =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean";

const allowedValue = (value: unknown): value is AttributeValue =>
  isScalar(value) || (Array.isArray(value) && value.length > 0 && value.every(isScalar));

/**
 * Whether a name may be recorded. Exported so a reviewer can check one
 * directly rather than constructing an object around it.
 *
 * There is no allowlist beside the patterns, deliberately. One was written
 * here for `user_id` and mutation-testing showed it did nothing: no pattern
 * matches `userid`, so emptying the set changed no behaviour. What protects
 * that decision is the test asserting `user_id` survives — which fails the
 * day somebody adds `/userid/` or a broader `/id$/` — and not a set that
 * looked like it was load-bearing and was not.
 */
export const banned = (key: string): boolean => {
  const name = flat(key);
  return BANNED.some((pattern) => pattern.test(name));
};

/**
 * The attributes of `input` that may be recorded.
 *
 * Silently dropping is the right failure here rather than throwing: an
 * instrumentation that crashed the request it was measuring would be worse
 * than one that recorded less than its author intended, and the test is where
 * an author finds out.
 */
export const safeAttributes = (input: Readonly<Record<string, unknown>>): Attributes => {
  const out: Record<string, AttributeValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (banned(key) || !allowedValue(value)) continue;
    out[key] = value;
  }
  return out;
};
