import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OutsideBasket } from "../../api/move";

const state = vi.hoisted(() => ({ baskets: [] as unknown[] }));
vi.mock("../../api/move", () => ({ useOutsideBaskets: () => ({ data: state.baskets }) }));
vi.mock("../Panels", () => ({ usePanels: () => ({ move: () => undefined }) }));
const { GLIDER_APP_URL, OutsideBaskets, holdingsLine } = await import("./OutsideBaskets");

const basket = (over: Partial<OutsideBasket> = {}): OutsideBasket => ({
  address: "Basket1",
  valueUsd: "470",
  holdings: [
    { mint: "t", symbol: "TSLAx", ticker: "TSLA", amount: "1.5", valueUsd: "450" },
    { mint: "u", symbol: "USDC", ticker: null, amount: "20", valueUsd: "20" },
  ],
  ...over,
});
const render = () => renderToStaticMarkup(createElement(OutsideBaskets, { name: "Phantom" }));

beforeEach(() => {
  state.baskets = [];
});

describe("OutsideBaskets", () => {
  it("shows nothing when the wallet runs no basket outside Mercury", () => {
    expect(render()).toBe("");
  });

  it("shows what the basket holds and is worth, and the three steps to bring it in", () => {
    state.baskets = [basket()];
    const html = render();
    expect(html).toContain("A basket on Glider");
    expect(html).toContain("$470.00");
    expect(html).toContain("1.5 TSLAx · 20 USDC");
    expect(html).toContain("Mercury can see it but can&#x27;t move it for you");
    expect(html).toContain("Choose to receive the shares themselves, in Phantom. Nothing is sold.");
    expect(html).toContain(`href="${GLIDER_APP_URL}"`);
    expect(html).toContain("Move shares to Mercury");
  });

  it("adds several baskets up, and names them in the plural", () => {
    state.baskets = [basket(), basket({ address: "Basket2", valueUsd: "30" })];
    const html = render();
    expect(html).toContain("2 baskets on Glider");
    expect(html).toContain("$500.00");
    expect(html).toContain("Mercury can see them but can&#x27;t move them");
  });
});

describe("holdingsLine", () => {
  it("says the three largest holdings, and how many more", () => {
    const many = basket({
      holdings: ["A", "B", "C", "D", "E"].map((s) => ({
        mint: s,
        symbol: s,
        ticker: s,
        amount: "1",
        valueUsd: "1",
      })),
    });
    expect(holdingsLine(many)).toBe("1 A · 1 B · 1 C · 2 more");
    expect(holdingsLine(basket())).toBe("1.5 TSLAx · 20 USDC");
  });
});
