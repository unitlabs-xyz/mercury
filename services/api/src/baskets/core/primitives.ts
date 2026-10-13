import { customAlphabet } from "nanoid";
import slugify from "slugify";
import type {
  BasketExitMessage,
  BasketExitMode,
  BasketExitSubmission,
  BasketTag,
} from "@mercury/types";

export interface BasketDefinition {
  slug: string;
  /** Null until Glider holds the strategy. The same spelling on both kinds of basket. */
  providerId: string | null;
  name: string;
  description: string;
  assets: readonly { assetId: string; weightBps: number }[];
  schedule: { type: "interval"; frequency: "daily" };
}

/**
 * One tokenised equity a basket may be built from.
 *
 * Narrower than the universe this product trades. Glider's registry classifies
 * xStocks as crypto and will not hold it inside a strategy, so this is Ondo's
 * equities and nothing else — a distinction invisible on the Invest page and
 * decisive here.
 */
export interface BasketAsset {
  /** The Solana mint, and the natural key: Glider is addressed by it. */
  readonly mint: string;
  /** The company, as somebody searching would type it: NVDA, not NVDAon. */
  readonly ticker: string;
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly logoUrl: string | null;
}

/** Solana, in CAIP-2, as every `assetId` in a definition is written. */
export const SOLANA = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

/** The id a strategy holds an asset by, derived so the mint is written down once. */
export const assetIdFor = (mint: string): string => `${SOLANA}/spl:${mint}`;

/** A basket somebody wrote for themselves. Private to its author. */
export interface CustomBasket {
  readonly id: string;
  readonly userId: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly assets: readonly { assetId: string; ticker: string; weightBps: number }[];
  /** Null while a draft: the row is written before Glider is called. */
  readonly providerId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** What somebody typed into the authoring panel, before any of it is believed. */
export interface BasketDraft {
  readonly name: string;
  readonly description: string;
  /** Tickers are not read: they are resolved from the catalogue by `assetId`. */
  readonly assets: readonly { assetId: string; weightBps: number }[];
}

/**
 * The one thing wrong with a draft, or null.
 *
 * Glider's own limits, measured rather than read off a page: 1–50 assets and
 * weights totalling exactly 100.00. `unknown_asset` is ours — Glider's
 * `validate` accepts a strategy holding BONK, so it is not an asset gate, and
 * the catalogue is the only signal we have that a mint can actually be traded.
 */
export type DraftProblem =
  | "name_required"
  | "name_too_long"
  | "no_assets"
  | "too_many_assets"
  | "duplicate_asset"
  | "unknown_asset"
  | "weights_must_total_10000";

export const NAME_MAX = 60;
export const DESCRIPTION_MAX = 280;
const ASSETS_MAX = 50;
const TOTAL_BPS = 10_000;

/** Pure, so the rules are a table rather than a database. `holdable` is the catalogue's asset ids. */
export const problemWith = (draft: BasketDraft, holdable: ReadonlySet<string>): DraftProblem | null => {
  if (draft.name.trim() === "") return "name_required";
  if (draft.name.trim().length > NAME_MAX) return "name_too_long";
  if (draft.assets.length === 0) return "no_assets";
  if (draft.assets.length > ASSETS_MAX) return "too_many_assets";
  const ids = draft.assets.map((asset) => asset.assetId);
  if (new Set(ids).size !== ids.length) return "duplicate_asset";
  if (ids.some((id) => !holdable.has(id))) return "unknown_asset";
  const total = draft.assets.reduce((sum, asset) => sum + asset.weightBps, 0);
  return total === TOTAL_BPS ? null : "weights_must_total_10000";
};

/** No i/l/o/u: the slug goes in a URL people read aloud and retype. */
const suffix = customAlphabet("0123456789abcdefghjkmnpqrstvwxyz", 8);

const STEM_MAX = 40;

export const randomSuffix = (): string => suffix();

/**
 * Custom and curated baskets share one slug namespace, because every basket
 * route resolves `/:slug` through a single lookup. The suffix is what stops a
 * basket named "Magnificent Seven" addressing the curated one.
 */
export const slugFor = (name: string, suffix: string): string => {
  const stem = slugify(name, { lower: true, strict: true, trim: true }).slice(0, STEM_MAX).replace(/-+$/, "");
  return `${stem || "basket"}-${suffix}`;
};

/**
 * What enrolling, funding, rebalancing or exiting needs of a basket, whoever
 * wrote it. Resolution has already proved Glider holds the strategy, so
 * `providerId` is not optional here.
 */
export interface LiveBasket {
  readonly slug: string;
  readonly name: string;
  readonly providerId: string;
  readonly assets: readonly { assetId: string; ticker: string; weightBps: number }[];
}

/** Catalog metadata stays with the definition so sync and discovery read one source. */
export interface CuratedBasket extends BasketDefinition {
  sourceStrategyId: string;
  tags: readonly BasketTag[];
  assets: readonly (BasketDefinition["assets"][number] & { ticker: string })[];
}

export interface StrategyPerformance {
  asOf: string;
  points: readonly { date: string; percentChange: string }[];
  windows: readonly {
    window: "1d" | "1w" | "1m" | "3m" | "6m" | "12m" | "all";
    percentChange: string;
    since: string;
  }[];
}

export type ProviderBasket = Omit<BasketDefinition, "slug" | "providerId" | "schedule"> & {
  id: string;
  schedule: unknown;
};

export interface ProviderPortfolio {
  portfolioId: string;
  ownerAccountId: string;
  strategyId: string;
  smartAccounts: readonly { accountId: string; depositAccountId?: string | undefined }[];
}

export interface EnrollmentChallenge {
  flowId: string;
  accountIndex: string;
  agentAccountId: string;
  message: { kind: "solana-message"; text: string };
  solanaTransaction?: string | undefined;
}

export interface EnrollmentIntent {
  id: string;
  userId: string;
  slug: string;
  ownerAccountId: string;
  strategyId: string;
  challenge: EnrollmentChallenge;
  expiresAt: Date;
  portfolioId: string | null;
}

export interface ExitIntentPayload {
  mode: BasketExitMode;
  /** Optional for exit intents recorded before selected USDC withdrawals existed. */
  submission?: BasketExitSubmission | undefined;
  smartAccountId: string;
  recipientAccountId: string;
  baselineSignature: string | null;
  authorization: { message: BasketExitMessage; signature: string };
  /** The exact mint quantities covered by the signed Glider authorization. */
  authorizedAssets: readonly { mint: string; amountRaw: string }[];
  expectedTransfers: readonly {
    mint: string;
    symbol: string;
    /** Null for liquidate-to-USDC because the signed input does not promise its output amount. */
    amountRaw: string | null;
  }[];
  templateName: string;
}

export interface ExitIntent {
  id: string;
  userId: string;
  slug: string;
  ownerAccountId: string;
  strategyId: string;
  portfolioId: string;
  nonce: string;
  payload: ExitIntentPayload;
  operationId: string | null;
  submittedAt: Date | null;
  createdAt: Date;
}

/** One asset as the picker shows it: the ticker, and the id a strategy holds it by. */
export interface PickableAsset {
  readonly ticker: string;
  readonly name: string;
  readonly assetId: string;
  readonly logoUrl: string | null;
}

/** What a catalogue refresh did, including deciding not to. */
export interface AssetSyncResult {
  readonly written: number;
  readonly offered: number;
  /** True when the answer was too thin to believe and the catalogue stands. */
  readonly held: boolean;
}

export interface SyncResult {
  strategyIds: Record<string, string>;
  recorded: number;
  reused: number;
  created: number;
}
