import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import type { Portfolio } from "@mercury/types";
import { Position } from "./Panels";

it("shows basket value in a stock position without assigning it wallet shares or cost basis", () => {
  const wallet: Portfolio["holdings"][number] = {
    ticker: "NVDA",
    name: "Nvidia",
    shares: "1",
    pledgedShares: "0.25",
    valueUsd: "100",
    costBasisUsd: "80",
    unrealisedPnlUsd: "20",
    changePct24h: "2",
    wrapperCount: 1,
  };
  const combined = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(Position, { h: wallet, basketValue: 50, stockTodayPct: 3 }),
    ),
  );
  expect(combined).toContain("$150.00");
  expect(combined).toContain("$100.00");
  expect(combined).toContain("$50.00");
  expect(combined).toContain("1.0000 wallet &amp; pledged shares");
  expect(combined).toContain("2.00%");

  const basketOnly = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(Position, { h: undefined, basketValue: 50, stockTodayPct: 3 }),
    ),
  );
  expect(basketOnly).toContain("$50.00");
  expect(basketOnly).toContain("Held in your Glider basket account");
  expect(basketOnly).toContain("3.00%");
  expect(basketOnly).not.toContain("wallet &amp; pledged shares");
});
