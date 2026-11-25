import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./LinkWalletSection", () => ({ default: () => null }));
const { KeptHistory } = await import("./LinkedWallets");

describe("KeptHistory", () => {
  it("lists each wallet unlinked with its history kept, with a way to delete it that needs no relink", () => {
    const html = renderToStaticMarkup(
      createElement(KeptHistory, {
        kept: [
          {
            id: "w1",
            address: "7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs",
            label: "Phantom main",
            unlinkedAt: "2026-11-22T09:00:00.000Z",
          },
          {
            id: "w2",
            address: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
            label: null,
            unlinkedAt: "2026-11-20T09:00:00.000Z",
          },
        ],
        onForget: () => undefined,
      }),
    );
    expect(html).toContain("Kept history");
    expect(html).toContain("Phantom main");
    expect(html).toContain("Unlinked Nov 22, 2026");
    // Named by its short address where it has no name.
    expect(html).toContain("9xQe");
    expect(html.match(/Delete history/g)).toHaveLength(2);
  });
});
