import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { D } from "@mercury/core";
import { mercuryWallet, testDb } from "../db/testing.js";
import { activities, loanEvents, notifications, users, wallets } from "../db/schema.js";
import { planChainLoan, positionsAfter, recordChainLoan, type ListedStock } from "./chain-loan.js";
import { loanLedger } from "./record.js";
import { outstandingPrincipal } from "./interest.js";
import { parseDays, parseTransactions, type KaminoLoanDay, type KaminoLoanTx } from "./kamino-loans.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TSLAX = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
const STOCKS = new Map<string, ListedStock>([[TSLAX, { ticker: "TSLA", decimals: 8 }]]);
const at = (iso: string) => new Date(iso);

let n = 0;
const tx = (
  action: KaminoLoanTx["action"],
  when: string,
  over: Partial<Omit<KaminoLoanTx, "amount" | "priceUsd" | "valueUsd">> & {
    amount?: string;
    price?: string;
    value?: string;
  } = {},
): KaminoLoanTx => {
  const money = action === "borrow" || action === "repay";
  const { amount, price, value, ...rest } = over;
  return {
    signature: `sig-${++n}`,
    at: at(when),
    action,
    mint: action === "create" ? null : money ? USDC : TSLAX,
    symbol: money ? "USDC" : "TSLAx",
    amount: D(amount ?? (money ? "100" : "2")),
    priceUsd: D(price ?? (money ? "1" : "250")),
    valueUsd: D(value ?? (money ? "100" : "500")),
    liquidation: action === "liquidate",
    ...rest,
  };
};
const day = (when: string, debt: string, collateral: string): KaminoLoanDay => ({
  at: at(when),
  debtUsd: D(debt),
  collateralUsd: D(collateral),
});
const fixed = (
  ps: readonly { debt: { toFixed: (n: number) => string }; collateral: { toFixed: (n: number) => string } }[],
) => ps.map((p) => [p.debt.toFixed(2), p.collateral.toFixed(2)]);

describe("positionsAfter", () => {
  it("reads the day's close and takes back what happened after the row, the same day", () => {
    const txs = [
      tx("deposit", "2026-03-01T10:00:00Z", { value: "500" }),
      tx("borrow", "2026-03-01T11:00:00Z", { value: "100" }),
      tx("repay", "2026-03-01T15:00:00Z", { value: "40" }),
    ];
    const days = [day("2026-03-02T00:00:00Z", "60.01", "510")];
    expect(fixed(positionsAfter(txs, days))).toEqual([
      // After the pledge: nothing borrowed yet. The cent is the day's interest, which the close
      // counts and no row says when it accrued: it lands on the earliest row, never more than that.
      ["0.01", "510.00"],
      ["100.01", "510.00"],
      ["60.01", "510.00"],
    ]);
  });

  it("works forward from the last close for a row after it", () => {
    const txs = [tx("borrow", "2026-03-05T09:00:00Z", { value: "50" })];
    expect(fixed(positionsAfter(txs, [day("2026-03-05T00:00:00Z", "100", "800")]))).toEqual([
      ["150.00", "800.00"],
    ]);
  });

  it("works forward from nothing when Kamino has no closes, and never says less than nothing", () => {
    const txs = [
      tx("deposit", "2026-03-01T10:00:00Z", { value: "500" }),
      tx("borrow", "2026-03-01T11:00:00Z", { value: "100" }),
      tx("repay", "2026-03-02T11:00:00Z", { value: "101.5" }),
      tx("withdraw", "2026-03-02T12:00:00Z", { value: "520" }),
    ];
    expect(fixed(positionsAfter(txs, []))).toEqual([
      ["0.00", "500.00"],
      ["100.00", "500.00"],
      // Repaid with interest: more than was lent, so nothing is owed.
      ["0.00", "500.00"],
      ["0.00", "0.00"],
    ]);
  });

  it("agrees with Kamino's own close for the recorded loan's first borrow, to the cent of a day's interest", () => {
    const txs = parseTransactions(
      JSON.parse(
        readFileSync(new URL("./__fixtures__/kamino-obligation-transactions.json", import.meta.url), "utf8"),
      ),
    );
    const days = parseDays(
      JSON.parse(
        readFileSync(new URL("./__fixtures__/kamino-obligation-history.json", import.meta.url), "utf8"),
      ),
    );
    const i = txs.findIndex((t) => t.action === "borrow");
    const after = positionsAfter(txs, days)[i]!;
    expect(Math.abs(after.debt.toNumber() - 350)).toBeLessThan(1);
  });
});

describe("planChainLoan", () => {
  it("words each row as Mercury's own loan rows are, with a pledge's price then", () => {
    const rows = planChainLoan(
      [
        tx("create", "2026-03-01T09:00:00Z"),
        tx("deposit", "2026-03-01T10:00:00Z", { amount: "10", price: "240.1", value: "2401" }),
        tx("borrow", "2026-03-01T11:00:00Z", { amount: "350", value: "349.91" }),
        tx("repay", "2026-04-01T11:00:00Z", { amount: "351.76", value: "351.7" }),
        tx("withdraw", "2026-04-01T12:00:00Z", { amount: "4", price: "260", value: "1040" }),
      ],
      [],
      STOCKS,
      USDC,
    );
    expect(
      rows.map((r) => [r.kind, r.title, r.subtitle, r.usdAmount?.toString() ?? null, r.ticker, r.tokensRaw]),
    ).toEqual([
      ["pledge", "Added collateral", "10 TSLA at $240.10", null, "TSLA", "1000000000"],
      // USDC is the dollar: the amount lent, not Kamino's valuation of it.
      ["borrow", "Borrowed USDC", "Against collateral", "350", null, null],
      ["repay", "Repaid loan", "Repayment", "351.76", null, null],
      ["unpledge", "Withdrew collateral", "4 TSLA at $260.00", null, "TSLA", "400000000"],
    ]);
    expect(rows.map((r) => r.mint)).toEqual([TSLAX, USDC, USDC, TSLAX]);
    expect(rows[0]!.priceUsd?.toString()).toBe("240.1");
  });

  it("says what Kamino sold to clear a debt, and what it was worth", () => {
    const [row] = planChainLoan(
      [tx("liquidate", "2026-05-01T00:00:00Z", { amount: "1.5", price: "200", value: "300" })],
      [],
      STOCKS,
      USDC,
    );
    expect([row!.kind, row!.title, row!.subtitle, row!.usdAmount?.toString()]).toEqual([
      "liquidation",
      "Sold by Kamino",
      "1.5 TSLA at $200.00",
      "300",
    ]);
  });

  it("names collateral Mercury doesn't list by Kamino's symbol, with no token count it can't scale", () => {
    const [row] = planChainLoan(
      [
        tx("deposit", "2026-03-01T10:00:00Z", {
          mint: "Other-mint",
          symbol: "JITOSOL",
          amount: "3",
          price: "0",
        }),
      ],
      [],
      STOCKS,
      USDC,
    );
    expect([row!.ticker, row!.tokensRaw, row!.subtitle, row!.priceUsd]).toEqual([
      "JITOSOL",
      null,
      "3 JITOSOL",
      null,
    ]);
  });

  it("keeps one row of a kind per transaction, as the ledger's key does", () => {
    const a = tx("deposit", "2026-03-01T10:00:00Z");
    const rows = planChainLoan([a, { ...a, amount: D(1) }], [], STOCKS, USDC);
    expect(rows).toHaveLength(1);
  });

  it("reads the recorded loan whole: every pledge, borrow, repay and withdrawal, and no creation rows", () => {
    const txs = parseTransactions(
      JSON.parse(
        readFileSync(new URL("./__fixtures__/kamino-obligation-transactions.json", import.meta.url), "utf8"),
      ),
    );
    const qqq = new Map([["Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ", { ticker: "QQQ", decimals: 8 }]]);
    const rows = planChainLoan(txs, [], qqq, USDC);
    const counts = rows.reduce<Record<string, number>>(
      (c, r) => ({ ...c, [r.kind]: (c[r.kind] ?? 0) + 1 }),
      {},
    );
    expect(counts).toEqual({ pledge: 17, unpledge: 3, borrow: 2, repay: 2 });
  });
});

describe("recordChainLoan", () => {
  const seed = async () => {
    const db = await testDb();
    const [user] = await db.insert(users).values({ privyUserId: "did:privy:loan" }).returning();
    await mercuryWallet(db, user!.id);
    const [linked] = await db
      .insert(wallets)
      .values({ userId: user!.id, address: "Phantom1", kind: "external", isPrimary: false })
      .returning();
    return { db, owner: { userId: user!.id, walletId: linked!.id } };
  };
  const loan = () =>
    planChainLoan(
      [
        tx("deposit", "2026-03-01T10:00:00Z", { amount: "10", price: "240.1", value: "2401" }),
        tx("borrow", "2026-03-01T11:00:00Z", { amount: "350", value: "349.95" }),
        tx("repay", "2026-04-01T11:00:00Z", { amount: "100", value: "99.98" }),
      ],
      [],
      STOCKS,
      USDC,
    );

  it("writes the ledger and the feed, marked as read from the chain, and tells nobody", async () => {
    const { db, owner } = await seed();
    const rows = loan();
    expect(await recordChainLoan(db, owner, rows)).toEqual({ written: 3 });

    const ledger = await db.select().from(loanEvents).where(eq(loanEvents.walletId, owner.walletId));
    expect(ledger.map((r) => [r.kind, r.originSource])).toEqual([
      ["pledge", "chain"],
      ["borrow", "chain"],
      ["repay", "chain"],
    ]);
    expect(D(ledger[0]!.priceUsd!).toString()).toBe("240.1");
    const feed = await db.select().from(activities).where(eq(activities.walletId, owner.walletId));
    expect(feed.map((a) => [a.kind, a.title, a.refTable, a.refId !== null])).toEqual([
      ["pledge", "Added collateral", "loan_event", true],
      ["borrow", "Borrowed USDC", "loan_event", true],
      ["repay", "Repaid loan", "loan_event", true],
    ]);
    expect(await db.select().from(notifications)).toEqual([]);
  });

  it("lets the loan screen split the debt: what was borrowed, less what was repaid, is the principal", async () => {
    const { db, owner } = await seed();
    await recordChainLoan(db, owner, loan());
    expect(outstandingPrincipal(await loanLedger(db, owner))?.toString()).toBe("250");
  });

  it("writes nothing the second time, and keeps a row Mercury recorded as Mercury recorded it", async () => {
    const { db, owner } = await seed();
    const rows = loan();
    // The borrow was made through Mercury, which recorded it with the rate at the time.
    await db.insert(loanEvents).values({
      ...owner,
      kind: "borrow",
      usdAmount: "350",
      borrowApy: "0.058",
      debtAfterUsd: "350",
      collateralAfterUsd: "2401",
      txSignature: rows[1]!.signature,
      occurredAt: rows[1]!.occurredAt,
    });
    expect(await recordChainLoan(db, owner, rows)).toEqual({ written: 2 });
    expect(await recordChainLoan(db, owner, rows)).toEqual({ written: 0 });
    const [borrow] = await db
      .select()
      .from(loanEvents)
      .where(and(eq(loanEvents.walletId, owner.walletId), eq(loanEvents.kind, "borrow")));
    expect([borrow!.originSource, D(borrow!.borrowApy!).toString()]).toEqual(["mercury", "0.058"]);
  });

  it("writes nothing for a loan with no rows", async () => {
    const { db, owner } = await seed();
    expect(await recordChainLoan(db, owner, [])).toEqual({ written: 0 });
  });
});
