import type { Portfolio, PortfolioSummary } from "@mercury/types";
import { usd, usdSigned } from "@mercury/view";
import { walletName } from "../../api/wallets";

type SummaryWallet = PortfolioSummary["wallets"][number];
type Health = NonNullable<SummaryWallet["loanHealth"]>;

/** A loan's health as a badge says it, and how loud. */
export const HEALTH: Record<Health, { readonly label: string; readonly tone: "up" | "warn" | "down" }> = {
  healthy: { label: "Loan healthy", tone: "up" },
  over_limit: { label: "Loan over limit", tone: "warn" },
  margin_call: { label: "Margin call", tone: "down" },
  liquidation: { label: "Near liquidation", tone: "down" },
};

/** "1 wallet calculating", or nothing when every wallet's past is read. */
export const calculatingNote = (n: number): string | null =>
  n === 0 ? null : `${n} wallet${n === 1 ? "" : "s"} calculating`;

/**
 * The summary's lines, as text. P&L starts with `~` when any of the cost
 * behind it is estimated, and says how much. With every wallet still being
 * read there is nothing to show, which is "Calculating…" rather than $0.
 */
export const summaryLines = (s: PortfolioSummary) => {
  const ready = s.wallets.length - s.calculating;
  const estimated = Number(s.pnl.estimatedCostUsd) > 0;
  const waiting = ready === 0;
  return {
    netWorth: usd(s.netWorthUsd),
    pnl: waiting
      ? "Calculating…"
      : `${estimated ? "~" : ""}${usdSigned(s.pnl.totalUsd)}${
          s.pnl.returnPct === null
            ? ""
            : ` (${Number(s.pnl.returnPct) >= 0 ? "+" : "−"}${Math.abs(Number(s.pnl.returnPct)).toFixed(1)}%)`
        }`,
    pnlSub: waiting ? null : estimated ? `${usd(s.pnl.estimatedCostUsd, 0)} of cost estimated` : null,
    income: waiting ? "Calculating…" : usdSigned(s.income.totalUsd),
    incomeSub: waiting ? null : `Earn ${usd(s.income.earnUsd)} · Dividends ${usd(s.income.dividendsUsd)}`,
    loanInterest: waiting
      ? "Calculating…"
      : Number(s.loanInterestUsd) === 0
        ? usd(0)
        : `−${usd(s.loanInterestUsd)}`,
    calculating: calculatingNote(s.calculating),
  };
};

export interface WalletCard {
  readonly id: string;
  readonly name: string;
  readonly isPrimary: boolean;
  /** Live while Home is open; the last hourly reading when the live read is not there. Null before either. */
  readonly valueUsd: string | null;
  /** Only live figures carry a day's change. */
  readonly changePct: string | null;
  readonly isLive: boolean;
  /** When the hourly reading was taken, for "as of" when it is what is shown. */
  readonly asOf: string | null;
  readonly loan: (typeof HEALTH)[Health] | null;
  /** What the wallet owes: live while Home is open, else as of its last loan reading. */
  readonly debtUsd: string;
  readonly calculating: boolean;
}

/**
 * One card per wallet, the Mercury wallet first and then linked wallets in the
 * order they were linked, as the summary lists them. Each shows its live
 * value when the live read has it, and its last hourly reading when not.
 */
export const walletCards = (
  summary: PortfolioSummary,
  live: Portfolio | undefined,
): readonly WalletCard[] => {
  const now = new Map((live?.wallets ?? []).map((w) => [w.walletId, w]));
  return summary.wallets.map((w) => {
    const fresh = now.get(w.id);
    return {
      id: w.id,
      name: walletName(w),
      isPrimary: w.isPrimary,
      valueUsd: fresh?.totalValueUsd ?? w.valueUsd,
      changePct: fresh?.changePct ?? null,
      isLive: fresh !== undefined,
      asOf: fresh === undefined ? w.asOf : null,
      loan: w.loanHealth === null ? null : HEALTH[w.loanHealth],
      debtUsd: fresh?.debtUsd ?? w.debtUsd,
      calculating: w.history === "calculating",
    };
  });
};

/**
 * Each wallet's colour, following the wallet and never its size: the Mercury
 * wallet wears the first chart series, and linked wallets the next ones in
 * the order they were linked. There are five validated series (tokens.css),
 * so a fifth linked wallet and beyond wear grey rather than a made-up hue;
 * their names in the legend still tell them apart.
 */
export const walletColor = (card: Pick<WalletCard, "isPrimary">, linkedIndex: number): string =>
  card.isPrimary
    ? "var(--color-series-1)"
    : linkedIndex < 4
      ? `var(--color-series-${linkedIndex + 2})`
      : "var(--color-ds-muted)";

export interface WalletSlice extends WalletCard {
  readonly color: string;
  /** The wallet's value as a number; 0 before its first reading. */
  readonly value: number;
  /**
   * Its part of everything held, 0 to 1, out of the wallets that hold
   * something. Null before its first reading. A wallet owing more than it
   * holds has none of the ring, and 0 here.
   */
  readonly share: number | null;
}

/** The cards as pieces of the ring: each wallet's colour and share of the whole. */
export const walletSlices = (cards: readonly WalletCard[]): readonly WalletSlice[] => {
  const values = cards.map((c) => (c.valueUsd === null ? 0 : Number(c.valueUsd)));
  const held = values.reduce((sum, v) => sum + (Number.isFinite(v) && v > 0 ? v : 0), 0);
  let linked = 0;
  return cards.map((card, i) => {
    const value = values[i] ?? 0;
    const color = walletColor(card, card.isPrimary ? 0 : linked++);
    const share = card.valueUsd === null ? null : held === 0 || !(value > 0) ? 0 : value / held;
    return { ...card, color, value, share };
  });
};

/** "34%", or "<1%" for a sliver, which a rounded 0% would hide. */
export const sharePct = (share: number | null): string =>
  share === null ? "—" : share > 0 && share < 0.005 ? "<1%" : `${Math.round(share * 100)}%`;

/**
 * Every wallet's loan, each on its own: a loan belongs to one wallet, its
 * health is that wallet's, and repaying is done from it. Wallets owing
 * nothing are left out; the worst loan comes first, then the larger.
 */
export const walletLoans = (cards: readonly WalletCard[]): readonly WalletCard[] => {
  const rank = (c: WalletCard) => (c.loan === null ? 0 : { up: 0, warn: 1, down: 2 }[c.loan.tone]);
  return cards
    .filter((c) => Number(c.debtUsd) > 0)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(b.c) - rank(a.c) || Number(b.c.debtUsd) - Number(a.c.debtUsd) || a.i - b.i)
    .map(({ c }) => c);
};
