import type { Issuer } from "@harbor/core";
import { searchTokens, type JupToken } from "./jupiter";
import { ABOUT, DISPLAY_NAME, SECTOR } from "./meta";

export type Wrapper = {
  readonly mint: string;
  readonly symbol: string;
  readonly issuer: Issuer;
  readonly decimals: number;
  readonly icon?: string;
  readonly liquidity: number;
  /** On-chain holders of this wrapper. */
  readonly holders: number;
  /** Net buyers over 24h — buyers minus sellers, from Jupiter's own stats. */
  readonly netBuyers24h: number;
  readonly volume24h: number;
  readonly traders24h: number;
};

export type Instrument = {
  readonly ticker: string;
  readonly name: string;
  readonly sector: string;
  readonly about: string;
  readonly logo?: string;
  readonly wrappers: readonly Wrapper[];
};

const ISSUER_TAG: Record<Issuer, string> = { backed: "xstocks", ondo: "ondo" };

/**
 * Roughly the pool depth a $1,000 order needs to stay inside the policy's 1.5%
 * impact cap. An instrument where no wrapper clears this cannot be filled at a
 * normal size, so listing it would be an offer we cannot honour — the empty
 * state promises we only show what we can route.
 *
 * Measured 20 September 2026: every verified Backed wrapper sits above it
 * ($80k-$6.6m) and every Ondo one below ($80-$48k). Wrappers are never dropped
 * individually, only whole instruments, so the issuer comparison keeps both legs
 * wherever both exist.
 */
const MIN_LIQUIDITY_USD = 70_000;

/** "NVDAx" -> "NVDA", "NVDAon" -> "NVDA", "BRK.Bx" -> "BRK.B". */
const tickerOf = (symbol: string, issuer: Issuer) =>
  issuer === "backed" ? symbol.replace(/x$/, "") : symbol.replace(/on$/, "");

/**
 * Only verified tokens carrying the issuer's own tag. Search returns
 * impersonators next to the real thing — an "NVDAon" with 17 holders, an "NVDAx"
 * with one — and a symbol match alone would route a customer's money into one.
 */
const keep = (t: JupToken, issuer: Issuer) =>
  t.isVerified === true && (t.tags ?? []).includes(ISSUER_TAG[issuer]);

const toWrapper = (t: JupToken, issuer: Issuer): Wrapper => ({
  mint: t.id,
  symbol: t.symbol,
  issuer,
  decimals: t.decimals,
  ...(t.icon ? { icon: t.icon } : {}),
  liquidity: t.liquidity ?? 0,
  holders: t.holderCount ?? 0,
  netBuyers24h: Math.max(0, Math.round(t.stats24h?.numNetBuyers ?? 0)),
  volume24h: (t.stats24h?.buyVolume ?? 0) + (t.stats24h?.sellVolume ?? 0),
  traders24h: Math.round(t.stats24h?.numTraders ?? 0),
});

export const fetchUniverse = async (signal?: AbortSignal): Promise<Instrument[]> => {
  const [xs, on] = await Promise.all([
    searchTokens("xStock", signal),
    searchTokens("Ondo Tokenized", signal).catch(() => [] as JupToken[]),
  ]);

  const byTicker = new Map<string, Wrapper[]>();
  const add = (tokens: JupToken[], issuer: Issuer) => {
    for (const t of tokens) {
      if (!keep(t, issuer)) continue;
      const ticker = tickerOf(t.symbol, issuer);
      const list = byTicker.get(ticker) ?? [];
      if (list.some((w) => w.issuer === issuer)) continue; // first verified wins
      list.push(toWrapper(t, issuer));
      byTicker.set(ticker, list);
    }
  };
  add(xs, "backed");
  add(on, "ondo");

  return [...byTicker.entries()]
    .filter(([, wrappers]) => wrappers.some((w) => w.liquidity >= MIN_LIQUIDITY_USD))
    .map(([ticker, wrappers]) => ({
      ticker,
      name: DISPLAY_NAME[ticker] ?? ticker,
      sector: SECTOR[ticker] ?? "Other",
      about: ABOUT[ticker] ?? "",
      ...(wrappers.find((w) => w.issuer === "backed")?.icon
        ? { logo: wrappers.find((w) => w.issuer === "backed")!.icon! }
        : {}),
      wrappers,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};
