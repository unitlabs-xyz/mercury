import { useQuery } from "@tanstack/react-query";
import { D, DEFAULT_POLICY, decide, type Candidate, type Decision } from "@harbor/core";
import { USDC_DECIMALS, fetchPrices, fetchQuote, type JupPrice, type JupQuote } from "./jupiter";
import { fetchSession } from "./pyth";
import { fetchUniverse, type Instrument, type Wrapper } from "./universe";

/** The token set changes when an issuer lists something. Hours, not seconds. */
export const useUniverse = () =>
  useQuery({
    queryKey: ["universe"],
    queryFn: ({ signal }) => fetchUniverse(signal),
    staleTime: 60 * 60 * 1000,
  });

export const usePrices = (mints: readonly string[]) =>
  useQuery({
    queryKey: ["prices", [...mints].sort().join(",")],
    queryFn: ({ signal }) => fetchPrices(mints, signal),
    enabled: mints.length > 0,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

export const useSession = () =>
  useQuery({
    queryKey: ["session"],
    queryFn: ({ signal }) => fetchSession(signal),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

/* ── deriving what the screens need ─────────────────────────────────── */

export type Priced = {
  readonly instrument: Instrument;
  /** Of one real share, from stockData — independent of the pool. */
  readonly fair: number | null;
  readonly todayPct: number | null;
  readonly liquidity: number;
  readonly observedAt: Date | null;
};

export const priceInstrument = (
  instrument: Instrument,
  prices: Record<string, JupPrice | null> | undefined,
): Priced => {
  const backed = instrument.wrappers.find((w) => w.issuer === "backed");
  const primary = backed ?? instrument.wrappers[0];
  const p = primary ? prices?.[primary.mint] : null;
  return {
    instrument,
    fair: p?.stockData?.price ?? null,
    todayPct: p?.priceChange24h ?? null,
    liquidity: instrument.wrappers.reduce((n, w) => n + (prices?.[w.mint]?.liquidity ?? 0), 0),
    observedAt: p?.stockData?.updatedAt ? new Date(p.stockData.updatedAt) : null,
  };
};

export const multiplierOf = (p: JupPrice | null | undefined) => p?.scaledUiConfig?.multiplier ?? 1;

/* ── the decision ───────────────────────────────────────────────────── */

const candidateFrom = (w: Wrapper, q: JupQuote, price: JupPrice | null | undefined): Candidate => ({
  mint: w.mint,
  symbol: w.symbol,
  issuer: w.issuer,
  multiplier: D(multiplierOf(price)),
  quote: {
    inAmount: D(Number(q.inAmount) / 10 ** USDC_DECIMALS),
    outAmount: D(Number(q.outAmount) / 10 ** w.decimals),
    priceImpact: D(Math.abs(Number(q.priceImpactPct))),
    routeLabels: (q.routePlan ?? []).map((r) => r.swapInfo?.label ?? "?"),
    quoteId: `${w.mint}:${q.contextSlot ?? Date.now()}`,
    expiresAt: new Date(Date.now() + 20_000),
  },
});

/**
 * One live quote per issuer at the amount actually being spent, then the real
 * engine decides. A wrapper with no route at this size becomes a candidate with
 * a null quote, which is what `decide` expects — not a dropped row.
 */
export const useDecision = (
  instrument: Instrument | undefined,
  usd: number,
  prices: Record<string, JupPrice | null> | undefined,
) => {
  const session = useSession();
  const amount = Number.isFinite(usd) && usd > 0 ? usd : 0;

  const quotes = useQuery({
    queryKey: ["quotes", instrument?.ticker, amount.toFixed(2)],
    enabled: !!instrument && amount > 0,
    staleTime: 10_000,
    refetchInterval: 20_000,
    queryFn: async ({ signal }) => {
      const wrappers = instrument!.wrappers;
      return Promise.all(
        wrappers.map(async (w) => {
          try {
            return { w, q: await fetchQuote(w.mint, amount, signal) };
          } catch {
            return { w, q: null }; // no route at this size
          }
        }),
      );
    },
  });

  const priced = instrument ? priceInstrument(instrument, prices) : null;
  const fair = priced?.fair ?? null;

  let decision: Decision | null = null;
  if (instrument && quotes.data && fair !== null && amount > 0) {
    const candidates: Candidate[] = quotes.data.map(({ w, q }) =>
      q ? candidateFrom(w, q, prices?.[w.mint]) : {
        mint: w.mint,
        symbol: w.symbol,
        issuer: w.issuer,
        multiplier: D(multiplierOf(prices?.[w.mint])),
        quote: null,
      },
    );
    decision = decide({
      ticker: instrument.ticker,
      side: "buy",
      amount: D(amount),
      candidates,
      reference: {
        pricePerShare: D(fair),
        observedAt: priced?.observedAt ?? new Date(),
        pendingDividendNet: D(0),
      },
      status: session.data?.status ?? "closed",
      policy: DEFAULT_POLICY,
      now: new Date(),
      ...(session.data?.nextOpen ? { marketOpensAt: session.data.nextOpen } : {}),
    });
  }

  return {
    decision,
    isLoading: quotes.isLoading || session.isLoading,
    isFetching: quotes.isFetching,
    error: quotes.error,
    session: session.data ?? null,
  };
};
