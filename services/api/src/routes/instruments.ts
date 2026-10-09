import { Hono } from "hono";
import { D, DEFAULT_POLICY, toWire, ZERO, type Decimal, type Issuer } from "@mercury/core";
import {
  anchoredTo,
  returnsFor,
  SPANS,
  type HistorySource,
  type PriceBoard,
  type SessionSource,
  type Span,
} from "@mercury/market";

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
  /** Price history for the underlying share. Detail page and its chart only. */
  readonly history: HistorySource;
}

const fail = (code: string, message: string) => ({ error: { code, message } });

/** A figure the provider had nothing for stays null on the wire, never zero. */
const toWireOrNull = (v: Decimal | null): string | null =>
  v === null ? null : toWire(v.toDecimalPlaces(PCT_DP));

/** The asked-for span, or null if it is not one we serve. Defaults to a month. */
const spanOf = (asked: string | undefined): Span | null => SPANS.find((s) => s === (asked ?? "1M")) ?? null;

/** A shelf draws many sparklines at once; this bounds the fan-out upstream. */
const MAX_TICKERS = 60;

/**
 * History goes on the wire rounded, unlike every other money figure here.
 *
 * These are drawn, not settled: a chart resolves to a pixel and a return is
 * shown to one decimal. Full Decimal precision put a 39-digit price on every
 * one of a year's 251 points and made that response 14 KB, five times what it
 * needs to be for precision no screen can render. Anchoring has already
 * re-levelled these anyway, so they are derived figures rather than a record
 * of anything.
 */
const CHART_DP = 6;
const PCT_DP = 4;

/**
 * The featured shelf: instruments where some wrapper's pool is deep enough that
 * a $1,000 order stays inside the impact cap. Everything else is found by search.
 */
export const FEATURED_LIQUIDITY_USD = D(70_000);

/** Search answers a page, not the whole list. */
const SEARCH_LIMIT = 50;

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

  /**
   * Price the given rows. No price, no row: showing an instrument at zero would
   * be a price.
   *
   * This used to keep fifteen seconds of prices of its own, stamped with a
   * clock read before its own fetch — so an entry was born as old as the
   * request that filled it. `CachedPriceBoard` holds them for everybody now,
   * serves an entry past its window while replacing it behind the reader, and
   * collects the misses of callers who arrive together into one request. A
   * second memory in front of that would only have made prices older.
   */
  const price = async (rows: readonly StockRow[]): Promise<readonly Priced[]> => {
    const board = await deps.prices.pricesFor(
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

  /**
   * Sparklines for a shelf: one span across many tickers, in one round trip.
   *
   * Registered before `/v1/instruments/:ticker/history` deliberately — Hono
   * matches in registration order, and after it this path would bind `:ticker`
   * to the literal "history" and answer 404 for every request.
   *
   * A ticker the provider has no history for comes back null rather than being
   * omitted, so a caller can tell "no chart for this one" from "not asked for".
   */
  app.get("/v1/instruments/history", async (c) => {
    const span = spanOf(c.req.query("span"));
    if (span === null) {
      return c.json(fail("validation_failed", `span must be one of ${SPANS.join(", ")}.`), 400);
    }

    const asked = (c.req.query("tickers") ?? "")
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0);
    const tickers = [...new Set(asked)].slice(0, MAX_TICKERS);
    if (tickers.length === 0) return c.json({ span, series: {} });

    const rows = await deps.supportedStocks();
    const priced = await price(rows.filter((r) => r.isTradable && tickers.includes(r.ticker)));
    const byTicker = new Map(priced.map((p) => [p.row.ticker, p]));

    // In parallel: these are independent reads and the page waits on the
    // slowest, not the sum. Every span is cached by the adapter, so a shelf
    // reloaded within the ttl costs nothing upstream at all.
    const series = await Promise.all(
      tickers.map(async (ticker) => {
        const p = byTicker.get(ticker);
        if (p === undefined) return [ticker, null] as const;
        const s = await deps.history.seriesFor(ticker, span);
        if (s === null) return [ticker, null] as const;
        const anchored = anchoredTo(s, p.pricePerShare);
        return [
          ticker,
          {
            changePct: toWire(anchored.changePct.toDecimalPlaces(PCT_DP)),
            points: anchored.points.map((pt) => [
              Math.floor(pt.at.getTime() / 1000),
              toWire(pt.price.toDecimalPlaces(CHART_DP)),
            ]),
          },
        ] as const;
      }),
    );

    return c.json({ span, series: Object.fromEntries(series) });
  });

  app.get("/v1/instruments/:ticker", async (c) => {
    const ticker = c.req.param("ticker").toUpperCase();
    const [rows, session] = await Promise.all([deps.supportedStocks(), deps.sessions.current()]);
    const row = rows.find((r) => r.isTradable && r.ticker === ticker);
    const [found] = row === undefined ? [] : await price([row]);
    if (found === undefined) return c.json(fail("not_found", `We do not list ${ticker}.`), 404);
    // One query, on the one page that shows it. Putting it on the shelf would be
    // a query per row for a number nobody reads there.
    // Both are the detail page's own, and neither belongs on the shelf: one is
    // a query per row, the other four upstream calls per row.
    const [buyers30d, returns] = await Promise.all([
      deps.buyers30d(ticker),
      returnsFor(deps.history, ticker),
    ]);

    return c.json({
      instrument: toInstrument(found, session.status),
      buyers30d,
      // Null throughout when the provider has no history. The screen draws a
      // blank row; it does not print a zero, which would read as "went nowhere".
      returns: {
        m1: toWireOrNull(returns.m1),
        m6: toWireOrNull(returns.m6),
        y1: toWireOrNull(returns.y1),
        cagr5y: toWireOrNull(returns.cagr5y),
      },
    });
  });

  /**
   * One span of a ticker's price history, for the chart.
   *
   * The series describes the underlying share and the screen prints what the
   * wrapper trades at, so it is anchored to the live price before it leaves
   * here — otherwise the line ends somewhere other than the number above it,
   * by the basis between the two (-0.78% on NVDAx when that was measured).
   *
   * 404 rather than an empty series when the provider has nothing: a chart that
   * cannot be drawn is a missing chart, and the screen says so instead of
   * drawing a flat line that looks like a price that never moved.
   */
  app.get("/v1/instruments/:ticker/history", async (c) => {
    const ticker = c.req.param("ticker").toUpperCase();
    const span = spanOf(c.req.query("span"));
    if (span === null) {
      return c.json(fail("validation_failed", `span must be one of ${SPANS.join(", ")}.`), 400);
    }

    const rows = await deps.supportedStocks();
    const row = rows.find((r) => r.isTradable && r.ticker === ticker);
    const [found] = row === undefined ? [] : await price([row]);
    if (found === undefined) return c.json(fail("not_found", `We do not list ${ticker}.`), 404);

    const series = await deps.history.seriesFor(ticker, span);
    if (series === null) {
      return c.json(fail("not_found", `No price history for ${ticker}.`), 404);
    }

    const anchored = anchoredTo(series, found.pricePerShare);
    return c.json({
      span,
      // The move over the span, which anchoring does not touch.
      changePct: toWire(anchored.changePct.toDecimalPlaces(PCT_DP)),
      // [unix seconds, price] per point: a year is 251 of them, and the object
      // form would triple the bytes for names the client already knows.
      points: anchored.points.map((pt) => [
        Math.floor(pt.at.getTime() / 1000),
        toWire(pt.price.toDecimalPlaces(CHART_DP)),
      ]),
    });
  });

  return app;
}
