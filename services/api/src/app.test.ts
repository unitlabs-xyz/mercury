import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { USDC_MINT, type TokenBalance } from "@mercury/chain";
import { createApp } from "./app.js";
import { testDb } from "./db/testing.js";
import { memoryOrderStore } from "./orders/memory.js";
import { inMemoryBuilds } from "./relay/builds.js";
import type { AuthDeps } from "./auth/middleware.js";
import type { Deps, ReadDeps } from "./deps.js";

const WALLET = "8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6";
const SOL = "So11111111111111111111111111111111111111112";
const XSC9 = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

/** A dollar a share, so the dollars and the shares in a test are told apart by size. */
const FAIR = 100;

const held = (mint: string, whole: string, decimals: number): TokenBalance => ({
  mint,
  rawAmount: BigInt(D(whole).mul(D(10).pow(decimals)).toFixed(0)),
  decimals,
});

/**
 * The whole app, over a real in-process Postgres, with every adapter answering
 * from a literal — and recording what it was asked. The recordings are the
 * point: which mint the fee was quoted against, and how many times the order
 * was priced, are the two things that differ by side and the two that nothing
 * below the route can observe.
 */
const harness = async (over: { balances?: TokenBalance[]; sponsored?: boolean } = {}) => {
  const db = await testDb();
  const priced: string[] = [];

  const market = {
    registry: {
      wrappersFor: async () => [{ mint: XSC9, symbol: "NVDAx", issuer: "backed", decimals: 8 }],
      byMint: async () => null,
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
      multiplierFor: async () => D(1),
      multipliersFor: async (mints: readonly string[]) => new Map(mints.map((m) => [m, D(1)])),
      isPaused: async () => false,
    },
    quotes: {
      quote: async (req: { side: string; amount: { toFixed(): string } }) => {
        priced.push(req.side);
        const amount = D(req.amount.toFixed());
        return {
          inAmount: amount,
          outAmount: req.side === "buy" ? amount.div(FAIR) : amount.mul(FAIR),
          minOutAmount: (req.side === "buy" ? amount.div(FAIR) : amount.mul(FAIR)).mul(D("0.995")),
          priceImpact: D("0.0001"),
          routeLabels: ["Raydium"],
          quoteId: "q:1",
          expiresAt: new Date(Date.now() + 20_000),
          raw: {},
        };
      },
    },
    chain: {
      tokenBalances: async (_owner: string) => over.balances ?? [held(XSC9, "10", 8)],
    },
    prices: {
      pricesFor: async () =>
        new Map([
          [
            SOL,
            {
              mint: SOL,
              usdPricePerToken: D("119.39"),
              pricePerShare: null,
              changePct24h: null,
              liquidityUsd: D(0),
              multiplier: D(1),
              observedAt: new Date(),
            },
          ],
        ]),
    },
  } as unknown as Deps;

  const read = {
    orders: memoryOrderStore(),
    send: {
      rpcUrl: "http://localhost:8899",
      ...(over.sponsored === false
        ? {}
        : {
            relay: {
              signer: {
                address: "AkZjMBy3SAfbend3qq22aMh9nsAehS7a8HXk15VxGJmJ",
                cosign: async (b: string) => b,
              },
              builds: inMemoryBuilds(),
            },
          }),
    },
    instruments: {},
    portfolio: {},
    money: {},
    activity: {},
    fills: {},
    borrow: {},
  } as unknown as ReadDeps;

  const auth = {
    db,
    verifier: { verify: async () => ({ privyUserId: "did:privy:1" }) },
    directory: { read: async () => ({ privyUserId: "did:privy:1", solanaAddress: WALLET }) },
  } as unknown as AuthDeps;

  const app = createApp(() => market, auth, read);
  const headers = {
    authorization: "Bearer access",
    "x-privy-identity-token": "identity",
    "content-type": "application/json",
  };
  const post = (path: string, body: unknown) =>
    app.request(path, { method: "POST", headers, body: JSON.stringify(body) });
  const get = (path: string) => app.request(path, { headers });

  return { post, get, priced };
};

describe("POST /v1/quote, selling", () => {
  it("reports proceeds rather than investable", async () => {
    const { post } = await harness();
    const res = await post("/v1/quote", { ticker: "NVDA", side: "sell", amount: "500" });
    const body = (await res.json()) as { investable: string | null; proceeds: string | null };
    expect(body.investable).toBeNull();
    expect(body.proceeds).not.toBeNull();
  });

  it("takes the fee out of the proceeds, not out of the shares", async () => {
    const { post } = await harness();
    const res = await post("/v1/quote", { ticker: "NVDA", side: "sell", amount: "500" });
    const body = (await res.json()) as { proceeds: string; fee: { usdc: string } };
    // Five shares at $100 gross; what lands is that less the charge.
    expect(D(body.proceeds).add(D(body.fee.usdc)).toFixed(2)).toBe("500.00");
  });

  /*
   * The fee's own value is the tell, and the only one visible from outside.
   * These balances hold the stock and no USDC, so rent is owed on the USDC
   * account and the charge is $0.25. Had the fee been quoted against the stock
   * — which is held — it would have come back $0.01, the signature alone.
   */
  it("quotes the fee against USDC, which the seller may have no account for", async () => {
    const { post } = await harness();
    const res = await post("/v1/quote", { ticker: "NVDA", side: "sell", amount: "500" });
    const body = (await res.json()) as { fee: { usdc: string } };
    expect(body.fee.usdc).toBe("0.25");
  });

  it("charges only the signature once that USDC account exists", async () => {
    const { post } = await harness({ balances: [held(XSC9, "10", 8), held(USDC_MINT, "1", 6)] });
    const res = await post("/v1/quote", { ticker: "NVDA", side: "sell", amount: "500" });
    const body = (await res.json()) as { fee: { usdc: string } };
    expect(body.fee.usdc).toBe("0.01");
  });

  it("prices once, where a buy prices twice", async () => {
    const { post, priced } = await harness();
    await post("/v1/quote", { ticker: "NVDA", side: "sell", amount: "500" });
    expect(priced).toEqual(["sell"]);
  });

  it("refuses a sell from a wallet holding none of the stock", async () => {
    const { post } = await harness({ balances: [] });
    const res = await post("/v1/quote", { ticker: "NVDA", side: "sell", amount: "500" });
    const body = (await res.json()) as { decision: { kind: string; detail?: string } };
    expect(body.decision.kind).toBe("refuse");
    expect(body.decision.detail).toContain("do not hold this stock");
  });
});

describe("POST /v1/quote, buying", () => {
  it("still reports investable, and no proceeds", async () => {
    const { post } = await harness();
    const res = await post("/v1/quote", { ticker: "NVDA", side: "buy", amount: "500" });
    const body = (await res.json()) as { investable: string | null; proceeds: string | null };
    expect(body.investable).not.toBeNull();
    expect(body.proceeds).toBeNull();
  });

  it("still prices twice, to quote the swap for what is left after the charge", async () => {
    const { post, priced } = await harness();
    await post("/v1/quote", { ticker: "NVDA", side: "buy", amount: "500" });
    expect(priced).toEqual(["buy", "buy"]);
  });
});

describe("POST /v1/orders", () => {
  const create = async (body: unknown) => {
    const h = await harness();
    const { orderId } = (await (await h.post("/v1/orders", body)).json()) as { orderId: string };
    return (await (await h.get(`/v1/orders/${orderId}`)).json()) as {
      max: boolean;
      usdAmount: string;
    };
  };

  /*
   * Execute re-prices from the row. A max sell whose row forgot it was one
   * would re-quote in dollars and leave behind exactly the dust that max
   * exists to sweep.
   */
  it("keeps max on the row", async () => {
    expect((await create({ ticker: "NVDA", side: "sell", amount: "500", max: true })).max).toBe(true);
  });

  it("defaults max to false when it is not asked for", async () => {
    expect((await create({ ticker: "NVDA", side: "sell", amount: "500" })).max).toBe(false);
  });

  /* In dollars, not the shares the decision reports, for the same reason. */
  it("keeps the dollars that were asked for", async () => {
    expect((await create({ ticker: "NVDA", side: "sell", amount: "500" })).usdAmount).toBe("500");
  });
});

describe("GET /f/:slug", () => {
  /*
   * The waitlist is gone, but its share links are still in people's posts on
   * X. Each one sends a reader on to the site rather than to an error page.
   */
  it("sends a founding card's old share link on to the site", async () => {
    const { get } = await harness();
    const res = await get("/f/3kQ9xZ1bTq7w");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://trymercury.xyz");
  });
});
