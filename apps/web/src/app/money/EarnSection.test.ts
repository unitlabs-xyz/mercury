import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ reading: false }));
vi.mock("../../api/history-reading", () => ({ useHistoryReading: () => state.reading }));
vi.mock("../Panels", () => ({ usePanels: () => ({ earn: () => undefined }) }));
vi.mock("../../ui/ds", () => ({ InfoTip: () => null }));
vi.mock("../earn/VaultMark", () => ({ VaultMark: () => null, rate: (v: number | null) => `${v}` }));
vi.mock("../../api/earn", () => ({
  useEarn: () => ({
    data: {
      holdings: [{ address: "v", name: "Steakhouse USDC", balanceUsd: 1000, earnedUsd: 0, apy: 0.05 }],
      walletUsd: 0,
    },
  }),
}));
const { EarnSection } = await import("./EarnSection");
// Its buttons are links, which need a router to sit in.
const render = () => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(EarnSection)));

beforeEach(() => {
  state.reading = false;
});

describe("EarnSection, for a linked wallet", () => {
  it("says it is reading the wallet's past, rather than that it has just started, while it is", () => {
    state.reading = true;
    const html = render();
    expect(html).toContain("Reading history…");
    expect(html).not.toContain("Just started");
  });

  it("reads as before once the past is read", () => {
    const html = render();
    expect(html).toContain("Just started");
    expect(html).not.toContain("Reading history…");
  });
});
