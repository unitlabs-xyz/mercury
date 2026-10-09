import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { Portfolio } from "@mercury/types";
import type { CreditMarket, Instrument } from "../../market/hooks";
import { USDC_ASSET_ID } from "@mercury/view";
import { Allocation } from "./Summary";
import { useModel, type Model } from "./model";

it("keeps basket value in net worth without folding its assets into direct stock rows or wallet cash", () => {
  const portfolio: Portfolio = {
    totalValueUsd: "35",
    cashUsd: "5",
    basketUsd: "20",
    debtUsd: "0",
    debtIsStale: false,
    changeUsd: "2",
    changePct: "10",
    holdings: [
      {
        ticker: "NVDA",
        name: "Nvidia",
        shares: "0.05",
        valueUsd: "10",
        costBasisUsd: "8",
        unrealisedPnlUsd: "2",
        sharesWithBasis: "0.05",
        changePct24h: "1",
        wrapperCount: 1,
      },
    ],
    baskets: [
      {
        portfolioId: "portfolio",
        slug: "basket",
        name: "Basket",
        valueUsd: "20",
        inTransitUsd: "0",
        changePct24h: "0",
        fetchedAt: "2026-10-07T00:00:00.000Z",
        holdings: [
          { assetId: "nvda", symbol: "NVDAon", ticker: "NVDA", balance: "1", valueUsd: "6" },
          { assetId: "tsla", symbol: "TSLAon", ticker: "TSLA", balance: "1", valueUsd: "8" },
          { assetId: USDC_ASSET_ID, symbol: "USDC", ticker: null, balance: "6", valueUsd: "6" },
        ],
      },
    ],
  };
  const credit: CreditMarket = {
    collateral: [
      { ticker: "NVDA", symbol: "NVDAon", maxLtv: 0.5 },
      { ticker: "TSLA", symbol: "TSLAon", maxLtv: 0.5 },
    ],
    borrowApy: null,
    supplyApy: null,
  };
  const tesla: Instrument = {
    ticker: "TSLA",
    name: "Tesla",
    sector: "Consumer",
    about: "",
    wrappers: [],
    featured: false,
    maxOrderUsd: 0,
    quote: { fair: 200, todayPct: 3 },
  };
  let model: Model | undefined;
  const Probe = () => {
    model = useModel(portfolio, [tesla], credit, undefined);
    return null;
  };
  renderToStaticMarkup(createElement(Probe));

  expect(model?.total).toBe(35);
  expect(model?.stocks).toBe(30);
  expect(model?.assets).toBe(35);
  expect(model?.cash).toBe(5);
  expect(model?.basketUsd).toBe(20);
  expect(model?.available).toBe(0);
  expect(model?.returnUsd).toBe(2);
  expect(model?.stockMove24hUsd).toBe(2);
  expect(model?.stockMove24hPct).toBe(10);
  expect(model?.rows.map((row) => [row.ticker, row.value, row.borrowable, row.returnPct])).toEqual([
    ["NVDA", 10, 0, 25],
  ]);
  const allocation = renderToStaticMarkup(createElement(Allocation, { m: model }));
  expect(allocation).toContain("Baskets 57%");
  expect(allocation).toContain("Cash 14%");
  expect(allocation).not.toContain("Basket cash");

  let withoutQuote: Model | undefined;
  const WithoutQuote = () => {
    withoutQuote = useModel(portfolio, undefined, credit, undefined);
    return null;
  };
  renderToStaticMarkup(createElement(WithoutQuote));
  expect(withoutQuote?.stockMove24hUsd).toBe(2);
});

/** `useModel` is a hook, so it is read through a component that renders nothing. */
const modelOf = (portfolio: Portfolio): Model => {
  let model: Model | undefined;
  const Probe = () => {
    model = useModel(portfolio, [], undefined, undefined);
    return null;
  };
  renderToStaticMarkup(createElement(Probe));
  return model!;
};

/** One holding, with the stacked figures the server now sends. */
const stacked = (over: Partial<Portfolio["holdings"][number]> = {}): Portfolio => ({
  totalValueUsd: "400",
  cashUsd: "0",
  basketUsd: "0",
  debtUsd: "0",
  debtIsStale: false,
  changeUsd: "0",
  changePct: "0",
  holdings: [
    {
      ticker: "NVDA",
      name: "Nvidia",
      shares: "2",
      valueUsd: "400",
      costBasisUsd: "300",
      unrealisedPnlUsd: "99.54",
      marketPnlUsd: "104",
      tradingCostUsd: "4.46",
      sharesWithBasis: "2",
      changePct24h: "1",
      wrapperCount: 1,
      ...over,
    },
  ],
  baskets: [],
});

it("keeps the stock's move and the trade's cost apart, and summing to the dollars", () => {
  const m = modelOf(stacked());
  expect(m.marketReturnUsd).toBeCloseTo(104, 6);
  expect(m.tradingCostUsd).toBeCloseTo(4.46, 6);
  expect(m.returnUsd).toBeCloseTo(99.54, 6);
  expect(m.marketReturnUsd - m.tradingCostUsd).toBeCloseTo(m.returnUsd, 6);
});

it("measures the move against what the shares were quoted at, not against what was paid", () => {
  const m = modelOf(stacked());
  // $104 on a reference basis of $295.54, not on the $300 paid: a percentage
  // of the price paid would fold the premium back into the figure it came out of.
  expect(m.marketReturnPct).toBeCloseTo((104 / 295.54) * 100, 6);
  expect(m.rows[0]!.marketReturnPct).toBeCloseTo((104 / 295.54) * 100, 6);
});

it("reads a whole return as market move when the server does not send the split", () => {
  // An older server, or a client deployed ahead of one. Nothing is charged for
  // trading, which is exactly what the single figure used to claim.
  const older = stacked();
  const holdings = older.holdings.map((h) => {
    const rest: Record<string, unknown> = { ...h };
    delete rest["marketPnlUsd"];
    delete rest["tradingCostUsd"];
    return rest as Portfolio["holdings"][number];
  });
  const m = modelOf({ ...older, holdings });
  expect(m.marketReturnUsd).toBeCloseTo(99.54, 6);
  expect(m.tradingCostUsd).toBe(0);
});

it("reports no market move on a stock sitting exactly where it was bought", () => {
  // The symptom: this used to show -$0.92 and call it a loss.
  const flat = stacked({
    valueUsd: "400",
    costBasisUsd: "400.46",
    unrealisedPnlUsd: "-0.92",
    marketPnlUsd: "0",
    tradingCostUsd: "0.92",
  });
  const m = modelOf(flat);
  expect(m.marketReturnUsd).toBe(0);
  expect(m.returnUsd).toBeCloseTo(-0.92, 6);
});
