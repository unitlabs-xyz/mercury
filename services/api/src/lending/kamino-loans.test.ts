import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { kaminoLoans, parseDays, parseTransactions } from "./kamino-loans.js";

/* Kamino's answers for one obligation in the xStocks market, recorded 24 November 2026. */
const recorded = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"));
const TXS = recorded("kamino-obligation-transactions.json");
const DAYS = recorded("kamino-obligation-history.json");
const MARKET = "5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua";
const OBLIGATION = "GGCN61XUn4MuFv7LqkHGjymENghMJf6vRYVK84sf7upR";

describe("parseTransactions", () => {
  it("reads every action against the loan, oldest first", () => {
    const txs = parseTransactions(TXS);
    expect(txs).toHaveLength(28);
    const counts = txs.reduce<Record<string, number>>(
      (c, t) => ({ ...c, [t.action]: (c[t.action] ?? 0) + 1 }),
      {},
    );
    expect(counts).toEqual({ deposit: 17, create: 4, withdraw: 3, borrow: 2, repay: 2 });
    for (let i = 1; i < txs.length; i++) expect(txs[i]!.at >= txs[i - 1]!.at).toBe(true);
  });

  it("keeps the token, the amount and the price at that moment", () => {
    const borrow = parseTransactions(TXS).find((t) => t.action === "borrow")!;
    expect(borrow).toMatchObject({ symbol: "USDC", liquidation: false });
    expect(borrow.amount.toString()).toBe("350");
    expect(borrow.at.toISOString()).toBe("2026-03-28T08:42:50.000Z");
    const pledge = parseTransactions(TXS)[0]!;
    expect([
      pledge.action,
      pledge.symbol,
      pledge.mint,
      pledge.amount.toString(),
      pledge.priceUsd.toString(),
    ]).toEqual([
      "deposit",
      "QQQx",
      "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ",
      "0.15550623",
      "582.35252675104537",
    ]);
  });

  it("names no token for the account's creation", () => {
    expect(
      parseTransactions(TXS)
        .filter((t) => t.action === "create")
        .every((t) => t.mint === null),
    ).toBe(true);
  });

  it("reads collateral taken to clear a debt as a liquidation, however Kamino names it", () => {
    const one = (over: Record<string, unknown>) => ({
      transactions: [
        {
          transactionSignature: "sig",
          createdOn: "2026-05-01T00:00:00.000Z",
          transactionDisplayName: "withdraw",
          liquidityToken: "TSLAx",
          liquidityTokenMint: "TSLAx-mint",
          liquidityTokenAmount: "2",
          liquidityTokenPrice: "300",
          liquidityUsdValue: "600",
          ...over,
        },
      ],
    });
    expect(parseTransactions(one({ isLiquidationWithdrawal: true }))[0]).toMatchObject({
      action: "liquidate",
      liquidation: true,
    });
    expect(parseTransactions(one({ transactionDisplayName: "liquidate" }))[0]!.action).toBe("liquidate");
    // Anything else Kamino lists, such as farm housekeeping, is not a ledger row.
    expect(parseTransactions(one({ transactionDisplayName: "initFarmsForReserve" }))).toEqual([]);
  });

  it("refuses an answer that isn't Kamino's shape, rather than write half of it", () => {
    expect(() => parseTransactions({ transactions: [{ transactionSignature: "x" }] })).toThrow();
    expect(() => parseTransactions([])).toThrow();
  });
});

describe("parseDays", () => {
  it("reads the loan's state once a day: what was owed and what was pledged", () => {
    const days = parseDays(DAYS);
    expect(days.length).toBeGreaterThan(200);
    expect(days[0]!.at.toISOString()).toBe("2026-03-23T00:00:00.000Z");
    expect(days[0]!.debtUsd.toString()).toBe("0");
    expect(days[0]!.collateralUsd.toFixed(2)).toBe("91.60");
  });
});

describe("kaminoLoans", () => {
  const answering = (status: number, body: unknown) => {
    const asked: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      asked.push(String(url));
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
    return { loans: kaminoLoans(fetchImpl), asked };
  };

  it("asks Kamino's obligation routes, and reads what they say", async () => {
    const { loans, asked } = answering(200, TXS);
    expect(await loans.transactions(MARKET, OBLIGATION)).toHaveLength(28);
    expect(asked).toEqual([
      `https://api.kamino.finance/v2/kamino-market/${MARKET}/obligations/${OBLIGATION}/transactions`,
    ]);
    const days = answering(200, DAYS);
    expect((await days.loans.days(MARKET, OBLIGATION))?.length).toBeGreaterThan(200);
    expect(days.asked[0]).toMatch(/\/metrics\/history$/);
  });

  it("answers null when Kamino can't be read, so the next pass tries again", async () => {
    expect(await answering(503, {}).loans.transactions(MARKET, OBLIGATION)).toBeNull();
    expect(await answering(200, { nonsense: true }).loans.days(MARKET, OBLIGATION)).toBeNull();
    const down = kaminoLoans((async () => {
      throw new Error("network down");
    }) as typeof fetch);
    expect(await down.transactions(MARKET, OBLIGATION)).toBeNull();
  });
});
