import { Hono } from "hono";
import { D, DEFAULT_POLICY, toWire, ZERO, type Decimal, type Issuer } from "@mercury/core";
import type { PriceBoard, SessionSource, TokenPrice } from "@mercury/market";

export interface StockWrapperRow {
  readonly mint: string;
  readonly symbol: string;
  readonly issuer: Issuer;
  readonly decimals: number;
  readonly multiplier: string;
  readonly isRoutable: boolean;
  readonly holders: number;
  /** Live figures folded in from the registry, which caches for an hour. */
  readonly icon: string | null;
  readonly liquidityUsd: string;
  readonly volume24hUsd: string;
  readonly netBuyers24h: number;
  readonly traders24h: number;
  /** Jupiter prices it at all. Only these are worth asking price/v3 about. */
  readonly hasMarket: boolean;
}

export interface StockRow {
  readonly ticker: string;
  readonly name: string;
  readonly sector: string | null;
  readonly description: string | null;
  readonly logoUrl: string | null;
  readonly isTradable: boolean;
  readonly wrappers: readonly StockWrapperRow[];
}

export interface InstrumentDeps {
  readonly supportedStocks: () => Promise<readonly StockRow[]>;
  /** How many Mercury accounts bought this in the last thirty days. Detail page only. */
  readonly buyers30d: (ticker: string) => Promise<number>;
  readonly prices: PriceBoard;
  readonly sessions: SessionSource;
  /** Injected so tests can move the clock under the price cache. */
  readonly now?: () => number;
}

const fail = (code: string, message: string) => ({ error: { code, message } });

/**
 * The featured shelf: instruments where some wrapper's pool is deep enough that
 * a $1,000 order stays inside the impact cap. Everything else is found by search.
 */
export const FEATURED_LIQUIDITY_USD = D(70_000);

/** Search answers a page, not the whole list. */
const SEARCH_LIMIT = 50;

/** Prices move every few seconds; a request should not cost a round trip per wrapper. */
const PRICE_TTL_MS = 15_000;

/**
 * About the largest order the deepest pool takes inside the impact cap. Impact
 * runs close to amount over liquidity at these sizes (the same rule of thumb that
 * put the featured line at $70k for $1,000), so this is an estimate for the
 * shelf. The real answer is always the quote at the amount asked.
 */
const maxOrderOf = (liquidity: Decimal): Decimal => liquidity.mul(DEFAULT_POLICY.maxPriceImpact);

interface Priced {
  readonly row: StockRow;
  readonly pricePerShare: Decimal;
  readonly changePct24h: Decimal;
  readonly liquidity: (w: StockWrapperRow) => Decimal;
}

const bestLiquidity = (row: StockRow) =>
  row.wrappers.reduce((best, w) => (D(w.liquidityUsd).gt(best) ? D(w.liquidityUsd) : best), ZERO);

export function instrumentRoutes(deps: InstrumentDeps): Hono {
  const app = new Hono();
  const now = deps.now ?? Date.now;
  const cache = new Map<string, { at: number; price: TokenPrice | null }>();

  /** Live prices for these mints, from cache where fresh. A mint Jupiter cannot price caches as null. */
  const pricesFor = async (mints: readonly string[]): Promise<ReadonlyMap<string, TokenPrice>> => {
    const t = now();
    const stale = mints.filter((m) => {
      const hit = cache.get(m);
      return hit === undefined || t - hit.at > PRICE_TTL_MS;
    });
    if (stale.length > 0) {
      const fresh = await deps.prices.pricesFor(stale);
      for (const m of stale) cache.set(m, { at: t, price: fresh.get(m) ?? null });
    }
    const board = new Map<string, TokenPrice>();
    for (const m of mints) {
      const p = cache.get(m)?.price;
      if (p) board.set(m, p);
    }
    return board;
  };

  /** Price the given rows. No price, no row: showing an instrument at zero would be a price. */
  const price = async (rows: readonly StockRow[]): Promise<readonly Priced[]> => {
    const board = await pricesFor(
      rows.flatMap((r) => r.wrappers.filter((w) => w.hasMarket).map((w) => w.mint)),
    );
    const priced: Priced[] = [];
    for (const row of rows) {
      // Any wrapper prices one share the same way. Backed first, because its
      // pools are the deep ones and its feed is the one that keeps updating.
      const lead =
        [row.wrappers.find((w) => w.issuer === "backed"), ...row.wrappers]
          .filter((w): w is StockWrapperRow => w !== undefined)
          .find((w) => board.get(w.mint)?.pricePerShare != null) ?? undefined;
      const p = lead === undefined ? undefined : board.get(lead.mint);
      if (p === undefined || p.pricePerShare === null) continue;
      priced.push({
        row,
        pricePerShare: p.pricePerShare,
        changePct24h: p.changePct24h ?? ZERO,
        // The live pool depth when we just priced it, the registry's otherwise.
        liquidity: (w) => board.get(w.mint)?.liquidityUsd ?? D(w.liquidityUsd),
      });
    }
    return priced;
  };

  const toInstrument = (p: Priced, status: string) => {
    const { row } = p;
    const liquidity = row.wrappers.reduce((s, w) => s.add(p.liquidity(w)), ZERO);
    const deepest = row.wrappers.reduce((b, w) => (p.liquidity(w).gt(b) ? p.liquidity(w) : b), ZERO);
    return {
      ticker: row.ticker,
      name: row.name,
      sector: row.sector,
      description: row.description,
      logoUrl: row.logoUrl,
      pricePerShare: toWire(p.pricePerShare),
      changePct24h: toWire(p.changePct24h),
      status,
      featured: deepest.gte(FEATURED_LIQUIDITY_USD),
      liquidityUsd: toWire(liquidity),
      maxOrderUsd: toWire(maxOrderOf(deepest).toDecimalPlaces(2)),
      holders: row.wrappers.reduce((n, w) => n + w.holders, 0),
      volume24hUsd: toWire(row.wrappers.reduce((s, w) => s.add(D(w.volume24hUsd)), ZERO)),
      netBuyers24h: row.wrappers.reduce((n, w) => n + w.netBuyers24h, 0),
      traders24h: row.wrappers.reduce((n, w) => n + w.traders24h, 0),
      wrappers: row.wrappers.map((w) => ({
        mint: w.mint,
        symbol: w.symbol,
        issuer: w.issuer,
        decimals: w.decimals,
        multiplier: toWire(D(w.multiplier)),
        isRoutable: w.isRoutable,
        icon: w.icon,
        liquidityUsd: toWire(p.liquidity(w)),
        holders: w.holders,
        volume24hUsd: toWire(D(w.volume24hUsd)),
        netBuyers24h: w.netBuyers24h,
        traders24h: w.traders24h,
      })),
    };
  };

  /**
   * The shelf. With no parameters, the featured instruments only — the short list
   * a first visit needs. `q` searches every supported stock by ticker and name,
   * `tickers` fetches exactly those (a portfolio's holdings), `scope=all` returns
   * everything with a market. `sector` and `shelf` narrow and order any of them.
   */
  app.get("/v1/instruments", async (c) => {
    const [rows, session] = await Promise.all([deps.supportedStocks(), deps.sessions.current()]);
    const listed = rows.filter((r) => r.isTradable);

    const q = c.req.query("q")?.trim().toLowerCase();
    const tickers = c.req
      .query("tickers")
      ?.split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    const sector = c.req.query("sector");
    const shelf = c.req.query("shelf");
    const all = c.req.query("scope") === "all";

    let chosen: readonly StockRow[];
    if (tickers !== undefined && tickers.length > 0) {
      chosen = listed.filter((r) => tickers.includes(r.ticker));
    } else if (q !== undefined && q.length > 0) {
      // Ticker matches first, exact before prefix, then names; the deepest pool breaks ties.
      const rank = (r: StockRow) => {
        const t = r.ticker.toLowerCase();
        return t === q ? 0 : t.startsWith(q) ? 1 : t.includes(q) ? 2 : 3;
      };
      chosen = listed
        .filter((r) => r.ticker.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
        .sort((a, b) => rank(a) - rank(b) || bestLiquidity(b).comparedTo(bestLiquidity(a)))
        .slice(0, SEARCH_LIMIT);
    } else if (all) {
      chosen = listed;
    } else {
      chosen = listed.filter((r) => bestLiquidity(r).gte(FEATURED_LIQUIDITY_USD));
    }
    if (sector !== undefined) chosen = chosen.filter((r) => r.sector === sector);

    const priced = [...(await price(chosen))];
    if (shelf === "popular") {
      // Holders on chain, not a number we chose. See the ground rules.
      priced.sort(
        (a, b) =>
          b.row.wrappers.reduce((n, w) => n + w.holders, 0) -
          a.row.wrappers.reduce((n, w) => n + w.holders, 0),
      );
    } else if (shelf === "movers") {
      // Size of the move, either direction: a fall is as much news as a rise.
      priced.sort((a, b) => b.changePct24h.abs().comparedTo(a.changePct24h.abs()));
    } else if (q === undefined || q.length === 0) {
      priced.sort((a, b) => a.row.name.localeCompare(b.row.name));
    }

    return c.json({ instruments: priced.map((p) => toInstrument(p, session.status)) });
  });

  app.get("/v1/instruments/:ticker", async (c) => {
    const ticker = c.req.param("ticker").toUpperCase();
    const [rows, session] = await Promise.all([deps.supportedStocks(), deps.sessions.current()]);
    const row = rows.find((r) => r.isTradable && r.ticker === ticker);
    const [found] = row === undefined ? [] : await price([row]);
    if (found === undefined) return c.json(fail("not_found", `We do not list ${ticker}.`), 404);
    // One query, on the one page that shows it. Putting it on the shelf would be
    // a query per row for a number nobody reads there.
    return c.json({
      instrument: toInstrument(found, session.status),
      buyers30d: await deps.buyers30d(ticker),
    });
  });

  return app;
}
