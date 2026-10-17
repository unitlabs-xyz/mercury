import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { D } from "@mercury/core";
import {
  LendingRefused,
  SponsorShort,
  type LendingIntent,
  type LendingSource,
  type LendingTerms,
} from "../lending/ports.js";
import type { LedgerRow } from "../lending/interest.js";
import type { PlannedLoanEvent } from "../lending/events.js";
import type { PriceBoard, TokenPrice } from "@mercury/market";
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
  minPositionUsd: D("0.01"),
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
          owedUsdc: D(debt),
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

const SOL = "So11111111111111111111111111111111111111112";

/** SOL at `usd`, or no price at all. */
const solAt = (usd: string | null): PriceBoard =>
  ({
    pricesFor: async () =>
      new Map(usd === null ? [] : [[SOL, { mint: SOL, usdPricePerToken: D(usd) } as TokenPrice]]),
  }) as unknown as PriceBoard;

const deps = (
  l: LendingSource,
  cash = 100_000_000n,
  spy = 5n * 100_000_000n,
  prices = solAt("103"),
): BorrowDeps => ({
  lending: l,
  prices,
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
        : ({
            signature,
            accountKeys: ["WaLLeT"],
            blockTime: 1_790_000_000,
            preTokens: [],
            postTokens: [],
          } as never),
  } as unknown as BorrowDeps["history"],
  record: async (planned, input) => {
    recorded.push(...planned);
    mints.push(...planned.map((e) => input.mintFor(e)));
    return { written: planned.length };
  },
  ledger: async () => [],
});

/** The mint each recorded event's feed row was filed under, per test. */
const mints: string[] = [];

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

  /*
   * What Mercury pays to open a first-time borrower's Kamino account, so the
   * sheet can say so. Rent for the obligation, the user metadata and the farm
   * state — 28,854,400 lamports at mainnet's October 2026 rate, which is what
   * a reader that cannot ask falls back to — at $103 SOL.
   */
  it("says what opening the Kamino account costs, for a wallet that has none", async () => {
    const res = await app(deps(lending(0, 0))).request("/v1/borrow");
    const body = (await res.json()) as Record<string, string | null>;
    expect(body.obligation).toBeNull();
    expect(body.setupCostUsd).toBe("2.97");
  });

  it("says nothing once the account is open", async () => {
    const res = await app(deps(lending(1_000))).request("/v1/borrow");
    expect(((await res.json()) as Record<string, string | null>).setupCostUsd).toBeNull();
  });

  /* The sheet still says Mercury pays; it only has no figure to strike through. */
  it("says nothing when SOL has no price", async () => {
    const res = await app(deps(lending(0, 0), undefined, undefined, solAt(null))).request("/v1/borrow");
    expect(((await res.json()) as Record<string, string | null>).setupCostUsd).toBeNull();
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

  /*
   * The feed's unique index is (user, signature, mint). Filed under the stock
   * like the pledge beside it, the borrow collided with it and was dropped,
   * and a first loan showed only "Pledged" in the feed.
   */
  it("files the borrow half of a pledge-and-borrow under USDC and the pledge under the stock", async () => {
    recorded.length = 0;
    mints.length = 0;
    await confirm(deps(lending()), {
      signature: "SIG1",
      action: { kind: "deposit_and_borrow", ticker: "SPY", tokensRaw: "100000000", usd: "500" },
    });
    expect(mints).toEqual([SPYX, USDC]);
  });

  it("refuses a signature the chain has not seen with a code the client can retry on", async () => {
    const res = await confirm(deps(lending()), {
      signature: "MISSING",
      action: { kind: "borrow", usd: "500" },
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("transaction_pending");
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

  /* The figure the request could not name is on the chain once it lands, interest to that slot included. */
  it("records what a repay of everything actually sent", async () => {
    recorded.length = 0;
    const d = deps(lending());
    const landed = {
      ...d,
      history: {
        transaction: async (signature: string) => ({
          signature,
          accountKeys: ["WaLLeT"],
          blockTime: 1_790_000_000,
          preTokens: [{ mint: USDC, owner: "WaLLeT", rawAmount: 5_000_000n, decimals: 6 }],
          postTokens: [{ mint: USDC, owner: "WaLLeT", rawAmount: 2_889_985n, decimals: 6 }],
        }),
      } as unknown as BorrowDeps["history"],
    };
    await confirm(landed, { signature: "SIG2", action: { kind: "repay", usd: "all" } });
    expect(recorded[0]!.usdAmount?.toFixed()).toBe("2.110015");
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

/**
 * A loan as it really stands a few minutes after borrowing: 2,110,008 micro-USDC
 * owed, which Kamino values at $2.10974 because its USDC price is $0.99988.
 */
const owing = (owedUsdc: string, debtUsd: string): LendingSource => {
  const l = lending(1);
  return {
    ...l,
    position: async () => ({ ...(await l.position("WaLLeT"))!, debtUsd: D(debtUsd), owedUsdc: D(owedUsdc) }),
  };
};
const ledgerOf =
  (...rows: [string, string | null, string][]) =>
  async (): Promise<readonly LedgerRow[]> =>
    rows.map(([kind, usd, after]) => ({
      kind,
      usdAmount: usd === null ? null : D(usd),
      debtAfterUsd: D(after),
    }));

const errorOf = async (res: Response) =>
  ((await res.json()) as { error: { code: string; message: string } }).error;

describe("GET /v1/borrow, what a loan is made of", () => {
  it("says what is owed in USDC, what was borrowed, and the interest on it", async () => {
    const d = { ...deps(owing("2.110008", "2.10974")), ledger: ledgerOf(["borrow", "2.11", "2.11"]) };
    const body = (await (await app(d).request("/v1/borrow")).json()) as Record<string, string | null>;
    expect(body).toMatchObject({ owedUsdc: "2.110008", principalUsdc: "2.11", interestUsdc: "0.000008" });
  });

  /* Owed plus an hour of interest at the pool's 6%: 2.110008 × (1 + 0.06 / 8,760), up to the micro-USDC. */
  it("says what the wallet must hold to repay all of it", async () => {
    const body = (await (
      await app(deps(owing("2.110008", "2.10974"))).request("/v1/borrow")
    ).json()) as Record<string, string>;
    expect(body.closeLoanUsdc).toBe("2.110023");
    expect(body.minPositionUsd).toBe("0.01");
  });

  it("leaves the split out when the ledger has no borrow to explain the debt", async () => {
    const body = (await (await app(deps(owing("5", "5"))).request("/v1/borrow")).json()) as Record<
      string,
      unknown
    >;
    expect(body.owedUsdc).toBe("5");
    expect(body.principalUsdc).toBeNull();
    expect(body.interestUsdc).toBeNull();
  });

  /*
   * Kamino's own figures run to forty digits — 2.110015389120025549923551862617188642438
   * USDC owed, read from mainnet on 17 October. The wire carries micro-USDC, the
   * smallest amount there is: what is owed rounded up, so it is never short.
   */
  it("says the loan in micro-USDC, what is owed rounded up", async () => {
    const d = {
      ...deps(owing("2.110015389120025549923551862617188642438", "2.10981808")),
      ledger: ledgerOf(["borrow", "2.11", "2.11"]),
    };
    const body = (await (await app(d).request("/v1/borrow")).json()) as Record<string, string>;
    expect(body).toMatchObject({ owedUsdc: "2.110016", principalUsdc: "2.11", interestUsdc: "0.000016" });
  });

  it("says Kamino's minimum as the cent it is", async () => {
    const l = lending(1);
    const precise: LendingSource = {
      ...l,
      terms: async () => ({
        ...(await l.terms()),
        minPositionUsd: D("0.01000000000000000020816681711721685132943"),
      }),
    };
    const body = (await (await app(deps(precise)).request("/v1/borrow")).json()) as Record<string, string>;
    expect(body.minPositionUsd).toBe("0.01");
  });

  it("owes nothing, and splits nothing, with no loan", async () => {
    const body = (await (await app(deps(lending(0, 0))).request("/v1/borrow")).json()) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({ owedUsdc: "0", principalUsdc: "0", interestUsdc: "0", closeLoanUsdc: "0" });
  });
});

describe("POST /v1/borrow/transactions, repaying in full", () => {
  /* The borrower who hit this: $2.11 borrowed, $2.11 held, a few minutes of interest owed on top. */
  it("refuses a repay of everything the wallet cannot cover, and says what it takes", async () => {
    const res = await post(deps(owing("2.110008", "2.10974"), 2_110_000n), { kind: "repay", usd: "all" });
    expect(res.status).toBe(409);
    const error = await errorOf(res);
    expect(error.code).toBe("insufficient_cash");
    expect(error.message).toContain("$2.12");
    expect(error.message).toContain("$2.11");
  });

  it("repays everything once the wallet holds what closing it takes", async () => {
    const res = await post(deps(owing("2.110008", "2.10974"), 2_120_000n), { kind: "repay", usd: "all" });
    expect(res.status).toBe(200);
  });

  /* What 0.1% of headroom refused: $1,000 owed and $1,000.50 held is plenty to close it. */
  it("asks only for an hour of interest as headroom, not a tenth of a percent", async () => {
    const res = await post(deps(lending(1_000), 1_000_500_000n), { kind: "repay", usd: "all" });
    expect(res.status).toBe(200);
  });

  it("refuses a repay that would leave less than a cent owing, before Kamino does", async () => {
    built.length = 0;
    const res = await post(deps(owing("2.110008", "2.10974"), 2_110_000n), { kind: "repay", usd: "2.11" });
    expect(res.status).toBe(409);
    const error = await errorOf(res);
    expect(error.code).toBe("dust_left");
    expect(error.message).toContain("$2.10");
    expect(built).toEqual([]);
  });

  it("repays part of a loan that leaves at least a cent owing", async () => {
    const res = await post(deps(owing("2.110008", "2.10974"), 2_110_000n), { kind: "repay", usd: "2.10" });
    expect(res.status).toBe(200);
  });
});

describe("POST /v1/borrow/transactions, Kamino's one-cent minimum", () => {
  /* 10 SPYx at $800 pledged, nothing owed; taking back all but one base unit leaves $0.000008 of it. */
  it("refuses a withdrawal that would leave less than a cent of a stock pledged", async () => {
    const res = await post(deps(lending(0, 10)), { kind: "withdraw", ticker: "SPY", tokensRaw: "999999999" });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("dust_left");
  });

  it("refuses a first loan of less than a cent", async () => {
    const res = await post(deps(lending(0, 10)), { kind: "borrow", usd: "0.005" });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("dust_left");
  });

  /* 0.00001 SPYx at $800 is $0.008. */
  it("refuses a first pledge worth less than a cent", async () => {
    const res = await post(deps(lending(0, 0)), { kind: "deposit", ticker: "SPY", tokensRaw: "1000" });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("dust_left");
  });
});

describe("POST /v1/borrow/transactions, when Kamino or the relayer refuses", () => {
  const refusing = (e: Error): LendingSource => ({
    ...lending(1_000),
    build: async () => {
      throw e;
    },
  });

  it("says plainly when Kamino would leave less than a cent", async () => {
    // $1,000 in the wallet, so the repay itself is fine and only Kamino objects.
    const res = await post(
      deps(refusing(new LendingRefused(6092, "NetValueRemainingTooSmall")), 1_000_000_000n),
      {
        kind: "repay",
        usd: "500",
      },
    );
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("dust_left");
  });

  it("names any other refusal of Kamino's, rather than calling it an internal error", async () => {
    const res = await post(deps(refusing(new LendingRefused(6017, "ObligationStale")), 1_000_000_000n), {
      kind: "repay",
      usd: "500",
    });
    expect(res.status).toBe(409);
    const error = await errorOf(res);
    expect(error.code).toBe("kamino_refused");
    expect(error.message).toContain("ObligationStale");
  });

  /* What a first loan met on 17 October: 0.0144 SOL in the relayer against 0.0295 of setup. */
  it("says borrowing is unavailable when the relayer cannot pay for it", async () => {
    const res = await post(deps(refusing(new SponsorShort("ReLaYeR", 14_440_977n, 30_504_640n))), {
      kind: "borrow",
      usd: "100",
    });
    expect(res.status).toBe(503);
    expect((await errorOf(res)).code).toBe("upstream_unavailable");
  });
});
