import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MovableToken, MoveOutcome, PreparedMove } from "./move-lines";

/* The chosen wallet, its tokens, its holdings and the move, stood in for: what the sheet shows in each state is tested. */
const PHANTOM = {
  id: "w-phantom",
  address: "Ph4nt0m",
  kind: "external",
  isPrimary: false,
  label: "Phantom",
  linkedAt: null,
};
const TSLAX: MovableToken = {
  mint: "TSLAx-mint",
  symbol: "TSLAx",
  ticker: "TSLA",
  name: "Tesla",
  decimals: 8,
  amountRaw: "1500000000",
  amount: "15",
};
const USDC: MovableToken = {
  mint: "usdc-mint",
  symbol: "USDC",
  ticker: null,
  name: "US dollars",
  decimals: 6,
  amountRaw: "20000000",
  amount: "20",
};

const state = vi.hoisted(() => ({
  acting: { kind: "linked" } as { kind: "mercury" | "linked" | "all"; wallet?: unknown },
  tokens: { isLoading: false, isError: false, data: undefined } as {
    isLoading: boolean;
    isError: boolean;
    data: { available: boolean; tokens: unknown[] } | undefined;
  },
  holdings: [] as unknown[],
  prepared: undefined as unknown,
  moved: undefined as unknown,
  moveError: null as Error | null,
}));

vi.mock("../../api/acting-wallet", () => ({ useActingWallet: () => ({ acting: state.acting }) }));
vi.mock("../../api/hooks", () => ({ usePortfolio: () => ({ data: { holdings: state.holdings } }) }));
vi.mock("../../api/move", () => ({
  useMovableTokens: () => state.tokens,
  usePrepareMove: () => ({
    data: state.prepared,
    mutate: () => undefined,
    reset: () => undefined,
    isPending: false,
    isError: false,
    error: null,
  }),
  useSignMove: () => ({
    data: state.moved,
    isSuccess: state.moved !== undefined,
    isPending: false,
    isError: state.moveError !== null,
    error: state.moveError,
    mutateAsync: async () => undefined,
    reset: () => undefined,
    approver: "Phantom",
  }),
}));

const { MoveSheet } = await import("./MoveSheet");
const render = () => renderToStaticMarkup(createElement(MoveSheet, { open: true, onClose: () => undefined }));

beforeEach(() => {
  state.acting = { kind: "linked", wallet: PHANTOM };
  state.tokens = { isLoading: false, isError: false, data: { available: true, tokens: [TSLAX, USDC] } };
  state.holdings = [
    {
      ticker: "TSLA",
      name: "Tesla",
      shares: "15",
      sharesWithBasis: "12",
      valueUsd: "6000",
      costBasisUsd: "4800",
      unrealisedPnlUsd: "0",
      marketPnlUsd: "0",
      tradingCostUsd: "0",
      changePct24h: "0",
      wrapperCount: 1,
    },
    {
      ticker: "NVDA",
      name: "Nvidia",
      shares: "2",
      pledgedShares: "2",
      valueUsd: "400",
      costBasisUsd: "300",
      unrealisedPnlUsd: "0",
      marketPnlUsd: "0",
      tradingCostUsd: "0",
      changePct24h: "0",
      wrapperCount: 1,
    },
  ];
  state.prepared = undefined;
  state.moved = undefined;
  state.moveError = null;
});

describe("MoveSheet", () => {
  it("chooses everything the wallet can move, amounts editable, each stock saying whether its cost goes with it", () => {
    const html = render();
    expect(html).toContain("Move to Mercury wallet");
    expect(html).toContain("From Phantom to your Mercury wallet");
    expect(html).toContain("TSLAx");
    expect(html).toContain("USDC");
    expect(html).toContain('aria-label="TSLAx to move"');
    expect(html).toContain('value="15"');
    expect(html).toContain("Cost known for 12 of 15 shares");
    expect(html).toContain("Review move");
  });

  it("lists what is pledged to a loan apart: it stays with the loan", () => {
    const html = render();
    expect(html).toContain("Pledged to a loan");
    expect(html).toContain("NVDA 2 · In a loan, stays here");
  });

  it("on review, says what it costs and that Phantom approves it, with no tip to use the Mercury wallet", () => {
    state.prepared = {
      transactions: [
        { transaction: "AA==", moved: [] },
        { transaction: "AA==", moved: [] },
      ],
      feeUsd: "0.84",
      rentUsd: "0.84",
      coveredByMercury: false,
    } satisfies PreparedMove;
    const html = render();
    expect(html).toContain("Review move");
    expect(html).toContain("Network cost $0.84, taken from the USDC you move.");
    expect(html).toContain("Phantom shows this as 2 small transactions, approved together.");
    expect(html).toContain("Continue in Phantom");
    expect(html).toContain("You&#x27;ll approve this in Phantom.");
    expect(html).not.toContain("Tip:");
  });

  it("says why when Phantom refused to sign", () => {
    state.prepared = {
      transactions: [{ transaction: "AA==", moved: [] }],
      feeUsd: "0",
      rentUsd: "0",
      coveredByMercury: false,
    };
    state.moveError = new Error("Phantom changed the transaction while signing");
    expect(render()).toContain("Phantom changed the transaction while signing");
  });

  it("says what landed once it is sent", () => {
    state.moved = { kind: "done", count: 1 } satisfies MoveOutcome;
    const html = render();
    expect(html).toContain("Move sent");
    expect(html).toContain("Moved. It&#x27;s in your Mercury wallet.");
  });

  it("says there is nothing to move when the wallet holds nothing Mercury lists", () => {
    state.tokens = { isLoading: false, isError: false, data: { available: true, tokens: [] } };
    const html = render();
    expect(html).toContain("Phantom holds nothing Mercury lists");
    expect(html).not.toContain("Review move");
  });

  it("says moving isn't available when the server has no relayer to pay for it", () => {
    state.tokens = { isLoading: false, isError: false, data: { available: false, tokens: [] } };
    expect(render()).toContain("Moving isn&#x27;t available right now.");
  });

  it("asks for a linked wallet when the Mercury wallet, or every wallet, is chosen", () => {
    for (const kind of ["mercury", "all"] as const) {
      state.acting = { kind };
      const html = render();
      expect(html).toContain("Choose a linked wallet to move from.");
      expect(html).not.toContain("Review move");
    }
  });
});
