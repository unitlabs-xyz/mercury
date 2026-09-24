import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { D } from "@mercury/core";
import { Money } from "@mercury/types";
import { moneyRoutes, type MoneyDeps } from "./money.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const deps = (over: Partial<MoneyDeps> = {}): MoneyDeps => ({
  chain: {
    tokenBalances: async () => [{ mint: USDC, rawAmount: 250_500_000n, decimals: 6 }],
    mintConfig: async () => null,
  },
  credit: {
    current: async () => ({ collateral: [], borrowApy: D("0.0444"), supplyApy: D("0.00095") }),
  },
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

  it("quotes the supply rate Kamino is paying right now", async () => {
    const body = await moneyOf(await appWith(deps()).request("/v1/money"));
    expect(body.yieldApr).toBe("0.00095");
  });

  it("says zero interest earned, because nothing is supplied anywhere", async () => {
    const body = await moneyOf(await appWith(deps()).request("/v1/money"));
    expect(body.interestEarnedYtdUsd).toBe("0");
  });

  it("gives the wallet as the deposit address", async () => {
    const body = await moneyOf(await appWith(deps()).request("/v1/money"));
    expect(body.depositAddress).toBe("WaLLeT");
  });

  it("offers no borrowing power, and says so rather than omitting it", async () => {
    const body = await moneyOf(await appWith(deps()).request("/v1/money"));
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
