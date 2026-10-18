import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { D, ZERO } from "@mercury/core";
import { Money } from "@mercury/types";
import { moneyRoutes, type MoneyDeps } from "./money.js";
import type { CollateralTerms, LendingSource, LendingTerms } from "../lending/ports.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

const nvda: CollateralTerms = {
  ticker: "NVDA",
  isStock: true,
  symbol: "NVDAx",
  mint: NVDAX,
  reserve: "NvdaReserve",
  decimals: 8,
  ltv: D("0.55"),
  liquidationThreshold: D("0.65"),
  pricePerToken: D(200),
  depositCapTokens: null,
  depositedTokens: D(0),
};

const terms: LendingTerms = {
  collateral: [nvda],
  minPositionUsd: D("0.01"),
  pool: {
    reserve: "UsdcReserve",
    availableUsd: D(500_000),
    borrowedUsd: D(5_000_000),
    borrowCapUsd: D(16_000_000),
    borrowFactor: D(1),
    borrowApy: D("0.06"),
  },
};

/** Kamino answering normally, with nothing pledged and nothing owed. */
const lending: LendingSource = {
  terms: async () => terms,
  position: async () => null,
  build: async () => {
    throw new Error("not used by this route");
  },
};

const deps = (over: Partial<MoneyDeps> = {}): MoneyDeps => ({
  chain: {
    tokenBalances: async () => [{ mint: USDC, rawAmount: 250_500_000n, decimals: 6 }],
    mintConfig: async () => null,
  },
  credit: {
    current: async () => ({ collateral: [], borrowApy: D("0.0444"), supplyApy: D("0.00095") }),
  },
  lending,
  usdcMint: USDC,
  ...over,
});

const appWith = (d: MoneyDeps, walletAddress: string | null = "WaLLeT") => {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress });
    await next();
  });
  app.route("/", moneyRoutes(d));
  return app;
};

/** Through the wire schema, so the route cannot drift from `packages/types`. */
const moneyOf = async (res: Response) => Money.parse(await res.json());

describe("GET /v1/money", () => {
  it("reports the USDC balance to the cent it actually holds", async () => {
    const body = await moneyOf(await appWith(deps()).request("/v1/money"));
    expect(body.balanceUsd).toBe("250.5");
  });

  it("quotes the Earn vault's rate, after its fees", async () => {
    const earn = async () => ({ balance: D("10.6"), apy: D("0.0408") });
    const body = await moneyOf(await appWith(deps({ earn })).request("/v1/money"));
    expect(body.yieldApr).toBe("0.0408");
    expect(body.earnUsd).toBe("10.6");
  });

  it("quotes no rate without Earn, never the lending market's supply rate", async () => {
    const body = await moneyOf(await appWith(deps()).request("/v1/money"));
    expect(body.yieldApr).toBe("0");
  });

  it("says zero interest earned, because nothing is supplied anywhere", async () => {
    const body = await moneyOf(await appWith(deps()).request("/v1/money"));
    expect(body.interestEarnedYtdUsd).toBe("0");
  });

  it("gives the wallet as the deposit address", async () => {
    const body = await moneyOf(await appWith(deps()).request("/v1/money"));
    expect(body.depositAddress).toBe("WaLLeT");
  });

  it("offers borrowing with nothing available when nothing is pledged yet", async () => {
    // Enabled is whether we can offer it, not whether anything is pledged: the
    // screen can then invite a deposit instead of hiding the feature.
    const body = await moneyOf(await appWith(deps()).request("/v1/money"));
    expect(body.borrowingPower).toEqual({ availableUsd: "0", enabled: true });
  });

  it("reports what is actually borrowable against pledged stock", async () => {
    const d = deps({
      lending: {
        terms: async () => terms,
        // 100 NVDAx at $200 is $20,000 pledged, nothing owed against it.
        position: async () => ({
          obligation: "Ob1",
          deposits: [
            {
              ticker: "NVDA",
              isStock: true,
              mint: NVDAX,
              raw: 10_000_000_000n,
              decimals: 8,
              tokens: D(100),
              valueUsd: D(20_000),
            },
          ],
          debtUsd: ZERO,
          owedUsdc: ZERO,
          debtBfAdjustedUsd: ZERO,
          allowedBorrowUsd: D(20_000).mul(D("0.55")),
          liquidationBorrowUsd: D(20_000).mul(D("0.65")),
        }),
        build: async () => {
          throw new Error("not used by this route");
        },
      },
    });
    const body = await moneyOf(await appWith(d).request("/v1/money"));
    expect(body.borrowingPower.enabled).toBe(true);
    expect(Number(body.borrowingPower.availableUsd)).toBeGreaterThan(0);
  });

  it("does not offer borrowing it cannot price when Kamino is unreachable", async () => {
    const d = deps({
      lending: {
        terms: async () => {
          throw new Error("kamino down");
        },
        position: async () => null,
        build: async () => {
          throw new Error("not used by this route");
        },
      },
    });
    const body = await moneyOf(await appWith(d).request("/v1/money"));
    // The balance is the figure this screen is about, and it still answers.
    expect(body.balanceUsd).toBe("250.5");
    expect(body.borrowingPower).toEqual({ availableUsd: "0", enabled: false });
  });

  it("says zero rather than failing when the wallet holds no USDC", async () => {
    const d = deps({ chain: { tokenBalances: async () => [], mintConfig: async () => null } });
    const body = await moneyOf(await appWith(d).request("/v1/money"));
    expect(body.balanceUsd).toBe("0");
  });

  it("still answers when Kamino is down, with no rate rather than a wrong one", async () => {
    const d = deps({
      credit: {
        current: async () => {
          throw new Error("kamino reserves returned 503");
        },
      },
    });
    const res = await appWith(d).request("/v1/money");
    expect(res.status).toBe(200);
    const body = await moneyOf(res);
    expect(body.balanceUsd).toBe("250.5");
    expect(body.yieldApr).toBe("0");
  });

  it("answers an empty account for a session with no wallet yet", async () => {
    const res = await appWith(deps(), null).request("/v1/money");
    const body = (await res.json()) as { balanceUsd: string; depositAddress: string | null };
    expect(body.balanceUsd).toBe("0");
    expect(body.depositAddress).toBeNull();
  });
});
