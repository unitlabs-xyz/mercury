import { useQuery } from "@tanstack/react-query";
import type { Finish } from "../cards/CardArt";
import { SAMPLE, SAMPLE_DASHBOARD } from "../dev/sample";
import { useSignedIn } from "./hooks";

/**
 * What the portfolio dashboard shows beside the holdings: the credit line
 * against them, the card that spends it, and what is coming up.
 *
 * None of this has an endpoint yet — borrowing and the card arrive with later
 * subsystems — so every field is empty for now and the panels say so. Borrowing *power* is the exception: it is holdings times Kamino's
 * published LTVs, both real, and the portfolio screen computes it itself.
 */
export type CardTxn = {
  readonly date: string;
  readonly merchant: string;
  readonly category: string;
  readonly amountUsd: number;
  readonly mode: "credit" | "cash";
};

export type Repayment = {
  readonly date: string;
  readonly amountUsd: number;
  readonly source: string;
};

export type Loan = {
  readonly borrowedUsd: number;
  readonly interestAccruedUsd: number;
  readonly borrowApy: number;
  /** Where Kamino starts selling collateral, as a share of its value. */
  readonly liquidationLtv: number;
  readonly openedAt: string;
  readonly repayments: readonly Repayment[];
};

export type CardAccount = {
  readonly plan: string;
  readonly finish: Finish;
  readonly last4: string;
  readonly mode: "credit" | "cash";
  readonly monthlyLimitUsd: number;
  readonly spentThisMonthUsd: number;
  readonly statementBalanceUsd: number;
  readonly statementDue: string;
  readonly minimumDueUsd: number;
  readonly autopay: boolean;
  readonly cashbackRate: number;
  readonly cashbackEarnedUsd: number;
  readonly frozen: boolean;
  readonly transactions: readonly CardTxn[];
};

export type Upcoming = {
  readonly date: string;
  readonly kind: "queued" | "card" | "interest" | "dividend" | "loan";
  readonly title: string;
  readonly detail: string;
  readonly amountUsd: number | null;
};

export type Dashboard = {
  readonly loan: Loan | null;
  readonly card: CardAccount | null;
  readonly upcoming: readonly Upcoming[];
  /** Max LTV by ticker, when the server has one; otherwise the app reads Kamino. */
  readonly ltv: Readonly<Record<string, number>> | null;
};

const EMPTY: Dashboard = { loan: null, card: null, upcoming: [], ltv: null };

export const useDashboard = () => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["dashboard"],
    // No endpoint yet: resolve empty so every panel renders its real empty state.
    queryFn: () => Promise.resolve(SAMPLE ? SAMPLE_DASHBOARD : EMPTY),
    enabled: signedIn,
    staleTime: 30_000,
  });
};
