import { useSyncExternalStore } from "react";

/**
 * The address a scan found, handed from the scanner back to the screen that
 * opened it. Two routes again, so a tiny store rather than React state: the
 * scanner writes, Send reads it once and clears it.
 */
let scanned: string | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useScanned = () => useSyncExternalStore(subscribe, () => scanned);

export const setScanned = (next: string | null) => {
  scanned = next;
  listeners.forEach((l) => l());
};

/** A Solana address: base58, 32 to 44 characters. */
export const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * The address inside what a wallet's QR code holds. Most show the bare
 * address; Solana Pay links wrap it as `solana:<address>?amount=…`. Anything
 * else is not an address, and says so by returning null.
 */
export const addressFrom = (raw: string): string | null => {
  const body =
    raw
      .trim()
      .replace(/^solana:/i, "")
      .split(/[?#/]/)[0] ?? "";
  return SOLANA_ADDRESS.test(body) ? body : null;
};
