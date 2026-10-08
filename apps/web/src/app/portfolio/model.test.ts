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
