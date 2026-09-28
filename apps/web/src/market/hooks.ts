import { useQuery } from "@tanstack/react-query";
import {
  D,
  DEFAULT_POLICY,
  ONE,
  decide,
  type Candidate,
  type Decimal,
  type Decision,
  type Issuer,
} from "@mercury/core";
import { JupiterLite, JupiterRegistry } from "@mercury/chain";
import {
  JupiterMarket,
  KaminoCredit,
  PythSessions,
  type CreditMarket as ChainCreditMarket,
  type TokenPrice,
} from "@mercury/market";
import type { Instrument as WireInstrument } from "@mercury/types";
import { ApiError, apiFetch } from "../api/client";

/**
 * The app's view of the market.
 *
 * Every read below happens in `@mercury/market` and `@mercury/chain`, which the
 * API uses too — one implementation, so the two paths cannot disagree. What
 * stays here is what belongs to the app: React Query's caching, and the view
 * models the screens are written against. Those use plain numbers, because they
 * are display figures; anything that reaches `decide()` stays a Decimal.
 *
 * This is the fallback path of ADR 0011: keyless, CORS-open, no server.
 */
const registry = new JupiterRegistry();
const market = new JupiterMarket({ registry });
const quotes = new JupiterLite();
const sessions = new PythSessions();
const credit = new KaminoCredit();

export type PriceMap = ReadonlyMap<string, TokenPrice>;
export type { TokenPrice };

export type Wrapper = {
  readonly mint: string;
  readonly symbol: string;
  readonly issuer: Issuer;
  readonly decimals: number;
  readonly icon?: string;
  readonly liquidity: number;
  /** On-chain holders of this wrapper. */
  readonly holders: number;
  /** Net buyers over 24h — buyers minus sellers, from Jupiter's own stats. */
  readonly netBuyers24h: number;
  readonly volume24h: number;
  readonly traders24h: number;
};

export type Instrument = {
  readonly ticker: string;
  readonly name: string;
  readonly sector: string;
  readonly about: string;
  readonly logo?: string;
  readonly wrappers: readonly Wrapper[];
  /** On the short shelf. Everything else is found by search. */
  readonly featured: boolean;
  /** About the largest order the deepest pool takes inside the impact cap. The quote decides. */
  readonly maxOrderUsd: number;
  /** The server's price when it sent the list, so a shelf needs no second request. */
  readonly quote: { readonly fair: number | null; readonly todayPct: number | null };
};

export type Session = {
  readonly status: Awaited<ReturnType<PythSessions["current"]>>["status"];
  readonly isOpen: boolean;
  readonly nextOpen: Date | null;
  readonly nextClose: Date | null;
};

export type Collateral = { readonly symbol: string; readonly ticker: string; readonly maxLtv: number };
export type CreditMarket = {
  readonly collateral: readonly Collateral[];
  readonly borrowApy: number | null;
  readonly supplyApy: number | null;
};

export { XSTOCKS_MARKET } from "@mercury/market";

const toInstrument = (i: WireInstrument & { description?: string | null }): Instrument => {
  const wrappers: Wrapper[] = i.wrappers.map((w) => ({
    mint: w.mint,
    symbol: w.symbol,
    issuer: w.issuer,
    decimals: w.decimals,
    ...(w.icon ? { icon: w.icon } : {}),
    liquidity: Number(w.liquidityUsd),
    holders: w.holders,
    netBuyers24h: w.netBuyers24h,
    volume24h: Number(w.volume24hUsd),
    traders24h: w.traders24h,
  }));
  return {
    ticker: i.ticker,
    name: i.name,
    sector: i.sector ?? "Other",
    about: i.description ?? "",
    ...(i.logoUrl ? { logo: i.logoUrl } : {}),
    wrappers,
    featured: i.featured,
    maxOrderUsd: Number(i.maxOrderUsd),
    quote: { fair: Number(i.pricePerShare), todayPct: Number(i.changePct24h) },
  };
};

/**
 * The website lists only what someone could actually buy. An instrument whose
 * every pool is empty has a price and nothing behind it; the API still returns
 * it, because other clients may want to say so, but a shelf should not.
 */
const buyable = (i: Instrument) => i.wrappers.some((w) => w.liquidity > 0);

const list = async (query = ""): Promise<Instrument[]> =>
  (await apiFetch<{ instruments: WireInstrument[] }>(`/v1/instruments${query}`)).instruments
    .map(toInstrument)
    .filter(buyable);

/**
 * The featured shelf, from our API: the instruments deep enough to fill a
 * normal order. Everything else is one search away. Polled, because the list
 * carries each price and a shelf should not go stale while it is open.
 */
export const useUniverse = () =>
  useQuery({
    queryKey: ["instruments", "featured"],
    queryFn: () => list(),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

/** Any instrument by name or ticker, across every stock we support. */
export const useInstrumentSearch = (q: string) =>
  useQuery({
    queryKey: ["instruments", "search", q],
    queryFn: () => list(`?q=${encodeURIComponent(q)}`),
    enabled: q.length > 0,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

/** Exactly these tickers, featured or not — a portfolio's holdings. */
export const useInstruments = (tickers: readonly string[]) => {
  const key = [...tickers].sort().join(",");
  return useQuery({
    queryKey: ["instruments", "tickers", key],
    queryFn: async () =>
      (
        await apiFetch<{ instruments: WireInstrument[] }>(
          `/v1/instruments?tickers=${encodeURIComponent(key)}`,
        )
      ).instruments.map(toInstrument),
    enabled: key.length > 0,
    staleTime: 60_000,
  });
};

/** One instrument's page. Null when we do not list it, or when nothing could buy it. */
export const useInstrument = (ticker: string) =>
  useQuery({
    queryKey: ["instruments", "one", ticker.toUpperCase()],
    queryFn: async (): Promise<Instrument | null> => {
      try {
        const body = await apiFetch<{ instrument: WireInstrument }>(
          `/v1/instruments/${encodeURIComponent(ticker)}`,
        );
        const i = toInstrument(body.instrument);
        return buyable(i) ? i : null;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    enabled: ticker.length > 0,
    staleTime: 30_000,
  });

export const usePrices = (mints: readonly string[]) =>
  useQuery({
    queryKey: ["prices", [...mints].sort().join(",")],
    queryFn: () => market.pricesFor(mints),
    enabled: mints.length > 0,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

/** Collateral factors and the borrow rate. Both move, neither moves fast. */
export const useCreditMarket = () =>
  useQuery({
    queryKey: ["credit-market"],
    queryFn: async (): Promise<CreditMarket> => toCreditMarket(await credit.current()),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

const toCreditMarket = (m: ChainCreditMarket): CreditMarket => ({
  collateral: m.collateral.map((c) => ({ symbol: c.symbol, ticker: c.ticker, maxLtv: c.maxLtv.toNumber() })),
  borrowApy: m.borrowApy?.toNumber() ?? null,
  supplyApy: m.supplyApy?.toNumber() ?? null,
});

export const useSession = () =>
  useQuery({
    queryKey: ["session"],
    queryFn: async (): Promise<Session> => {
      const s = await sessions.current();
      return { status: s.status, isOpen: s.isOpen, nextOpen: s.nextOpenAt, nextClose: s.nextCloseAt };
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

export type Priced = {
  readonly instrument: Instrument;
  /** Of one real share, from stockData — independent of the pool. */
  readonly fair: number | null;
  readonly todayPct: number | null;
  readonly liquidity: number;
  readonly observedAt: Date | null;
  readonly holders: number;
  readonly netBuyers24h: number;
  readonly volume24h: number;
};

export const priceInstrument = (instrument: Instrument, prices: PriceMap | undefined): Priced => {
  const backed = instrument.wrappers.find((w) => w.issuer === "backed");
  const primary = backed ?? instrument.wrappers[0];
  const p = primary ? prices?.get(primary.mint) : undefined;
  const sum = (pick: (w: Wrapper) => number) => instrument.wrappers.reduce((n, w) => n + pick(w), 0);
  return {
    instrument,
    fair: p?.pricePerShare?.toNumber() ?? instrument.quote.fair,
    todayPct: p?.changePct24h?.toNumber() ?? instrument.quote.todayPct,
    liquidity: sum((w) => prices?.get(w.mint)?.liquidityUsd.toNumber() ?? w.liquidity),
    observedAt: p?.observedAt ?? null,
    holders: sum((w) => w.holders),
    netBuyers24h: sum((w) => w.netBuyers24h),
    volume24h: sum((w) => w.volume24h),
  };
};

/**
 * Shares per token, at the multiplier actually in force.
 *
 * A ScaledUiAmount mint carries the multiplier and the next one, with the second
 * taking over at a timestamp. `@mercury/market` applies that rule; reading the
 * raw field understates every share count from the moment a dividend goes
 * effective. See ADR 0011.
 */
export const multiplierOf = (p: TokenPrice | undefined): Decimal => p?.multiplier ?? ONE;

/* ── the decision ───────────────────────────────────────────────────── */

/**
 * One live quote per issuer at the amount actually being spent, then the real
 * engine decides. A wrapper with no route at this size becomes a candidate with
 * a null quote, which is what `decide` expects — not a dropped row.
 */
export const useDecision = (
  instrument: Instrument | undefined,
  usd: number,
  prices: PriceMap | undefined,
) => {
  const session = useSession();
  const amount = Number.isFinite(usd) && usd > 0 ? usd : 0;

  const quoted = useQuery({
    queryKey: ["quotes", instrument?.ticker, amount.toFixed(2)],
    enabled: !!instrument && amount > 0,
    staleTime: 10_000,
    refetchInterval: 20_000,
    queryFn: async () => {
      const wrappers = instrument!.wrappers;
      return Promise.all(
        wrappers.map(async (w) => ({
          w,
          q: await quotes
            .quote({ side: "buy", mint: w.mint, decimals: w.decimals, amount: D(amount) })
            .catch(() => null),
        })),
      );
    },
  });

  const priced = instrument ? priceInstrument(instrument, prices) : null;
  const fair = priced?.fair ?? null;

  let decision: Decision | null = null;
  if (instrument && quoted.data && fair !== null && amount > 0) {
    const candidates: Candidate[] = quoted.data.map(({ w, q }) => ({
      mint: w.mint,
      symbol: w.symbol,
      issuer: w.issuer,
      multiplier: multiplierOf(prices?.get(w.mint)),
      quote: q,
    }));
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
    isLoading: quoted.isLoading || session.isLoading,
    isFetching: quoted.isFetching,
    error: quoted.error,
    session: session.data ?? null,
  };
};
