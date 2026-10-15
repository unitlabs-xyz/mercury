/**
 * Money out of an aggregate, as a decimal string.
 *
 * Never a JavaScript number. `usd()` columns in this schema are
 * `numeric(38, 18)` because a float cannot hold a cent reliably, and summing
 * them through a `number` on the way to a dashboard would undo that for the
 * one figure somebody quotes in a meeting.
 *
 * Postgres returns a `numeric(38, 18)` sum at full scale —
 * `"400.000000000000000000"` — and `sum()` of no rows returns null. This trims
 * the trailing zeros a scale of 18 pads with, and answers "0" for nothing,
 * without ever parsing the value.
 */
export const decimal = (value: string | null | undefined): string => {
  if (value === null || value === undefined || value === "") return "0";
  /* No point, nothing to trim — and stripping zeros from "1000" would be
     stripping significant digits. */
  if (!value.includes(".")) return value;
  const trimmed = value.replace(/0+$/, "").replace(/\.$/, "");
  /* Anything that trimmed down to nothing, or to a sign, or to a signed zero,
     is zero — and "-0" on a dashboard reads as a glitch. */
  return /^-?0*$/.test(trimmed) ? "0" : trimmed;
};
