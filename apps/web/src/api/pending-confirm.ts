import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./client";

/*
 * Transactions that are on chain but that the server has not recorded yet.
 *
 * Confirming reads the transaction back, and a node can take the better part of
 * a minute to answer for one it has only just seen. The money has already moved
 * by then, so the claim is kept and asked again until it lands: without it a
 * buy leaves no fill and a borrow leaves no loan event, because the client's
 * word is the only record either one has.
 *
 * Keyed by signature, never by feature. A single slot per feature loses work
 * the moment someone acts twice — a borrow then a repay then a withdrawal kept
 * only the withdrawal, and the first two were never recorded at all.
 *
 * Session storage, because the claim is only worth as much as the tab that
 * made it: another browser has nothing to say about this transaction.
 */
const PREFIX = "pending-confirm";
const RETRY_MS = 5_000;

const keyOf = (kind: string, signature: string) => `${PREFIX}:${kind}:${signature}`;

/**
 * What every claim has: the transaction it is about. Whatever else a caller
 * needs to confirm it rides along untouched — the server validates its own
 * request body, so this reads back only the one field it keys on.
 */
export type PendingClaim = { readonly signature: string };

export const rememberConfirm = <T extends PendingClaim>(kind: string, claim: T) => {
  try {
    sessionStorage.setItem(keyOf(kind, claim.signature), JSON.stringify(claim));
  } catch {
    /* A claim we cannot store is one we cannot retry; the attempt still happens. */
  }
};

export const forgetConfirm = (kind: string, signature: string) =>
  sessionStorage.removeItem(keyOf(kind, signature));

/** Every outstanding claim of one kind, with the key that holds it. */
const claimsFor = <T extends PendingClaim>(kind: string) => {
  const prefix = `${PREFIX}:${kind}:`;
  /* Collected before anything is removed: deleting mid-scan shifts the indexes under it. */
  const keys = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index)).filter(
    (key): key is string => key !== null && key.startsWith(prefix),
  );
  const found: { key: string; claim: T }[] = [];
  for (const key of keys) {
    try {
      const claim = JSON.parse(sessionStorage.getItem(key) ?? "null") as T | null;
      if (typeof claim?.signature === "string") found.push({ key, claim });
      else sessionStorage.removeItem(key);
    } catch {
      /* Unreadable is not a claim. Drop it rather than retry it forever. */
      sessionStorage.removeItem(key);
    }
  }
  return found;
};

/**
 * Keeps asking the server to record every sent transaction of one kind.
 *
 * A claim is retried only while the server says the node is behind; any other
 * answer is final and it is dropped, so a rejected one cannot spin. Returns
 * what is still outstanding, for a caller that shows it.
 */
export const usePendingConfirms = <T extends PendingClaim>(
  kind: string,
  confirm: (claim: T) => Promise<unknown>,
  opts: { paused?: boolean; onSettled?: () => void } = {},
): readonly T[] => {
  const { paused = false, onSettled } = opts;
  const [outstanding, setOutstanding] = useState<readonly T[]>([]);
  /*
   * Through a ref, never a dependency. Callers write it inline, so a new
   * function arrives on every render; depending on it rebuilt the sweep, which
   * re-ran the effect, which set state, which rendered again — a loop that
   * holds the main thread and leaves dialogs unable to answer a click.
   */
  const settled = useRef(onSettled);
  settled.current = onSettled;
  /* The claims we last published, so an unchanged sweep does not re-render. */
  const published = useRef("");
  /* One pass at a time: a slow confirm would otherwise be asked again beneath itself. */
  const sweeping = useRef(false);

  const publish = useCallback((found: readonly { key: string; claim: T }[]) => {
    const keys = found.map((entry) => entry.key).join("|");
    if (keys === published.current) return;
    published.current = keys;
    setOutstanding(found.map((entry) => entry.claim));
  }, []);

  const sweep = useCallback(async () => {
    if (sweeping.current) return;
    const claims = claimsFor<T>(kind);
    publish(claims);
    if (claims.length === 0) return;
    sweeping.current = true;
    let recorded = false;
    try {
      for (const { key, claim } of claims) {
        try {
          await confirm(claim);
          sessionStorage.removeItem(key);
          recorded = true;
        } catch (error) {
          if (error instanceof ApiError && error.code !== "transaction_pending") {
            sessionStorage.removeItem(key);
          }
        }
      }
    } finally {
      sweeping.current = false;
    }
    publish(claimsFor<T>(kind));
    if (recorded) settled.current?.();
    /* `confirm` is a module-level function at every call site. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, publish]);

  useEffect(() => {
    if (paused) return undefined;
    void sweep();
    const timer = setInterval(() => void sweep(), RETRY_MS);
    return () => clearInterval(timer);
  }, [paused, sweep]);

  return outstanding;
};
