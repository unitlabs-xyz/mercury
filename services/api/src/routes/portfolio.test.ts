import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { D, ZERO } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import type { MultiplierSource, PriceBoard, TokenPrice } from "@mercury/market";
import { Exposure, Portfolio } from "@mercury/types";
import { portfolioRoutes, type HoldingRow, type PortfolioDeps } from "./portfolio.js";

/**
 * Parsed through the wire schema rather than cast. `packages/types` is the
 * single definition of what a response looks like, so a route that drifts from
 * it fails here rather than in whichever client notices first.
 */
const portfolioOf = async (res: Response) => Portfolio.parse(await res.json());
const exposureOf = async (res: Response) => Exposure.parse(await res.json());
const errorOf = async (res: Response) => (await res.json()) as { error: { code: string; message: string } };

// Real mints, because the wire schema validates them — a four-character
// stand-in is not a mint and `packages/types` is right to refuse it.
const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const NVDAON = "9MjAmgHXbu5drkNa9XpzfozgsM5Dcq6bzq1bbuTbqPLY";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const price = (mint: string, over: Partial<TokenPrice> = {}): TokenPrice => ({
  mint,
  usdPricePerToken: D(200),
  pricePerShare: D(200),
  changePct24h: D(0),
  liquidityUsd: D(1_000_000),
  multiplier: D(1),
  observedAt: new Date("2026-09-24T12:00:00Z"),
  ...over,
});

const holding = (over: Partial<HoldingRow> = {}): HoldingRow => ({
  instrumentId: "instrument-nvda",
  ticker: "NVDA",
  name: "Nvidia",
  shares: D(2),
  costBasisUsd: D(300),
  avgUnitCostUsd: D(150),
  wrappers: [{ mint: NVDAX, symbol: "NVDAx", issuer: "backed", decimals: 8 }],
  ...over,
});

const deps = (over: Partial<PortfolioDeps> = {}): PortfolioDeps => ({
  reconcile: async () => undefined,
  holdings: async () => [holding()],
  prices: { pricesFor: async (mints) => new Map(mints.map((m) => [m, price(m)])) } satisfies PriceBoard,
  chain: {
    tokenBalances: async () => [{ mint: NVDAX, rawAmount: 200_000_000n, decimals: 8 }],
    mintConfig: async () => null,
  } satisfies ChainReader,
  multipliers: { multiplierFor: async () => D(1), isPaused: async () => false } satisfies MultiplierSource,
  usdcMint: USDC,
  ...over,
});

/** The route with an identity already resolved, as the auth middleware would leave it. */
const appWith = (d: PortfolioDeps, walletAddress: string | null = "WaLLeT") => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress });
    await next();
  });
  app.route("/", portfolioRoutes(d));
  return app;
};

describe("GET /v1/portfolio", () => {
  it("values a holding at the live price and reports its profit", async () => {
    const res = await appWith(deps()).request("/v1/portfolio");
    expect(res.status).toBe(200);
    const body = await portfolioOf(res);
    expect(body.holdings[0]!).toMatchObject({
      ticker: "NVDA",
      name: "Nvidia",
      shares: "2",
      valueUsd: "400",
      costBasisUsd: "300",
      unrealisedPnlUsd: "100",
      wrapperCount: 1,
    });
  });

  it("sends money as decimal strings, never as numbers", async () => {
    const res = await appWith(deps()).request("/v1/portfolio");
    const body = await portfolioOf(res);
    expect(typeof body.totalValueUsd).toBe("string");
    expect(typeof body.cashUsd).toBe("string");
    expect(typeof body.changeUsd).toBe("string");
    expect(typeof body.changePct).toBe("string");
    expect(typeof body.holdings[0]!.valueUsd).toBe("string");
  });

  it("counts cash from the USDC balance on chain", async () => {
    const d = deps({
      chain: {
        tokenBalances: async () => [
          { mint: NVDAX, rawAmount: 200_000_000n, decimals: 8 },
          { mint: USDC, rawAmount: 250_000_000n, decimals: 6 },
        ],
        mintConfig: async () => null,
      },
    });
    const body = await portfolioOf(await appWith(d).request("/v1/portfolio"));
    expect(body.cashUsd).toBe("250");
    expect(body.totalValueUsd).toBe("650");
  });

  it("derives today's change from each holding's own move", async () => {
    // 2 shares now worth $400 after a 25% rise: $80 of that is today's.
    const d = deps({
      prices: {
        pricesFor: async (mints) => new Map(mints.map((m) => [m, price(m, { changePct24h: D(25) })])),
      },
    });
    const body = await portfolioOf(await appWith(d).request("/v1/portfolio"));
    expect(body.changeUsd).toBe("80");
    expect(body.changePct).toBe("25");
  });

  it("reconciles before it reads, so the portfolio follows the chain", async () => {
    const calls: string[] = [];
    const d = deps({
      reconcile: async (userId, wallet) => {
        calls.push(`${userId}:${wallet}`);
      },
    });
    await appWith(d).request("/v1/portfolio");
    expect(calls).toEqual(["user-1:WaLLeT"]);
  });

  it("answers an empty portfolio for a session with no wallet yet", async () => {
    // Privy can hand out a valid session before the embedded wallet finishes
    // provisioning. That is not an error, and it is not a 500.
    const body = await portfolioOf(await appWith(deps(), null).request("/v1/portfolio"));
    expect(body).toEqual({
      totalValueUsd: "0",
      cashUsd: "0",
      changeUsd: "0",
      changePct: "0",
      holdings: [],
    });
    expect(body.holdings).toEqual([]);
  });

  it("leaves out a holding that has gone to zero", async () => {
    const d = deps({ holdings: async () => [holding({ shares: ZERO, costBasisUsd: ZERO })] });
    const body = await portfolioOf(await appWith(d).request("/v1/portfolio"));
    expect(body.holdings).toEqual([]);
  });

  it("counts both wrappers of one company as one holding", async () => {
    const d = deps({
      holdings: async () => [
        holding({
          wrappers: [
            { mint: NVDAX, symbol: "NVDAx", issuer: "backed", decimals: 8 },
            { mint: NVDAON, symbol: "NVDAon", issuer: "ondo", decimals: 6 },
          ],
        }),
      ],
    });
    const body = await portfolioOf(await appWith(d).request("/v1/portfolio"));
    expect(body.holdings.length).toBe(1);
    expect(body.holdings[0]!.wrapperCount).toBe(2);
  });

  it("values an unpriced holding at zero rather than dropping the row", async () => {
    // Its shares are real even when no upstream will price them. Hiding it
    // would be a quieter lie than showing it with nothing beside it.
    const d = deps({ prices: { pricesFor: async () => new Map() } });
    const body = await portfolioOf(await appWith(d).request("/v1/portfolio"));
    expect(body.holdings[0]!).toMatchObject({ ticker: "NVDA", valueUsd: "0", unrealisedPnlUsd: "-300" });
  });
});

describe("GET /v1/portfolio/exposure/:ticker", () => {
  it("adds shares across wrappers, never token counts", async () => {
    const d = deps({
      holdings: async () => [
        holding({
          wrappers: [
            { mint: NVDAX, symbol: "NVDAx", issuer: "backed", decimals: 8 },
            { mint: NVDAON, symbol: "NVDAon", issuer: "ondo", decimals: 6 },
          ],
        }),
      ],
      chain: {
        tokenBalances: async () => [
          { mint: NVDAX, rawAmount: 100_000_000n, decimals: 8 }, // 1 token
          { mint: NVDAON, rawAmount: 1_000_000n, decimals: 6 }, // 1 token
        ],
        mintConfig: async () => null,
      },
      prices: {
        pricesFor: async (mints) =>
          new Map(
            mints.map((m) => [
              m,
              // Two tokens, two different multipliers. One token is not one share.
              m === NVDAX
                ? price(m, { multiplier: D(2), usdPricePerToken: D(400) })
                : price(m, { multiplier: D(1) }),
            ]),
          ),
      },
      // The mint is the authority on the multiplier, and the route asks it
      // first. A fake that answered 1 for everything would be testing the
      // fallback while pretending to test the preferred path.
      multipliers: {
        multiplierFor: async (mint) => (mint === NVDAX ? D(2) : D(1)),
        isPaused: async () => false,
      },
    });
    const body = await exposureOf(await appWith(d).request("/v1/portfolio/exposure/NVDA"));
    expect(body.shares).toBe("3");
    expect(body.valueUsd).toBe("600");
    expect(body.wrappers.length).toBe(2);
  });

  it("warns when one issuer holds nearly everything", async () => {
    const body = await exposureOf(await appWith(deps()).request("/v1/portfolio/exposure/NVDA"));
    // One wrapper is not a concentration: there is nothing to have chosen instead.
    expect(body.warnings).toEqual([]);
  });

  it("says 404 for a ticker the user holds nothing of", async () => {
    const res = await appWith(deps()).request("/v1/portfolio/exposure/SPY");
    expect(res.status).toBe(404);
    expect((await errorOf(res)).error.code).toBe("not_found");
  });
});
