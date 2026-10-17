import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import type { TransactionDetail } from "@mercury/chain";
import { landedAmounts, planLoanEvents, tokenText } from "./events.js";

const decimalsOf = () => 8;

describe("tokenText", () => {
  it("writes a token quantity the way a person would", () => {
    expect(tokenText("240000000", 8)).toBe("2.4");
    expect(tokenText("100000000", 8)).toBe("1");
    expect(tokenText("1", 8)).toBe("0.00000001");
  });

  it("does not eat a whole number's zeros", () => {
    // The bug `plural()` had in reconcile.ts: "100" became "1".
    expect(tokenText("10000000000", 8)).toBe("100");
  });
});

describe("planLoanEvents", () => {
  it("names the collateral when the pledge is in the same transaction", () => {
    const events = planLoanEvents(
      { kind: "deposit_and_borrow", ticker: "SPACEX", tokensRaw: "240000000", usd: D("500") },
      decimalsOf,
    );
    expect(events.map((e) => e.kind)).toEqual(["pledge", "borrow"]);
    expect(events[1]!.title).toBe("Borrowed $500.00 against SPACEX");
    expect(events[0]!.title).toBe("Pledged 2.4 SPACEX");
  });

  /*
   * One transaction, two events. A feed with only the cash loses the pledge; a
   * feed with only the pledge loses the loan.
   */
  it("splits one transaction into both the things it did", () => {
    const events = planLoanEvents(
      { kind: "deposit_and_borrow", ticker: "SPACEX", tokensRaw: "240000000", usd: D("500") },
      decimalsOf,
    );
    expect(events).toHaveLength(2);
  });

  it("names no ticker when the loan draws on everything already pledged", () => {
    const [event] = planLoanEvents({ kind: "borrow", usd: D("500") }, decimalsOf);
    expect(event!.title).toBe("Borrowed $500.00");
    expect(event!.ticker).toBeNull();
    expect(event!.subtitle).toBe("Against your pledged stock");
  });

  it("carries the figure on a repay of a stated amount", () => {
    const [event] = planLoanEvents({ kind: "repay", usd: D("250.5") }, decimalsOf);
    expect(event!.title).toBe("Repaid $250.50");
    expect(event!.usdAmount?.toFixed(2)).toBe("250.50");
  });

  /*
   * The size of "everything" is decided by the chain when it lands, and differs
   * from anything we could state here by the interest accrued in between. A
   * number that is nearly right is worse in a feed than no number.
   */
  it("states no figure for repaying everything, because we do not know it yet", () => {
    const [event] = planLoanEvents({ kind: "repay", usd: "all" }, decimalsOf);
    expect(event!.title).toBe("Repaid your loan in full");
    expect(event!.usdAmount).toBeNull();
  });

  it("does the same for withdrawing everything", () => {
    const [event] = planLoanEvents({ kind: "withdraw", ticker: "SPACEX", tokensRaw: "all" }, decimalsOf);
    expect(event!.title).toBe("Withdrew all your SPACEX");
    expect(event!.tokensRaw).toBeNull();
  });

  it("reports a pledge on its own as collateral moving, not as money", () => {
    const [event] = planLoanEvents({ kind: "deposit", ticker: "SPACEX", tokensRaw: "240000000" }, decimalsOf);
    expect(event!.kind).toBe("pledge");
    expect(event!.usdAmount).toBeNull();
    expect(event!.subtitle).toBe("Held by Kamino as collateral");
  });

  it("reports a withdrawal of a stated size with that size", () => {
    const [event] = planLoanEvents(
      { kind: "withdraw", ticker: "SPACEX", tokensRaw: "240000000" },
      decimalsOf,
    );
    expect(event!.title).toBe("Withdrew 2.4 SPACEX");
  });
});

describe("landedAmounts", () => {
  const WALLET = "6Yg9nNQEqCQBMcYHLrrfj6qGjcR6hvhdhHQZPjtDqLRT";
  const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
  const entry = (mint: string, rawAmount: bigint, decimals: number) => ({
    mint,
    owner: WALLET,
    rawAmount,
    decimals,
  });
  const tx = (pre: ReturnType<typeof entry>[], post: ReturnType<typeof entry>[]): TransactionDetail => ({
    signature: "Sig",
    blockTime: 1,
    succeeded: true,
    accountKeys: [WALLET],
    feeLamports: 5000n,
    preLamports: [0n],
    postLamports: [0n],
    preTokens: pre,
    postTokens: post,
  });
  const ctx = {
    wallet: WALLET,
    usdcMint: USDC,
    mintOf: (ticker: string) => (ticker === "NVDA" ? NVDAX : null),
  };

  /*
   * A repay of everything is sized by the chain when it lands, interest to that
   * slot included, so the request never knew the figure. The transaction does.
   */
  it("reads what a repay of everything actually sent", () => {
    const [repay] = landedAmounts(
      planLoanEvents({ kind: "repay", usd: "all" }, decimalsOf),
      tx([entry(USDC, 5_000_000n, 6)], [entry(USDC, 2_889_985n, 6)]),
      ctx,
    );
    expect(repay!.usdAmount?.toFixed()).toBe("2.110015");
    expect(repay!.title).toBe("Repaid your loan in full");
  });

  it("reads what a withdrawal of everything actually returned", () => {
    const [withdraw] = landedAmounts(
      planLoanEvents({ kind: "withdraw", ticker: "NVDA", tokensRaw: "all" }, decimalsOf),
      tx([entry(NVDAX, 0n, 8)], [entry(NVDAX, 2_239_976n, 8)]),
      ctx,
    );
    expect(withdraw!.tokensRaw).toBe("2239976");
  });

  /* A figure the request named is the figure; the chain is only read for the ones it could not. */
  it("leaves an amount the request named as it was", () => {
    const planned = planLoanEvents({ kind: "repay", usd: D("1") }, decimalsOf);
    const [repay] = landedAmounts(
      planned,
      tx([entry(USDC, 5_000_000n, 6)], [entry(USDC, 3_000_000n, 6)]),
      ctx,
    );
    expect(repay!.usdAmount?.toFixed()).toBe("1");
  });

  it("leaves the amount out when the transaction shows nothing moved", () => {
    const [repay] = landedAmounts(planLoanEvents({ kind: "repay", usd: "all" }, decimalsOf), tx([], []), ctx);
    expect(repay!.usdAmount).toBeNull();
  });
});
