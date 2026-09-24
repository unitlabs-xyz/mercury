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
import {
  JupiterLite,
  JupiterRegistry,
  type CatalogueInstrument,
  type CatalogueWrapper,
} from "@mercury/chain";
import {
  JupiterMarket,
  KaminoCredit,
  PythSessions,
  type CreditMarket as ChainCreditMarket,
  type TokenPrice,
} from "@mercury/market";
import { ABOUT, DISPLAY_NAME, SECTOR } from "./meta";

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

const toWrapper = (w: CatalogueWrapper): Wrapper => ({
  mint: w.mint,
  symbol: w.symbol,
  issuer: w.issuer,
  decimals: w.decimals,
  ...(w.icon ? { icon: w.icon } : {}),
  liquidity: w.liquidityUsd.toNumber(),
  holders: w.holders,
  netBuyers24h: w.netBuyers24h,
  volume24h: w.volume24hUsd.toNumber(),
  traders24h: w.traders24h,
});

/** Jupiter names the token ("NVIDIA xStock"); the company's name is ours. */
const toInstrument = (i: CatalogueInstrument): Instrument => {
  const wrappers = i.wrappers.map(toWrapper);
  const logo = wrappers.find((w) => w.issuer === "backed")?.icon;
  return {
    ticker: i.ticker,
    name: DISPLAY_NAME[i.ticker] ?? i.ticker,
    sector: SECTOR[i.ticker] ?? "Other",
    about: ABOUT[i.ticker] ?? "",
    ...(logo ? { logo } : {}),
    wrappers,
  };
};

/** The token set changes when an issuer lists something. Hours, not seconds. */
export const useUniverse = () =>
  useQuery({
    queryKey: ["universe"],
    queryFn: async () =>
      (await registry.instruments()).map(toInstrument).sort((a, b) => a.name.localeCompare(b.name)),
    staleTime: 60 * 60 * 1000,
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
    fair: p?.pricePerShare?.toNumber() ?? null,
    todayPct: p?.changePct24h?.toNumber() ?? null,
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
