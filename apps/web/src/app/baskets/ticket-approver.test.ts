import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ManagedBasketPortfolio, ManagedBasketPortfolioSnapshot } from "@mercury/types";

// The sheet opens panels for its Earn link; nothing here opens one.
vi.mock("../Panels", () => ({ usePanels: () => ({ earn: () => undefined }) }));
// The modal itself needs a page; its contents are what is tested.
vi.mock("../../ui/Dialog", () => ({ Dialog: ({ children }: { children: unknown }) => children }));
// Tooltips draw into the page; none is open here.
vi.mock("../../ui/ds", async (actual) => ({ ...(await actual<object>()), InfoTip: () => null }));
const { ExitSheet, InvestSheet } = await import("./Ticket");

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

describe("moving a linked wallet's basket into the Mercury wallet", () => {
  const SOL = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
  const account = {
    portfolioId: "p-1",
    ownerAccountId: `${SOL}:PhantomWa11et1111111111111111111111111111111`,
    strategyId: "s-1",
    smartAccounts: [{ accountId: `${SOL}:Vau1t` }],
    schedule: null,
    totalValueUsd: "1200",
    inTransitUsd: "0",
    fetchedAt: "2026-11-24T00:00:00.000Z",
    warnings: [],
    assets: [
      {
        assetId: `${SOL}/spl:TSLAx`,
        smartAccountId: `${SOL}:Vau1t`,
        symbol: "TSLAx",
        decimals: 8,
        balance: "1",
        balanceRaw: "100000000",
        priceUsd: "300",
        valueUsd: "300",
      },
    ],
  } as unknown as ManagedBasketPortfolioSnapshot;
  const sheet = (toMercury: string | undefined) =>
    renderToStaticMarkup(
      createElement(ExitSheet, {
        open: true,
        name: "Magnificent Seven",
        mark: null,
        assetMarks: new Map(),
        mode: "in_kind",
        onMode: () => undefined,
        account,
        prepared: null,
        submitted: null,
        busy: false,
        walletReady: true,
        approver: "Phantom",
        toMercury,
        onPrepare: () => undefined,
        onSubmit: () => undefined,
        onBack: () => undefined,
        onClose: () => undefined,
      }),
    );

  it("says it moves the shares into the Mercury wallet, unsold, with their cost, and offers no conversion", () => {
    const html = sheet("MercuryWa11et111111111111111111111111111111");
    expect(html).toContain("Move Magnificent Seven to your Mercury wallet");
    expect(html).toContain("Mercury wallet · ");
    expect(html).toContain("without being sold, with their share of what the basket cost");
    expect(html).not.toContain("Convert to USDC");
  });

  it("reads as a withdrawal to the wallet itself otherwise", () => {
    const html = sheet(undefined);
    expect(html).toContain("Withdraw Magnificent Seven");
    expect(html).toContain("Convert to USDC");
    expect(html).not.toContain("Mercury wallet · ");
  });
});
