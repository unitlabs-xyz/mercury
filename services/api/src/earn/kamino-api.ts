import { D, type Decimal } from "@mercury/core";

/**
 * Kamino's public API, for what the chain does not keep: a vault's rate
 * averaged over past weeks, its history, how many hold it, and the names of
 * the lending markets it lends into. The live rate and every balance still
 * come from the chain; this only adds the past.
 *
 * Everything here is cached and every failure answers null, because a page
 * that cannot show a 30-day average should still show the vault.
 */
const BASE = "https://api.kamino.finance";

/** One vault as Kamino lists it: what its state says, without reading the chain. */
export interface ListedVault {
  readonly address: string;
  readonly name: string;
  readonly tokenMint: string;
  readonly sharesMint: string;
  readonly sharesDecimals: number;
  readonly tokenDecimals: number;
  readonly performanceFeeBps: number;
  readonly managementFeeBps: number;
  /** In the token's base units. */
  readonly minDeposit: bigint;
  /** In base units; zero is no cap. */
  readonly depositCap: bigint;
  readonly createdAt: Date | null;
}

export interface VaultMetrics {
  readonly apy7d: Decimal | null;
  readonly apy30d: Decimal | null;
  readonly apy365d: Decimal | null;
  readonly tvlUsd: Decimal | null;
  readonly holders: number | null;
  /** The vault's own rate right now, after fees: Kamino's `apyActual`. */
  readonly apy: Decimal | null;
  /** USDC one share withdraws as. */
  readonly tokensPerShare: Decimal | null;
}

export interface VaultPoint {
  readonly at: string;
  /** What a depositor was paid, after fees, 0–1. */
  readonly apy: Decimal;
  readonly tvlUsd: Decimal;
  readonly sharePrice: Decimal;
}

export interface KaminoApi {
  /** Every Earn vault Kamino runs, any token. */
  vaults(): Promise<readonly ListedVault[]>;
  metrics(vault: string): Promise<VaultMetrics | null>;
  history(vault: string, from: Date, to: Date): Promise<readonly VaultPoint[] | null>;
  /** Lending market address to its name: "JLP Market". */
  marketNames(): Promise<ReadonlyMap<string, string>>;
}

const num = (v: unknown): Decimal | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  try {
    const d = D(String(v));
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
};

/** One cached value per key, kept for `ttlMs`; a failure is not cached. */
const memo = <T>(ttlMs: number) => {
  const cache = new Map<string, { at: number; value: Promise<T> }>();
  return (key: string, load: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = load();
    value.catch(() => cache.delete(key));
    cache.set(key, { at: Date.now(), value });
    return value;
  };
};

export const kaminoApi = (fetchImpl: typeof fetch = fetch): KaminoApi => {
  const get = async (path: string): Promise<unknown> => {
    const res = await fetchImpl(`${BASE}${path}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`kamino api: ${path} answered ${res.status}`);
    return res.json();
  };
  const metricsMemo = memo<VaultMetrics | null>(10 * 60_000);
  const historyMemo = memo<readonly VaultPoint[] | null>(30 * 60_000);
  const marketsMemo = memo<ReadonlyMap<string, string>>(60 * 60_000);
  const vaultsMemo = memo<readonly ListedVault[]>(60 * 60_000);
  const big = (v: unknown) => {
    try {
      return BigInt(String(v ?? "0").split(".")[0] ?? "0");
    } catch {
      return 0n;
    }
  };

  return {
    vaults: () =>
      vaultsMemo("all", async () => {
        const rows = (await get("/kvaults/vaults")) as { address: string; state: Record<string, unknown> }[];
        return rows.map((r) => ({
          address: r.address,
          name: String(r.state["name"] ?? "").trim(),
          tokenMint: String(r.state["tokenMint"]),
          sharesMint: String(r.state["sharesMint"]),
          sharesDecimals: Number(r.state["sharesMintDecimals"] ?? 6),
          tokenDecimals: Number(r.state["tokenMintDecimals"] ?? 6),
          performanceFeeBps: Number(r.state["performanceFeeBps"] ?? 0),
          managementFeeBps: Number(r.state["managementFeeBps"] ?? 0),
          minDeposit: big(r.state["minDepositAmount"]),
          depositCap: big(r.state["depositCap"]),
          createdAt: r.state["creationTimestamp"]
            ? new Date(Number(r.state["creationTimestamp"]) * 1000)
            : null,
        }));
      }),

    metrics: (vault) =>
      metricsMemo(vault, async () => {
        const m = (await get(`/kvaults/${vault}/metrics`)) as Record<string, unknown>;
        const invested = num(m["tokensInvestedUsd"]);
        const available = num(m["tokensAvailableUsd"]);
        return {
          apy7d: num(m["apy7d"]),
          apy30d: num(m["apy30d"]),
          apy365d: num(m["apy365d"]),
          tvlUsd: invested === null || available === null ? null : invested.add(available),
          holders: typeof m["numberOfHolders"] === "number" ? m["numberOfHolders"] : null,
          apy: num(m["apyActual"] ?? m["apy"]),
          tokensPerShare: num(m["tokensPerShare"]),
        };
      }).catch(() => null),

    history: (vault, from, to) => {
      const day = (d: Date) => d.toISOString().slice(0, 10);
      return historyMemo(`${vault}:${day(from)}:${day(to)}`, async () => {
        const rows = (await get(
          `/kvaults/${vault}/metrics/history?start=${day(from)}&end=${day(to)}`,
        )) as Record<string, unknown>[];
        return rows.flatMap((r) => {
          const apy = num(r["apyActual"] ?? r["apy"]);
          const tvl = num(r["tvl"]);
          const share = num(r["sharePrice"]);
          return apy === null || tvl === null || share === null || typeof r["timestamp"] !== "string"
            ? []
            : [{ at: r["timestamp"], apy, tvlUsd: tvl, sharePrice: share }];
        });
      }).catch(() => null);
    },

    marketNames: () =>
      marketsMemo("all", async () => {
        const rows = (await get("/v2/kamino-market")) as { lendingMarket?: string; name?: string }[];
        return new Map(
          rows.flatMap((r) => (r.lendingMarket && r.name ? [[r.lendingMarket, r.name] as const] : [])),
        );
      }).catch(() => new Map()),
  };
};
