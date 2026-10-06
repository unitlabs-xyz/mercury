import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";

/**
 * Stocks somebody has saved to keep an eye on: the web's `watchlist.ts`, on
 * the phone. Per-device convenience, deliberately not account state — nothing
 * here is money, and a list of names is not worth a round trip.
 */
const KEY = "mercury.watchlist.v1";

let tickers: readonly string[] = [];
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const emit = () => listeners.forEach((l) => l());

void SecureStore.getItemAsync(KEY)
  .then((raw) => {
    if (raw === null) return;
    const saved = JSON.parse(raw) as unknown;
    if (Array.isArray(saved)) {
      tickers = saved.filter((t): t is string => typeof t === "string");
      emit();
    }
  })
  .catch(() => undefined);

export const useWatchlist = () => useSyncExternalStore(subscribe, () => tickers);

export const toggleWatch = (ticker: string) => {
  tickers = tickers.includes(ticker) ? tickers.filter((t) => t !== ticker) : [...tickers, ticker];
  emit();
  void SecureStore.setItemAsync(KEY, JSON.stringify(tickers)).catch(() => undefined);
};
