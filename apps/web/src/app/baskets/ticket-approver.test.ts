import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ManagedBasketPortfolio } from "@mercury/types";

// The sheet opens panels for its Earn link; nothing here opens one.
vi.mock("../Panels", () => ({ usePanels: () => ({ earn: () => undefined }) }));
// The modal itself needs a page; its contents are what is tested.
vi.mock("../../ui/Dialog", () => ({ Dialog: ({ children }: { children: unknown }) => children }));
// Tooltips draw into the page; none is open here.
vi.mock("../../ui/ds", async (actual) => ({ ...(await actual<object>()), InfoTip: () => null }));
const { InvestSheet } = await import("./Ticket");

const step = (approver: string | null) => ({
  walletReady: true,
  busy: false,
  approver,
  onConfirm: () => undefined,
});
const portfolio = {
  portfolioId: "p-1",
  ownerAccountId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:PhantomWa11et",
  smartAccounts: [
    {
      accountId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:Vault",
      depositAccountId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:Deposit",
    },
  ],
} as unknown as ManagedBasketPortfolio;

const render = (approver: string | null, withPortfolio = false) =>
  renderToStaticMarkup(
    createElement(InvestSheet, {
      open: true,
      name: "Magnificent Seven",
      mark: null,
      assetCount: 7,
      amount: "25",
      cash: 100,
      portfolio: withPortfolio ? portfolio : null,
      firstDeposit: true,
      receipt: null,
      enroll: step(approver),
      fund: step(approver),
      onClose: () => undefined,
    }),
  );

describe("a basket's sheets, for the wallet that approves", () => {
  it("asks the linked wallet to set up its own portfolio, in its own pop-up", () => {
    const html = render("Phantom");
    expect(html).toContain("Continue in Phantom");
    expect(html).toContain("You&#x27;ll approve this in Phantom.");
    expect(html).not.toContain("Set up portfolio");
  });

  it("asks the linked wallet to send the USDC, once its portfolio is set up", () => {
    const html = render("Phantom", true);
    expect(html).toContain("Continue in Phantom");
    expect(html).not.toContain("Send $25.00");
  });

  it("reads as it always has for the Mercury wallet", () => {
    expect(render(null)).toContain("Set up portfolio");
    expect(render(null, true)).toContain("Send $25.00");
    expect(render(null)).not.toContain("approve this in");
  });
});
