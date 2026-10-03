/**
 * Money arrives from the API as a decimal string and is formatted here, once.
 *
 * It is never parsed into a number and back: `Number("12480.62")` is fine, but
 * the habit of doing it is how a repository ends up with a float in a place
 * that matters. These helpers take the string, format it, and hand back a
 * string.
 */
const money = (digits: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export const usd = (v: string | number | null | undefined, digits = 2): string =>
  v === null || v === undefined || v === "" ? "—" : money(digits).format(Number(v));

/** Signed, for a change figure where the direction is the point. */
export const usdSigned = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return `${n < 0 ? "−" : "+"}${usd(Math.abs(n))}`;
};

/** A percentage that arrives as "10.68", rendered "10.68%". Always absolute: the arrow carries the sign. */
export const pct = (v: string | number | null | undefined, digits = 2): string =>
  v === null || v === undefined || v === "" ? "—" : `${Math.abs(Number(v)).toFixed(digits)}%`;

/** A share count. Three places, because fractional shares are the point. */
export const shares = (v: string | number | null | undefined): string =>
  v === null || v === undefined || v === "" ? "—" : Number(v).toFixed(3);

export const isUp = (v: string | number | null | undefined): boolean => Number(v ?? 0) >= 0;

export const count = (n: number): string => new Intl.NumberFormat("en-US").format(n);

/**
 * Thousands, millions, billions: `$1.83M`, `$48.2K`, `$912`.
 *
 * Hand-rolled rather than `Intl`'s `notation: "compact"`, which Hermes does not
 * implement. It does not throw — it silently ignores the option and returns the
 * long form carrying the one fraction digit the compact form asked for, so a
 * $2,500 loan rendered as "$2,500.0" on the phone and "$2.5K" in the browser.
 * An option quietly dropped is worse than an unsupported one.
 *
 * Every case below matches what `Intl` produces in a browser, including the two
 * that are easy to get wrong: a value rounds to its unit's precision BEFORE the
 * unit is final, so 999,949 is $999.9K while 999,999 is $1M; and a trailing
 * ".0" is dropped, so 1,000 is $1K rather than $1.0K.
 */
const UNITS = ["", "K", "M", "B", "T"] as const;

/**
 * The figure at a unit, to one decimal — rounded BEFORE the division.
 *
 * `(1450 / 1000).toFixed(1)` is "1.4", because 1.45 has no exact binary form
 * and lands a hair below the halfway point. Intl rounds the decimal value and
 * says "1.5". Scaling first keeps the arithmetic on integers either side of the
 * only rounding that happens.
 */
const atUnit = (size: number, divisor: number): number => Math.round((size * 10) / divisor) / 10;

export const usdCompact = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined || v === "") return "\u2014";
  const n = Number(v);
  if (!Number.isFinite(n)) return "\u2014";

  const sign = n < 0 ? "-" : "";
  const size = Math.abs(n);

  let unit = 0;
  while (size >= 1000 ** (unit + 1) && unit < UNITS.length - 1) unit += 1;

  // Below a thousand Intl shows no decimals; at a unit it shows one.
  let value = unit === 0 ? Math.round(size) : atUnit(size, 1000 ** unit);
  // That rounding can reach the next unit — 999,949 is $999.9K and 999,999 is
  // $1M — and "$1000.0K" is nobody's idea of a compact figure.
  if (value >= 1000 && unit < UNITS.length - 1) {
    unit += 1;
    value = atUnit(size, 1000 ** unit);
  }

  // `String` already writes 1.0 as "1" and keeps 1.5 as "1.5".
  return `${sign}$${String(value)}${UNITS[unit]}`;
};
