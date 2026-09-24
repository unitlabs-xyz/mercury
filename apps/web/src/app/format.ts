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
