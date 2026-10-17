import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { loanReceipt, tradeReceipt, type LoanSource, type TradeSource } from "./receipt.js";

const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const NVDAON = "NVDAon1111111111111111111111111111111111111";

const candidate = (mint: string, issuer: "backed" | "ondo", filledShares: string, route: string[]) => ({
  mint,
  symbol: issuer === "backed" ? "NVDAx" : "NVDAon",
  issuer,
  multiplier: "1",
  pricePerToken: "218.29",
  pricePerShare: "218.29",
  worstPricePerShare: "217.2",
  filledShares,
  priceImpact: "0.001",
  routeLabels: route,
  viable: true,
  rejection: null,
});

const decision = (side: "buy" | "sell", filledShares: string) => ({
  kind: "execute",
  ticker: "NVDA",
  side,
  amount: side === "buy" ? "10" : filledShares,
  fairPricePerShare: "218.05",
  status: "open",
  candidates: [
    candidate(NVDAX, "backed", filledShares, ["Meteora"]),
    candidate(NVDAON, "ondo", filledShares, ["Raydium", "Orca"]),
  ],
  decidedAt: "2026-10-15T14:32:00.000Z",
  maxSlippageBps: 50,
  best: candidate(NVDAX, "backed", filledShares, ["Meteora"]),
  premium: "0.0011",
  warning: null,
});

const buy: TradeSource = {
  side: "buy",
  ticker: "NVDA",
  mint: NVDAX,
  cashUsd: D("10"),
  feeUsd: D("0.26"),
  mercuryFeeUsd: D("0.05"),
  realisedPnlUsd: null,
  decision: decision("buy", "0.0446"),
  lot: { shares: D("0.044619"), unitCostUsd: D("218.29"), referencePriceUsd: D("218.05") },
};

describe("tradeReceipt", () => {
  it("is what the shares cost, and each part of the charge on top", () => {
    const r = tradeReceipt(buy);
    expect(r.sharesUsd).toBe("9.74");
    expect(r.mercuryFeeUsd).toBe("0.05");
    expect(r.networkFeeUsd).toBe("0.21");
  });

  /* The lot is the fill, read off the chain; the decision is only the quote that preceded it. */
  it("takes a buy's shares and price from the lot it wrote, not the quote", () => {
    const r = tradeReceipt(buy);
    expect(r.shares).toBe("0.044619");
    expect(r.pricePerShare).toBe("218.29");
    expect(r.referencePricePerShare).toBe("218.05");
  });

  it("names the token that traded and the venues it routed through", () => {
    const r = tradeReceipt({ ...buy, mint: NVDAON });
    expect(r.issuer).toBe("ondo");
    expect(r.route).toEqual(["Raydium", "Orca"]);
  });

  /*
   * A sell writes no lot. It sells an exact number of tokens, so the quote's
   * share count is what left; the price is what they fetched over that count.
   */
  it("prices a sell from what the shares fetched", () => {
    const r = tradeReceipt({
      side: "sell",
      ticker: "NVDA",
      mint: NVDAX,
      // What reached the wallet: $21.83 for the shares, less $0.11 of fees.
      cashUsd: D("21.72"),
      feeUsd: D("0.11"),
      mercuryFeeUsd: D("0.11"),
      realisedPnlUsd: D("1.2"),
      decision: decision("sell", "0.1"),
      lot: null,
    });
    expect(r.sharesUsd).toBe("21.83");
    expect(r.shares).toBe("0.1");
    expect(r.pricePerShare).toBe("218.3");
    expect(r.networkFeeUsd).toBe("0");
    expect(r.realisedPnlUsd).toBe("1.2");
    expect(r.referencePricePerShare).toBe("218.05");
  });

  /* Before Mercury had a fee, the whole charge was the network's. Reading it otherwise invents a fee. */
  it("calls the whole charge the network's on an order from before Mercury's fee", () => {
    const r = tradeReceipt({ ...buy, mercuryFeeUsd: null });
    expect(r.mercuryFeeUsd).toBe("0");
    expect(r.networkFeeUsd).toBe("0.26");
  });

  it("splits nothing when the order recorded no charge", () => {
    const r = tradeReceipt({ ...buy, feeUsd: null, mercuryFeeUsd: null });
    expect(r.mercuryFeeUsd).toBeNull();
    expect(r.networkFeeUsd).toBeNull();
    expect(r.sharesUsd).toBe("10");
  });

  /* An order row written by an older build, or edited by hand, is still a receipt worth showing. */
  it("survives a decision it cannot read", () => {
    const r = tradeReceipt({ ...buy, decision: { kind: "something else" } });
    expect(r.issuer).toBeNull();
    expect(r.route).toEqual([]);
    expect(r.shares).toBe("0.044619");
    expect(r.referencePricePerShare).toBe("218.05");
  });

  it("rounds a computed price to the micro-dollar, not forty digits", () => {
    const r = tradeReceipt({
      side: "sell",
      ticker: "NVDA",
      mint: NVDAX,
      cashUsd: D("10"),
      feeUsd: D("0"),
      mercuryFeeUsd: D("0"),
      realisedPnlUsd: null,
      decision: decision("sell", "0.03"),
      lot: null,
    });
    expect(r.pricePerShare).toBe("333.333333");
  });
});

const loan = (over: Partial<LoanSource> = {}): LoanSource => ({
  legs: [
    { kind: "pledge", usdAmount: null, ticker: "NVDA", tokensRaw: "2239976", decimals: 8 },
    { kind: "borrow", usdAmount: D("2.11"), ticker: "NVDA", tokensRaw: null, decimals: null },
  ],
  borrowApy: D("0.058"),
  debtAfterUsd: D("2.11"),
  collateralAfterUsd: D("4.36"),
  openedAccount: true,
  earlier: [],
  ...over,
});

describe("loanReceipt", () => {
  /* One transaction can pledge and borrow at once. A receipt for half of it would be wrong about the other half. */
  it("lists every leg of the transaction, in order, with tokens a person would write", () => {
    const r = loanReceipt(loan());
    expect(r.legs).toEqual([
      { kind: "pledge", usdAmount: null, ticker: "NVDA", tokens: "0.02239976" },
      { kind: "borrow", usdAmount: "2.11", ticker: "NVDA", tokens: null },
    ]);
  });

  it("carries the rate then and the position straight after", () => {
    const r = loanReceipt(loan());
    expect(r.borrowApy).toBe("0.058");
    expect(r.debtAfterUsd).toBe("2.11");
    expect(r.collateralAfterUsd).toBe("4.36");
    expect(r.openedAccount).toBe(true);
  });

  /* Closing the loan is when the interest is paid: what went in, less what was ever borrowed. */
  it("says how much of a repay that closed the loan was interest", () => {
    const r = loanReceipt(
      loan({
        legs: [{ kind: "repay", usdAmount: D("2.110015"), ticker: null, tokensRaw: null, decimals: null }],
        debtAfterUsd: D("0"),
        openedAccount: false,
        earlier: [{ kind: "borrow", usdAmount: D("2.11"), debtAfterUsd: D("2.11") }],
      }),
    );
    expect(r.interestPaidUsd).toBe("0.000015");
  });

  /* A partial repay comes off what was borrowed; the interest is still owed, and still on the loan. */
  it("says no interest was paid by a repay that left a loan open", () => {
    const r = loanReceipt(
      loan({
        legs: [{ kind: "repay", usdAmount: D("1"), ticker: null, tokensRaw: null, decimals: null }],
        debtAfterUsd: D("1.11"),
        earlier: [{ kind: "borrow", usdAmount: D("2.11"), debtAfterUsd: D("2.11") }],
      }),
    );
    expect(r.interestPaidUsd).toBeNull();
  });

  /* A repay of everything recorded before its amount was read off the chain has nothing to subtract from. */
  it("leaves the interest out when the repay's amount was never recorded", () => {
    const r = loanReceipt(
      loan({
        legs: [{ kind: "repay", usdAmount: null, ticker: null, tokensRaw: null, decimals: null }],
        debtAfterUsd: D("0"),
        earlier: [{ kind: "borrow", usdAmount: D("2.11"), debtAfterUsd: D("2.11") }],
      }),
    );
    expect(r.interestPaidUsd).toBeNull();
  });

  it("leaves the interest out when the ledger never saw the loan taken", () => {
    const r = loanReceipt(
      loan({
        legs: [{ kind: "repay", usdAmount: D("2.11"), ticker: null, tokensRaw: null, decimals: null }],
        debtAfterUsd: D("0"),
        earlier: [],
      }),
    );
    expect(r.interestPaidUsd).toBeNull();
  });

  it("shows a token amount it has no decimals for as nothing, rather than as raw units", () => {
    const r = loanReceipt(
      loan({
        legs: [{ kind: "pledge", usdAmount: null, ticker: "NVDA", tokensRaw: "2239976", decimals: null }],
      }),
    );
    expect(r.legs[0]!.tokens).toBeNull();
  });
});
