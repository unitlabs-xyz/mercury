import { describe, expect, it } from "vitest";
import { D, ZERO } from "@mercury/core";
import { capacity, MARGIN_CALL_USAGE, safeHeadroomAfter, safeLimitAfter, SAFETY_TARGET } from "./capacity.js";
import type { CollateralTerms, LendingPosition, LendingTerms } from "./ports.js";

const SPYX = "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W";
const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

const spy: CollateralTerms = {
  ticker: "SPY",
  isStock: true,
  symbol: "SPYx",
  mint: SPYX,
  reserve: "SpyReserve",
  decimals: 8,
  ltv: D("0.73"),
  liquidationThreshold: D("0.75"),
  pricePerToken: D(800),
  depositCapTokens: D(20_000),
  depositedTokens: D(5_000),
};
const nvda: CollateralTerms = {
  ...spy,
  ticker: "NVDA",
  symbol: "NVDAx",
  mint: NVDAX,
  reserve: "NvdaReserve",
  ltv: D("0.55"),
  liquidationThreshold: D("0.65"),
  pricePerToken: D(200),
};

const terms = (over: Partial<LendingTerms["pool"]> = {}, collateral = [spy, nvda]): LendingTerms => ({
  collateral,
  minPositionUsd: D("0.01"),
  pool: {
    reserve: "UsdcReserve",
    availableUsd: D(500_000),
    borrowedUsd: D(5_000_000),
    borrowCapUsd: D(16_000_000),
    borrowFactor: D(1),
    borrowApy: D("0.06"),
    ...over,
  },
});

/** Ten SPYx pledged at $800 ($8,000), and a loan of `debt`. */
const pledged = (debt: number): LendingPosition => ({
  obligation: "Obligation",
  deposits: [
    {
      ticker: "SPY",
      isStock: true,
      mint: SPYX,
      raw: 1_000_000_000n,
      decimals: 8,
      tokens: D(10),
      valueUsd: D(8_000),
    },
  ],
  debtUsd: D(debt),
  owedUsdc: D(debt),
  debtBfAdjustedUsd: D(debt),
  allowedBorrowUsd: D(8_000 * 0.73),
  liquidationBorrowUsd: D(8_000 * 0.75),
});

const tokens = (n: number) => BigInt(Math.round(n * 1e8));

describe("capacity", () => {
  it("lends to 80% of Kamino's limit, never to the limit itself", () => {
    expect(SAFETY_TARGET.toString()).toBe("0.8");
    const s = capacity({ terms: terms(), position: pledged(0), wallet: new Map(), cashUsd: ZERO });
    // $8,000 × 73% × 80%
    expect(s.borrowableNowUsd.toString()).toBe("4672");
  });

  it("subtracts what is already owed", () => {
    const s = capacity({ terms: terms(), position: pledged(1_000), wallet: new Map(), cashUsd: ZERO });
    expect(s.borrowableNowUsd.toString()).toBe("3672");
    expect(s.overTargetUsd.toString()).toBe("0");
  });

  it("says how much to repay when a fall has pushed the loan past the target", () => {
    const s = capacity({ terms: terms(), position: pledged(5_000), wallet: new Map(), cashUsd: ZERO });
    // Target on $8,000 of SPY is $4,672; $5,000 owed is $328 over.
    expect(s.overTargetUsd.toString()).toBe("328");
    expect(s.borrowableNowUsd.toString()).toBe("0");
  });

  it("counts stock still in the wallet as pledgeable, within the deposit cap", () => {
    const s = capacity({
      terms: terms(),
      position: null,
      wallet: new Map([[NVDAX, tokens(10)]]),
      cashUsd: ZERO,
    });
    const row = s.rows.find((r) => r.ticker === "NVDA")!;
    expect(row.depositableUsd.toString()).toBe("2000");
    // $2,000 × 55% × 80%
    expect(row.borrowableUsd.toString()).toBe("880");
    expect(s.borrowableNowUsd.toString()).toBe("0");
    expect(s.borrowableUsd.toString()).toBe("880");
  });

  it("will not count tokens past what the reserve's deposit cap still takes", () => {
    const full = { ...nvda, depositCapTokens: D(5_004), depositedTokens: D(5_000) };
    const s = capacity({
      terms: terms({}, [spy, full]),
      position: null,
      wallet: new Map([[NVDAX, tokens(10)]]),
      cashUsd: ZERO,
    });
    expect(s.rows.find((r) => r.ticker === "NVDA")!.depositableTokens.toString()).toBe("4");
  });

  it("caps everything at what the USDC pool can still lend", () => {
    const s = capacity({
      terms: terms({ availableUsd: D(1_000) }),
      position: pledged(0),
      wallet: new Map(),
      cashUsd: ZERO,
    });
    expect(s.borrowableNowUsd.toString()).toBe("1000");
  });

  it("respects the pool's borrow cap as well as its liquidity", () => {
    const s = capacity({
      terms: terms({ borrowedUsd: D(15_999_500) }),
      position: pledged(0),
      wallet: new Map(),
      cashUsd: ZERO,
    });
    expect(s.borrowableNowUsd.toString()).toBe("500");
  });

  it("spendable is cash plus what could be borrowed", () => {
    const s = capacity({
      terms: terms(),
      position: pledged(1_000),
      wallet: new Map([[NVDAX, tokens(10)]]),
      cashUsd: D("250.5"),
    });
    // 3,672 against SPY plus 880 against the NVDA still in the wallet, plus cash.
    expect(s.borrowableUsd.toString()).toBe("4552");
    expect(s.spendableUsd.toString()).toBe("4802.5");
  });

  it("says how far the collateral can fall before liquidation", () => {
    const s = capacity({ terms: terms(), position: pledged(3_000), wallet: new Map(), cashUsd: ZERO });
    // Liquidation at $6,000 of debt against $8,000; $3,000 owed survives a 50% fall.
    expect(s.safeUntilDrop!.toString()).toBe("0.5");
    expect(s.liquidationLtv!.toString()).toBe("0.5");
  });

  it("at the safety target SPY survives a fall of about 22%, not the 2.7% at Kamino's maximum", () => {
    const s = capacity({ terms: terms(), position: null, wallet: new Map(), cashUsd: ZERO });
    const row = s.rows.find((r) => r.ticker === "SPY")!;
    expect(row.cushionAtTarget.toDecimalPlaces(4).toString()).toBe("0.2213");
  });

  it("counts collateral that is not a stock, as Kamino does", () => {
    // A wallet that pledged Bitcoin here earlier: its borrowing power is real even though we only offer stocks.
    const btc: CollateralTerms = {
      ...spy,
      ticker: "cbBTC",
      isStock: false,
      symbol: "cbBTC",
      mint: "cbBTCmint",
      ltv: D("0.75"),
      liquidationThreshold: D("0.8"),
      pricePerToken: D(80_000),
    };
    const position: LendingPosition = {
      ...pledged(0),
      deposits: [
        {
          ticker: "cbBTC",
          isStock: false,
          mint: "cbBTCmint",
          raw: 50_000_000n,
          decimals: 8,
          tokens: D("0.5"),
          valueUsd: D(40_000),
        },
      ],
      liquidationBorrowUsd: D(32_000),
    };
    const s = capacity({ terms: terms({}, [spy, btc]), position, wallet: new Map(), cashUsd: ZERO });
    // $40,000 × 75% × 80%
    expect(s.borrowableNowUsd.toString()).toBe("24000");
    expect(s.collateralUsd.toString()).toBe("40000");
  });

  it("never offers the wallet's own cash as collateral, so spendable counts it once", () => {
    const usdc: CollateralTerms = {
      ...spy,
      ticker: "USDC",
      isStock: false,
      symbol: "USDC",
      mint: "UsdcMint",
      decimals: 6,
      ltv: D("0.8"),
      liquidationThreshold: D("0.9"),
      pricePerToken: D(1),
      depositCapTokens: null,
    };
    const s = capacity({
      terms: terms({}, [spy, usdc]),
      position: null,
      wallet: new Map([["UsdcMint", 1_000_000_000n]]),
      cashUsd: D(1_000),
    });
    expect(s.borrowableUsd.toString()).toBe("0");
    expect(s.spendableUsd.toString()).toBe("1000");
  });

  it("gives the price at which a pledged stock would be liquidated, and how far away it is", () => {
    // 10 SPYx at $800, $3,000 owed: liquidation when 10 × p × 75% = 3,000, so p = $400, 50% below.
    const s = capacity({ terms: terms(), position: pledged(3_000), wallet: new Map(), cashUsd: ZERO });
    const row = s.rows.find((r) => r.ticker === "SPY")!;
    expect(row.liquidationPrice!.toString()).toBe("400");
    expect(row.liquidationDistance!.toString()).toBe("0.5");
    // Nothing pledged, nothing to liquidate.
    expect(s.rows.find((r) => r.ticker === "NVDA")!.liquidationPrice).toBeNull();
  });

  it("has no liquidation figure with no loan", () => {
    const s = capacity({ terms: terms(), position: pledged(0), wallet: new Map(), cashUsd: ZERO });
    expect(s.safeUntilDrop).toBeNull();
  });
});

describe("health", () => {
  // 10 SPYx at $800: borrow limit $4,672, margin call at 85% of $6,000 = $5,100, Kamino sells at $6,000.
  const at = (debt: number) =>
    capacity({ terms: terms(), position: pledged(debt), wallet: new Map(), cashUsd: ZERO });

  it("is healthy and open inside the 80% limit", () => {
    const s = at(4_000);
    expect(s.health).toBe("healthy");
    expect(s.locked).toBe(false);
    // Usage 4,000 / 6,000; a margin call needs usage 0.85, so a 21.6% fall.
    expect(s.dropToMarginCall!.toDecimalPlaces(4).toString()).toBe("0.2157");
  });

  it("locks borrowing and withdrawals once a fall pushes the loan past the limit", () => {
    const s = at(4_800);
    expect(s.health).toBe("over_limit");
    expect(s.locked).toBe(true);
    expect(s.overTargetUsd.toString()).toBe("128");
  });

  it("calls a margin call at 85% of the way to Kamino's line, well before a sale", () => {
    expect(MARGIN_CALL_USAGE.toString()).toBe("0.85");
    const s = at(5_400);
    expect(s.health).toBe("margin_call");
    // Back under $5,100 ends the margin call; back under $4,672 unlocks everything.
    expect(s.repayToClearMarginCallUsd.toString()).toBe("300");
    expect(s.overTargetUsd.toString()).toBe("728");
    expect(s.dropToMarginCall).toBeNull();
  });

  it("says liquidation once Kamino's own line is crossed", () => {
    expect(at(6_000).health).toBe("liquidation");
  });

  it("is healthy with no loan at all", () => {
    expect(at(0).health).toBe("healthy");
  });
});

describe("safeHeadroomAfter", () => {
  it("adds a deposit before checking the borrow against the target", () => {
    const input = { terms: terms(), position: pledged(0), wallet: new Map(), cashUsd: ZERO };
    // Another 10 SPYx doubles the pledge.
    expect(safeHeadroomAfter(input, { ticker: "SPY", tokensDelta: D(10) }).toString()).toBe("9344");
  });

  it("shows when a withdrawal would push the loan past the target", () => {
    const input = { terms: terms(), position: pledged(4_000), wallet: new Map(), cashUsd: ZERO };
    // Taking out 5 of 10 SPYx leaves a safe limit of $2,336 against $4,000 owed.
    expect(safeLimitAfter(input, { ticker: "SPY", tokensDelta: D(-5) }).lt(D(4_000))).toBe(true);
    expect(safeLimitAfter(input, { ticker: "SPY", tokensDelta: D(-1) }).gte(D(4_000))).toBe(true);
  });
});
