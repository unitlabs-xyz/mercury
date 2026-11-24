import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* The chosen wallet and the save, stood in for: what the panel shows in each state is what is tested. */
const state = vi.hoisted(() => ({
  acting: { kind: "linked" } as { kind: "mercury" | "linked" | "all" },
  saved: false,
}));
vi.mock("../../api/acting-wallet", () => ({ useActingWallet: () => ({ acting: state.acting }) }));
vi.mock("../../api/cost", () => ({
  useSetCost: () => ({
    mutate: () => undefined,
    reset: () => undefined,
    isPending: false,
    isError: false,
    isSuccess: state.saved,
    error: null,
  }),
}));

const { SetCost } = await import("./SetCost");
const render = (line: string | null) =>
  renderToStaticMarkup(createElement(SetCost, { ticker: "TSLA", line }));

describe("SetCost", () => {
  beforeEach(() => {
    state.acting = { kind: "linked" };
    state.saved = false;
  });

  it("says where an estimated cost came from, marked, with Set cost beside it", () => {
    const html = render("Estimated from the price when you linked this wallet");
    expect(html).toContain("~");
    expect(html).toContain("Estimated from the price when you linked this wallet.");
    expect(html).toContain("Set cost");
  });

  it("is not there for a holding whose cost is exact", () => {
    expect(render(null)).toBe("");
  });

  it("asks for one wallet when every wallet is shown, rather than offering to set a cost for all", () => {
    state.acting = { kind: "all" };
    const html = render("Estimated from the share price when it arrived");
    expect(html).toContain("Choose a wallet to set what you paid.");
    expect(html).not.toContain("Set cost");
  });

  it("says the figures are updating once it saved", () => {
    state.saved = true;
    const html = render("Estimated from the share price when it arrived");
    expect(html).toContain("Saved. Updating your figures…");
    expect(html).not.toContain(">Set cost<");
  });
});
