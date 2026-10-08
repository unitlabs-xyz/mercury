import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import type { TokenBalance } from "@mercury/chain";
import type { Deps } from "./deps.js";
import { priceOrder } from "./pricing.js";

const WALLET = "8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6";

/** A dollar a token, so shares and dollars are easy to tell apart in a test. */
const FAIR = 100;

const held = (mint: string, whole: string, decimals: number): TokenBalance => ({
  mint,
  rawAmount: BigInt(D(whole).mul(D(10).pow(decimals)).toFixed(0)),
  decimals,
});

/**
 * A market whose every adapter answers from a literal, and which records the
 * amount each wrapper was quoted for. That recording is the point: the bug this
 * guards against is handing a share count to an adapter that wants tokens.
 */
const deps = (over: { balances?: TokenBalance[]; multipliers?: Record<string, string> } = {}) => {
  const asked: { mint: string; amount: string }[] = [];
  const market = {
    registry: {
      wrappersFor: async () => [
        { mint: "Xsc9", symbol: "NVDAx", issuer: "backed", decimals: 8 },
        { mint: "Ondo", symbol: "NVDAon", issuer: "ondo", decimals: 6 },
      ],
    },
    reference: {
      priceFor: async () => ({
        pricePerShare: D(FAIR),
        observedAt: new Date(),
        pendingDividendNet: D(0),
      }),
    },
    sessions: { current: async () => ({ status: "open", isOpen: true, nextOpenAt: null }) },
    multipliers: {
      multiplierFor: async (mint: string) => D(over.multipliers?.[mint] ?? "1"),
      isPaused: async () => false,
    },
    quotes: {
      quote: async (req: { mint: string; amount: { toFixed(): string } }) => {
        asked.push({ mint: req.mint, amount: req.amount.toFixed() });
        const amount = D(req.amount.toFixed());
        return {
          inAmount: amount,
          outAmount: amount.mul(FAIR),
          minOutAmount: amount.mul(FAIR).mul(D("0.995")),
          priceImpact: D("0.0001"),
          routeLabels: ["Raydium"],
          quoteId: `${req.mint}:1`,
          expiresAt: new Date(Date.now() + 20_000),
          raw: {},
        };
      },
    },
    chain: {
      tokenBalances: async () => over.balances ?? [held("Xsc9", "10", 8), held("Ondo", "10", 6)],
    },
  } as unknown as Deps;
  return { market, asked };
};

describe("priceOrder, selling", () => {
  it("takes dollars and quotes tokens, because the adapter speaks tokens", async () => {
    const { market, asked } = deps();
    const d = await priceOrder(market, { ticker: "NVDA", side: "sell", amount: "500", owner: WALLET });
    expect(d?.kind).toBe("execute");
    // $500 at $100 a share is five shares, and at multiplier 1 five tokens.
    expect(asked.find((a) => a.mint === "Xsc9")?.amount).toBe("5");
  });

  it("converts through each wrapper's own multiplier, not a shared one", async () => {
    const { market, asked } = deps({ multipliers: { Xsc9: "2" } });
    await priceOrder(market, { ticker: "NVDA", side: "sell", amount: "500", owner: WALLET });
    // Five shares of a 2x wrapper is two and a half of its tokens.
    expect(asked.find((a) => a.mint === "Xsc9")?.amount).toBe("2.5");
    expect(asked.find((a) => a.mint === "Ondo")?.amount).toBe("5");
  });

  it("never quotes a wrapper the wallet does not hold", async () => {
    const { market, asked } = deps({ balances: [held("Xsc9", "10", 8)] });
    await priceOrder(market, { ticker: "NVDA", side: "sell", amount: "500", owner: WALLET });
    expect(asked.map((a) => a.mint)).toEqual(["Xsc9"]);
  });

  it("caps at the balance rather than asking for tokens that are not there", async () => {
    const { market, asked } = deps({ balances: [held("Xsc9", "0.5", 8)] });
    await priceOrder(market, { ticker: "NVDA", side: "sell", amount: "500", owner: WALLET });
    expect(asked[0]?.amount).toBe("0.5");
  });

  it("refuses when the wallet holds none of any wrapper, and says so in those terms", async () => {
    const { market } = deps({ balances: [] });
    const d = await priceOrder(market, { ticker: "NVDA", side: "sell", amount: "500", owner: WALLET });
    expect(d?.kind).toBe("refuse");
    if (d?.kind !== "refuse") return;
    // Not "no wrapper is registered", which is true of the system and false
    // about the person reading it.
    expect(d.detail).toContain("do not hold this stock");
  });

  it("refuses a sell with no wallet rather than reading somebody else's balances", async () => {
    const { market, asked } = deps();
    const d = await priceOrder(market, { ticker: "NVDA", side: "sell", amount: "500" });
    expect(d?.kind).toBe("refuse");
    expect(asked).toEqual([]);
  });

  it("sells the whole balance on max, ignoring the amount entirely", async () => {
    const { market, asked } = deps({ balances: [held("Xsc9", "0.12345678", 8)] });
    await priceOrder(market, { ticker: "NVDA", side: "sell", amount: "1", max: true, owner: WALLET });
    expect(asked[0]?.amount).toBe("0.12345678");
  });
});

describe("priceOrder, buying", () => {
  it("still quotes every wrapper, held or not", async () => {
    const { market, asked } = deps({ balances: [] });
    await priceOrder(market, { ticker: "NVDA", side: "buy", amount: "100" });
    expect(asked.map((a) => a.mint).sort()).toEqual(["Ondo", "Xsc9"]);
  });

  it("still quotes the dollar amount, untouched", async () => {
    const { market, asked } = deps();
    await priceOrder(market, { ticker: "NVDA", side: "buy", amount: "100" });
    expect(asked.every((a) => a.amount === "100")).toBe(true);
  });

  it("never reads balances for a buy, because nothing about a buy depends on them", async () => {
    let reads = 0;
    const { market } = deps();
    const spied = {
      ...market,
      chain: {
        tokenBalances: async () => {
          reads += 1;
          return [];
        },
      },
    } as unknown as Deps;
    await priceOrder(spied, { ticker: "NVDA", side: "buy", amount: "100" });
    expect(reads).toBe(0);
  });
});

describe("priceOrder, with an issuer picked", () => {
  it("quotes only that issuer's token on a buy", async () => {
    const { market, asked } = deps();
    const d = await priceOrder(market, { ticker: "NVDA", side: "buy", amount: "50", issuer: "ondo" });
    expect(asked.map((a) => a.mint)).toEqual(["Ondo"]);
    expect(d?.kind === "execute" ? d.best.issuer : null).toBe("ondo");
  });

  it("sells only from that issuer's token", async () => {
    const { market, asked } = deps();
    const d = await priceOrder(market, {
      ticker: "NVDA",
      side: "sell",
      amount: "500",
      owner: WALLET,
      issuer: "backed",
    });
    expect(asked.map((a) => a.mint)).toEqual(["Xsc9"]);
    expect(d?.kind === "execute" ? d.best.mint : null).toBe("Xsc9");
  });

  it("quotes every token when nothing was picked", async () => {
    const { market, asked } = deps();
    await priceOrder(market, { ticker: "NVDA", side: "buy", amount: "50" });
    expect(asked.map((a) => a.mint).sort()).toEqual(["Ondo", "Xsc9"]);
  });
});
