import { HarborClient } from "@harbor/sdk";

/** Wallet address comes from Privy once that is wired. See ADR 0003. */
export const client = new HarborClient({ baseUrl: import.meta.env.VITE_API_URL ?? "" });

export const usd = (v: string | null, dp = 2): string =>
  v === null ? "—" : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

export const pct = (ratio: string | null, dp = 2): string =>
  ratio === null ? "—" : `${(Number(ratio) * 100).toFixed(dp)}%`;
