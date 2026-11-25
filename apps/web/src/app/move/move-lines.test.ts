import { describe, expect, it } from "vitest";
import type { Portfolio } from "@mercury/types";
import {
  BANNER_HIDDEN_MS,
  bannerShown,
  costLine,
  dismissBanner,
  moveCostLine,
  outcomeLine,
  outcomeOf,
  pledgedLines,
  toRaw,
  type MovableToken,
} from "./move-lines";

type Holding = Portfolio["holdings"][number];

const holding = (over: Partial<Holding> = {}): Holding => ({
  ticker: "TSLA",
  name: "Tesla",
  shares: "15",
  valueUsd: "6000",
  costBasisUsd: "4800",
  unrealisedPnlUsd: "1200",
  marketPnlUsd: "1200",
  tradingCostUsd: "0",
  sharesWithBasis: "15",
  changePct24h: "0",
  wrapperCount: 1,
  ...over,
});

const token = (over: Partial<MovableToken> = {}): MovableToken => ({
  mint: "TSLAx-mint",
  symbol: "TSLAx",
  ticker: "TSLA",
  name: "Tesla",
  decimals: 8,
  amountRaw: "1500000000",
  amount: "15",
  ...over,
});

describe("toRaw", () => {
  it("reads an amount into the token's smallest unit", () => {
    expect(toRaw("15", 8)).toBe(1_500_000_000n);
    expect(toRaw(" 1.5 ", 8)).toBe(150_000_000n);
    expect(toRaw("0.00000001", 8)).toBe(1n);
    expect(toRaw("20.", 6)).toBe(20_000_000n);
    expect(toRaw("0", 6)).toBe(0n);
  });

  it("refuses more places than the token has, rather than round", () => {
    expect(toRaw("0.000000001", 8)).toBeNull();
    expect(toRaw("1.0000001", 6)).toBeNull();
  });

  it("refuses anything that isn't an amount", () => {
    for (const bad of ["", "-1", "1e3", "1,000", ".5", "abc", "1.2.3"]) expect(toRaw(bad, 8), bad).toBeNull();
  });
});

describe("costLine", () => {
  it("says the cost moves with the shares when all of it is known", () => {
    expect(costLine(token(), [holding()])).toBe("Cost known, and it moves with them");
  });

  it("says how many shares the known cost covers when it is only some", () => {
    expect(costLine(token(), [holding({ sharesWithBasis: "12" })])).toBe("Cost known for 12 of 15 shares");
    expect(costLine(token(), [holding({ shares: "2.5", sharesWithBasis: "1.25" })])).toBe(
      "Cost known for 1.25 of 2.5 shares",
    );
  });

  it("says when the cost is an estimate, which it stays in the Mercury wallet", () => {
    expect(costLine(token(), [holding({ estimatedCostUsd: "4800" })])).toBe(
      "Cost estimated, and it moves with them",
    );
    expect(costLine(token(), [holding({ sharesWithBasis: "12", estimatedCostUsd: "100" })])).toBe(
      "Cost estimated for 12 of 15 shares",
    );
  });

  it("says plainly when there is no cost to carry", () => {
    expect(costLine(token(), [holding({ sharesWithBasis: "0" })])).toBe(
      "Cost not known: it arrives without one",
    );
  });

  it("says nothing for USDC, or a stock the page has no holding for yet", () => {
    expect(costLine(token({ ticker: null, symbol: "USDC" }), [holding()])).toBeNull();
    expect(costLine(token({ ticker: "NVDA" }), [holding()])).toBeNull();
  });
});

describe("pledgedLines", () => {
  it("lists what is in a loan, which stays where it is", () => {
    expect(
      pledgedLines([
        holding({ ticker: "NVDA", pledgedShares: "2" }),
        holding({ ticker: "TSLA" }),
        holding({ ticker: "AAPL", pledgedShares: "0" }),
        holding({ ticker: "SPY", pledgedShares: "0.123456" }),
      ]),
    ).toEqual(["NVDA 2 · In a loan, stays here", "SPY 0.1235 · In a loan, stays here"]);
  });
});

describe("moveCostLine", () => {
  it("says the linked wallet pays the new accounts' rent in SOL, with the fee", () => {
    expect(moveCostLine({ rentUsd: "0.84", rentSol: "0.004176" })).toBe(
      "This wallet pays about $0.84 (0.004176 SOL) in SOL to open accounts in your Mercury wallet, plus the network fee.",
    );
  });

  it("says only the network fee when the Mercury wallet already has every account", () => {
    expect(moveCostLine({ rentUsd: "0", rentSol: "0" })).toBe(
      "This wallet pays the network fee in SOL, a fraction of a cent.",
    );
  });
});

describe("outcomeOf and outcomeLine", () => {
  it("says it moved when every step confirmed", () => {
    const o = outcomeOf(["confirmed", "confirmed"]);
    expect(o).toEqual({ kind: "done", count: 2 });
    expect(outcomeLine(o)).toBe("Moved. It's in your Mercury wallet.");
  });

  it("says it is on its way when a step is still confirming", () => {
    const o = outcomeOf(["confirmed", "pending"]);
    expect(o).toEqual({ kind: "waiting", count: 2 });
    expect(outcomeLine(o)).toContain("on its way");
  });

  it("says how much moved when a step failed, and that the rest stayed", () => {
    const o = outcomeOf(["confirmed", "failed", "pending"]);
    expect(o).toEqual({ kind: "partial", landed: 1, count: 3 });
    expect(outcomeLine(o)).toBe(
      "Part of it moved: 1 of 3 steps. The rest stayed in this wallet; try again to move it.",
    );
  });

  it("says nothing moved when nothing did", () => {
    expect(outcomeLine(outcomeOf(["failed"]))).toBe("Nothing moved. Try again.");
  });
});

describe("the reminder banner", () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it("shows until it is dismissed, then stays away for that wallet for 30 days", () => {
    const s = store();
    expect(bannerShown("w-1", 1_000, s)).toBe(true);
    dismissBanner("w-1", 1_000, s);
    expect(bannerShown("w-1", 1_000 + BANNER_HIDDEN_MS - 1, s)).toBe(false);
    expect(bannerShown("w-1", 1_000 + BANNER_HIDDEN_MS, s)).toBe(true);
    // Another wallet's reminder is its own.
    expect(bannerShown("w-2", 2_000, s)).toBe(true);
  });

  it("shows when the browser keeps nothing, and dismissing then never throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(bannerShown("w-1", 1, broken)).toBe(true);
    expect(() => dismissBanner("w-1", 1, broken)).not.toThrow();
    expect(bannerShown("w-1", 1, null)).toBe(true);
  });
});
