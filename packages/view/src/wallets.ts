import type { EstimateSource, Portfolio, PortfolioSummary } from "@mercury/types";
import type { Borrow, BorrowRow } from "./borrow.js";
import { usd, usdSigned } from "./format.js";
import { shortAddress } from "./receipt.js";

/**
 * The header that picks which wallet a read is for: a wallet id, or `all` for
 * every followed wallet at once. Absent, the Mercury wallet. Both clients send
 * the same, so the server has one rule.
 */
export const WALLET_HEADER = "X-Mercury-Wallet";
export const ALL_WALLETS = "all";

/**
 * The wallets on someone's account: the Mercury wallet, and the Solana wallets
 * they already hold and have linked beside it. The wire shape of
 * `GET /v1/wallets`, read the same by web and the phone.
 */
export interface AccountWallet {
  readonly id: string;
  readonly address: string;
  readonly kind: "privy_embedded" | "external";
  readonly isPrimary: boolean;
  readonly label: string | null;
  readonly linkedAt: string | null;
}

export interface AccountWallets {
  readonly wallets: readonly AccountWallet[];
  /** How many may be linked at once, beside the Mercury wallet. */
  readonly limit: number;
  /**
   * Wallets unlinked with their history kept: not followed, nothing shown, but
   * what Mercury kept is still there to delete. Absent from an older server.
   */
  readonly kept?: readonly KeptWallet[];
}

/** A wallet unlinked with its history kept. */
export interface KeptWallet {
  readonly id: string;
  readonly address: string;
  readonly label: string | null;
  readonly unlinkedAt: string;
}

/** What a wallet is called on screen: "Mercury", its label, or its short address. */
export const walletName = (w: Pick<AccountWallet, "isPrimary" | "label" | "address">): string =>
  w.isPrimary ? "Mercury" : (w.label ?? shortAddress(w.address));

/** Linked wallets being followed. The Mercury wallet is not one. */
export const linkedCount = (wallets: readonly AccountWallet[]): number =>
  wallets.filter((w) => !w.isPrimary).length;

/** "3 of 5 linked". */
export const linkedLine = (account: AccountWallets): string =>
  `${linkedCount(account.wallets)} of ${account.limit} linked`;

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
  const earnEstimated = s.income.earnEstimated === true;
  const paid = Number(s.loanInterestPaidUsd ?? 0);
  const loanCost = paid + Number(s.loanInterestUsd);
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
    // Earn shares sent in or out by hand were valued at a day's share price: `~`, as an estimated cost is.
    income: waiting ? "Calculating…" : `${earnEstimated ? "~" : ""}${usdSigned(s.income.totalUsd)}`,
    incomeSub: waiting
      ? null
      : `Earn ${earnEstimated ? "~" : ""}${usd(s.income.earnUsd)} · Dividends ${usd(s.income.dividendsUsd)}`,
    // What borrowing has cost: interest paid already, and interest owed now. A loan repaid in full
    // still shows what it cost, where it used to read $0.
    loanInterest: waiting ? "Calculating…" : loanCost === 0 ? usd(0) : `−${usd(loanCost)}`,
    loanInterestSub: waiting || loanCost === 0 ? null : `${usd(paid)} paid · ${usd(s.loanInterestUsd)} owing`,
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

/** The five chart series each client draws in, validated as a set. */
export type Series = 1 | 2 | 3 | 4 | 5;

/**
 * Each wallet's chart series, following the wallet and never its size: the
 * Mercury wallet wears the first, and linked wallets the next ones in the
 * order they were linked. There are five validated series, so a fifth linked
 * wallet and beyond get none and each client draws them grey rather than in a
 * made-up hue; their names in the legend still tell them apart. A series, not
 * a colour, because each client keeps its own palette.
 */
export const walletSeries = (card: Pick<WalletCard, "isPrimary">, linkedIndex: number): Series | null =>
  card.isPrimary ? 1 : linkedIndex < 4 ? ((linkedIndex + 2) as Series) : null;

export interface WalletSlice extends WalletCard {
  /** Its chart series; null past the fifth, drawn grey. */
  readonly series: Series | null;
  /** The wallet's value as a number; 0 before its first reading. */
  readonly value: number;
  /**
   * Its part of everything held, 0 to 1, out of the wallets that hold
   * something. Null before its first reading. A wallet owing more than it
   * holds has none of the ring, and 0 here.
   */
  readonly share: number | null;
}

/** The cards as pieces of the ring: each wallet's series and share of the whole. */
export const walletSlices = (cards: readonly WalletCard[]): readonly WalletSlice[] => {
  const values = cards.map((c) => (c.valueUsd === null ? 0 : Number(c.valueUsd)));
  const held = values.reduce((sum, v) => sum + (Number.isFinite(v) && v > 0 ? v : 0), 0);
  let linked = 0;
  return cards.map((card, i) => {
    const value = values[i] ?? 0;
    const series = walletSeries(card, card.isPrimary ? 0 : linked++);
    const share = card.valueUsd === null ? null : held === 0 || !(value > 0) ? 0 : value / held;
    return { ...card, series, value, share };
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

/**
 * How long ago a reading was taken, for "Updated 38m ago": minutes within the
 * hour, hours within the day, then the date. `now` is a parameter so the
 * wording can be checked without a clock.
 */
export const updatedAgo = (iso: string, now: number = Date.now()): string => {
  const seconds = Math.round((now - Date.parse(iso)) / 1000);
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `on ${new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`;
};

/**
 * The line under a wallet's name: still being read, P&L still calculating,
 * which wallet it is when its figures are live, or when its last hourly
 * reading was taken when they are not.
 */
export const walletStatus = (card: WalletCard, now: number = Date.now()): string =>
  card.valueUsd === null
    ? "Reading this wallet…"
    : card.calculating
      ? "P&L calculating…"
      : card.isLive
        ? card.isPrimary
          ? "Your Mercury wallet"
          : "Linked wallet"
        : card.asOf === null
          ? ""
          : `Updated ${updatedAgo(card.asOf, now)}`;

/** The query parameter that opens the web app on one wallet: `?wallet=<id>`. */
export const WALLET_PARAM = "wallet";

/**
 * Where "Manage on web" goes for a wallet: the web app, opened on it. The web
 * reads the parameter once, chooses that wallet, and drops it from the address.
 */
export const manageOnWebUrl = (base: string, walletId: string): string =>
  `${base.replace(/\/+$/, "")}/?${WALLET_PARAM}=${encodeURIComponent(walletId)}`;

/** The parameter that opens the move into the Mercury wallet as the page loads. */
export const MOVE_PARAM = "move";

/**
 * Where "Move to Mercury wallet to trade here" goes: the web app on that
 * wallet, with the move open. The move is signed by the linked wallet, which
 * only the browser it is connected in can ask.
 */
export const moveOnWebUrl = (base: string, walletId: string): string =>
  `${manageOnWebUrl(base, walletId)}&${MOVE_PARAM}=1`;

/** Whether a link asks for the move to open, from a query string. */
export const moveFromSearch = (search: string): boolean =>
  new URLSearchParams(search).get(MOVE_PARAM) === "1";

/** The wallet a link asks to open on, from a query string; null when it names none. */
export const walletFromSearch = (search: string): string | null => {
  const id = new URLSearchParams(search).get(WALLET_PARAM)?.trim() ?? "";
  return id.length === 0 ? null : id;
};

/**
 * The stocks a loan is held against, the largest first: each with what is
 * pledged and the price at which Kamino would start selling it. Cash-like
 * collateral has no liquidation price of its own and is left out.
 */
export const pledgedStocks = (b: Borrow): readonly BorrowRow[] =>
  b.collateral.filter((c) => c.isStock && c.depositedUsd > 0).sort((x, y) => y.depositedUsd - x.depositedUsd);

/** "Kamino sells below $319.40 · 9% away", or what is known when the price is not. */
export const liquidationLine = (row: BorrowRow): string => {
  if (row.liquidationPrice === null) return "No liquidation price while nothing is owed";
  const away =
    row.liquidationDistance === null
      ? ""
      : ` · ${Math.max(0, Math.round(row.liquidationDistance * 100))}% away`;
  return `Kamino sells below ${usd(row.liquidationPrice)}${away}`;
};

/** Where linking and unlinking happen: web's Linked wallets panel. The phone cannot ask a wallet to sign. */
export const linkOnWebUrl = (base: string): string => `${base.replace(/\/+$/, "")}/?settings=wallets`;

/** One linked wallet's share of a stock, for "You also hold…". */
export interface HeldElsewhere {
  readonly walletId: string;
  readonly name: string;
  readonly shares: number;
  readonly valueUsd: number;
}

/**
 * How much of one stock each linked wallet holds, from each wallet's own
 * portfolio, in the order the wallets are given. Wallets holding none, or not
 * read yet, are left out.
 */
export const heldElsewhere = (
  ticker: string,
  wallets: readonly {
    readonly id: string;
    readonly name: string;
    readonly holdings:
      readonly { readonly ticker: string; readonly shares: string; readonly valueUsd: string }[] | undefined;
  }[],
): readonly HeldElsewhere[] =>
  wallets.flatMap((w) => {
    const h = w.holdings?.find((x) => x.ticker === ticker);
    const n = h === undefined ? 0 : Number(h.shares);
    return n > 0 ? [{ walletId: w.id, name: w.name, shares: n, valueUsd: Number(h!.valueUsd) }] : [];
  });

/** A share count as a sentence says it: up to three places, no trailing zeros, and never a held sliver as 0. */
const sharesSaid = (n: number): string => (n > 0 && n < 0.0005 ? "<0.001" : String(Number(n.toFixed(3))));

/**
 * "You also hold 2.1 in Phantom main", under the Mercury wallet's position,
 * or "You hold 2.1 in Phantom main" when the Mercury wallet holds none. Two
 * wallets join with "and"; more with commas. Null when no linked wallet does.
 */
export const alsoHoldLine = (held: readonly HeldElsewhere[], mercuryHolds: boolean): string | null => {
  if (held.length === 0) return null;
  const parts = held.map((h) => `${sharesSaid(h.shares)} in ${h.name}`);
  const list =
    parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]!}`;
  return `${mercuryHolds ? "You also hold" : "You hold"} ${list}`;
};

/** What each estimate source says, under a holding whose cost was estimated. */
const ESTIMATED_FROM: Record<EstimateSource, string> = {
  market_price: "Estimated from the share price when it arrived",
  sol_price: "Estimated from what SOL was worth when it was swapped in",
  earliest_price: "Estimated from the earliest price Mercury has",
  link_day_price: "Estimated from the price when you linked this wallet",
  own_wallet: "The cost it had in your other wallet",
};

/**
 * The line under a holding whose cost is estimated, saying where the estimate
 * came from; null when its cost is exact. Paired with "Set cost", which
 * replaces the estimate with what the person paid.
 */
export const estimateLine = (h: {
  readonly estimatedCostUsd?: string | undefined;
  readonly estimateSource?: EstimateSource | null | undefined;
}): string | null => {
  if (!(Number(h.estimatedCostUsd ?? 0) > 0)) return null;
  return h.estimateSource == null ? "Part of this cost is estimated" : ESTIMATED_FROM[h.estimateSource];
};

/** `~` before a figure measured against a cost that is partly estimated, and nothing before an exact one. */
export const estimateMark = (h: { readonly estimatedCostUsd?: string | undefined }): "~" | "" =>
  Number(h.estimatedCostUsd ?? 0) > 0 ? "~" : "";

/** Said where a figure waits for a linked wallet's past: its loan's interest, what it earned in Earn. */
export const READING_HISTORY = "Reading history…";

/**
 * Whether a figure that comes from history is still waiting for it, for the
 * wallet shown: a linked wallet whose past is being read, or, for every wallet
 * at once, any of them. The Mercury wallet's history is Mercury's own and is
 * never read. Without the summary yet, nothing is said to be waiting.
 */
export const historyReading = (
  wallets: readonly { readonly id: string; readonly history: "ready" | "calculating" }[] | undefined,
  shown:
    | { readonly kind: "mercury" }
    | { readonly kind: "linked"; readonly walletId: string }
    | { readonly kind: "all" },
): boolean => {
  if (wallets === undefined || shown.kind === "mercury") return false;
  if (shown.kind === "all") return wallets.some((w) => w.history === "calculating");
  return wallets.some((w) => w.id === shown.walletId && w.history === "calculating");
};
