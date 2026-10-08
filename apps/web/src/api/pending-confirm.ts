import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";
import { refreshAfterChain } from "./settle";

/*
 * A transaction that is on chain but that the server has not recorded yet.
 *
 * Confirming reads the transaction back, and a node can take the better part of
 * a minute to answer for one it has only just seen. The money has already
 * moved by then, so the claim is kept rather than dropped, and asked again
 * until it lands: without it a buy leaves no fill and a borrow leaves no loan
 * event, because the client's word is the only record either one has.
 *
 * Session storage, because the claim is only worth as much as the tab that
 * made it — a different browser has nothing to say about this transaction.
 */
const RETRY_MS = 5_000;

export const rememberConfirm = (key: string, claim: object) =>
  sessionStorage.setItem(key, JSON.stringify(claim));

export const forgetConfirm = (key: string) => sessionStorage.removeItem(key);

const readConfirm = <T>(key: string, parse: (raw: unknown) => T | null): T | null => {
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? null : parse(JSON.parse(raw));
  } catch {
    /* A claim we cannot read is not a claim. */
    return null;
  }
};

/**
 * Keeps asking the server to record a sent transaction until it can.
 *
 * `confirm` is retried only while the server says the node is behind; any other
 * answer is final and the claim is dropped, so a rejected one cannot spin.
 */
export const usePendingConfirm = <T>(
  key: string,
  parse: (raw: unknown) => T | null,
  confirm: (claim: T) => Promise<unknown>,
  paused = false,
) => {
  const qc = useQueryClient();
  useEffect(() => {
    if (paused) return undefined;
    let stopped = false;
    const attempt = async () => {
      const claim = readConfirm(key, parse);
      if (claim === null || stopped) return;
      try {
        await confirm(claim);
        forgetConfirm(key);
        refreshAfterChain(qc);
      } catch (error) {
        if (error instanceof ApiError && error.code !== "transaction_pending") forgetConfirm(key);
      }
    };
    void attempt();
    const timer = setInterval(() => void attempt(), RETRY_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
    /* `parse` and `confirm` are stable module-level functions at every call site. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, paused, qc]);
};
