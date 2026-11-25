import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OutsideBasket } from "../../api/move";

const state = vi.hoisted(() => ({ baskets: [] as unknown[] }));
vi.mock("../../api/move", () => ({ useOutsideBaskets: () => ({ data: state.baskets }) }));
vi.mock("../Panels", () => ({ usePanels: () => ({ move: () => undefined }) }));
vi.mock("../../api/acting-wallet", () => ({
  useActingWallet: () => ({ choose: () => undefined, wallets: [] }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => () => undefined }));
const { GLIDER_APP_URL, OutsideBaskets, holdingsLine } = await import("./OutsideBaskets");

const basket = (over: Partial<OutsideBasket> = {}): OutsideBasket => ({
  address: "Basket1",
  valueUsd: "470",
  holdings: [
    { mint: "t", symbol: "TSLAx", ticker: "TSLA", amount: "1.5", valueUsd: "450" },
    { mint: "u", symbol: "USDC", ticker: null, amount: "20", valueUsd: "20" },
  ],
  arrived: null,
  similar: { slug: "tech-leaders", name: "Tech Leaders", overlap: "0.6" },
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

  it("shows what the basket holds, and asks only for the withdrawal to the wallet", () => {
    state.baskets = [basket()];
    const html = render();
    expect(html).toContain("A basket on Glider");
    expect(html).toContain("$470.00");
    expect(html).toContain("1.5 TSLAx · 20 USDC");
    expect(html).toContain("Mercury can see it but can&#x27;t withdraw it for you");
    expect(html).toContain(
      "Open the app you put this basket in (Glider, or another app built on it) and withdraw it to Phantom.",
    );
    expect(html).toContain("When it lands in Phantom, this card offers the next step");
    expect(html).toContain(`href="${GLIDER_APP_URL}"`);
    // No option it can't vouch for.
    expect(html).not.toContain("radiogroup");
    expect(html).not.toContain("Sell, reinvest here");
  });

  it("moves on by itself once shares arrive in the wallet: move them here", () => {
    state.baskets = [
      basket({
        holdings: [],
        valueUsd: "0",
        arrived: {
          at: "2026-11-24T10:00:00.000Z",
          holdings: [{ mint: "t", symbol: "TSLAx", ticker: "TSLA", amount: "1.5", valueUsd: "450" }],
        },
      }),
    ];
    const html = render();
    expect(html).toContain("$450.00 arrived in Phantom from this basket: 1.5 TSLAx.");
    expect(html).toContain("Move shares to Mercury");
    expect(html).not.toContain("Open Glider");
  });

  it("once USDC arrives: move it here, then invest it in the closest Mercury basket", () => {
    state.baskets = [
      basket({
        holdings: [],
        valueUsd: "0",
        arrived: {
          at: "2026-11-24T10:00:00.000Z",
          holdings: [{ mint: "u", symbol: "USDC", ticker: null, amount: "1186.4", valueUsd: "1186.4" }],
        },
      }),
    ];
    const html = render();
    expect(html).toContain("$1,186.40 arrived in Phantom from this basket: 1,186.4 USDC.");
    expect(html).toContain("Move USDC to Mercury");
    expect(html).toContain("Invest in Tech Leaders");
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
