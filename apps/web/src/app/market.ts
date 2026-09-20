import {
  D,
  DEFAULT_POLICY,
  decide,
  type Candidate,
  type Decision,
  type InstrumentStatus,
  type Side,
} from "@harbor/core";

export type IssuerQuote = {
  /** Price per share actually realised on a $1,000 order, as measured. */
  readonly at1000: number;
  /** Jupiter's reported price impact on that same order. */
  readonly impact: number;
  readonly multiplier: number;
  readonly mint: string;
};

export type Instrument = {
  readonly ticker: string;
  readonly name: string;
  readonly logo?: string;
  readonly sector: string;
  /** Reference price of one real share, from Chainlink. */
  readonly fair: number;
  readonly todayPct: number;
  readonly backed: IssuerQuote | null;
  readonly ondo: IssuerQuote | null;
  /** True where the quotes come from the 19 September measurement. */
  readonly measured: boolean;
  readonly about: string;
};

/**
 * Six instruments carry the quotes measured on Jupiter on 19 September 2026.
 * The rest are illustrative, so the browse shelves are not three rows long;
 * `measured` says which is which and the stock page shows it.
 */
export const INSTRUMENTS: Instrument[] = [
  {
    ticker: "NVDA",
    name: "Nvidia",
    logo: "/tokens/NVDAx.png",
    sector: "Semiconductors",
    fair: 222.29,
    todayPct: 1.56,
    backed: { at1000: 222.33, impact: 0.0002, multiplier: 1.001701, mint: "Xsc9qvGR…NVDAx" },
    ondo: { at1000: 1523.66, impact: 0.8527, multiplier: 1.001715, mint: "NVDAon…4f2" },
    measured: true,
    about:
      "Designs the graphics and AI accelerators that most large models are trained on. The most valuable company in the world by market capitalisation for much of 2026.",
  },
  {
    ticker: "SPY",
    name: "S&P 500",
    logo: "/tokens/SPYx.png",
    sector: "Index funds",
    fair: 664.21,
    todayPct: 0.31,
    backed: { at1000: 664.21, impact: 0.0, multiplier: 1.005715, mint: "XsoCS1T…SPYx" },
    ondo: { at1000: 664.88, impact: 0.001, multiplier: 1.009473, mint: "SPYon…9bQ" },
    measured: true,
    about:
      "The five hundred largest listed companies in the United States, weighted by market value. The default answer for someone who does not want to pick.",
  },
  {
    ticker: "QQQ",
    name: "Nasdaq 100",
    logo: "/tokens/QQQx.png",
    sector: "Index funds",
    fair: 597.76,
    todayPct: 0.84,
    backed: { at1000: 598.42, impact: 0.0011, multiplier: 1.0042, mint: "XsqE9c…QQQx" },
    ondo: { at1000: 1050.12, impact: 0.7564, multiplier: 1.0061, mint: "QQQon…2kR" },
    measured: true,
    about:
      "The hundred largest non-financial companies on the Nasdaq. Heavier in technology than the S&P 500, and more volatile for it.",
  },
  {
    ticker: "TSLA",
    name: "Tesla",
    logo: "/tokens/TSLAx.png",
    sector: "Consumer",
    fair: 426.0,
    todayPct: -0.94,
    backed: { at1000: 426.07, impact: 0.0002, multiplier: 1.0, mint: "XsDoVf…TSLAx" },
    ondo: { at1000: 2178.43, impact: 0.9741, multiplier: 1.0, mint: "TSLAon…7hM" },
    measured: true,
    about:
      "Electric vehicles, energy storage and an autonomy programme the share price has long been valued on more than the cars.",
  },
  {
    ticker: "AAPL",
    name: "Apple",
    logo: "/tokens/AAPLx.png",
    sector: "Technology",
    fair: 245.5,
    todayPct: 0.42,
    backed: { at1000: 245.5, impact: 0.0027, multiplier: 1.0023, mint: "XsbEhL…AAPLx" },
    ondo: { at1000: 281.14, impact: 0.1318, multiplier: 1.0031, mint: "AAPLon…5tW" },
    measured: true,
    about:
      "iPhone, Mac and a services business that now earns more than most companies do in total. The largest holding in most US index funds.",
  },
  {
    ticker: "MSTR",
    name: "Strategy",
    logo: "/tokens/MSTRx.png",
    sector: "Technology",
    fair: 159.6,
    todayPct: 3.21,
    backed: { at1000: 162.47, impact: 0.0019, multiplier: 1.0, mint: "XsP7xz…MSTRx" },
    ondo: null,
    measured: true,
    about:
      "A software company that holds bitcoin on its balance sheet, and trades more on that holding than on the software.",
  },
  ...[
    ["MSFT", "Microsoft", "Technology", 512.4, 0.22, "Windows, Office and Azure — the second largest cloud business in the world."],
    ["AMZN", "Amazon", "Consumer", 238.9, -0.35, "Online retail at scale, plus AWS, which earns most of the profit."],
    ["GOOGL", "Alphabet", "Technology", 204.7, 0.61, "Search, YouTube, Android and a cloud business growing into third place."],
    ["META", "Meta", "Technology", 742.1, 1.18, "Facebook, Instagram and WhatsApp, funded almost entirely by advertising."],
    ["AVGO", "Broadcom", "Semiconductors", 388.2, 2.04, "Networking and custom silicon, increasingly for AI data centres."],
    ["AMD", "AMD", "Semiconductors", 216.8, 1.77, "Processors and accelerators, and the only real competition Nvidia has."],
    ["JPM", "JPMorgan", "Financials", 318.5, -0.18, "The largest bank in the United States by assets."],
    ["XOM", "Exxon Mobil", "Energy", 124.3, -0.72, "Oil and gas, upstream to refining."],
    ["LLY", "Eli Lilly", "Healthcare", 1042.6, 0.94, "Diabetes and obesity treatments, and the most valuable drugmaker in the world."],
    ["UNH", "UnitedHealth", "Healthcare", 528.3, -0.41, "Health insurance and care delivery across the United States."],
    ["NFLX", "Netflix", "Consumer", 1187.4, 0.55, "Streaming, now with advertising and live events alongside subscriptions."],
    ["KO", "Coca-Cola", "Consumer", 71.2, 0.12, "Soft drinks, distributed almost everywhere people live."],
  ].map(([ticker, name, sector, fair, todayPct, about]) => ({
    ticker: ticker as string,
    name: name as string,
    sector: sector as string,
    fair: fair as number,
    todayPct: todayPct as number,
    backed: {
      at1000: (fair as number) * 1.0008,
      impact: 0.0015,
      multiplier: 1.0031,
      mint: `${ticker}x`,
    },
    ondo: {
      at1000: (fair as number) * 1.06,
      impact: 0.21,
      multiplier: 1.0048,
      mint: `${ticker}on`,
    },
    measured: false,
    about: about as string,
  })),
];

export const bySector = (sector: string) => INSTRUMENTS.filter((i) => i.sector === sector);

export const SECTORS = [...new Set(INSTRUMENTS.map((i) => i.sector))];

export const findInstrument = (ticker: string) =>
  INSTRUMENTS.find((i) => i.ticker.toLowerCase() === ticker.toLowerCase());

/**
 * A quote has two separable parts, and conflating them gets the answer wrong.
 *
 *   spread  — where the pool's mid sits against net asset value. A persistent
 *             level: a token trading 1.6% rich is 1.6% rich on a $50 order and
 *             on a $50,000 one.
 *   impact  — what your own order does to the price. Grows with size.
 *
 * The measurement gives us the two multiplied together, so we divide the impact
 * back out to recover the spread, then re-apply impact at the size being asked
 * about. A $1,000 order reproduces the measurement exactly by construction.
 */
/**
 * A depth term for pools that measured flat at $1,000. It vanishes at exactly
 * $1,000 — so the anchor stays exact — and bites above it, because no pool
 * absorbs an arbitrary order without moving.
 */
const DEPTH = 0.00008;

const spreadOf = (q: IssuerQuote, fair: number) => q.at1000 / (fair * (1 + q.impact)) - 1;

const quoteAt = (q: IssuerQuote, fair: number, usd: number) => {
  const scale = usd / 1000;
  const impact = Math.min(0.99, Math.max(0, q.impact * scale + DEPTH * scale * (scale - 1)));
  const pricePerShare = fair * (1 + spreadOf(q, fair)) * (1 + impact);
  return { impact, pricePerShare: Math.max(pricePerShare, 0.01) };
};

const candidate = (
  q: IssuerQuote,
  issuer: "backed" | "ondo",
  symbol: string,
  fair: number,
  usd: number,
  side: Side,
): Candidate => {
  const { impact, pricePerShare } = quoteAt(q, fair, usd);
  const pricePerToken = pricePerShare * q.multiplier;
  const tokens = usd / pricePerToken;
  return {
    mint: q.mint,
    symbol,
    issuer,
    multiplier: D(q.multiplier),
    quote: {
      inAmount: side === "buy" ? D(usd) : D(tokens),
      outAmount: side === "buy" ? D(tokens) : D(usd),
      priceImpact: D(impact),
      routeLabels: issuer === "backed" ? ["Jupiter", "Orca"] : ["Jupiter", "Raydium"],
      quoteId: `${q.mint}-${Math.round(usd)}`,
      expiresAt: new Date(Date.now() + 20_000),
    },
  };
};

/** Saturday 19 September 2026 — the market is shut, which is when the gate matters. */
export const MARKET_STATUS: InstrumentStatus = "closed";
export const MARKET_OPENS = new Date("2026-09-21T13:30:00Z");

export const priceFor = (instrument: Instrument, usd: number, side: Side = "buy"): Decision => {
  const candidates: Candidate[] = [];
  if (instrument.backed)
    candidates.push(candidate(instrument.backed, "backed", `${instrument.ticker}x`, instrument.fair, usd, side));
  if (instrument.ondo)
    candidates.push(candidate(instrument.ondo, "ondo", `${instrument.ticker}on`, instrument.fair, usd, side));

  return decide({
    ticker: instrument.ticker,
    side,
    amount: D(usd),
    candidates,
    reference: {
      pricePerShare: D(instrument.fair),
      observedAt: new Date(Date.now() - 30_000),
      pendingDividendNet: D(0),
    },
    status: MARKET_STATUS,
    policy: DEFAULT_POLICY,
    now: new Date(),
    marketOpensAt: MARKET_OPENS,
  });
};

export const ISSUER_NAME = { backed: "Backed", ondo: "Ondo" } as const;

/** Always in exchange time. A US equities product that says "7:00 PM GMT+5:30" is lying about the market. */
export const MARKET_OPENS_ET = MARKET_OPENS.toLocaleString("en-US", {
  weekday: "long",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
  timeZoneName: "short",
});
