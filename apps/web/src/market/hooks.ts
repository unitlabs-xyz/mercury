import { useQuery } from "@tanstack/react-query";
import { D, DEFAULT_POLICY, ONE, type Decimal, type Issuer } from "@mercury/core";
import { JupiterRegistry } from "@mercury/chain";
import {
  JupiterMarket,
  KaminoCredit,
  PythSessions,
  type CreditMarket as ChainCreditMarket,
  type TokenPrice,
} from "@mercury/market";
import type { Instrument as WireInstrument } from "@mercury/types";
import { ApiError, apiFetch } from "../api/client";
import { useSignedIn } from "../api/hooks";
import { decisionFromWire } from "@mercury/view";
import type { Decision as WireDecision } from "@mercury/types";

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
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
};

/** The move over each period, as percentages. Null where the provider has none. */
export type Returns = {
  readonly m1: number | null;
  readonly m6: number | null;
  readonly y1: number | null;
  readonly cagr5y: number | null;
};

type WireReturns = Record<keyof Returns, string | null>;

const pct = (v: string | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);

type Detail = { readonly instrument: Instrument | null; readonly returns: Returns };

const EMPTY_RETURNS: Returns = { m1: null, m6: null, y1: null, cagr5y: null };

/**
 * One instrument's page, fetched once.
 *
 * The detail response carries the instrument and its returns together, so both
 * hooks below read the same cache entry rather than asking twice for one page.
 */
const detailQuery = (ticker: string) => ({
  queryKey: ["instruments", "one", ticker.toUpperCase()],
  queryFn: async (): Promise<Detail> => {
    try {
      const body = await apiFetch<{ instrument: WireInstrument; returns?: WireReturns }>(
        `/v1/instruments/${encodeURIComponent(ticker)}`,
      );
      const i = toInstrument(body.instrument);
      const r = body.returns;
      return {
        instrument: buyable(i) ? i : null,
        returns:
          r === undefined
            ? EMPTY_RETURNS
            : { m1: pct(r.m1), m6: pct(r.m6), y1: pct(r.y1), cagr5y: pct(r.cagr5y) },
      };
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return { instrument: null, returns: EMPTY_RETURNS };
      throw e;
    }
  },
  enabled: ticker.length > 0,
  staleTime: 30_000,
});

/** One instrument's page. Null when we do not list it, or when nothing could buy it. */
export const useInstrument = (ticker: string) =>
  useQuery({ ...detailQuery(ticker), select: (d: Detail) => d.instrument });

/**
 * What the underlying share did over each period.
 *
 * Every figure is nullable and a null stays null all the way to the screen: a
 * period we have no history for is a blank, never a zero. A zero would read as
 * "it went nowhere", which is a claim about the company we have no basis for.
 */
export const useReturns = (ticker: string) =>
  useQuery({ ...detailQuery(ticker), select: (d: Detail) => d.returns });

/** The spans the chart offers, shortest first. */
export type Span = "1D" | "1W" | "1M" | "6M" | "1Y" | "5Y";

export type History = {
  /** Oldest first. Already anchored server-side to the live share price. */
  readonly points: readonly { readonly at: Date; readonly price: number }[];
  readonly changePct: number;
};

/**
 * One span of a ticker's price history.
 *
 * Null is a missing chart, and the screen draws none. It is deliberately not an
 * empty series: a flat line reads as a price that never moved, which is exactly
 * the invented-data failure this replaced.
 */
export const useHistory = (ticker: string, span: Span) =>
  useQuery({
    queryKey: ["instruments", "history", ticker.toUpperCase(), span],
    queryFn: async (): Promise<History | null> => {
      try {
        const body = await apiFetch<{ changePct: string; points: [number, string][] }>(
          `/v1/instruments/${encodeURIComponent(ticker)}/history?span=${span}`,
        );
        return {
          changePct: Number(body.changePct),
          points: body.points.map(([at, price]) => ({ at: new Date(at * 1000), price: Number(price) })),
        };
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    enabled: ticker.length > 0,
    // Intraday spans move while someone watches; the rest settle once a day.
    staleTime: span === "1D" || span === "1W" ? 60_000 : 10 * 60 * 1000,
    refetchInterval: span === "1D" || span === "1W" ? 60_000 : 10 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

/** The spans the range switch offers. A subset of what the API serves. */
export const RANGES: readonly Span[] = ["1D", "1W", "1M", "1Y"];

/**
 * One span across many tickers, in one request.
 *
 * A shelf draws a sparkline per row, and a hook per row would be a request per
 * row. The map is keyed by ticker and a ticker with no history is present and
 * null, so a row can tell "no chart" from "not loaded yet".
 */
export const useHistories = (tickers: readonly string[], span: Span) => {
  const key = [...new Set(tickers.map((t) => t.toUpperCase()))].sort().join(",");
  return useQuery({
    queryKey: ["instruments", "histories", key, span],
    queryFn: async (): Promise<ReadonlyMap<string, History | null>> => {
      const body = await apiFetch<{
        series: Record<string, { changePct: string; points: [number, string][] } | null>;
      }>(`/v1/instruments/history?tickers=${encodeURIComponent(key)}&span=${span}`);
      return new Map(
        Object.entries(body.series).map(([ticker, s]) => [
          ticker,
          s === null
            ? null
            : {
                changePct: Number(s.changePct),
                points: s.points.map(([at, price]) => ({
                  at: new Date(at * 1000),
                  price: Number(price),
                })),
              },
        ]),
      );
    },
    enabled: key.length > 0,
    staleTime: span === "1D" || span === "1W" ? 60_000 : 10 * 60 * 1000,
    refetchInterval: span === "1D" || span === "1W" ? 60_000 : 10 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
};

export const usePrices = (mints: readonly string[]) =>
  useQuery({
    queryKey: ["prices", [...mints].sort().join(",")],
    queryFn: () => market.pricesFor(mints),
    enabled: mints.length > 0,
    refetchInterval: 20_000,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
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
/**
 * What this order would do, decided by the server.
 *
 * It used to be decided here: five chain clients in the browser, its own
 * quotes, its own copy of the policy. Two decisions then existed for every
 * order — the one on screen and the one that executed — computed by different
 * code over separately fetched quotes, and `PriceMoved` was catching the gap
 * between them as often as it caught the market moving.
 *
 * `prices` is still taken, and still ignored for the decision itself. The
 * caller has it for the page around the ticket, and asking for it keeps the
 * call sites unchanged while the reference price comes from the server.
 */
export const useDecision = (
  instrument: Instrument | undefined,
  usd: number,
  _prices: PriceMap | undefined,
  opts: { side?: "buy" | "sell"; max?: boolean } = {},
) => {
  const side = opts.side ?? "buy";
  const max = opts.max === true;
  const session = useSession();
  const signedIn = useSignedIn();
  const amount = Number.isFinite(usd) && usd > 0 ? usd : 0;
  /* Under the minimum the answer is known without asking: the ticket says so itself, and no quote is fetched. */
  const belowMinimum = !max && amount > 0 && amount < DEFAULT_POLICY.minOrderUsd.toNumber();

  const quoted = useQuery({
    /* The side and `max` belong in the key: the same dollar figure means a
       different order on each tab, and "everything" is not a dollar figure at
       all. Sharing a cache entry would show a buy's answer on the sell tab. */
    queryKey: ["quote", instrument?.ticker, amount.toFixed(2), side, max, signedIn],
    enabled: !!instrument && (amount > 0 || max) && !belowMinimum,
    staleTime: 10_000,
    refetchInterval: 20_000,
    queryFn: () =>
      apiFetch<{
        decision: WireDecision;
        fee: { usdc: string; lamports: number };
        investable: string | null;
        proceeds: string | null;
      }>("/v1/quote", {
        method: "POST",
        body: JSON.stringify({
          ticker: instrument!.ticker,
          side,
          amount: amount.toFixed(2),
          ...(max ? { max: true } : {}),
        }),
      }),
  });

  return {
    decision: quoted.data ? decisionFromWire(quoted.data.decision) : null,
    /*
     * What the network costs, and what is left to buy with. Zero unless a
     * relayer is paying, which is why the ticket shows these lines only
     * sometimes rather than always.
     */
    fee: quoted.data ? D(quoted.data.fee.usdc) : null,
    investable: quoted.data?.investable ? D(quoted.data.investable) : null,
    /** What lands in the wallet once the network is paid. Null on a buy. */
    proceeds: quoted.data?.proceeds ? D(quoted.data.proceeds) : null,
    isLoading: quoted.isLoading || session.isLoading,
    isFetching: quoted.isFetching,
    error: quoted.error,
    session: session.data ?? null,
  };
};
