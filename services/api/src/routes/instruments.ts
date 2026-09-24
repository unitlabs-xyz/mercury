import { Hono } from "hono";
import { D, toWire, ZERO, type Decimal, type Issuer } from "@mercury/core";
import type { PriceBoard, SessionSource } from "@mercury/market";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";

export interface CatalogueWrapperRow {
  readonly mint: string;
  readonly symbol: string;
  readonly issuer: Issuer;
  readonly decimals: number;
  readonly multiplier: string;
  readonly isRoutable: boolean;
  readonly holders: number;
}

export interface CatalogueRow {
  readonly ticker: string;
  readonly name: string;
  readonly sector: string | null;
  readonly description: string | null;
  readonly logoUrl: string | null;
  readonly isTradable: boolean;
  readonly wrappers: readonly CatalogueWrapperRow[];
}

export interface InstrumentDeps {
  readonly catalogue: () => Promise<readonly CatalogueRow[]>;
  /** How many Mercury accounts bought this in the last thirty days. Detail page only. */
  readonly buyers30d: (ticker: string) => Promise<number>;
  readonly prices: PriceBoard;
  readonly sessions: SessionSource;
}

const fail = (code: string, message: string) => ({ error: { code, message } });

interface Priced {
  readonly row: CatalogueRow;
  readonly pricePerShare: Decimal;
  readonly changePct24h: Decimal;
  readonly holders: number;
}

export function instrumentRoutes(deps: InstrumentDeps): Hono {
  const app = new Hono();

  /** Everything the shelf and the detail page share: the rows, priced, with the session. */
  const priceAll = async (): Promise<{ priced: readonly Priced[]; status: string }> => {
    const [rows, session] = await Promise.all([deps.catalogue(), deps.sessions.current()]);
    const tradable = rows.filter((r) => r.isTradable);
    const board = await deps.prices.pricesFor(tradable.flatMap((r) => r.wrappers.map((w) => w.mint)));

    const priced: Priced[] = [];
    for (const row of tradable) {
      // Any wrapper prices one share the same way. Backed first, because its
      // pools are the deep ones and its feed is the one that keeps updating.
      const lead = row.wrappers.find((w) => w.issuer === "backed") ?? row.wrappers[0];
      const price = lead === undefined ? undefined : board.get(lead.mint);
      // No price, no row. Showing an instrument at zero would be a price.
      if (price === undefined || price.pricePerShare === null) continue;
      const perShare = price.pricePerShare;

      priced.push({
        row,
        pricePerShare: perShare,
        changePct24h: price.changePct24h ?? ZERO,
        holders: row.wrappers.reduce((n, w) => n + w.holders, 0),
      });
    }
    return { priced, status: session.status };
  };

  const toInstrument = (p: Priced, status: string) => ({
    ticker: p.row.ticker,
    name: p.row.name,
    sector: p.row.sector,
    description: p.row.description,
    logoUrl: p.row.logoUrl,
    pricePerShare: toWire(p.pricePerShare),
    changePct24h: toWire(p.changePct24h),
    status,
    wrappers: p.row.wrappers.map((w) => ({
      mint: w.mint,
      symbol: w.symbol,
      issuer: w.issuer,
      decimals: w.decimals,
      multiplier: toWire(D(w.multiplier)),
      isRoutable: w.isRoutable,
    })),
  });

  app.get("/v1/instruments", async (c) => {
    const { priced, status } = await priceAll();

    const q = c.req.query("q")?.trim().toLowerCase();
    const sector = c.req.query("sector");
    const shelf = c.req.query("shelf");

    let rows = priced;
    if (q !== undefined && q.length > 0) {
      rows = rows.filter((p) => p.row.ticker.toLowerCase().includes(q) || p.row.name.toLowerCase().includes(q));
    }
    if (sector !== undefined) rows = rows.filter((p) => p.row.sector === sector);

    const sorted = [...rows];
    if (shelf === "popular") {
      // Holders on chain, not a number we chose. See the ground rules.
      sorted.sort((a, b) => b.holders - a.holders);
    } else if (shelf === "movers") {
      // Size of the move, either direction: a fall is as much news as a rise.
      sorted.sort((a, b) => b.changePct24h.abs().comparedTo(a.changePct24h.abs()));
    } else {
      sorted.sort((a, b) => a.row.name.localeCompare(b.row.name));
    }

    return c.json({ instruments: sorted.map((p) => toInstrument(p, status)) });
  });

  app.get("/v1/instruments/:ticker", async (c) => {
    const ticker = c.req.param("ticker").toUpperCase();
    const { priced, status } = await priceAll();
    const found = priced.find((p) => p.row.ticker === ticker);
    if (found === undefined) return c.json(fail("not_found", `We do not list ${ticker}.`), 404);
    // One query, on the one page that shows it. Putting it on the shelf would be
    // a query per row for a number nobody reads there.
    return c.json({ instrument: toInstrument(found, status), buyers30d: await deps.buyers30d(ticker) });
  });

  return app;
}
