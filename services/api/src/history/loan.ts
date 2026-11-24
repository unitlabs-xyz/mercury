import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { instruments, tokens } from "../db/schema.js";
import type { LendingSource } from "../lending/ports.js";
import type { KaminoLoans } from "../lending/kamino-loans.js";
import { planChainLoan, recordChainLoan, type ListedStock } from "../lending/chain-loan.js";

export interface LoanHistoryDeps {
  readonly db: Db;
  /** Finds the wallet's loan by its owner, as loan health already does. */
  readonly lending: Pick<LendingSource, "position">;
  readonly loans: KaminoLoans;
  /** The xStocks lending market the loan is in. */
  readonly market: string;
  readonly usdcMint: string;
}

export type LoanHistoryResult =
  | { readonly kind: "none" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "read"; readonly written: number };

/**
 * A linked wallet's loan, read into the ledger from Kamino: when it was
 * opened, each pledge at its price then, each withdrawal, borrow and repay,
 * and anything Kamino sold. With every borrow and repay in the ledger, the
 * loan screen splits the debt into what was borrowed and the interest, as it
 * does for a loan made in Mercury.
 *
 * Read again on each of the wallet's later passes, which costs one call to
 * Kamino and writes only what is new: the ledger's key keeps every row once,
 * and keeps a row Mercury recorded as Mercury recorded it.
 *
 * "unavailable" when Kamino could not be read: the next pass tries again.
 */
export async function readLoanHistory(
  deps: LoanHistoryDeps,
  wallet: { readonly userId: string; readonly walletId: string; readonly address: string },
): Promise<LoanHistoryResult> {
  const position = await deps.lending.position(wallet.address);
  if (position === null) return { kind: "none" };
  const [txs, days] = await Promise.all([
    deps.loans.transactions(deps.market, position.obligation),
    deps.loans.days(deps.market, position.obligation),
  ]);
  if (txs === null) return { kind: "unavailable" };
  const stocks = new Map<string, ListedStock>(
    (
      await deps.db
        .select({ mint: tokens.mint, ticker: instruments.ticker, decimals: tokens.decimals })
        .from(tokens)
        .innerJoin(instruments, eq(instruments.id, tokens.instrumentId))
    ).map((r) => [r.mint, { ticker: r.ticker, decimals: r.decimals }]),
  );
  // Without the daily closes, each row's position is worked forward from nothing, which is still right in total.
  const events = planChainLoan(txs, days ?? [], stocks, deps.usdcMint);
  const { written } = await recordChainLoan(deps.db, wallet, events);
  return { kind: "read", written };
}
