import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { D, ZERO } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import type { MultiplierSource, PriceBoard, TokenPrice } from "@mercury/market";
import { Exposure, Portfolio, PortfolioHistory, PortfolioSummary } from "@mercury/types";
import { portfolioRoutes, type HoldingRow, type PortfolioDeps } from "./portfolio.js";
import type { Acting } from "../wallets/acting.js";
import { actingAs, actingLinked } from "../wallets/testing.js";

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
  // Filled at the quote and free, unless a test says otherwise, so a stacked
  // return is all market move and no cost of trading.
  referenceBasisUsd: over.costBasisUsd ?? D(300),
  feeUsd: ZERO,
  avgUnitCostUsd: D(150),
  estimatedCostUsd: ZERO,
  estimateSource: null,
  wrappers: [{ mint: NVDAX, symbol: "NVDAx", issuer: "backed", decimals: 8 }],
  ...over,
});

/** One Glider basket worth `valueUsd`, holding nothing the price board must answer for. */
const basket = (valueUsd: string) => ({
  portfolioId: "portfolio-1",
  slug: "nvda-tsla-50-50",
  name: "AI & EV Leaders",
  valueUsd,
  inTransitUsd: "0",
  fetchedAt: new Date().toISOString(),
  holdings: [],
});

const deps = (over: Partial<PortfolioDeps> = {}): PortfolioDeps => ({
  walletHoldings: async () => [holding()],
  prices: { pricesFor: async (mints) => new Map(mints.map((m) => [m, price(m)])) } satisfies PriceBoard,
  chain: {
    tokenBalances: async () => [{ mint: NVDAX, rawAmount: 200_000_000n, decimals: 8 }],
    mintConfig: async () => null,
  } satisfies ChainReader,
  multipliers: {
    multiplierFor: async () => D(1),
    multipliersFor: async (mints) => new Map(mints.map((m) => [m, D(1)])),
    isPaused: async () => false,
  } satisfies MultiplierSource,
  usdcMint: USDC,
  pledged: async () => [],
  debt: async () => ZERO,
  lastKnownDebt: async () => null,
  lastKnownEarn: async () => null,
  snapshots: async () => [],
  baskets: async () => ({ totalUsd: ZERO, baskets: [], fetchedAt: null }),
  ...over,
});

/**
 * The route with an identity and a wallet already resolved, as the auth and
 * acting-wallet middleware would leave them: the Mercury wallet unless `acting` says otherwise.
 */
const appWith = (d: PortfolioDeps, walletAddress: string | null = "WaLLeT", acting?: Acting) => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress });
    c.set(
      "acting",
      acting ?? { all: false, wallets: walletAddress === null ? [] : [actingAs(walletAddress)] },
    );
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
      walletHoldings: async () => [holding({ shares: D(5), sharesWithBasis: D(2), costBasisUsd: D(300) })],
    });
    const body = await portfolioOf(await appWith(d).request("/v1/portfolio"));
    expect(body.holdings[0]!.valueUsd).toBe("1000"); // 5 shares at $200
    expect(body.holdings[0]!.unrealisedPnlUsd).toBe("100"); // 2 x $200 - $300
  });

  it("splits a return into what the stock did and what the trade cost", async () => {
    // 2 shares bought for $300 when they were quoted at $296, $0.46 of fee,
    // now worth $400. The old single figure said +$99.54 and gave no way to
    // see that $4.46 of the move was never the stock.
    const d = deps({
      walletHoldings: async () => [
        holding({ costBasisUsd: D(300), referenceBasisUsd: D(296), feeUsd: D("0.46") }),
      ],
    });
    const body = await portfolioOf(await appWith(d).request("/v1/portfolio"));
    expect(body.holdings[0]!).toMatchObject({
      marketPnlUsd: "104", // 2 x $200 against $296 quoted
      tradingCostUsd: "4.46", // $4 of premium and spread, plus $0.46 of fee
      unrealisedPnlUsd: "99.54",
    });
  });

  it("reports no market move on a stock sitting where it was bought", async () => {
    // The symptom this exists to fix: a position whose stock has not moved at
    // all used to report the fee and the premium as a loss.
    const d = deps({
      walletHoldings: async () => [
        holding({ costBasisUsd: D("400.46"), referenceBasisUsd: D(400), feeUsd: D("0.46") }),
      ],
    });
    const body = await portfolioOf(await appWith(d).request("/v1/portfolio"));
    expect(body.holdings[0]!).toMatchObject({
      marketPnlUsd: "0",
      tradingCostUsd: "0.92",
      unrealisedPnlUsd: "-0.92",
    });
  });

  it("keeps the two lines summing to the dollars, so the split hides nothing", async () => {
    const d = deps({
      walletHoldings: async () => [
        holding({ costBasisUsd: D(300), referenceBasisUsd: D(296), feeUsd: D("0.46") }),
      ],
    });
    const h = (await portfolioOf(await appWith(d).request("/v1/portfolio"))).holdings[0]!;
    expect(D(h.marketPnlUsd!).sub(D(h.tradingCostUsd!)).toFixed()).toBe(h.unrealisedPnlUsd);
  });

  it("gives a basket a cost basis from the cash that went into it", async () => {
    // Without this a basket contributes value to net worth and no cost at all,
    // so an account with $500 in baskets and $20 in one stock reported a P&L
    // that was about the $20.
    const d = deps({
      baskets: async () => ({
        totalUsd: D("542.10"),
        fetchedAt: new Date(),
        baskets: [basket("542.10")],
      }),
      basketMovements: async () => ({
        movements: [{ portfolioId: "portfolio-1", amountUsd: D(500), inward: true }],
        inKindExits: [],
      }),
    });
    const body = await portfolioOf(await appWith(d).request("/v1/portfolio"));
    expect(body.baskets[0]!).toMatchObject({
      costBasisUsd: "500",
      pnlUsd: "42.1",
      returnPct: "8.42",
      basisIsComplete: true,
    });
  });

  it("takes money that came back out of a basket off its basis", async () => {
    const d = deps({
      baskets: async () => ({ totalUsd: D("330"), fetchedAt: new Date(), baskets: [basket("330")] }),
      basketMovements: async () => ({
        movements: [
          { portfolioId: "portfolio-1", amountUsd: D(500), inward: true },
          { portfolioId: "portfolio-1", amountUsd: D(200), inward: false },
        ],
        inKindExits: [],
      }),
    });
    const body = await portfolioOf(await appWith(d).request("/v1/portfolio"));
    expect(body.baskets[0]!).toMatchObject({ costBasisUsd: "300", pnlUsd: "30" });
  });

  it("says a basis is incomplete when something left the basket in kind", async () => {
    // Tokens left, not dollars, so nothing recorded what they were worth.
    const d = deps({
      baskets: async () => ({ totalUsd: D("100"), fetchedAt: new Date(), baskets: [basket("100")] }),
      basketMovements: async () => ({
        movements: [{ portfolioId: "portfolio-1", amountUsd: D(500), inward: true }],
        inKindExits: [{ portfolioId: "portfolio-1" }],
      }),
    });
    const body = await portfolioOf(await appWith(d).request("/v1/portfolio"));
    expect(body.baskets[0]!.basisIsComplete).toBe(false);
  });

  it("leaves a basket's basis off entirely when no money is recorded against it", async () => {
    // Enrolled through a path we did not witness. A basis of zero would report
    // the whole of the basket's value as profit.
    const d = deps({
      baskets: async () => ({ totalUsd: D("100"), fetchedAt: new Date(), baskets: [basket("100")] }),
    });
    const body = await portfolioOf(await appWith(d).request("/v1/portfolio"));
    expect(body.baskets[0]!.costBasisUsd).toBeUndefined();
    expect(body.baskets[0]!.pnlUsd).toBeUndefined();
  });

  it("values a holding at the pool, not at the underlying quote", async () => {
    // The two are different numbers: measured across twenty xStocks on 9
    // October 2026 they differed by a median 0.49%, as far apart as 9.4%.
    // What the wallet is worth is what the pool would pay for it.
    const d = deps({
      prices: {
        pricesFor: async (mints) =>
          new Map(mints.map((m) => [m, price(m, { usdPricePerToken: D(198), pricePerShare: D(200) })])),
      } satisfies PriceBoard,
    });
    const body = await portfolioOf(await appWith(d).request("/v1/portfolio"));
    expect(body.holdings[0]!.valueUsd).toBe("396"); // 2 shares at $198, not $200
  });

  it("divides the pool's token price by the multiplier to get a share", async () => {
    // A token is `multiplier` shares, so the pool's price per token is that
    // many shares' worth. Using it per share would double a holder's value
    // every time the multiplier did.
    const d = deps({
      prices: {
        pricesFor: async (mints) =>
          new Map(
            mints.map((m) => [
              m,
              price(m, { usdPricePerToken: D(400), pricePerShare: D(200), multiplier: D(2) }),
            ]),
          ),
      } satisfies PriceBoard,
    });
    const body = await portfolioOf(await appWith(d).request("/v1/portfolio"));
    expect(body.holdings[0]!.valueUsd).toBe("400"); // 2 shares at $400/2
  });

  it("charges the discount it would be sold into, without calling it the stock falling", async () => {
    // The stock is exactly where it was bought and the token is under it.
    const d = deps({
      walletHoldings: async () => [
        holding({ costBasisUsd: D(400), referenceBasisUsd: D(400), feeUsd: ZERO }),
      ],
      prices: {
        pricesFor: async (mints) =>
          new Map(mints.map((m) => [m, price(m, { usdPricePerToken: D(198), pricePerShare: D(200) })])),
      } satisfies PriceBoard,
    });
    const h = (await portfolioOf(await appWith(d).request("/v1/portfolio"))).holdings[0]!;
    expect(h.marketPnlUsd).toBe("0");
    expect(h.tradingCostUsd).toBe("4");
    expect(h.unrealisedPnlUsd).toBe("-4");
  });

  it("agrees with the exposure endpoint about what one holding is worth", async () => {
    // These valued the same shares differently: the portfolio at the issuer's
    // quote and the exposure breakdown at the pool. Whichever a reader saw
    // second looked like a bug.
    const d = deps({
      prices: {
        pricesFor: async (mints) =>
          new Map(mints.map((m) => [m, price(m, { usdPricePerToken: D(198), pricePerShare: D(200) })])),
      } satisfies PriceBoard,
    });
    const app = appWith(d);
    const body = await portfolioOf(await app.request("/v1/portfolio"));
    const exposure = (await (await app.request("/v1/portfolio/exposure/NVDA")).json()) as {
      valueUsd: string;
    };
    expect(exposure.valueUsd).toBe(body.holdings[0]!.valueUsd);
  });

  it("says how many of the shares a cost is known for", async () => {
    const d = deps({
      walletHoldings: async () => [holding({ shares: D(5), sharesWithBasis: D(2) })],
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
      earnUsd: "0",
      basketUsd: "0",
      debtUsd: "0",
      debtIsStale: false,
      earnIsStale: false,
      changeUsd: "0",
      changePct: "0",
      holdings: [],
      baskets: [],
    });
    expect(body.holdings).toEqual([]);
  });

  it("leaves out a holding that has gone to zero", async () => {
    const d = deps({ walletHoldings: async () => [holding({ shares: ZERO, costBasisUsd: ZERO })] });
    const body = await portfolioOf(await appWith(d).request("/v1/portfolio"));
    expect(body.holdings).toEqual([]);
  });

  it("counts both wrappers of one company as one holding", async () => {
    const d = deps({
      walletHoldings: async () => [
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
      walletHoldings: async () => [
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
        multipliersFor: async (mints) => new Map(mints.map((m) => [m, m === NVDAX ? D(2) : D(1)])),
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
      snapshots: async (_userId: string, _walletIds: readonly string[], from: Date) => {
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

describe("GET /v1/portfolio, with money in Earn", () => {
  it("counts Earn in the total, read fresh", async () => {
    const body = await portfolioOf(
      await appWith(deps({ earn: async () => D("300") })).request("/v1/portfolio"),
    );
    expect(body.earnUsd).toBe("300");
    expect(body.earnIsStale).toBe(false);
  });

  /* Unreadable used to count as $0: net worth fell by the whole Earn balance, and nothing said why. */
  it("serves the last recorded Earn balance when Kamino cannot be read, and says so", async () => {
    const fresh = await portfolioOf(
      await appWith(deps({ earn: async () => D("300") })).request("/v1/portfolio"),
    );
    const body = await portfolioOf(
      await appWith(
        deps({
          earn: async () => Promise.reject(new Error("kamino down")),
          lastKnownEarn: async () => D("300"),
        }),
      ).request("/v1/portfolio"),
    );
    expect(body.earnUsd).toBe("300");
    expect(body.earnIsStale).toBe(true);
    expect(body.totalValueUsd).toBe(fresh.totalValueUsd);
  });

  it("says so too when there is no reading to fall back on", async () => {
    const body = await portfolioOf(
      await appWith(deps({ earn: async () => Promise.reject(new Error("kamino down")) })).request(
        "/v1/portfolio",
      ),
    );
    expect(body.earnUsd).toBe("0");
    expect(body.earnIsStale).toBe(true);
  });
});

/*
 * One linked wallet, or every wallet at once. The Mercury wallet holds two
 * NVDA and $100; the linked one holds one NVDA, three TSLA, $50, and owes
 * $100. Every figure below is worked out from those, each wallet on its own.
 */
describe("GET /v1/portfolio, across wallets", () => {
  const MERCURY = actingAs("Mercury");
  const PHANTOM = actingLinked("Phantom", { label: "Phantom" });
  const ALL: Acting = { all: true, wallets: [MERCURY, PHANTOM] };
  const tsla = (over: Partial<HoldingRow> = {}) =>
    holding({
      instrumentId: "instrument-tsla",
      ticker: "TSLA",
      name: "Tesla",
      shares: D(3),
      sharesWithBasis: D(3),
      costBasisUsd: D(600),
      wrappers: [{ mint: TSLAON, symbol: "TSLAon", issuer: "ondo", decimals: 6 }],
      ...over,
    });
  const usdc = (dollars: number) => [{ mint: USDC, rawAmount: BigInt(dollars * 1_000_000), decimals: 6 }];

  /** Asked about each wallet by its id or address, and remembering who was asked. */
  const twoWallets = (over: Partial<PortfolioDeps> = {}) => {
    const asked: string[] = [];
    const d = deps({
      walletHoldings: async (_userId, walletId) => {
        asked.push(walletId);
        return walletId === MERCURY.id
          ? [holding()]
          : [holding({ shares: D(1), sharesWithBasis: D(1), costBasisUsd: D(150) }), tsla()];
      },
      chain: {
        tokenBalances: async (address) => {
          asked.push(address);
          return address === MERCURY.address ? usdc(100) : usdc(50);
        },
        mintConfig: async () => null,
      },
      debt: async (address) => (address === PHANTOM.address ? D(100) : ZERO),
      ...over,
    });
    return { d, asked };
  };

  it("reads only the linked wallet that is chosen", async () => {
    const { d, asked } = twoWallets();
    const body = await portfolioOf(
      await appWith(d, "Mercury", { all: false, wallets: [PHANTOM] }).request("/v1/portfolio"),
    );
    expect(new Set(asked)).toEqual(new Set([PHANTOM.id, PHANTOM.address]));
    // $800 of stock and $50, less the $100 it owes.
    expect(body.totalValueUsd).toBe("750");
    expect(body.cashUsd).toBe("50");
    expect(body.debtUsd).toBe("100");
    expect(body.holdings.map((h) => [h.ticker, h.shares])).toEqual([
      ["NVDA", "1"],
      ["TSLA", "3"],
    ]);
  });

  it("adds every wallet up, a stock held in two wallets as one row", async () => {
    const { d } = twoWallets();
    const body = await portfolioOf(await appWith(d, "Mercury", ALL).request("/v1/portfolio"));
    // $1,200 of stock and $150 of cash, less the linked wallet's $100.
    expect(body.totalValueUsd).toBe("1250");
    expect(body.cashUsd).toBe("150");
    expect(body.debtUsd).toBe("100");
    expect(body.holdings).toHaveLength(2);
    expect(body.holdings[0]).toMatchObject({
      ticker: "NVDA",
      shares: "3",
      sharesWithBasis: "3",
      valueUsd: "600",
      costBasisUsd: "450",
      unrealisedPnlUsd: "150",
    });
    expect(body.holdings[1]).toMatchObject({
      ticker: "TSLA",
      shares: "3",
      valueUsd: "600",
      unrealisedPnlUsd: "0",
    });
  });

  it("adds up how much of a stock's cost was estimated, and says where most of it came from", async () => {
    const { d } = twoWallets({
      walletHoldings: async (_userId, walletId) =>
        walletId === MERCURY.id
          ? [holding({ estimatedCostUsd: D(50), estimateSource: "own_wallet" })]
          : [holding({ estimatedCostUsd: D(120), estimateSource: "market_price" }), tsla()],
    });
    const all = await portfolioOf(await appWith(d, "Mercury", ALL).request("/v1/portfolio"));
    expect(all.holdings[0]).toMatchObject({
      ticker: "NVDA",
      estimatedCostUsd: "170",
      estimateSource: "market_price",
    });
    // A holding whose cost is all exact names no source.
    expect(all.holdings[1]).toMatchObject({ ticker: "TSLA", estimatedCostUsd: "0", estimateSource: null });

    const one = await portfolioOf(
      await appWith(d, "Mercury", { all: false, wallets: [MERCURY] }).request("/v1/portfolio"),
    );
    expect(one.holdings[0]).toMatchObject({ estimatedCostUsd: "50", estimateSource: "own_wallet" });
  });

  it("measures the day's change over the sum, not as an average of each wallet's", async () => {
    const { d } = twoWallets({
      prices: {
        pricesFor: async (mints) =>
          new Map(mints.map((m) => [m, price(m, { changePct24h: m === TSLAON ? D(10) : ZERO })])),
      },
    });
    const body = await portfolioOf(await appWith(d, "Mercury", ALL).request("/v1/portfolio"));
    // Only TSLA moved: $600 now, $600/1.1 yesterday, out of $1,200 of stock.
    const change = 600 - 600 / 1.1;
    expect(Number(body.changeUsd)).toBeCloseTo(change, 6);
    expect(Number(body.changePct)).toBeCloseTo((change / (1200 - change)) * 100, 6);
  });

  it("falls back to each wallet's own last debt, and says the sum is stale", async () => {
    const owners: unknown[] = [];
    const { d } = twoWallets({
      debt: async (address) => (address === PHANTOM.address ? null : ZERO),
      lastKnownDebt: async (owner) => {
        owners.push(owner);
        return D(80);
      },
    });
    const body = await portfolioOf(await appWith(d, "Mercury", ALL).request("/v1/portfolio"));
    expect(owners).toEqual([{ userId: "user-1", walletId: PHANTOM.id }]);
    expect(body.debtUsd).toBe("80");
    expect(body.debtIsStale).toBe(true);
  });

  it("is unavailable as a whole when one wallet's baskets can't be valued, rather than quietly short", async () => {
    const { d } = twoWallets({
      baskets: async (_userId, address) => {
        if (address === PHANTOM.address) throw new Error("glider down");
        return { totalUsd: ZERO, baskets: [], fetchedAt: null };
      },
    });
    const res = await appWith(d, "Mercury", ALL).request("/v1/portfolio");
    expect(res.status).toBe(503);
  });

  it("charts the wallets it is asked for, by id", async () => {
    const asked: (readonly string[])[] = [];
    const d = deps({
      snapshots: async (_userId, walletIds) => {
        asked.push(walletIds);
        return [];
      },
      flows: async (_userId, walletIds) => {
        asked.push(walletIds);
        return [];
      },
    });
    await appWith(d, "Mercury", ALL).request("/v1/portfolio/history?range=1D");
    await appWith(d, "Mercury", { all: false, wallets: [PHANTOM] }).request("/v1/portfolio/history?range=1D");
    expect(asked).toEqual([[MERCURY.id, PHANTOM.id], [MERCURY.id, PHANTOM.id], [PHANTOM.id], [PHANTOM.id]]);
  });

  it("adds one stock's tokens up across wallets for its exposure", async () => {
    const { d } = twoWallets({
      chain: {
        tokenBalances: async () => [{ mint: NVDAX, rawAmount: 100_000_000n, decimals: 8 }],
        mintConfig: async () => null,
      },
    });
    const body = await exposureOf(await appWith(d, "Mercury", ALL).request("/v1/portfolio/exposure/nvda"));
    // One NVDAx in each wallet.
    expect(body.shares).toBe("2");
    expect(body.wrappers).toEqual([expect.objectContaining({ mint: NVDAX, tokenQty: "2" })]);
  });

  it("counts a wrapper only a later wallet holds, whichever row comes first (even a closed one)", async () => {
    // The Mercury wallet's NVDA row is closed (sold out) and names NVDAx; the linked wallet holds NVDA as NVDAon.
    const { d } = twoWallets({
      walletHoldings: async (_userId, walletId) =>
        walletId === MERCURY.id
          ? [holding({ shares: ZERO, sharesWithBasis: ZERO, costBasisUsd: ZERO })]
          : [
              holding({
                shares: D(1),
                sharesWithBasis: D(1),
                wrappers: [{ mint: NVDAON, symbol: "NVDAon", issuer: "ondo", decimals: 6 }],
              }),
            ],
      chain: {
        tokenBalances: async (address) =>
          address === PHANTOM.address ? [{ mint: NVDAON, rawAmount: 1_000_000n, decimals: 6 }] : [],
        mintConfig: async () => null,
      },
    });
    const body = await exposureOf(await appWith(d, "Mercury", ALL).request("/v1/portfolio/exposure/NVDA"));
    expect(body.shares).toBe("1");
    expect(body.valueUsd).toBe("200");
    expect(body.wrappers).toEqual([expect.objectContaining({ mint: NVDAON, tokenQty: "1" })]);
  });

  it("lists a stock held through different wrappers in two wallets, each once", async () => {
    const { d } = twoWallets({
      walletHoldings: async (_userId, walletId) =>
        walletId === MERCURY.id
          ? [holding({ shares: D(1), sharesWithBasis: D(1) })]
          : [
              holding({
                shares: D(1),
                sharesWithBasis: D(1),
                wrappers: [
                  { mint: NVDAX, symbol: "NVDAx", issuer: "backed", decimals: 8 },
                  { mint: NVDAON, symbol: "NVDAon", issuer: "ondo", decimals: 6 },
                ],
              }),
            ],
      chain: {
        tokenBalances: async (address) =>
          address === PHANTOM.address
            ? [{ mint: NVDAON, rawAmount: 1_000_000n, decimals: 6 }]
            : [{ mint: NVDAX, rawAmount: 100_000_000n, decimals: 8 }],
        mintConfig: async () => null,
      },
    });
    const body = await exposureOf(await appWith(d, "Mercury", ALL).request("/v1/portfolio/exposure/NVDA"));
    expect(body.shares).toBe("2");
    expect(body.wrappers.map((w) => w.mint).sort()).toEqual([NVDAON, NVDAX].sort());
  });

  it("finds a stock only the linked wallet holds", async () => {
    const { d } = twoWallets({
      chain: {
        tokenBalances: async (address) =>
          address === PHANTOM.address ? [{ mint: TSLAON, rawAmount: 3_000_000n, decimals: 6 }] : [],
        mintConfig: async () => null,
      },
    });
    const all = await appWith(d, "Mercury", ALL).request("/v1/portfolio/exposure/TSLA");
    expect((await exposureOf(all)).shares).toBe("3");
    const mercuryOnly = await appWith(d, "Mercury").request("/v1/portfolio/exposure/TSLA");
    expect(mercuryOnly.status).toBe(404);
  });

  it("reads each wallet's basket returns", async () => {
    const asked: string[] = [];
    const d = deps({
      basketReturns: async (address) => {
        asked.push(address);
        return [{ portfolioId: `portfolio-${address}`, percentChange: "1" }];
      },
    });
    const body = (await (
      await appWith(d, "Mercury", ALL).request("/v1/portfolio/basket-returns")
    ).json()) as {
      returns: { portfolioId: string }[];
    };
    expect(asked).toEqual(["Mercury", "Phantom"]);
    expect(body.returns.map((r) => r.portfolioId)).toEqual(["portfolio-Mercury", "portfolio-Phantom"]);
  });
});

describe("GET /v1/portfolio, each wallet's own figures", () => {
  it("lists each wallet valued on its own, in the order they were added up", async () => {
    const mercury = actingAs("Mercury");
    const phantom = actingLinked("Phantom");
    const d = deps({
      walletHoldings: async (_userId, walletId) =>
        walletId === mercury.id ? [holding()] : [holding({ shares: D(1), sharesWithBasis: D(1) })],
      prices: {
        pricesFor: async (mints) => new Map(mints.map((m) => [m, price(m, { changePct24h: D(10) })])),
      },
      debt: async (address) => (address === "Phantom" ? D(50) : ZERO),
    });
    const body = await portfolioOf(
      await appWith(d, "Mercury", { all: true, wallets: [mercury, phantom] }).request("/v1/portfolio"),
    );
    expect(body.wallets?.map((w) => [w.walletId, w.totalValueUsd, w.debtUsd])).toEqual([
      [mercury.id, "400", "0"],
      [phantom.id, "150", "50"],
    ]);
    // Each wallet's own move: its stock up 10% on the day.
    for (const w of body.wallets ?? []) expect(Number(w.changePct)).toBeCloseTo(10, 6);
    expect(Number(body.totalValueUsd)).toBe(550);
  });
});

describe("GET /v1/portfolio/summary", () => {
  const empty = {
    wallets: [],
    netWorthUsd: "0",
    asOf: null,
    pnl: { totalUsd: "0", unrealisedUsd: "0", realisedUsd: "0", returnPct: null, estimatedCostUsd: "0" },
    income: { totalUsd: "0", earnUsd: "0", dividendsUsd: "0" },
    loanInterestUsd: "0",
    calculating: 0,
  };

  it("is the whole account's, whichever wallet is chosen", async () => {
    const asked: string[] = [];
    const d = deps({
      summary: async (userId) => {
        asked.push(userId);
        return empty;
      },
    });
    const res = await appWith(d, "Mercury", { all: false, wallets: [actingLinked("Phantom")] }).request(
      "/v1/portfolio/summary",
    );
    expect(res.status).toBe(200);
    expect(PortfolioSummary.parse(await res.json())).toEqual(empty);
    expect(asked).toEqual(["user-1"]);
  });

  it("is not there when it is not wired", async () => {
    expect((await appWith(deps()).request("/v1/portfolio/summary")).status).toBe(404);
  });
});

describe("POST /v1/portfolio/holdings/:ticker/cost", () => {
  const LINKED = actingLinked("Phantom", { id: "wallet-phantom" });
  const post = (d: PortfolioDeps, body: unknown, acting: Acting = { all: false, wallets: [LINKED] }) =>
    appWith(d, "Mercury", acting).request("/v1/portfolio/holdings/tsla/cost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const recording = (
    answer: Awaited<ReturnType<NonNullable<PortfolioDeps["declareCost"]>>> = { kind: "set", lots: 2 },
  ) => {
    const calls: unknown[] = [];
    const d = deps({
      declareCost: async (owner, ticker, cost) => {
        calls.push([owner, ticker, cost.toString()]);
        return answer;
      },
    });
    return { d, calls };
  };

  it("sets the cost for the chosen wallet, a linked one included, on the stock asked", async () => {
    const { d, calls } = recording();
    const res = await post(d, { unitCostUsd: "212.50" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lots: 2 });
    expect(calls).toEqual([[{ userId: "user-1", walletId: "wallet-phantom" }, "TSLA", "212.5"]]);
  });

  it("takes a number as readily as a string", async () => {
    const { d, calls } = recording();
    expect((await post(d, { unitCostUsd: 99 })).status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("refuses a cost that is not dollars above zero, before touching anything", async () => {
    const { d, calls } = recording();
    for (const bad of [
      { unitCostUsd: "0" },
      { unitCostUsd: "-5" },
      { unitCostUsd: "1e3" },
      { unitCostUsd: "abc" },
      {},
      null,
    ]) {
      const res = await post(d, bad);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("bad_cost");
    }
    expect(calls).toEqual([]);
  });

  it("asks which wallet when every wallet is shown: a cost for all would not say whose shares", async () => {
    const { d, calls } = recording();
    const res = await post(d, { unitCostUsd: "10" }, { all: true, wallets: [actingAs("Mercury"), LINKED] });
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("says when every cost is exact already, and when the stock is not one Mercury lists", async () => {
    expect((await post(recording({ kind: "nothing_estimated" }).d, { unitCostUsd: "10" })).status).toBe(409);
    expect((await post(recording({ kind: "unknown_stock" }).d, { unitCostUsd: "10" })).status).toBe(404);
  });

  it("is not there without the dependency", async () => {
    expect((await post(deps(), { unitCostUsd: "10" })).status).toBe(404);
  });
});
