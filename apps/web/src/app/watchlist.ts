import { useCallback, useEffect, useState } from "react";

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
  const [tickers, setTickers] = useState<string[]>([]);
  useEffect(() => setTickers(read()), []);

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
