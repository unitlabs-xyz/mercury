import type {
  BasketExitMessage,
  BasketExitMode,
  BasketExitSubmission,
  ManagedBasketTag,
} from "@mercury/types";

export interface BasketDefinition {
  slug: string;
  providerId?: string;
  name: string;
  description: string;
  assets: readonly { assetId: string; weightBps: number }[];
  schedule: { type: "interval"; frequency: "daily" };
}

/** Catalog metadata stays with the definition so sync and discovery read one source. */
export interface BasketTemplate extends BasketDefinition {
  sourceStrategyId: string;
  status: "candidate" | "disabled" | "enabled";
  tags: readonly ManagedBasketTag[];
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

export interface BasketPortfolio {
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

export interface SyncResult {
  strategyIds: Record<string, string>;
  recorded: number;
  reused: number;
  created: number;
}
