import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { D, ZERO } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import type { MultiplierSource, PriceBoard, TokenPrice } from "@mercury/market";
import { Exposure, Portfolio, PortfolioHistory } from "@mercury/types";
import { portfolioRoutes, type HoldingRow, type PortfolioDeps } from "./portfolio.js";

/**
 * Parsed through the wire schema rather than cast. `packages/types` is the
 * single definition of what a response looks like, so a route that drifts from
 * it fails here rather than in whichever client notices first.
 */
const portfolioOf = async (res: Response) => Portfolio.parse(await res.json());
const exposureOf = async (res: Response) => Exposure.parse(await res.json());
const historyOf = async (res: Response) => PortfolioHistory.parse(await res.json());
const errorOf = async (res: Response) => (await res.json()) as { error: { code: string; message: string } };

// Real mints, because the wire schema validates them — a four-character
// stand-in is not a mint and `packages/types` is right to refuse it.
const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const NVDAON = "9MjAmgHXbu5drkNa9XpzfozgsM5Dcq6bzq1bbuTbqPLY";
const TSLAON = "KeGv7bsfR4MheC1CkmnAVceoApjrkvBhHYjWb67ondo";
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
  sharesWithBasis: D(2),
  costBasisUsd: D(300),
  avgUnitCostUsd: D(150),
  wrappers: [{ mint: NVDAX, symbol: "NVDAx", issuer: "backed", decimals: 8 }],
  ...over,
});

const deps = (over: Partial<PortfolioDeps> = {}): PortfolioDeps => ({
  holdings: async () => [holding()],
  prices: { pricesFor: async (mints) => new Map(mints.map((m) => [m, price(m)])) } satisfies PriceBoard,
  chain: {
    tokenBalances: async () => [{ mint: NVDAX, rawAmount: 200_000_000n, decimals: 8 }],
    mintConfig: async () => null,
  } satisfies ChainReader,
  multipliers: { multiplierFor: async () => D(1), isPaused: async () => false } satisfies MultiplierSource,
  usdcMint: USDC,
  pledged: async () => [],
  debt: async () => ZERO,
  lastKnownDebt: async () => null,
  snapshots: async () => [],
  baskets: async () => ({ totalUsd: ZERO, baskets: [], fetchedAt: null }),
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
  it("reports how many of a holding's shares are pledged to Kamino", async () => {
    // Two shares held in total, one of them pledged: still owned, still in the position.
    const d = deps({ pledged: async () => [{ mint: NVDAX, rawAmount: 100_000_000n, decimals: 8 }] });
    const body = await portfolioOf(await appWith(d).request("/v1/portfolio"));
    expect(body.holdings[0]).toMatchObject({ shares: "2", pledgedShares: "1" });
  });

  it("answers from the stored books alone, writing nothing", async () => {
    // The route has no way to write: reconciliation belongs to `position-sync`,
    // on its own clock. Two identical reads therefore cannot produce two
    // different sets of books, which is the whole reason it moved.
    const a = await portfolioOf(await appWith(deps()).request("/v1/portfolio"));
    const b = await portfolioOf(await appWith(deps()).request("/v1/portfolio"));
    expect(a).toEqual(b);
    expect(a.holdings[0]!.shares).toBe("2");
  });

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

  it("counts owned basket value without making its USDC wallet cash or a sellable holding", async () => {
    const d = deps({
      baskets: async () => ({
        totalUsd: D("35"),
        fetchedAt: new Date(),
        baskets: [
          {
            portfolioId: "portfolio-1",
            slug: "nvda-tsla-50-50",
            name: "AI & EV Leaders",
            valueUsd: "35",
            inTransitUsd: "1",
            fetchedAt: new Date().toISOString(),
            holdings: [
              {
                assetId: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:${USDC}`,
                symbol: "USDC",
                ticker: null,
                balance: "1",
                valueUsd: "1",
              },
            ],
          },
        ],
      }),
    });
    const body = await portfolioOf(await appWith(d).request("/v1/portfolio"));
    expect(body.totalValueUsd).toBe("435");
    expect(body.basketUsd).toBe("35");
    expect(body.cashUsd).toBe("0");
    expect(body.holdings).toHaveLength(1);
    expect(body.baskets[0]?.holdings[0]?.symbol).toBe("USDC");
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

  it("includes basket-only and overlapping stocks in the daily move without counting basket cash", async () => {
    const requested: string[][] = [];
    const d = deps({
      prices: {
        pricesFor: async (mints) => {
          requested.push([...mints]);
          const pct = new Map([
            [NVDAX, D(25)],
            [NVDAON, D(10)],
            [TSLAON, D(-20)],
          ]);
          return new Map(mints.map((mint) => [mint, price(mint, { changePct24h: pct.get(mint) ?? D(0) })]));
        },
      },
      baskets: async () => ({
        totalUsd: D(90),
        fetchedAt: new Date(),
        baskets: [
          {
            portfolioId: "portfolio-1",
            slug: "pilot",
            name: "Pilot",
            valueUsd: "90",
            inTransitUsd: "0",
            fetchedAt: new Date().toISOString(),
            holdings: [
              {
                assetId: `solana:mainnet/spl:${NVDAON}`,
                symbol: "NVDAon",
                ticker: "NVDA",
                balance: "1",
                valueUsd: "50",
              },
              {
                assetId: `solana:mainnet/spl:${TSLAON}`,
                symbol: "TSLAon",
                ticker: "TSLA",
                balance: "1",
                valueUsd: "30",
              },
              {
                assetId: `solana:mainnet/spl:${USDC}`,
                symbol: "USDC",
                ticker: null,
                balance: "10",
                valueUsd: "10",
              },
            ],
          },
        ],
      }),
    });
    const body = await portfolioOf(await appWith(d).request("/v1/portfolio"));
    const move = 80 + (50 * 10) / 110 - (30 * 20) / 80;
    expect(Number(body.changeUsd)).toBeCloseTo(move);
    expect(Number(body.changePct)).toBeCloseTo((move / (480 - move)) * 100);
    expect(body.holdings.map((item) => item.ticker)).toEqual(["NVDA"]);
    const basketMove = (50 * 10) / 110 - (30 * 20) / 80;
    expect(Number(body.baskets[0]?.changePct24h)).toBeCloseTo((basketMove / (90 - basketMove)) * 100);
    expect(requested[0]).toEqual([NVDAX, NVDAON, TSLAON]);
  });

  it("reports profit only on the shares it has a cost for", async () => {
    // Five shares held, a lot covering two of them. Treating the other three
    // as free would report their whole value as profit; the honest figure is
    // measured over what we can prove was paid for.
    const d = deps({
      holdings: async () => [holding({ shares: D(5), sharesWithBasis: D(2), costBasisUsd: D(300) })],
    });
    const body = await portfolioOf(await appWith(d).request("/v1/portfolio"));
    expect(body.holdings[0]!.valueUsd).toBe("1000"); // 5 shares at $200
    expect(body.holdings[0]!.unrealisedPnlUsd).toBe("100"); // 2 x $200 - $300
  });

  it("says how many of the shares a cost is known for", async () => {
    const d = deps({
      holdings: async () => [holding({ shares: D(5), sharesWithBasis: D(2) })],
    });
    const res = await appWith(d).request("/v1/portfolio");
    const body = (await res.json()) as { holdings: { sharesWithBasis: string }[] };
    expect(body.holdings[0]!.sharesWithBasis).toBe("2");
  });

  it("answers an empty portfolio for a session with no wallet yet", async () => {
    // Privy can hand out a valid session before the embedded wallet finishes
    // provisioning. That is not an error, and it is not a 500.
    const body = await portfolioOf(await appWith(deps(), null).request("/v1/portfolio"));
    expect(body).toEqual({
      totalValueUsd: "0",
      cashUsd: "0",
      basketUsd: "0",
      debtUsd: "0",
      debtIsStale: false,
      changeUsd: "0",
      changePct: "0",
      holdings: [],
      baskets: [],
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

it("reads basket returns independently of the portfolio valuation", async () => {
  const app = appWith(
    deps({
      baskets: async () => {
        throw new Error("valuation must not run");
      },
      basketReturns: async () => [{ portfolioId: "portfolio-1", percentChange: "2.5" }],
    }),
  );
  expect(await (await app.request("/v1/portfolio/basket-returns")).json()).toEqual({
    returns: [{ portfolioId: "portfolio-1", percentChange: "2.5" }],
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

/**
 * `h` hours before now, worth `value`.
 *
 * Anchored to the real clock, not to a fixed instant. The route builds its
 * window from `new Date()` — that is the behaviour under test — so readings
 * written at a hard-coded date fall out of a one-day range as soon as the wall
 * clock passes them. This was a fixed 2026-09-30 and returned nothing three
 * days later. Its twin in `portfolio/history.roundtrip.test.ts` had the same
 * bug and the same fix.
 */
const NOW = new Date();
const reading = (h: number, value: string) => ({
  at: new Date(NOW.getTime() - h * 3_600_000),
  totalUsd: D(value),
});

describe("GET /v1/portfolio/history", () => {
  it("draws the readings it has, oldest first", async () => {
    const d = deps({ snapshots: async () => [reading(2, "100"), reading(1, "110")] });
    const body = await historyOf(await appWith(d).request("/v1/portfolio/history?range=1D"));
    expect(body.range).toBe("1D");
    expect(body.points.map((p) => p.valueUsd)).toEqual(["100", "110"]);
  });

  it("defaults to a day when no range is asked for", async () => {
    const d = deps({ snapshots: async () => [reading(2, "100"), reading(1, "110")] });
    const body = await historyOf(await appWith(d).request("/v1/portfolio/history"));
    expect(body.range).toBe("1D");
  });

  it("refuses a range it does not draw rather than quietly picking one", async () => {
    const res = await appWith(deps()).request("/v1/portfolio/history?range=5Y");
    expect(res.status).toBe(400);
    expect((await errorOf(res)).error.code).toBe("bad_range");
  });

  it("holds back a single reading, because one point is a dot and not a line", async () => {
    const d = deps({ snapshots: async () => [reading(1, "100")] });
    const body = await historyOf(await appWith(d).request("/v1/portfolio/history?range=1D"));
    expect(body.points).toEqual([]);
  });

  it("is empty for an account with no readings yet", async () => {
    const body = await historyOf(await appWith(deps()).request("/v1/portfolio/history?range=1M"));
    expect(body.points).toEqual([]);
  });

  it("is empty before the wallet exists, which is not an error", async () => {
    const res = await appWith(deps(), null).request("/v1/portfolio/history?range=1D");
    expect(res.status).toBe(200);
    expect((await historyOf(res)).points).toEqual([]);
  });

  it("asks the store only for the window the range covers", async () => {
    const since: Date[] = [];
    const d = deps({
      snapshots: async (_userId: string, from: Date) => {
        since.push(from);
        return [];
      },
    });
    await appWith(d).request("/v1/portfolio/history?range=1W");
    // A week back, give or take the moment the request was served.
    const hoursBack = (Date.now() - since[0]!.getTime()) / 3_600_000;
    expect(hoursBack).toBeGreaterThan(167);
    expect(hoursBack).toBeLessThan(169);
  });
});

/**
 * Debt, and the difference between owing nothing and not knowing.
 *
 * The fallback matters because the moment Kamino is unreadable is the moment
 * nobody is watching a loan. Reporting zero then would tell a borrower they are
 * solvent and have room to borrow more.
 */
describe("GET /v1/portfolio, against a loan", () => {
  it("nets the loan out of the headline, and leaves the holdings gross", async () => {
    const body = await portfolioOf(
      await appWith(deps({ debt: async () => D("300") })).request("/v1/portfolio"),
    );
    // $400 of stock and no cash, less $300 owed, is $100 of net worth.
    expect(body.holdings[0]!.valueUsd).toBe("400");
    expect(body.cashUsd).toBe("0");
    expect(body.debtUsd).toBe("300");
    expect(body.totalValueUsd).toBe("100");
    expect(body.debtIsStale).toBe(false);
  });

  it("serves the last recorded figure when Kamino cannot be read, and says so", async () => {
    const body = await portfolioOf(
      await appWith(deps({ debt: async () => null, lastKnownDebt: async () => D("450") })).request(
        "/v1/portfolio",
      ),
    );
    expect(body.debtUsd).toBe("450");
    expect(body.debtIsStale).toBe(true);
  });

  it("never turns an unreadable loan into no loan", async () => {
    const stale = await portfolioOf(
      await appWith(deps({ debt: async () => null, lastKnownDebt: async () => D("450") })).request(
        "/v1/portfolio",
      ),
    );
    const zero = await portfolioOf(await appWith(deps({ debt: async () => ZERO })).request("/v1/portfolio"));
    expect(Number(stale.totalValueUsd)).toBeLessThan(Number(zero.totalValueUsd));
  });

  it("falls back to zero only for an account with nothing recorded, which has no loan to hide", async () => {
    const body = await portfolioOf(
      await appWith(deps({ debt: async () => null, lastKnownDebt: async () => null })).request(
        "/v1/portfolio",
      ),
    );
    expect(body.debtUsd).toBe("0");
    expect(body.debtIsStale).toBe(true);
  });

  it("reports no loan as no loan, not as stale", async () => {
    const body = await portfolioOf(await appWith(deps()).request("/v1/portfolio"));
    expect(body.debtUsd).toBe("0");
    expect(body.debtIsStale).toBe(false);
  });
});
