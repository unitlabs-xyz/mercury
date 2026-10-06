import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { D } from "@mercury/core";
import type { LendingIntent, LendingSource, LendingTerms } from "../lending/ports.js";
import type { PlannedLoanEvent } from "../lending/events.js";
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
    return {
      transactions: ["AAAA"],
      messages: [new Uint8Array([1, 2, 3])],
      firstTime: false,
      expiresAt: new Date("2026-09-27T12:00:00Z"),
    };
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
  history: {
    transaction: async (signature: string) =>
      signature === "MISSING"
        ? null
        : ({ signature, accountKeys: ["WaLLeT"], blockTime: 1_790_000_000 } as never),
  } as unknown as BorrowDeps["history"],
  record: async (planned) => {
    recorded.push(...planned);
    return { written: planned.length };
  },
});

/** What `record` was handed, per test. */
const recorded: PlannedLoanEvent[] = [];

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

  it("repays what is owed even when the borrow-factor-weighted debt reads zero", async () => {
    const l = lending(2);
    const owing: LendingSource = {
      ...l,
      position: async () => ({ ...(await l.position("WaLLeT"))!, debtBfAdjustedUsd: D(0) }),
    };
    const res = await post(deps(owing), { kind: "repay", usd: "2.00" });
    expect(res.status).toBe(200);
  });

  it("builds with the relayer as sponsor and remembers each message, so the send route will co-sign it", async () => {
    let sponsor: string | undefined;
    const l = lending();
    const remembered: Uint8Array[] = [];
    const d: BorrowDeps = {
      ...deps({
        ...l,
        build: async (wallet, intent, s) => {
          sponsor = s;
          return l.build(wallet, intent);
        },
      }),
      relay: {
        relayer: "ReLaYeR",
        builds: { remember: (m) => remembered.push(m), recognises: () => false, size: 0 },
      },
    };
    expect((await post(d, { kind: "borrow", usd: "100" })).status).toBe(200);
    expect(sponsor).toBe("ReLaYeR");
    expect(remembered).toEqual([new Uint8Array([1, 2, 3])]);
  });

  it("builds unsponsored when no relayer is configured", async () => {
    let sponsor: string | undefined = "unset";
    const l = lending();
    await post(
      deps({
        ...l,
        build: async (wallet, intent, s) => {
          sponsor = s;
          return l.build(wallet, intent);
        },
      }),
      { kind: "borrow", usd: "100" },
    );
    expect(sponsor).toBeUndefined();
  });

  it("rejects a malformed amount", async () => {
    const res = await post(deps(lending()), { kind: "borrow", usd: "-5" });
    expect(res.status).toBe(400);
  });
});

/**
 * Recording what a loan did.
 *
 * Nothing recorded it before. Kamino pays a borrower into their own wallet, so
 * every job watching balances sees a dollar arrive and calls it "Added cash" —
 * a loan and a deposit are the same event to anything counting money. And a
 * pledge-and-borrow moves a stock in the same transaction, which the wallet
 * watcher treats as a swap and drops, so the commonest way to borrow left no
 * trace at all.
 */
describe("POST /v1/borrow/confirm", () => {
  const confirm = (d: BorrowDeps, body: unknown) =>
    app(d).request("/v1/borrow/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("records a pledge and a borrow from the one transaction that did both", async () => {
    recorded.length = 0;
    const res = await confirm(deps(lending()), {
      signature: "SIG1",
      action: { kind: "deposit_and_borrow", ticker: "SPY", tokensRaw: "100000000", usd: "500" },
    });
    expect(res.status).toBe(200);
    expect(recorded.map((e) => e.kind)).toEqual(["pledge", "borrow"]);
    expect(recorded[1]!.title).toBe("Borrowed $500.00 against SPY");
  });

  it("refuses a signature the chain has not seen, so the client can retry", async () => {
    const res = await confirm(deps(lending()), {
      signature: "MISSING",
      action: { kind: "borrow", usd: "500" },
    });
    expect(res.status).toBe(404);
  });

  it("refuses a transaction that is not this wallet's", async () => {
    const d = deps(lending());
    const other = {
      ...d,
      history: {
        transaction: async () => ({ signature: "SIG", accountKeys: ["SomeoneElse"], blockTime: 1 }),
      } as unknown as BorrowDeps["history"],
    };
    const res = await confirm(other, { signature: "SIG", action: { kind: "borrow", usd: "500" } });
    expect(res.status).toBe(422);
  });

  it("records a repay of everything without inventing the figure", async () => {
    recorded.length = 0;
    await confirm(deps(lending()), { signature: "SIG2", action: { kind: "repay", usd: "all" } });
    expect(recorded[0]!.kind).toBe("repay");
    expect(recorded[0]!.usdAmount).toBeNull();
    expect(recorded[0]!.title).toBe("Repaid your loan in full");
  });

  /*
   * The build path refuses what should not happen. By the time this runs it
   * already has, and refusing to record a transaction that is on the chain
   * would leave the books further from the truth rather than closer.
   */
  it("records an action the build path would now refuse, because it already happened", async () => {
    recorded.length = 0;
    // No cash in the wallet: a repay built now would be refused for that.
    const res = await confirm(deps(lending(), 0n), {
      signature: "SIG3",
      action: { kind: "repay", usd: "250" },
    });
    expect(res.status).toBe(200);
    expect(recorded[0]!.title).toBe("Repaid $250.00");
  });

  it("says no wallet rather than recording against nobody", async () => {
    const res = await app(deps(lending()), null).request("/v1/borrow/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signature: "SIG", action: { kind: "borrow", usd: "1" } }),
    });
    expect(res.status).toBe(401);
  });
});
