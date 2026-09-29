import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "./client";
import { useSignedIn } from "./hooks";

/** One collateral line from GET /v1/borrow. Money as numbers: these are display figures. */
export type BorrowRow = {
  readonly ticker: string;
  readonly isStock: boolean;
  readonly decimals: number;
  readonly ltv: number;
  readonly liquidationThreshold: number;
  readonly pricePerToken: number;
  readonly depositedTokens: number;
  readonly depositedUsd: number;
  readonly depositableTokens: number;
  readonly depositableUsd: number;
  /** This stock alone at the safety target, pledged or pledgeable. */
  readonly safeLimitUsd: number;
  /** What can be borrowed against it right now, within the pool. */
  readonly borrowableUsd: number;
  /** At the target on this stock alone, the fall that would reach liquidation. */
  readonly cushionAtTarget: number;
  /** The price per token at which Kamino would liquidate, everything else held still. */
  readonly liquidationPrice: number | null;
  /** How far today's price is above it, 0–1. */
  readonly liquidationDistance: number | null;
};

/**
 * Where a loan stands. Healthy is inside the 80% limit; over_limit and
 * margin_call lock borrowing and withdrawals until a repay; liquidation means
 * Kamino is selling.
 */
export type Health = "healthy" | "over_limit" | "margin_call" | "liquidation";

export type Borrow = {
  readonly safetyTarget: number;
  readonly cashUsd: number;
  readonly collateralUsd: number;
  readonly debtUsd: number;
  readonly borrowableNowUsd: number;
  readonly overTargetUsd: number;
  readonly health: Health;
  readonly locked: boolean;
  /** Debt over the point Kamino liquidates, 0–1. The margin call is at 0.85. */
  readonly usage: number | null;
  readonly repayToClearMarginCallUsd: number;
  /** The fall that would start a margin call. */
  readonly dropToMarginCall: number | null;
  readonly borrowableUsd: number;
  /** Cash plus what could be borrowed. */
  readonly spendableUsd: number;
  readonly ltv: number;
  readonly liquidationLtv: number | null;
  readonly safeUntilDrop: number | null;
  readonly poolAvailableUsd: number;
  readonly borrowApy: number;
  readonly obligation: string | null;
  readonly collateral: readonly BorrowRow[];
};

type Wire = Record<string, string | boolean | null> & {
  collateral: Record<string, string | number | boolean | null>[];
};

const n = (v: string | boolean | null | undefined) => (v === null || v === undefined ? null : Number(v));

const fromWire = (w: Wire): Borrow => ({
  safetyTarget: Number(w["safetyTarget"]),
  cashUsd: Number(w["cashUsd"]),
  collateralUsd: Number(w["collateralUsd"]),
  debtUsd: Number(w["debtUsd"]),
  borrowableNowUsd: Number(w["borrowableNowUsd"]),
  overTargetUsd: Number(w["overTargetUsd"]),
  health: (w["health"] ?? "healthy") as Health,
  locked: String(w["locked"]) === "true",
  usage: n(w["usage"]),
  repayToClearMarginCallUsd: Number(w["repayToClearMarginCallUsd"] ?? 0),
  dropToMarginCall: n(w["dropToMarginCall"]),
  borrowableUsd: Number(w["borrowableUsd"]),
  spendableUsd: Number(w["spendableUsd"]),
  ltv: Number(w["ltv"]),
  liquidationLtv: n(w["liquidationLtv"]),
  safeUntilDrop: n(w["safeUntilDrop"]),
  poolAvailableUsd: Number(w["poolAvailableUsd"]),
  borrowApy: Number(w["borrowApy"]),
  obligation: typeof w["obligation"] === "string" ? w["obligation"] : null,
  collateral: w.collateral.map((r) => ({
    ticker: String(r["ticker"]),
    isStock: r["isStock"] === true,
    decimals: Number(r["decimals"]),
    ltv: Number(r["ltv"]),
    liquidationThreshold: Number(r["liquidationThreshold"]),
    pricePerToken: Number(r["pricePerToken"]),
    depositedTokens: Number(r["depositedTokens"]),
    depositedUsd: Number(r["depositedUsd"]),
    depositableTokens: Number(r["depositableTokens"]),
    depositableUsd: Number(r["depositableUsd"]),
    safeLimitUsd: Number(r["safeLimitUsd"]),
    borrowableUsd: Number(r["borrowableUsd"]),
    cushionAtTarget: Number(r["cushionAtTarget"]),
    liquidationPrice: r["liquidationPrice"] === null ? null : Number(r["liquidationPrice"]),
    liquidationDistance: r["liquidationDistance"] === null ? null : Number(r["liquidationDistance"]),
  })),
});

/** The account's Kamino position and what it can spend: cash plus what it could borrow. */
export const useBorrow = () => {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ["api", "borrow"],
    queryFn: async () => fromWire(await apiFetch<Wire>("/v1/borrow")),
    enabled: signedIn,
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
};

export type BorrowIntent =
  | { kind: "deposit_and_borrow"; ticker: string; tokensRaw: string; usd: string }
  | { kind: "deposit"; ticker: string; tokensRaw: string }
  | { kind: "borrow"; usd: string }
  | { kind: "repay"; usd: string | "all" }
  | { kind: "withdraw"; ticker: string; tokensRaw: string | "all" };

export type Step = "building" | "signing" | "sending" | "done";

const toBytes = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/**
 * One borrowing action, end to end: the server checks it against the safety
 * target and builds unsigned transactions, the embedded wallet signs each, and
 * the server broadcasts them in order, waiting for each to confirm. A first-time
 * borrower signs twice: one-time setup, then the action.
 */
export const useBorrowAction = () => {
  const qc = useQueryClient();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const [step, setStep] = useState<Step | null>(null);
  const [progress, setProgress] = useState<{ at: number; of: number }>({ at: 0, of: 0 });

  const mutation = useMutation({
    mutationFn: async (intent: BorrowIntent) => {
      const wallet = wallets[0];
      if (wallet === undefined) throw new Error("No wallet is connected to sign with.");
      setStep("building");
      const built = await apiFetch<{ transactions: string[]; firstTime: boolean }>(
        "/v1/borrow/transactions",
        {
          method: "POST",
          body: JSON.stringify(intent),
        },
      );
      const signatures: string[] = [];
      for (const [i, tx] of built.transactions.entries()) {
        setProgress({ at: i + 1, of: built.transactions.length });
        setStep("signing");
        const { signedTransaction } = await signTransaction({ transaction: toBytes(tx), wallet });
        setStep("sending");
        const sent = await apiFetch<{
          signature: string;
          status: string;
          ok?: boolean;
          error?: string | null;
          logs?: string[];
        }>("/v1/transactions/send", {
          method: "POST",
          body: JSON.stringify({ transaction: toBase64(signedTransaction) }),
        }).catch((e: unknown) => {
          // A failed simulation answers 422 with the program's own reason in the body.
          throw e instanceof Error ? e : new Error("The transaction failed.");
        });
        if (sent.status === "failed") throw new Error(sent.error ?? "The transaction failed on chain.");
        signatures.push(sent.signature);
      }
      setStep("done");
      return { signatures };
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["api"] });
    },
    onError: () => setStep(null),
  });

  /* Same race the buy sheet waits out: Privy fills the wallet list a beat
     after load, and an empty list there is not a missing wallet. */
  const walletReady = wallets[0] !== undefined;

  return { ...mutation, step, progress, walletReady, reset: () => (mutation.reset(), setStep(null)) };
};
