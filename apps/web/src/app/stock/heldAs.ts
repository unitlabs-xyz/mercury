import { useQueries, useQuery } from "@tanstack/react-query";
import type { Exposure, Issuer, Portfolio } from "@mercury/types";
import { apiFetch } from "../../api/client";
import { usePortfolio } from "../../api/hooks";
import { useBorrow } from "../../api/borrow";

/** What each issuer's token is called where a person would meet it. */
export const TOKEN_NAME: Record<Issuer, string> = { backed: "xStocks", ondo: "Ondo" };

/**
 * Kamino's stock reserves are xStocks mints; no Ondo token is one. The server
 * says this per ticker today (`/v1/borrow` rows are xStocks only), not per
 * mint, so the rule lives here until the API sends it with each token. See
 * docs/backend/issuer-aware-holdings.md.
 */
const LENDABLE: ReadonlySet<Issuer> = new Set<Issuer>(["backed"]);

/** One issuer's part of a position: what it is, what it is worth, and whether it can back a loan. */
export type HeldPart = {
  readonly issuer: Issuer;
  readonly shares: number;
  readonly valueUsd: number;
  /** Of `shares`, pledged to Kamino. Always xStocks: nothing else can be. */
  readonly pledged: number;
  /** Kamino accepts this ticker, and this token is the one it accepts. */
  readonly lendable: boolean;
};

export type HeldAs = {
  readonly holding: Portfolio["holdings"][number] | undefined;
  /** Kamino takes this ticker as collateral at all. Null until the borrow read lands. */
  readonly accepted: boolean | null;
  /** The position by issuer, largest first. Null until the exposure read lands, or when nothing is held. */
  readonly parts: readonly HeldPart[] | null;
  readonly lendableShares: number;
  readonly unlendableShares: number;
  readonly unlendableUsd: number;
};

const exposureQuery = (ticker: string, held: boolean) => ({
  queryKey: ["api", "exposure", ticker],
  queryFn: () => apiFetch<Exposure>(`/v1/portfolio/exposure/${encodeURIComponent(ticker)}`),
  enabled: held && ticker.length > 0,
  staleTime: 30_000,
});

/** Every token of the company held in the wallet, by issuer. 404s on a position of nothing, so it waits for one. */
const useExposure = (ticker: string, held: boolean) => useQuery(exposureQuery(ticker, held));

/**
 * Which providers each holding sits with, for the holdings list: xStocks,
 * Ondo, or both. Pledged shares are xStocks, so they count even when the
 * wallet holds none. A ticker is missing until its read lands.
 */
export const useProviders = (
  holdings: readonly { ticker: string; pledgedShares?: string | number | undefined }[],
): ReadonlyMap<string, readonly Issuer[]> => {
  const reads = useQueries({ queries: holdings.map((h) => exposureQuery(h.ticker, true)) });
  const out = new Map<string, Issuer[]>();
  holdings.forEach((h, i) => {
    const data = reads[i]?.data;
    if (!data) return;
    const set = new Set(data.wrappers.filter((w) => Number(w.shares) > 0).map((w) => w.issuer));
    if (Number(h.pledgedShares ?? 0) > 0) set.add("backed");
    out.set(h.ticker, [...set].sort());
  });
  return out;
};

/**
 * One company as it is actually held: the position the books show, split by
 * the token behind it. The exposure read is the wallet only, so the pledged
 * shares (xStocks, in Kamino) are added back to the xStocks part.
 */
export const useHeldAs = (ticker: string): HeldAs => {
  const portfolio = usePortfolio();
  const borrow = useBorrow();
  const holding = portfolio.data?.holdings.find((h) => h.ticker === ticker);
  const shares = holding ? Number(holding.shares) : 0;
  const exposure = useExposure(ticker, shares > 0);
  const accepted = borrow.data ? borrow.data.collateral.some((c) => c.isStock && c.ticker === ticker) : null;

  const perShare = holding && shares > 0 ? Number(holding.valueUsd) / shares : 0;
  const pledged = Number(holding?.pledgedShares ?? 0);
  let parts: HeldPart[] | null = null;
  if (holding && exposure.data) {
    const byIssuer = new Map<Issuer, number>();
    for (const w of exposure.data.wrappers) {
      byIssuer.set(w.issuer, (byIssuer.get(w.issuer) ?? 0) + Number(w.shares));
    }
    if (pledged > 0) byIssuer.set("backed", (byIssuer.get("backed") ?? 0) + pledged);
    parts = [...byIssuer]
      .filter(([, n]) => n > 1e-9)
      .map(([issuer, n]) => ({
        issuer,
        shares: n,
        valueUsd: n * perShare,
        pledged: issuer === "backed" ? pledged : 0,
        lendable: accepted === true && LENDABLE.has(issuer),
      }))
      .sort((a, b) => b.shares - a.shares);
  }
  const lendableShares = parts?.filter((p) => p.lendable).reduce((s, p) => s + p.shares, 0) ?? 0;
  const unlendableShares = parts?.filter((p) => !p.lendable).reduce((s, p) => s + p.shares, 0) ?? 0;
  return {
    holding,
    accepted,
    parts,
    lendableShares,
    unlendableShares,
    unlendableUsd: unlendableShares * perShare,
  };
};

/** Whether this issuer's token of an accepted ticker can back a loan. */
export const lendableIssuer = (issuer: Issuer) => LENDABLE.has(issuer);
