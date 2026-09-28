import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { D } from "@mercury/core";
import type { TokenPrice, HistorySource } from "@mercury/market";
import { Instrument } from "@mercury/types";
import { instrumentRoutes, type StockRow, type InstrumentDeps } from "./instruments.js";

const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const SPYX = "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W";

const supportedStocks: readonly StockRow[] = [
  {
    ticker: "NVDA",
    name: "Nvidia",
    sector: "Semiconductors",
    description: "Designs the graphics and AI accelerators most large models are trained on.",
    logoUrl: "https://example.test/nvdax.png",
    isTradable: true,
    wrappers: [
      {
        mint: NVDAX,
        symbol: "NVDAx",
        issuer: "backed",
        decimals: 8,
        multiplier: "1.5",
        isRoutable: true,
        holders: 108_418,
        icon: null,
        liquidityUsd: "2800000",
        volume24hUsd: "400000",
        netBuyers24h: 13,
        traders24h: 190,
        hasMarket: true,
      },
    ],
  },
  {
    ticker: "SPY",
    name: "S&P 500",
    sector: "Index funds",
    description: "The five hundred largest listed companies in the United States.",
    logoUrl: null,
    isTradable: true,
    wrappers: [
      {
        mint: SPYX,
        symbol: "SPYx",
        issuer: "backed",
        decimals: 8,
        multiplier: "1",
        isRoutable: true,
        holders: 250_000,
        icon: null,
        liquidityUsd: "6600000",
        volume24hUsd: "900000",
        netBuyers24h: 40,
        traders24h: 500,
        hasMarket: true,
      },
    ],
  },
];

const THINX = "ThinMintxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const DEADX = "DeadMintxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const thin = (
  ticker: string,
  name: string,
  mint: string,
  liquidityUsd: string,
  hasMarket: boolean,
): StockRow => ({
  ticker,
  name,
  sector: "Other",
  description: "",
  logoUrl: null,
  isTradable: true,
  wrappers: [
    {
      mint,
      symbol: `${ticker}x`,
      issuer: "backed",
      decimals: 8,
      multiplier: "1",
      isRoutable: false,
      holders: 12,
      icon: null,
      liquidityUsd,
      volume24hUsd: "0",
      netBuyers24h: 0,
      traders24h: 0,
      hasMarket,
    },
  ],
});
const everything: readonly StockRow[] = [
  ...supportedStocks,
  thin("ASML", "ASML Holding", THINX, "2000", true),
  thin("DEAD", "Deadco", DEADX, "0", false),
];

const price = (mint: string, over: Partial<TokenPrice> = {}): TokenPrice => ({
  mint,
  usdPricePerToken: D(300),
  pricePerShare: D(200),
  changePct24h: D(1),
  liquidityUsd: D(1_000_000),
  multiplier: D("1.5"),
  observedAt: new Date("2026-09-24T12:00:00Z"),
  ...over,
});

/** A provider with nothing, so the default deps exercise the no-history path. */
const noHistory: HistorySource = { seriesFor: async () => null };

const deps = (over: Partial<InstrumentDeps> = {}): InstrumentDeps => ({
  supportedStocks: async () => supportedStocks,
  buyers30d: async () => 0,
  history: noHistory,
  prices: { pricesFor: async (mints) => new Map(mints.map((m) => [m, price(m)])) },
  sessions: {
    current: async () => ({
      status: "open",
      isOpen: true,
      nextOpenAt: null,
      nextCloseAt: null,
      isWeekend: false,
    }),
  },
  ...over,
});

const app = (d: InstrumentDeps) => {
  const a = new Hono();
  a.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress: "WaLLeT" });
    await next();
  });
  a.route("/", instrumentRoutes(d));
  return a;
};

/** Through the wire schema, so a drifting route fails here rather than in a client. */
const shelfOf = async (res: Response) => {
  const body = (await res.json()) as { instruments: unknown[] };
  return body.instruments.map((i) => Instrument.parse(i));
};
const detailOf = async (res: Response) => {
  const body = (await res.json()) as { instrument: unknown; buyers30d: number };
  return { instrument: Instrument.parse(body.instrument), buyers30d: body.buyers30d };
};
const errorOf = async (res: Response) => (await res.json()) as { error: { code: string } };

describe("GET /v1/instruments", () => {
  it("prices each instrument per share, not per token", async () => {
    const shelf = await shelfOf(await app(deps()).request("/v1/instruments"));
    const nvda = shelf.find((i) => i.ticker === "NVDA");
    // The token costs $300 and is 1.5 shares. A share costs $200.
    expect(nvda!.pricePerShare).toBe("200");
  });

  it("carries the live session, so a closed market is visible before an order is tried", async () => {
    const d = deps({
      sessions: {
        current: async () => ({
          status: "closed",
          isOpen: false,
          nextOpenAt: null,
          nextCloseAt: null,
          isWeekend: true,
        }),
      },
    });
    const shelf = await shelfOf(await app(d).request("/v1/instruments"));
    expect(shelf[0]!.status).toBe("closed");
  });

  it("filters by a search term against both the ticker and the name", async () => {
    const byTicker = await shelfOf(await app(deps()).request("/v1/instruments?q=nvda"));
    expect(byTicker.map((i) => i.ticker)).toEqual(["NVDA"]);
    const byName = await shelfOf(await app(deps()).request("/v1/instruments?q=nvidia"));
    expect(byName.map((i) => i.ticker)).toEqual(["NVDA"]);
  });

  it("filters by sector", async () => {
    const shelf = await shelfOf(await app(deps()).request("/v1/instruments?sector=Index%20funds"));
    expect(shelf.map((i) => i.ticker)).toEqual(["SPY"]);
  });

  it("orders the popular shelf by how many people actually hold it", async () => {
    const shelf = await shelfOf(await app(deps()).request("/v1/instruments?shelf=popular"));
    expect(shelf.map((i) => i.ticker)).toEqual(["SPY", "NVDA"]);
  });

  it("orders the movers shelf by the size of the move, in either direction", async () => {
    const d = deps({
      prices: {
        pricesFor: async (mints) =>
          new Map(mints.map((m) => [m, price(m, { changePct24h: m === SPYX ? D(-9) : D(2) })])),
      },
    });
    const shelf = await shelfOf(await app(d).request("/v1/instruments?shelf=movers"));
    expect(shelf.map((i) => i.ticker)).toEqual(["SPY", "NVDA"]);
  });

  it("leaves out an instrument nothing can fill", async () => {
    const d = deps({
      supportedStocks: async () => supportedStocks.map((c) => ({ ...c, isTradable: c.ticker !== "SPY" })),
    });
    const shelf = await shelfOf(await app(d).request("/v1/instruments"));
    expect(shelf.map((i) => i.ticker)).toEqual(["NVDA"]);
  });

  it("omits an instrument with no live price rather than showing it at zero", async () => {
    const d = deps({ prices: { pricesFor: async () => new Map() } });
    const shelf = await shelfOf(await app(d).request("/v1/instruments"));
    expect(shelf).toEqual([]);
  });
});

describe("GET /v1/instruments, featured and search", () => {
  // The board prices by liquidity as the registry reported it, so the thin row stays thin.
  const wide = (over: Partial<InstrumentDeps> = {}) =>
    deps({
      supportedStocks: async () => everything,
      prices: {
        pricesFor: async (mints) =>
          new Map(mints.map((m) => [m, price(m, { liquidityUsd: m === THINX ? D(2_000) : D(1_000_000) })])),
      },
      ...over,
    });

  it("shows only the featured, deep instruments with no parameters", async () => {
    const shelf = await shelfOf(await app(wide()).request("/v1/instruments"));
    expect(shelf.map((i) => i.ticker)).toEqual(["NVDA", "SPY"]);
    expect(shelf.every((i) => i.featured)).toBe(true);
  });

  it("finds a thin instrument by search, marked unfeatured with a small order ceiling", async () => {
    const shelf = await shelfOf(await app(wide()).request("/v1/instruments?q=asml"));
    expect(shelf.map((i) => i.ticker)).toEqual(["ASML"]);
    expect(shelf[0]).toMatchObject({ featured: false, liquidityUsd: "2000", maxOrderUsd: "30" });
  });

  it("returns everything with a market for scope=all, and never an unpriced one", async () => {
    const shelf = await shelfOf(await app(wide()).request("/v1/instruments?scope=all"));
    expect(shelf.map((i) => i.ticker).sort()).toEqual(["ASML", "NVDA", "SPY"]);
  });

  it("does not ask price/v3 about a token Jupiter has no market for", async () => {
    const asked: string[] = [];
    const d = wide({
      prices: {
        pricesFor: async (mints) => {
          asked.push(...mints);
          return new Map(mints.map((m) => [m, price(m)]));
        },
      },
    });
    await app(d).request("/v1/instruments?scope=all");
    expect(asked).not.toContain(DEADX);
  });

  it("fetches exactly the tickers asked for, featured or not", async () => {
    const shelf = await shelfOf(await app(wide()).request("/v1/instruments?tickers=asml,spy"));
    expect(shelf.map((i) => i.ticker).sort()).toEqual(["ASML", "SPY"]);
  });

  it("ranks an exact ticker match above a name that merely contains the term", async () => {
    const rows = [
      ...everything,
      { ...thin("NVDL", "Leveraged Nvidia", "NvdlMintxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "5000", true) },
    ];
    const shelf = await shelfOf(
      await app(wide({ supportedStocks: async () => rows })).request("/v1/instruments?q=nvd"),
    );
    expect(shelf[0]!.ticker).toBe("NVDA");
  });

  it("serves repeat requests from the price cache for fifteen seconds", async () => {
    let calls = 0;
    let clock = 0;
    const d = wide({
      now: () => clock,
      prices: {
        pricesFor: async (mints) => {
          calls += 1;
          return new Map(mints.map((m) => [m, price(m)]));
        },
      },
    });
    const a = app(d);
    await a.request("/v1/instruments");
    await a.request("/v1/instruments");
    expect(calls).toBe(1);
    clock = 15_001;
    await a.request("/v1/instruments");
    expect(calls).toBe(2);
  });

  it("opens a thin instrument's own page", async () => {
    const { instrument } = await detailOf(await app(wide()).request("/v1/instruments/ASML"));
    expect(instrument.featured).toBe(false);
  });
});

describe("GET /v1/instruments/:ticker", () => {
  it("returns the instrument with every wrapper and its multiplier", async () => {
    const { instrument } = await detailOf(await app(deps()).request("/v1/instruments/nvda"));
    expect(instrument).toMatchObject({ ticker: "NVDA", name: "Nvidia", sector: "Semiconductors" });
    expect(instrument.wrappers[0]).toMatchObject({ symbol: "NVDAx", issuer: "backed", isRoutable: true });
    expect(instrument.wrappers[0]!.multiplier).toBe("1.5");
  });

  it("includes the sentence that says what the company does", async () => {
    const res = await app(deps()).request("/v1/instruments/NVDA");
    const body = (await res.json()) as { instrument: { description: string } };
    expect(body.instrument.description).toContain("accelerators");
  });

  it("counts how many people here actually bought it", async () => {
    // The figure `placeholder.ts` invented. It is our own order table now, so it
    // is honest and it is zero until subsystem 3 starts writing fills.
    const d = deps({ buyers30d: async (ticker) => (ticker === "NVDA" ? 37 : 0) });
    const { buyers30d } = await detailOf(await app(d).request("/v1/instruments/NVDA"));
    expect(buyers30d).toBe(37);
  });

  it("does not put the buyer count on the shelf, which would be one query per row", async () => {
    const res = await app(deps()).request("/v1/instruments");
    const body = (await res.json()) as { instruments: { buyers30d?: number }[] };
    expect(body.instruments[0]!.buyers30d).toBeUndefined();
  });

  it("says 404 for a ticker we do not list", async () => {
    const res = await app(deps()).request("/v1/instruments/TSLA");
    expect(res.status).toBe(404);
    expect((await errorOf(res)).error.code).toBe("not_found");
  });
});

/** A provider that serves one shape for every ticker it is asked about. */
const historyOf = (pts: readonly (readonly [number, number])[]): HistorySource => ({
  seriesFor: async () =>
    pts.length < 2
      ? null
      : {
          points: pts.map(([t, v]) => ({ at: new Date(t * 1000), price: D(v) })),
          changePct: D(pts[pts.length - 1]![1])
            .div(D(pts[0]![1]))
            .sub(1)
            .mul(100),
        },
});

/** Three points that move 100 -> 125, i.e. +25% across whatever span is asked. */
const series = [
  [1_000, 100],
  [2_000, 110],
  [3_000, 125],
] as const;

describe("GET /v1/instruments/:ticker/history", () => {
  it("anchors the last point to the live share price, so chart and headline agree", async () => {
    const res = await app(deps({ history: historyOf(series) })).request(
      "/v1/instruments/NVDA/history?span=1M",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { span: string; changePct: string; points: [number, string][] };

    expect(body.span).toBe("1M");
    expect(body.points.length).toBe(3);
    // The fixture prices one share at 200; the series ends at 125.
    expect(Number(body.points[2]![1])).toBeCloseTo(200, 6);
    // Every point scales by the same factor, so the shape is untouched.
    expect(Number(body.points[0]![1])).toBeCloseTo(160, 6);
  });

  it("reports the move from the unanchored series, because re-levelling is not a rewrite", async () => {
    const res = await app(deps({ history: historyOf(series) })).request(
      "/v1/instruments/NVDA/history?span=1M",
    );
    const { changePct } = (await res.json()) as { changePct: string };
    expect(Number(changePct)).toBeCloseTo(25, 6);
  });

  it("carries each point as [unix seconds, price]", async () => {
    const res = await app(deps({ history: historyOf(series) })).request(
      "/v1/instruments/NVDA/history?span=1M",
    );
    const { points } = (await res.json()) as { points: [number, string][] };
    expect(points[0]![0]).toBe(1_000);
    expect(typeof points[0]![1]).toBe("string");
  });

  it("defaults to a month when no span is asked for", async () => {
    const res = await app(deps({ history: historyOf(series) })).request("/v1/instruments/NVDA/history");
    expect(((await res.json()) as { span: string }).span).toBe("1M");
  });

  it("refuses a span it does not serve", async () => {
    const res = await app(deps({ history: historyOf(series) })).request(
      "/v1/instruments/NVDA/history?span=10Y",
    );
    expect(res.status).toBe(400);
  });

  it("is a missing chart, not an empty one, when the provider has no history", async () => {
    const res = await app(deps()).request("/v1/instruments/NVDA/history?span=1M");
    expect(res.status).toBe(404);
  });

  it("is not found for a ticker we do not list", async () => {
    const res = await app(deps({ history: historyOf(series) })).request(
      "/v1/instruments/NOPE/history?span=1M",
    );
    expect(res.status).toBe(404);
  });
});

describe("returns on the detail page", () => {
  it("are null throughout when the provider has no history, never zero", async () => {
    const res = await app(deps()).request("/v1/instruments/NVDA");
    const { returns } = (await res.json()) as { returns: Record<string, string | null> };
    expect(returns).toEqual({ m1: null, m6: null, y1: null, cagr5y: null });
  });

  it("carry the move for each span the provider answers", async () => {
    const res = await app(deps({ history: historyOf(series) })).request("/v1/instruments/NVDA");
    const { returns } = (await res.json()) as { returns: Record<string, string | null> };
    expect(Number(returns["m1"])).toBeCloseTo(25, 6);
    expect(Number(returns["y1"])).toBeCloseTo(25, 6);
    // Three points seconds apart is far too short a span to annualise.
    expect(returns["cagr5y"]).toBeNull();
  });
});
