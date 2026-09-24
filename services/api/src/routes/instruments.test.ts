import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { D } from "@mercury/core";
import type { TokenPrice } from "@mercury/market";
import { Instrument } from "@mercury/types";
import { instrumentRoutes, type CatalogueRow, type InstrumentDeps } from "./instruments.js";

const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const SPYX = "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W";

const catalogue: readonly CatalogueRow[] = [
  {
    ticker: "NVDA",
    name: "Nvidia",
    sector: "Semiconductors",
    description: "Designs the graphics and AI accelerators most large models are trained on.",
    logoUrl: "https://example.test/nvdax.png",
    isTradable: true,
    wrappers: [
      { mint: NVDAX, symbol: "NVDAx", issuer: "backed", decimals: 8, multiplier: "1.5", isRoutable: true, holders: 108_418 },
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
      { mint: SPYX, symbol: "SPYx", issuer: "backed", decimals: 8, multiplier: "1", isRoutable: true, holders: 250_000 },
    ],
  },
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

const deps = (over: Partial<InstrumentDeps> = {}): InstrumentDeps => ({
  catalogue: async () => catalogue,
  buyers30d: async () => 0,
  prices: { pricesFor: async (mints) => new Map(mints.map((m) => [m, price(m)])) },
  sessions: {
    current: async () => ({ status: "open", isOpen: true, nextOpenAt: null, nextCloseAt: null, isWeekend: false }),
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
        current: async () => ({ status: "closed", isOpen: false, nextOpenAt: null, nextCloseAt: null, isWeekend: true }),
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
    const d = deps({ catalogue: async () => catalogue.map((c) => ({ ...c, isTradable: c.ticker !== "SPY" })) });
    const shelf = await shelfOf(await app(d).request("/v1/instruments"));
    expect(shelf.map((i) => i.ticker)).toEqual(["NVDA"]);
  });

  it("omits an instrument with no live price rather than showing it at zero", async () => {
    const d = deps({ prices: { pricesFor: async () => new Map() } });
    const shelf = await shelfOf(await app(d).request("/v1/instruments"));
    expect(shelf).toEqual([]);
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
