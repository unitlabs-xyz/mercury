import { z } from "zod";
import { D, type Decimal } from "@mercury/core";

/**
 * A loan's past, as Kamino's API keeps it: every transaction against the
 * obligation, and its state once a day. Read for a linked wallet's loan, which
 * was opened and worked outside Mercury, so the loan screen can say when it
 * was opened, each pledge at its price then, each borrow and repay, and what
 * interest it has cost.
 *
 * Kamino's routes rather than decoding each lending instruction: they name the
 * action, the token, the amount and the price at the moment, which is
 * everything the ledger keeps. Verified live 24 November 2026.
 */
const BASE = "https://api.kamino.finance";

/** What Kamino calls each action, as the ledger reads it. Anything else is left out. */
export type KaminoLoanAction = "create" | "deposit" | "withdraw" | "borrow" | "repay" | "liquidate";

export interface KaminoLoanTx {
  readonly signature: string;
  readonly at: Date;
  readonly action: KaminoLoanAction;
  /** The token that moved: the stock on a deposit or withdrawal, USDC on a borrow or repay. Null on create. */
  readonly mint: string | null;
  /** Its symbol as Kamino names it ("QQQx", "USDC"), for a token Mercury does not list. */
  readonly symbol: string;
  /** In whole tokens, as Kamino reports it. */
  readonly amount: Decimal;
  /** What one token was worth at that moment. */
  readonly priceUsd: Decimal;
  /** What it moved was worth then. */
  readonly valueUsd: Decimal;
  /** Collateral that Kamino took to clear debt. */
  readonly liquidation: boolean;
}

/** One day's close of the loan: what was owed and what was pledged, in dollars. */
export interface KaminoLoanDay {
  readonly at: Date;
  readonly debtUsd: Decimal;
  readonly collateralUsd: Decimal;
}

export interface KaminoLoans {
  /** Oldest first. Null when Kamino could not be read: the history is then read on a later pass. */
  transactions(market: string, obligation: string): Promise<readonly KaminoLoanTx[] | null>;
  /** Oldest first. Null when Kamino could not be read. */
  days(market: string, obligation: string): Promise<readonly KaminoLoanDay[] | null>;
}

const Num = z.union([z.string(), z.number()]).transform((v, ctx) => {
  try {
    const d = D(String(v));
    if (d.isFinite()) return d;
  } catch {
    // reported below
  }
  ctx.addIssue({ code: "custom", message: "not a number" });
  return z.NEVER;
});

const Transactions = z.object({
  transactions: z.array(
    z.object({
      transactionSignature: z.string().min(1),
      createdOn: z.string(),
      transactionDisplayName: z.string(),
      liquidityTokenMint: z.string(),
      liquidityToken: z.string(),
      liquidityTokenAmount: Num,
      liquidityTokenPrice: Num,
      liquidityUsdValue: Num,
      isLiquidationWithdrawal: z.boolean().optional(),
    }),
  ),
});

const History = z.object({
  history: z.array(
    z.object({
      timestamp: z.string(),
      refreshedStats: z.object({ userTotalBorrow: Num, userTotalCollateralDeposit: Num }),
    }),
  ),
});

/** Kamino's display name, as the ledger reads it. A liquidation can arrive as either. */
const actionOf = (name: string, liquidation: boolean): KaminoLoanAction | null => {
  if (liquidation) return "liquidate";
  switch (name.toLowerCase()) {
    case "create":
      return "create";
    case "deposit":
      return "deposit";
    case "withdraw":
      return "withdraw";
    case "borrow":
      return "borrow";
    case "repay":
      return "repay";
    case "liquidate":
    case "liquidation":
      return "liquidate";
    default:
      return null;
  }
};

/** The answers as the ledger uses them, oldest first. Exported for the tests, which read a recorded answer. */
export const parseTransactions = (body: unknown): readonly KaminoLoanTx[] => {
  const parsed = Transactions.parse(body);
  const out: KaminoLoanTx[] = [];
  for (const t of parsed.transactions) {
    const liquidation = t.isLiquidationWithdrawal === true;
    const action = actionOf(t.transactionDisplayName, liquidation);
    const at = new Date(t.createdOn);
    if (action === null || Number.isNaN(at.getTime())) continue;
    out.push({
      signature: t.transactionSignature,
      at,
      action,
      mint: t.liquidityTokenMint === "" ? null : t.liquidityTokenMint,
      symbol: t.liquidityToken,
      amount: t.liquidityTokenAmount,
      priceUsd: t.liquidityTokenPrice,
      valueUsd: t.liquidityUsdValue,
      liquidation,
    });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
};

export const parseDays = (body: unknown): readonly KaminoLoanDay[] =>
  History.parse(body)
    .history.map((p) => ({
      at: new Date(p.timestamp),
      debtUsd: p.refreshedStats.userTotalBorrow,
      collateralUsd: p.refreshedStats.userTotalCollateralDeposit,
    }))
    .filter((d) => !Number.isNaN(d.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

export const kaminoLoans = (fetchImpl: typeof fetch = fetch): KaminoLoans => {
  const get = async (path: string): Promise<unknown> => {
    const res = await fetchImpl(`${BASE}${path}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`kamino api: loan history answered ${res.status}`);
    return res.json();
  };
  const route = (market: string, obligation: string) =>
    `/v2/kamino-market/${encodeURIComponent(market)}/obligations/${encodeURIComponent(obligation)}`;
  return {
    transactions: async (market, obligation) =>
      get(`${route(market, obligation)}/transactions`)
        .then(parseTransactions)
        .catch(() => null),
    days: async (market, obligation) =>
      get(`${route(market, obligation)}/metrics/history`)
        .then(parseDays)
        .catch(() => null),
  };
};
