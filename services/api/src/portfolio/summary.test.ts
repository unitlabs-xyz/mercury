import { describe, expect, it } from "vitest";
import { D, ZERO } from "@mercury/core";
import type { TokenPrice } from "@mercury/market";
import { PortfolioSummary } from "@mercury/types";
import type { HoldingRow } from "../routes/portfolio.js";
import { actingAs, actingLinked } from "../wallets/testing.js";
import { summarise, type WalletRecords } from "./summary.js";

const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const AT = new Date("2026-11-23T10:00:00.000Z");

const price = (perShare: number): TokenPrice => ({
  mint: NVDAX,
  usdPricePerToken: D(perShare),
  pricePerShare: D(perShare),
  changePct24h: ZERO,
  liquidityUsd: D(1_000_000),
  multiplier: D(1),
  observedAt: AT,
});
const BOARD = new Map([[NVDAX, price(200)]]);

/** Two NVDA bought at $150 each, unless a test says otherwise. */
const holding = (over: Partial<HoldingRow> = {}): HoldingRow => ({
  instrumentId: "instrument-nvda",
  ticker: "NVDA",
  name: "Nvidia",
  shares: D(2),
  sharesWithBasis: D(2),
  costBasisUsd: D(300),
  referenceBasisUsd: over.costBasisUsd ?? D(300),
  feeUsd: ZERO,
  avgUnitCostUsd: D(150),
  estimatedCostUsd: ZERO,
  estimateSource: null,
  wrappers: [{ mint: NVDAX, symbol: "NVDAx", issuer: "backed", decimals: 8 }],
  ...over,
});

const records = (over: Partial<WalletRecords> = {}): WalletRecords => ({
  latest: { totalUsd: D(500), debtUsd: ZERO, earnUsd: null, asOf: AT },
  holdings: [],
  realisedUsd: ZERO,
  dividendsUsd: ZERO,
  earnNetDepositedUsd: null,
  loanLedger: [],
  loanHealth: null,
  historyRead: false,
  ...over,
});

const MERCURY = actingAs("Mercury");
const PHANTOM = actingLinked("Phantom", { label: "Phantom" });

/** Parsed through the wire schema, so a summary the app could not read fails here. */
const run = (...wallets: Parameters<typeof summarise>[0]) =>
  PortfolioSummary.parse(summarise(wallets, BOARD));

describe("summarise: net worth", () => {
  it("adds every wallet's latest reading, and says how old the oldest is", () => {
    const earlier = new Date(AT.getTime() - 40 * 60_000);
    const s = run(
      { wallet: MERCURY, records: records() },
      {
        wallet: PHANTOM,
        records: records({ latest: { totalUsd: D(750), debtUsd: D(100), earnUsd: null, asOf: earlier } }),
      },
    );
    expect(s.netWorthUsd).toBe("1250");
    expect(s.asOf).toBe(earlier.toISOString());
    expect(s.wallets.map((w) => [w.id, w.valueUsd, w.debtUsd])).toEqual([
      [MERCURY.id, "500", "0"],
      [PHANTOM.id, "750", "100"],
    ]);
  });

  it("leaves out a wallet with no reading yet, rather than counting it as nothing", () => {
    const s = run(
      { wallet: MERCURY, records: records() },
      { wallet: PHANTOM, records: records({ latest: null }) },
    );
    expect(s.netWorthUsd).toBe("500");
    expect(s.wallets[1]).toMatchObject({ valueUsd: null, asOf: null });
  });

  it("is zero, as of nothing, with no readings at all", () => {
    const s = run({ wallet: MERCURY, records: records({ latest: null }) });
    expect(s).toMatchObject({ netWorthUsd: "0", asOf: null });
  });
});

describe("summarise: P&L", () => {
  it("is unrealised at today's price plus realised, the percentage over the cost still held", () => {
    const s = run({
      wallet: MERCURY,
      records: records({ holdings: [holding()], realisedUsd: D(25) }),
    });
    // Two shares at $200 against $300 of cost.
    expect(s.pnl).toMatchObject({ unrealisedUsd: "100", realisedUsd: "25", totalUsd: "125" });
    expect(Number(s.pnl.returnPct)).toBeCloseTo(33.3333, 3);
  });

  it("says how much of the cost was estimated", () => {
    const s = run({
      wallet: MERCURY,
      records: records({ holdings: [holding({ estimatedCostUsd: D(300) })] }),
    });
    expect(s.pnl.estimatedCostUsd).toBe("300");
  });

  it("has no percentage with no cost to measure against", () => {
    const s = run({ wallet: MERCURY, records: records() });
    expect(s.pnl.returnPct).toBeNull();
  });

  it("leaves a closed holding out", () => {
    const s = run({
      wallet: MERCURY,
      records: records({ holdings: [holding({ shares: ZERO, costBasisUsd: ZERO })] }),
    });
    expect(s.pnl.unrealisedUsd).toBe("0");
  });
});

/*
 * A linked wallet whose past has not been read yet has no cost for anything
 * it holds. Counting it would show its whole value as profit.
 */
describe("summarise: a linked wallet still calculating", () => {
  const linked = records({
    latest: { totalUsd: D(900), debtUsd: D(120), earnUsd: D(50), asOf: AT },
    holdings: [holding({ costBasisUsd: ZERO, sharesWithBasis: ZERO })],
    dividendsUsd: D(9),
    loanLedger: [{ kind: "borrow", usdAmount: D(100), debtAfterUsd: D(100) }],
  });

  it("is in net worth, and out of P&L, income and interest, counted as calculating", () => {
    const s = run({ wallet: MERCURY, records: records() }, { wallet: PHANTOM, records: linked });
    expect(s.netWorthUsd).toBe("1400");
    expect(s.pnl.totalUsd).toBe("0");
    expect(s.income.totalUsd).toBe("0");
    expect(s.loanInterestUsd).toBe("0");
    expect(s.calculating).toBe(1);
    expect(s.wallets.map((w) => w.history)).toEqual(["ready", "calculating"]);
  });

  it("counts once its past is read", () => {
    const s = run({ wallet: PHANTOM, records: { ...linked, historyRead: true } });
    expect(s.calculating).toBe(0);
    expect(s.income.dividendsUsd).toBe("9");
    expect(s.loanInterestUsd).toBe("20");
  });

  it("still shows its loan's health, which never waits for history", () => {
    const s = run({ wallet: PHANTOM, records: { ...linked, loanHealth: "margin_call" } });
    expect(s.wallets[0]!.loanHealth).toBe("margin_call");
  });
});

describe("summarise: income", () => {
  it("is Earn's balance over what went in, plus dividends", () => {
    const s = run({
      wallet: MERCURY,
      records: records({
        latest: { totalUsd: D(500), debtUsd: ZERO, earnUsd: D(212.5), asOf: AT },
        earnNetDepositedUsd: D(200),
        dividendsUsd: D(3.25),
      }),
    });
    expect(s.income).toEqual({ earnUsd: "12.5", dividendsUsd: "3.25", totalUsd: "15.75" });
  });

  it("earns nothing in Earn with nothing recorded going in, rather than the whole balance", () => {
    const s = run({
      wallet: MERCURY,
      records: records({ latest: { totalUsd: D(500), debtUsd: ZERO, earnUsd: D(212.5), asOf: AT } }),
    });
    expect(s.income.earnUsd).toBe("0");
  });

  it("never earns less than nothing, when a withdrawal's reading lags", () => {
    const s = run({
      wallet: MERCURY,
      records: records({
        latest: { totalUsd: D(500), debtUsd: ZERO, earnUsd: D(150), asOf: AT },
        earnNetDepositedUsd: D(200),
      }),
    });
    expect(s.income.earnUsd).toBe("0");
  });
});

describe("summarise: loans", () => {
  const owing = (debt: number, over: Partial<WalletRecords> = {}) =>
    records({ latest: { totalUsd: D(500), debtUsd: D(debt), earnUsd: null, asOf: AT }, ...over });

  it("counts what is owed beyond what was borrowed as interest", () => {
    const s = run({
      wallet: MERCURY,
      records: owing(103.5, { loanLedger: [{ kind: "borrow", usdAmount: D(100), debtAfterUsd: D(100) }] }),
    });
    expect(s.loanInterestUsd).toBe("3.5");
  });

  it("adds nothing for a debt its ledger can't explain, rather than calling it all interest", () => {
    expect(run({ wallet: MERCURY, records: owing(103.5) }).loanInterestUsd).toBe("0");
  });

  it("is healthy with a loan and nothing recorded against it, and has no health with no loan", () => {
    expect(run({ wallet: MERCURY, records: owing(50) }).wallets[0]!.loanHealth).toBe("healthy");
    expect(
      run({ wallet: MERCURY, records: owing(0, { loanHealth: "margin_call" }) }).wallets[0]!.loanHealth,
    ).toBeNull();
  });

  it("shows what the loan watch last recorded", () => {
    const s = run({ wallet: MERCURY, records: owing(50, { loanHealth: "liquidation" }) });
    expect(s.wallets[0]!.loanHealth).toBe("liquidation");
  });
});
