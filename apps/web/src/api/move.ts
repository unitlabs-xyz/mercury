import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { useActingWallet } from "./acting-wallet";
import { useTransactionSigner } from "./signer";
import { refreshAfterChain } from "./settle";
import { outcomeOf, type MovableToken, type MoveOutcome, type PreparedMove } from "../app/move/move-lines";

/**
 * What the chosen linked wallet holds that can move into the Mercury wallet.
 * Asked only for a linked wallet; under the wallet's own key, so another
 * wallet's list is never shown for this one.
 */
export const useMovableTokens = (enabled: boolean) => {
  const { acting } = useActingWallet();
  const linked = acting.kind === "linked";
  return useQuery({
    queryKey: ["api", "move", "tokens"],
    queryFn: () => apiFetch<{ available: boolean; tokens: MovableToken[] }>("/v1/move/tokens"),
    enabled: enabled && linked,
    staleTime: 10_000,
  });
};

/** A basket the linked wallet runs outside Mercury, as `GET /v1/move/outside-baskets` lists it. */
export interface OutsideBasket {
  readonly address: string;
  readonly valueUsd: string;
  readonly holdings: readonly {
    readonly mint: string;
    readonly symbol: string;
    readonly ticker: string | null;
    readonly amount: string;
    readonly valueUsd: string;
  }[];
}

/**
 * The chosen linked wallet's baskets made outside Mercury: shown so they are
 * not missing from the picture, with the way to bring them in. Slow to change,
 * and the server keeps the answer for ten minutes.
 */
export const useOutsideBaskets = () => {
  const { acting } = useActingWallet();
  return useQuery({
    queryKey: ["api", "move", "outside-baskets"],
    queryFn: async () => (await apiFetch<{ baskets: OutsideBasket[] }>("/v1/move/outside-baskets")).baskets,
    enabled: acting.kind === "linked",
    staleTime: 5 * 60_000,
  });
};

/** How much of each token to move, in its smallest unit. */
export type MoveAsk = readonly { readonly mint: string; readonly amountRaw: string }[];

/** The move, built by the server, with its cost: asked for when the person reviews it. */
export const usePrepareMove = () =>
  useMutation<PreparedMove, Error, MoveAsk>({
    mutationFn: (tokens) =>
      apiFetch<PreparedMove>("/v1/move/prepare", { method: "POST", body: JSON.stringify({ tokens }) }),
  });

const toBytes = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

type SendAnswer = { signature: string; status: "confirmed" | "pending" | "failed" };

/**
 * Every transaction of a prepared move signed at once, then sent in turn. A
 * send the server refuses counts as failed and the rest still go: each is its
 * own few tokens, and what landed has landed. Nothing is sent if signing fails.
 */
export const signAndSendMove = async (
  prepared: PreparedMove,
  io: {
    readonly signAll: (transactions: readonly Uint8Array[]) => Promise<Uint8Array[]>;
    readonly submit: (transaction: string) => Promise<SendAnswer>;
  },
): Promise<MoveOutcome> => {
  const signed = await io.signAll(prepared.transactions.map((t) => toBytes(t.transaction)));
  const statuses: SendAnswer["status"][] = [];
  for (const bytes of signed) {
    const answer = await io
      .submit(toBase64(bytes))
      .catch((): SendAnswer => ({ signature: "", status: "failed" }));
    statuses.push(answer.status);
  }
  return outcomeOf(statuses);
};

/**
 * Signs every transaction of a prepared move in the linked wallet, approved
 * once, then sends each through the relayer in turn. A transaction the
 * network refuses does not stop the rest: each is its own few tokens, and
 * what landed has landed. The answer says how much did.
 */
export const useSignMove = () => {
  const qc = useQueryClient();
  const signer = useTransactionSigner();
  const action = useMutation<MoveOutcome, Error, PreparedMove>({
    mutationFn: (prepared) =>
      signAndSendMove(prepared, {
        signAll: signer.signAll,
        submit: (transaction) =>
          apiFetch<SendAnswer>("/v1/transactions/send", {
            method: "POST",
            body: JSON.stringify({ transaction }),
          }),
      }),
    onSettled: () => refreshAfterChain(qc),
  });
  return { ...action, approver: signer.approver };
};
