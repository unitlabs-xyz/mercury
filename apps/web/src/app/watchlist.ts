import { useCallback, useState } from "react";

const KEY = "harbor.watchlist";

const read = (): string[] => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return []; // private mode, blocked storage — a watchlist is not worth throwing over
  }
};

/** Per-browser convenience, deliberately not account state. Nothing here is money. */
export const useWatchlist = () => {
  // Read on the first render, not in an effect: the saved rows must be there
  // from the start, or the watchlist would open them in as if just added.
  const [tickers, setTickers] = useState<string[]>(read);

  const toggle = useCallback((ticker: string) => {
    setTickers((prev) => {
      const next = prev.includes(ticker) ? prev.filter((t) => t !== ticker) : [...prev, ticker];
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* nothing to do */
      }
      return next;
    });
  }, []);

  return { tickers, toggle, has: (t: string) => tickers.includes(t) };
};
