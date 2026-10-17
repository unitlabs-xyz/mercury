import { describe, expect, it } from "vitest";
import type { ActivityItem } from "./activity-map.js";
import { receiptOf, whenText, type ReceiptDetail } from "./receipt.js";

const item = (over: Partial<ActivityItem> = {}): ActivityItem => ({
  id: "0b0f6a0e-3c3a-4f4e-9a59-0c6f1d8f2a11",
  kind: "buy",
  occurredAt: "2026-10-15T14:32:00.000Z",
  title: "Bought NVDA",
  subtitle: "0.044619 shares at $218.29",
  amountUsd: "10",
  txSignature: "5MRg8vcaYzjDoU1ZBuMgCncMQe5DSUPeVvDc4wTXKQatxWoTeDuAMzWz7SEyLj39bFWmaVQZRDiHwersgCVT4bwe",
  mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
  logoUrl: null,
  ...over,
});

const bought: ReceiptDetail = {
  type: "trade",
  side: "buy",
  ticker: "NVDA",
  shares: "0.044619",
  pricePerShare: "218.29",
  referencePricePerShare: "218.05",
  sharesUsd: "9.74",
  mercuryFeeUsd: "0.05",
  networkFeeUsd: "0.21",
  realisedPnlUsd: null,
  issuer: "backed",
  route: ["Meteora"],
};

const values = (lines: readonly { label: string; value: string }[]) => lines.map((l) => [l.label, l.value]);

describe("receiptOf — a trade", () => {
  it("shows what was paid and what arrived, as the order review does", () => {
    const r = receiptOf(item(), bought);
    expect(r.swap).toEqual({
      from: { label: "You paid", value: "$10.00", unit: "USD" },
      to: { label: "You received", value: "0.044619", unit: "shares" },
    });
  });

  /* The rows add up to the total, so nobody has to do the sum to trust it. */
  it("splits the total into the shares and each part of the charge", () => {
    const r = receiptOf(item(), bought);
    expect(values(r.parts)).toEqual([
      ["Subtotal", "$9.74"],
      ["Mercury fee", "$0.05"],
      ["Network fee", "$0.21"],
    ]);
    expect(r.total).toMatchObject({ label: "Total", value: "$10.00" });
  });

  it("says how the price compares with the real share's", () => {
    const [price] = receiptOf(item(), bought).facts;
    expect(price).toMatchObject({ label: "Price per share", value: "$218.29" });
    expect(price!.tip).toBe("0.11% above the real share price.");
  });

  it("names the route and links to the stock", () => {
    const r = receiptOf(item(), bought);
    expect(r.route).toEqual({ issuer: "backed", venues: ["Meteora"] });
    expect(r.actions).toEqual([{ kind: "stock", ticker: "NVDA", label: "View NVDA" }]);
    // The feed's subtitle was these same figures in a line; the rows say them now.
    expect(r.note).toBeNull();
  });

  it("takes the charge off a sale, and says what the sale made", () => {
    const r = receiptOf(
      item({ kind: "sell", title: "Sold NVDA", subtitle: "0.1 shares at $218.30", amountUsd: "21.72" }),
      {
        ...bought,
        side: "sell",
        shares: "0.1",
        pricePerShare: "218.3",
        sharesUsd: "21.83",
        mercuryFeeUsd: "0.11",
        networkFeeUsd: "0",
        realisedPnlUsd: "-1.2",
      },
    );
    expect(r.swap).toEqual({
      from: { label: "You sold", value: "0.1", unit: "shares" },
      to: { label: "You received", value: "$21.72", unit: "USD" },
    });
    // A part that came to nothing has no line: there is no fee to explain.
    expect(values(r.parts)).toEqual([
      ["Subtotal", "$21.83"],
      ["Mercury fee", "−$0.11"],
    ]);
    expect(r.total).toMatchObject({ label: "Total received", value: "$21.72" });
    expect(r.after).toEqual([{ label: "Realised loss", value: "$1.20", tone: "down" }]);
  });

  /* With nothing taken, a sum of one line is the same figure twice. */
  it("leaves the sum out of a trade that paid no fee", () => {
    const r = receiptOf(item(), { ...bought, mercuryFeeUsd: null, networkFeeUsd: null, sharesUsd: "10" });
    expect(r.parts).toEqual([]);
    expect(r.total).toBeNull();
  });
});

const loanDetail = (over: Partial<Extract<ReceiptDetail, { type: "loan" }>> = {}): ReceiptDetail => ({
  type: "loan",
  legs: [
    { kind: "pledge", usdAmount: null, ticker: "NVDA", tokens: "0.0099" },
    { kind: "borrow", usdAmount: "2.11", ticker: "NVDA", tokens: null },
  ],
  borrowApy: "0.058",
  debtAfterUsd: "2.11",
  collateralAfterUsd: "4.36",
  openedAccount: true,
  interestPaidUsd: null,
  ...over,
});

describe("receiptOf — a loan", () => {
  it("shows a pledge-and-borrow as stock in and dollars out, from either of its rows", () => {
    const borrow = receiptOf(
      item({ kind: "borrow", title: "Borrowed USDC", subtitle: "Against NVDA", amountUsd: "2.11" }),
      loanDetail(),
    );
    expect(borrow.swap).toEqual({
      from: { label: "Collateral", value: "0.0099", unit: "NVDA" },
      to: { label: "Borrowed", value: "$2.11", unit: "USDC" },
    });
    const pledge = receiptOf(
      item({ kind: "pledge", title: "Added collateral", subtitle: "0.0099 NVDA", amountUsd: null }),
      loanDetail(),
    );
    expect(pledge.swap).toEqual(borrow.swap);
  });

  it("says the rate then, that Mercury paid for the account, and the loan it left", () => {
    const r = receiptOf(item({ kind: "borrow", amountUsd: "2.11" }), loanDetail());
    expect(values(r.facts)).toEqual([
      ["Interest rate", "5.8% a year"],
      ["Account setup", "Covered by Mercury"],
    ]);
    expect(values(r.after)).toEqual([
      ["Loan balance", "$2.11"],
      ["Collateral value", "$4.36"],
      ["Loan-to-value", "48%"],
    ]);
    expect(r.actions).toEqual([{ kind: "borrow", tab: "borrow", label: "Manage loan" }]);
  });

  /* Closing a loan is when its interest is paid, so that is where it is shown, as part of the sum. */
  it("splits a repay that closed the loan into what was borrowed and the interest", () => {
    const r = receiptOf(
      item({ kind: "repay", title: "Repaid loan", subtitle: "Paid in full", amountUsd: "2.110015" }),
      loanDetail({
        legs: [{ kind: "repay", usdAmount: "2.110015", ticker: null, tokens: null }],
        debtAfterUsd: "0",
        openedAccount: false,
        interestPaidUsd: "0.000015",
      }),
    );
    expect(r.swap).toBeNull();
    expect(values(r.parts)).toEqual([
      ["Principal", "$2.11"],
      ["Interest", "Less than 1¢"],
    ]);
    expect(r.total).toMatchObject({ label: "Total repaid", value: "$2.11" });
    expect(values(r.after)).toEqual([
      ["Loan balance", "Nothing owed"],
      ["Collateral value", "$4.36"],
    ]);
  });

  it("says what a withdrawal returned", () => {
    const r = receiptOf(
      item({ kind: "unpledge", title: "Withdrew collateral", subtitle: "0.0099 NVDA", amountUsd: null }),
      loanDetail({
        legs: [{ kind: "unpledge", usdAmount: null, ticker: "NVDA", tokens: "0.0099" }],
        openedAccount: false,
      }),
    );
    expect(values(r.facts)).toEqual([["Collateral withdrawn", "0.0099 NVDA"]]);
  });
});

describe("receiptOf — cash", () => {
  it("says where a deposit came from, Mercury's fee on it, and links to both chains", () => {
    const r = receiptOf(
      item({
        kind: "transfer_in",
        title: "Added cash",
        subtitle: "From Base · cbBTC",
        amountUsd: "21.04",
        txSignature: "SigSol",
      }),
      { type: "deposit", fromChain: "Base", fromToken: "cbBTC", mercuryFeeUsd: "0.05", sourceTx: "0xbase" },
    );
    expect(values(r.facts)).toEqual([
      ["From", "cbBTC on Base"],
      ["Deposit fee", "$0.05"],
    ]);
    expect(r.links).toEqual([
      { label: "Solana", text: "SigSol", href: "https://solscan.io/tx/SigSol" },
      { label: "Base", text: "0xbase", href: "https://relay.link/transaction/0xbase" },
    ]);
  });

  it("names who a send went to, and adds what opening their account cost", () => {
    const r = receiptOf(
      item({
        kind: "transfer_out",
        title: "Sent cash",
        subtitle: "Plus $0.25 recipient account setup",
        amountUsd: "20",
      }),
      {
        type: "transfer",
        counterparty: "FMVHP1xw6ZHB9zLGyrJeeAvEzCBgouH8bPzdkYqq2C5W",
        accountSetupUsd: "0.25",
      },
    );
    expect(r.facts).toEqual([
      {
        label: "To",
        value: "FMVH…2C5W",
        copy: "FMVHP1xw6ZHB9zLGyrJeeAvEzCBgouH8bPzdkYqq2C5W",
      },
    ]);
    expect(values(r.parts)).toEqual([
      ["Sent", "$20.00"],
      ["Recipient account setup", "$0.25"],
    ]);
    expect(r.total).toMatchObject({ label: "Total", value: "$20.25" });
    // The subtitle said the same thing as the sum, so it is not said twice.
    expect(r.note).toBeNull();
  });

  it("names who money came from", () => {
    const r = receiptOf(item({ kind: "transfer_in", title: "Added cash", subtitle: null, amountUsd: "50" }), {
      type: "transfer",
      counterparty: "FMVHP1xw6ZHB9zLGyrJeeAvEzCBgouH8bPzdkYqq2C5W",
      accountSetupUsd: null,
    });
    expect(r.facts.map((f) => f.label)).toEqual(["From"]);
    expect(r.parts).toEqual([]);
  });
});

describe("receiptOf — nothing behind the row", () => {
  /* Before the receipt arrives, or for a row with no record behind it, the row's own words are the receipt. */
  it("falls back to the row's own line", () => {
    const r = receiptOf(
      item({
        kind: "dividend",
        title: "NVDA dividend",
        subtitle: "Paid as 0.0012 shares",
        txSignature: null,
      }),
      null,
    );
    expect(r.note).toBe("Paid as 0.0012 shares");
    expect(r.links).toEqual([]);
  });

  it("offers the way out of a loan warning", () => {
    const r = receiptOf(
      item({
        kind: "loan_alert",
        title: "Loan over limit",
        subtitle: "Repay some, or add collateral.",
        amountUsd: null,
        txSignature: null,
      }),
      null,
    );
    expect(r.actions).toEqual([
      { kind: "borrow", tab: "repay", label: "Repay" },
      { kind: "borrow", tab: "pledge", label: "Add collateral" },
    ]);
  });
});

describe("whenText", () => {
  it("says the day and the minute", () => {
    expect(whenText("2026-10-15T14:32:00.000Z", "UTC")).toBe("15 Oct 2026, 14:32");
  });
});
