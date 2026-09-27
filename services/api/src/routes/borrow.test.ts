import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { D } from "@mercury/core";
import type { LendingIntent, LendingSource, LendingTerms } from "../lending/ports.js";
import { borrowRoutes, type BorrowDeps } from "./borrow.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SPYX = "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W";

const terms: LendingTerms = {
  collateral: [
    {
      ticker: "SPY",
      isStock: true,
      symbol: "SPYx",
      mint: SPYX,
      reserve: "SpyReserve",
      decimals: 8,
      ltv: D("0.73"),
      liquidationThreshold: D("0.75"),
      pricePerToken: D(800),
      depositCapTokens: null,
      depositedTokens: D(0),
    },
  ],
  pool: {
    reserve: "UsdcReserve",
    availableUsd: D(500_000),
    borrowedUsd: D(0),
    borrowCapUsd: D(16_000_000),
    borrowFactor: D(1),
    borrowApy: D("0.06"),
  },
};

const built: LendingIntent[] = [];
const lending = (debt = 0, pledgedTokens = 10): LendingSource => ({
  terms: async () => terms,
  position: async () =>
    pledgedTokens === 0 && debt === 0
      ? null
      : {
          obligation: "Obligation",
          deposits: [
            {
              ticker: "SPY",
              isStock: true,
              mint: SPYX,
              raw: BigInt(pledgedTokens) * 100_000_000n,
              decimals: 8,
              tokens: D(pledgedTokens),
              valueUsd: D(pledgedTokens * 800),
            },
          ],
          debtUsd: D(debt),
          debtBfAdjustedUsd: D(debt),
          allowedBorrowUsd: D(pledgedTokens * 800 * 0.73),
          liquidationBorrowUsd: D(pledgedTokens * 800 * 0.75),
        },
  build: async (_wallet, intent) => {
    built.push(intent);
    return { transactions: ["AAAA"], firstTime: false, expiresAt: new Date("2026-09-27T12:00:00Z") };
  },
});

const deps = (l: LendingSource, cash = 100_000_000n, spy = 5n * 100_000_000n): BorrowDeps => ({
  lending: l,
  chain: {
    tokenBalances: async () => [
      { mint: USDC, rawAmount: cash, decimals: 6 },
      { mint: SPYX, rawAmount: spy, decimals: 8 },
    ],
    mintConfig: async () => null,
  },
  usdcMint: USDC,
});

const app = (d: BorrowDeps, walletAddress: string | null = "WaLLeT") => {
  const a = new Hono();
  a.use("*", async (c, next) => {
    c.set("identity", { userId: "user-1", privyUserId: "did:privy:1", walletAddress });
    await next();
  });
  a.route("/", borrowRoutes(d));
  return a;
};

const post = (d: BorrowDeps, body: unknown) =>
  app(d).request("/v1/borrow/transactions", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

describe("GET /v1/borrow", () => {
  it("reports cash, what could be borrowed at the target, and the two added up as spendable", async () => {
    const res = await app(deps(lending(1_000))).request("/v1/borrow");
    const body = (await res.json()) as Record<string, string>;
    // 10 SPYx pledged: $8,000 × 73% × 80% = $4,672, less $1,000 owed.
    expect(body.borrowableNowUsd).toBe("3672");
    // 5 more SPYx in the wallet: + $2,336.
    expect(body.borrowableUsd).toBe("6008");
    expect(body.cashUsd).toBe("100");
    expect(body.spendableUsd).toBe("6108");
    expect(body.safetyTarget).toBe("0.8");
  });

  it("says 401 with no wallet on the session", async () => {
    const res = await app(deps(lending()), null).request("/v1/borrow");
    expect(res.status).toBe(401);
  });
});

describe("GET /v1/borrow/:ticker", () => {
  it("answers for an accepted stock", async () => {
    const res = await app(deps(lending())).request("/v1/borrow/spy");
    const body = (await res.json()) as { accepted: boolean; collateral: { borrowableUsd: string } };
    expect(body.accepted).toBe(true);
    expect(body.collateral.borrowableUsd).toBe("7008");
  });

  it("says plainly when Kamino does not take a stock", async () => {
    const res = await app(deps(lending())).request("/v1/borrow/GME");
    expect(((await res.json()) as { accepted: boolean }).accepted).toBe(false);
  });
});

describe("POST /v1/borrow/transactions", () => {
  it("builds a borrow inside the target", async () => {
    const res = await post(deps(lending()), { kind: "borrow", usd: "4000" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { transactions: string[] }).transactions).toEqual(["AAAA"]);
  });

  it("refuses a borrow past the 80% target, before anything is built", async () => {
    built.length = 0;
    const res = await post(deps(lending()), { kind: "borrow", usd: "4700" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("above_safety_target");
    expect(built).toEqual([]);
  });

  it("counts the deposit when checking a deposit-and-borrow", async () => {
    // Pledging the 5 in the wallet as well allows up to $7,008.
    const ok = await post(deps(lending()), {
      kind: "deposit_and_borrow",
      ticker: "SPY",
      tokensRaw: "500000000",
      usd: "7000",
    });
    expect(ok.status).toBe(200);
    const over = await post(deps(lending()), {
      kind: "deposit_and_borrow",
      ticker: "SPY",
      tokensRaw: "500000000",
      usd: "7100",
    });
    expect(over.status).toBe(409);
  });

  it("refuses to pledge more than the wallet holds", async () => {
    const res = await post(deps(lending()), { kind: "deposit", ticker: "SPY", tokensRaw: "600000000" });
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("insufficient_tokens");
  });

  it("refuses a stock Kamino does not accept", async () => {
    const res = await post(deps(lending()), { kind: "deposit", ticker: "GME", tokensRaw: "1" });
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("not_collateral");
  });

  it("refuses a withdrawal that would push the loan past the target", async () => {
    const res = await post(deps(lending(4_000)), { kind: "withdraw", ticker: "SPY", tokensRaw: "500000000" });
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("above_safety_target");
  });

  it("locks borrowing and withdrawals once the loan is past the limit, with the repay that unlocks them", async () => {
    // 10 SPYx: limit $4,672. $5,400 owed after a fall is a margin call.
    const d = deps(lending(5_400));
    const b = await post(d, { kind: "borrow", usd: "1" });
    expect(b.status).toBe(409);
    const body = (await b.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("locked");
    expect(body.error.message).toContain("Margin call");
    expect(body.error.message).toContain("728");
    const w = await post(d, { kind: "withdraw", ticker: "SPY", tokensRaw: "1" });
    expect(((await w.json()) as { error: { code: string } }).error.code).toBe("locked");
  });

  it("still lets a locked loan be repaid or given more collateral", async () => {
    const d = deps(lending(5_400), 6_000_000_000n);
    expect((await post(d, { kind: "repay", usd: "800" })).status).toBe(200);
    expect((await post(d, { kind: "deposit", ticker: "SPY", tokensRaw: "100000000" })).status).toBe(200);
  });

  it("reports the loan's health on the summary", async () => {
    const res = await app(deps(lending(5_400))).request("/v1/borrow");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ health: "margin_call", locked: true, repayToClearMarginCallUsd: "300" });
  });

  it("allows withdrawing everything once nothing is owed", async () => {
    const res = await post(deps(lending(0)), { kind: "withdraw", ticker: "SPY", tokensRaw: "all" });
    expect(res.status).toBe(200);
  });

  it("refuses to repay with cash the wallet does not have", async () => {
    const res = await post(deps(lending(1_000), 50_000_000n), { kind: "repay", usd: "all" });
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("insufficient_cash");
  });

  it("rejects a malformed amount", async () => {
    const res = await post(deps(lending()), { kind: "borrow", usd: "-5" });
    expect(res.status).toBe(400);
  });
});
