export const usd = (v: number, dp = 2): string =>
  `$${v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

export const usdCompact = (v: number): string =>
  v >= 10_000 ? `$${(v / 1000).toFixed(1)}k` : usd(v);

export const signed = (v: number, dp = 2): string => `${v < 0 ? "−" : "+"}${usd(Math.abs(v), dp)}`;

export const pct = (ratio: number, dp = 2): string => `${ratio < 0 ? "−" : "+"}${(Math.abs(ratio) * 100).toFixed(dp)}%`;

export const bareP = (ratio: number, dp = 2): string => `${(ratio * 100).toFixed(dp)}%`;

export const shares = (v: number): string => v.toLocaleString("en-US", { maximumFractionDigits: 4 });

export const when = (iso: string): string =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const dayOf = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

/** Market hours are New York hours. Never show them in the reader's timezone. */
export const nyTime = (iso: string): string =>
  new Date(iso).toLocaleString("en-US", {
    weekday: "long", hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
  }) + " New York time";
