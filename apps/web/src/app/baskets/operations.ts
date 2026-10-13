import type { BasketExitMode, BasketOperation, BasketPortfolioSummary } from "@mercury/types";

/*
 * The rebalances and withdrawals a person started in this browser session.
 * Glider accepts the work before Mercury records it, so these keys are what
 * keeps an operation visible between submission and the durable row landing.
 */
const REBALANCE_PREFIX = "basket-rebalance:";
const EXIT_PREFIX = "basket-exit:";

type StoredExit = { operationId: string; mode: BasketExitMode };

const isMode = (value: unknown): value is BasketExitMode => value === "in_kind" || value === "liquidate_usdc";

const readExit = (raw: string | null): StoredExit | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { operationId?: unknown; mode?: unknown };
    return typeof parsed.operationId === "string" && isMode(parsed.mode)
      ? { operationId: parsed.operationId, mode: parsed.mode }
      : null;
  } catch {
    /* An invalid local receipt is not an operation. */
    return null;
  }
};

export const readPortfolioOperations = (portfolioId: string) => ({
  rebalanceId: sessionStorage.getItem(`${REBALANCE_PREFIX}${portfolioId}`),
  exit: readExit(sessionStorage.getItem(`${EXIT_PREFIX}${portfolioId}`)),
});

/** One operation a person started this session, against the basket it belongs to. */
export type BasketOperationRow = {
  key: string;
  portfolio: BasketPortfolioSummary;
  name: string;
  label: string;
  state: BasketOperation["state"] | undefined;
  unavailable: boolean;
  occurredAt: string | null;
};

const ACTIVE: ReadonlySet<string> = new Set(["accepted", "running", "retrying", "awaiting_user"]);

/** A state Glider has not reported yet is still work in flight, not a finished run. */
const isActive = (state: BasketOperation["state"] | undefined) => state === undefined || ACTIVE.has(state);

/* Work in flight first, then the most recent result, so a finished run is still confirmable. */
export const sortOperationRows = (rows: readonly BasketOperationRow[]): readonly BasketOperationRow[] =>
  [...rows].sort(
    (a, b) =>
      Number(isActive(b.state)) - Number(isActive(a.state)) ||
      (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""),
  );
