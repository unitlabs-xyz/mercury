import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dismissBanner } from "./move-lines";

vi.mock("../Panels", () => ({ usePanels: () => ({ move: () => undefined }) }));
const { MoveBanner } = await import("./MoveBanner");

/** A browser's storage, for the reminder's dismissal. */
const kept = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => kept.get(k) ?? null,
  setItem: (k: string, v: string) => void kept.set(k, v),
});

const render = (walletId = "w-phantom") =>
  renderToStaticMarkup(createElement(MoveBanner, { walletId, name: "Phantom" }));

afterEach(() => kept.clear());

describe("MoveBanner", () => {
  it("reminds that moving to the Mercury wallet makes trading one tap, with Move funds and Dismiss", () => {
    const html = render();
    expect(html).toContain("Managing funds here means approving each step in Phantom.");
    expect(html).toContain("Move them to your Mercury wallet for one-tap trading.");
    expect(html).toContain("Move funds");
    expect(html).toContain("Dismiss");
  });

  it("stays away for a wallet dismissed in the last 30 days, and only that wallet", () => {
    dismissBanner("w-phantom", Date.now(), localStorage);
    expect(render("w-phantom")).toBe("");
    expect(render("w-solflare")).toContain("Move funds");
  });
});
