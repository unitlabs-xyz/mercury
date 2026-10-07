/**
 * Glider baskets, as both clients present them.
 *
 * Lifted out of the web when the phone gained the same screens. Two pieces here
 * guard money: `enrollBasket` and `fundBasket` re-check what the server
 * prepared — the portfolio, the destination, the exact amount, the expiry —
 * before anything reaches the wallet to sign. The rest is presentation that
 * would otherwise drift between a phone and a browser: the catalog's shelves,
 * the modeled-return series, and the allocation mosaic.
 */
import type {
  ManagedBasketPortfolio,
  ManagedBasketTag,
  ManagedBasketTemplate,
  PreparedBasketEnrollment,
  PreparedBasketFunding,
} from "@mercury/types";

/** Glider's id for Solana USDC: how a smart account's cash is told apart from its holdings. */
export const USDC_ASSET_ID =
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** The CAIP account id a Solana wallet address goes by, as an exit's recipient. */
export const solanaAccountId = (address: string) => `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${address}`;

/** "Mercury Solana – AI Leaders" → "AI Leaders". */
export const displayBasketName = (name: string) => name.replace(/^Mercury Solana\s*[-–]\s*/, "");

export const BASKET_THEMES: readonly { tag: ManagedBasketTag; title: string; description: string }[] = [
  {
    tag: "theme:technology",
    title: "Technology",
    description: "Computing and the next generation internet.",
  },
  { tag: "theme:energy", title: "Energy", description: "Powering a changing world." },
  { tag: "theme:defense", title: "Defense", description: "Security for a more stable tomorrow." },
  { tag: "theme:consumer", title: "Consumer", description: "The brands people live with." },
  { tag: "theme:finance", title: "Finance", description: "The future of financial services." },
  { tag: "theme:hard-assets", title: "Hard assets", description: "Materials and real-world infrastructure." },
  { tag: "theme:healthcare", title: "Healthcare", description: "Science and modern medicine." },
];

/** The investor-inspired strategies, in the order the shelf shows them. */
export const BASKET_INVESTORS = [
  "nancy-pelosi-tracker",
  "warren-buffett-tracker",
  "cathie-wood-tracker",
  "leopold-aschenbrenner-tracker",
] as const;

export const themeTitle = (tag: ManagedBasketTag) =>
  BASKET_THEMES.find((t) => t.tag === tag)?.title ?? tag.replace("theme:", "");

/** What a template's status means to someone deciding whether to enroll. */
export const basketStatusLabel = (status: ManagedBasketTemplate["status"]) =>
  status === "enabled" ? "Available" : status === "candidate" ? "Enrollment pilot" : "Preview";

/** Featured by default; a theme narrows it; "all" widens it. */
export const visibleStrategies = (
  templates: readonly ManagedBasketTemplate[],
  selected: ManagedBasketTag | null,
  showAll: boolean,
) =>
  selected
    ? templates.filter((item) => item.tags.includes(selected))
    : showAll
      ? [...templates]
      : templates.filter((item) => item.tags.includes("shelf:featured"));

/** Holdings by weight, largest first. */
export const byWeight = <T extends { weightBps: number }>(items: readonly T[]) =>
  [...items].sort((a, b) => b.weightBps - a.weightBps);

export const weightLabel = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.00$/, "")}%`;
export const returnLabel = (value: string | number) =>
  `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)}%`;

/** The return windows Glider models, under the labels a range switch shows. */
export const BASKET_RANGES = [
  { key: "1M", window: "1m" },
  { key: "3M", window: "3m" },
  { key: "6M", window: "6m" },
  { key: "1Y", window: "12m" },
  { key: "All", window: "all" },
] as const;
export type BasketRange = (typeof BASKET_RANGES)[number]["key"];

/** Glider points are cumulative TWR; a selected window needs its own opening baseline. */
export const modeledSeries = (points: readonly { date: string; percentChange: string }[], since?: string) => {
  const selected = points.filter((point) => since === undefined || point.date >= since);
  const opening = Number(selected[0]?.percentChange);
  if (!Number.isFinite(opening) || opening <= -100) return [];
  return selected
    .map((point) => ({
      label: new Date(`${point.date}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      value: Number((((1 + Number(point.percentChange) / 100) / (1 + opening / 100) - 1) * 100).toFixed(6)),
    }))
    .filter((point) => Number.isFinite(point.value));
};

/** A template's modeled series and return for one range, as the detail page charts it. */
export const modeledRange = (performance: ManagedBasketTemplate["performance"], range: BasketRange) => {
  const window = BASKET_RANGES.find((r) => r.key === range)?.window;
  const chosen = performance?.windows.find((item) => item.window === window);
  const since = chosen?.since ?? (range === "All" ? performance?.points[0]?.date : undefined);
  const series =
    chosen === undefined && range !== "All" ? [] : modeledSeries(performance?.points ?? [], since);
  return { series, change: chosen?.percentChange ?? null };
};

type Holding = { readonly ticker: string; readonly weightBps: number };

export type AllocationTile<T extends Holding> =
  | { readonly kind: "asset"; readonly ticker: string; readonly weightBps: number; readonly asset: T }
  | {
      readonly kind: "other";
      readonly ticker: "Other";
      readonly weightBps: number;
      readonly assets: readonly T[];
    };

/** Seven named holdings plus the rest, arranged as a compact target-weight mosaic. */
export const allocationRows = <T extends Holding>(holdings: readonly T[]): AllocationTile<T>[][] => {
  const sorted = [...holdings].sort((a, b) => b.weightBps - a.weightBps);
  const tiles: AllocationTile<T>[] = sorted.slice(0, 7).map((asset) => ({
    kind: "asset",
    ticker: asset.ticker,
    weightBps: asset.weightBps,
    asset,
  }));
  const remainingAssets = sorted.slice(7);
  const remaining = remainingAssets.reduce((sum, asset) => sum + asset.weightBps, 0);
  if (remaining > 0)
    tiles.push({ kind: "other", ticker: "Other", weightBps: remaining, assets: remainingAssets });
  if (tiles.length <= 2) return [tiles];
  if (tiles.length <= 5) return [tiles.slice(0, 2), tiles.slice(2)];
  return [tiles.slice(0, 2), tiles.slice(2, 4), tiles.slice(4)];
};

/** "2d 4h", "3h 12m", "Due now": time until the next scheduled rebalance. */
export const countdownText = (remainingMs: number | null, paused: boolean) => {
  if (paused) return "Paused";
  if (remainingMs === null) return "—";
  if (remainingMs === 0) return "Due now";
  const minutes = Math.floor(Math.ceil(remainingMs / 1_000) / 60);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
};

/** An operation still worth polling, and still blocking another write. */
export const operationActive = (state: string | undefined) =>
  !state || ["accepted", "running", "retrying", "awaiting_user"].includes(state);

export interface EnrollmentIo {
  prepare: () => Promise<PreparedBasketEnrollment>;
  submit: (body: { intentId: string; signed: string }) => Promise<ManagedBasketPortfolio>;
  signMessage: (text: string) => Promise<string>;
  signTransaction: (base64: string) => Promise<string>;
}

/** One challenge, one wallet signature, one submission; Glider never receives a client-held API key. */
export async function enrollBasket(_slug: string, io: EnrollmentIo): Promise<ManagedBasketPortfolio> {
  const prepared = await io.prepare();
  const signed =
    prepared.authorization.kind === "solana-message"
      ? await io.signMessage(prepared.authorization.text)
      : await io.signTransaction(prepared.authorization.transaction);
  return io.submit({ intentId: prepared.intentId, signed });
}

export type FundingReceipt = { signature: string; status: "confirmed" | "pending" };

export interface FundingIo {
  prepare: (amountUsd: string) => Promise<PreparedBasketFunding>;
  sign: (unsignedTransaction: string) => Promise<string>;
  send: (signedTransaction: string) => Promise<FundingReceipt>;
}

export const FUNDING_AMOUNT = /^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/;

/** Where a portfolio takes USDC: its Solana smart account's deposit address. */
export const fundingDestination = (portfolio: Pick<ManagedBasketPortfolio, "smartAccounts">) => {
  const account = portfolio.smartAccounts.find((item) => item.accountId.startsWith("solana:"));
  return account ? (account.depositAccountId ?? account.accountId) : null;
};

/** Recheck the prepared amount and recipient before handing bytes to the wallet. */
export async function fundBasket(
  amountUsd: string,
  portfolio: ManagedBasketPortfolio,
  io: FundingIo,
): Promise<FundingReceipt> {
  if (!FUNDING_AMOUNT.test(amountUsd)) throw new Error("Enter a valid USDC amount.");
  const [whole = "0", fraction = ""] = amountUsd.split(".");
  const amountRaw = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0") || "0");
  if (amountRaw === 0n) throw new Error("Enter an amount greater than zero.");
  const destination = fundingDestination(portfolio);
  if (!destination) throw new Error("This portfolio has no Solana funding account.");
  const prepared = await io.prepare(amountUsd);
  if (prepared.portfolioId !== portfolio.portfolioId || prepared.destinationAccountId !== destination)
    throw new Error("Funding destination changed. Refresh the portfolio before trying again.");
  if (prepared.amountRaw !== amountRaw.toString())
    throw new Error("Funding amount changed. Review it again.");
  if (Date.parse(prepared.expiresAt) <= Date.now() + 5_000)
    throw new Error("Funding transaction expired. Try again.");
  return io.send(await io.sign(prepared.transaction));
}
