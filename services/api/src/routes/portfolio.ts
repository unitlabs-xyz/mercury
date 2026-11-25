import { Hono } from "hono";
import { logger } from "../log/index.js";
import {
  D,
  exposure,
  stackedReturn,
  toWire,
  ZERO,
  type Decimal,
  type Issuer,
  type WrapperHolding,
} from "@mercury/core";
import type { ChainReader, TokenBalance } from "@mercury/chain";
import type { EstimateSource, PortfolioSummary } from "@mercury/types";
import type { MultiplierSource, PriceBoard } from "@mercury/market";
import {
  basketStockMints,
  cashFrom,
  marketPricePerShare,
  priceFor,
  valueBasketStocks,
  valuePortfolio,
} from "../portfolio/value.js";
import { basketBases, basketPnl, basketReturnPct } from "../portfolio/basket-basis.js";
import type { BasketMovement, InKindExit } from "../portfolio/basket-basis.js";
import {
  BasketValuationError,
  type BasketReturnsReader,
  type BasketValueReader,
} from "../portfolio/baskets.js";
import {
  MIN_POINTS,
  RANGES,
  bucketSeries,
  type Flow,
  type Range,
  type Reading,
} from "../portfolio/history.js";
// Loads the ContextVariableMap declarations so `c.get("identity")` and `c.get("acting")` are typed.
import type {} from "../auth/middleware.js";
import type { ActingWallet } from "../wallets/acting.js";
import type { DeclaredCost } from "../portfolio/declared-cost.js";
import { actingOne, oneWalletOnly } from "../wallets/acting.js";
import type { WalletOwner } from "../wallets/active.js";

export interface HoldingWrapper {
  readonly mint: string;
  readonly symbol: string;
  readonly issuer: Issuer;
  readonly decimals: number;
}

export interface HoldingRow {
  readonly instrumentId: string;
  readonly ticker: string;
  readonly name: string;
  readonly shares: Decimal;
  /** Of those shares, how many we hold a lot for. */
  readonly sharesWithBasis: Decimal;
  readonly costBasisUsd: Decimal;
  /** The same shares at the quotes they were bought against. */
  readonly referenceBasisUsd: Decimal;
  /** Fees paid to acquire the shares still held. */
  readonly feeUsd: Decimal;
  readonly avgUnitCostUsd: Decimal;
  /** Of `costBasisUsd`, how much was estimated rather than read off a trade. */
  readonly estimatedCostUsd: Decimal;
  /** Where most of the estimated cost came from; null when none is estimated. */
  readonly estimateSource: EstimateSource | null;
  readonly wrappers: readonly HoldingWrapper[];
}

export interface PortfolioDeps {
  /** One wallet's holdings: what this page and the hourly snapshot both value, wallet by wallet. */
  readonly walletHoldings: (userId: string, walletId: string) => Promise<readonly HoldingRow[]>;
  readonly prices: PriceBoard;
  readonly chain: ChainReader;
  readonly multipliers: MultiplierSource;
  readonly usdcMint: string;
  /** Stock pledged to Kamino by mint, raw. Still held: it counts in the position. */
  readonly pledged: (walletAddress: string) => Promise<readonly TokenBalance[]>;
  /** Owed to Kamino now. Null when Kamino could not be read — never zero. */
  readonly debt: (walletAddress: string) => Promise<Decimal | null>;
  /** The newest recorded debt for this wallet, for when `debt` answers null. */
  readonly lastKnownDebt: (owner: WalletOwner) => Promise<Decimal | null>;
  /** Hourly readings of these wallets' value added together, no older than `from`. */
  readonly snapshots: (
    userId: string,
    walletIds: readonly string[],
    from: Date,
  ) => Promise<readonly Reading[]>;
  readonly baskets: BasketValueReader;
  /**
   * USDC this wallet holds in the Earn vault. Absent when Earn is not set up.
   * It is the wallet's money, out of the wallet, so it counts in the total
   * the way pledged stock does; without it a deposit would chart as a loss.
   */
  readonly earn?: (walletAddress: string) => Promise<Decimal>;
  /** The Earn balance in this wallet's latest hourly reading, for when it cannot be read now. */
  readonly lastKnownEarn?: (owner: WalletOwner) => Promise<Decimal | null>;
  readonly basketReturns?: BasketReturnsReader;
  /** Deposits and withdrawals since `from`, signed, so the chart can show performance without them. */
  readonly flows?: (userId: string, walletIds: readonly string[], from: Date) => Promise<readonly Flow[]>;
  /**
   * Cash that crossed between the wallet and its own baskets, for a basket's
   * cost basis. Absent, a basket reports its value and no cost — which is
   * what it did before, and why a basket contributed nothing to the account's
   * return however much was in it.
   */
  readonly basketMovements?: (
    owner: WalletOwner,
  ) => Promise<{ movements: readonly BasketMovement[]; inKindExits: readonly InKindExit[] }>;
  /** The summary at the top of Home, across every followed wallet. Absent, the route is not there. */
  readonly summary?: (userId: string) => Promise<PortfolioSummary>;
  /** "Set cost": what the person paid, in place of a holding's estimates. Absent, the route is not there. */
  readonly declareCost?: (owner: WalletOwner, ticker: string, unitCostUsd: Decimal) => Promise<DeclaredCost>;
}

/** A cost per share as a person types it: dollars, up to a billion, to the cent or finer. */
const COST = /^\d{1,9}(\.\d{1,12})?$/;

const fail = (code: string, message: string) => ({ error: { code, message } });

const EMPTY = {
  totalValueUsd: "0",
  cashUsd: "0",
  earnUsd: "0",
  basketUsd: "0",
  debtUsd: "0",
  debtIsStale: false,
  earnIsStale: false,
  changeUsd: "0",
  changePct: "0",
  holdings: [] as const,
  baskets: [] as const,
};

const log = logger("portfolio");

/** One holding in one wallet, before it is added to the same stock in any other. */
interface HoldingView {
  readonly ticker: string;
  readonly name: string;
  readonly shares: Decimal;
  readonly valueUsd: Decimal;
  readonly costBasisUsd: Decimal;
  readonly unrealisedPnlUsd: Decimal;
  readonly marketPnlUsd: Decimal;
  readonly tradingCostUsd: Decimal;
  readonly sharesWithBasis: Decimal;
  /** The stock's, not the wallet's: the same in every wallet that holds it. */
  readonly changePct24h: Decimal;
  readonly wrapperCount: number;
  readonly pledgedShares: Decimal;
  readonly estimatedCostUsd: Decimal;
  readonly estimateSource: EstimateSource | null;
}

/** One wallet, valued: everything the page shows, as numbers, before any sum. */
interface WalletView {
  readonly walletId: string;
  readonly totalUsd: Decimal;
  readonly cashUsd: Decimal;
  readonly earnUsd: Decimal;
  readonly basketUsd: Decimal;
  readonly debtUsd: Decimal;
  readonly debtIsStale: boolean;
  readonly earnIsStale: boolean;
  readonly changeUsd: Decimal;
  /** What the stocks behind `changeUsd` were worth a day ago, which the percentage is of. */
  readonly yesterdayUsd: Decimal;
  readonly holdings: readonly HoldingView[];
  readonly baskets: readonly object[];
}

/**
 * Several wallets as one. Every figure is a sum, a stock held in two wallets
 * is one row, and the day's percentage is the summed change over the summed
 * day-ago value, never an average of percentages. Each wallet was valued on
 * its own first, so nothing here can mix one wallet's balances with
 * another's debt.
 */
const sumViews = (views: readonly WalletView[]) => {
  const add = (pick: (v: WalletView) => Decimal) => views.reduce((s, v) => s.add(pick(v)), ZERO);
  const holdings = new Map<string, HoldingView>();
  for (const h of views.flatMap((v) => v.holdings)) {
    const seen = holdings.get(h.ticker);
    holdings.set(
      h.ticker,
      seen === undefined
        ? h
        : {
            ...seen,
            shares: seen.shares.add(h.shares),
            valueUsd: seen.valueUsd.add(h.valueUsd),
            costBasisUsd: seen.costBasisUsd.add(h.costBasisUsd),
            unrealisedPnlUsd: seen.unrealisedPnlUsd.add(h.unrealisedPnlUsd),
            marketPnlUsd: seen.marketPnlUsd.add(h.marketPnlUsd),
            tradingCostUsd: seen.tradingCostUsd.add(h.tradingCostUsd),
            sharesWithBasis: seen.sharesWithBasis.add(h.sharesWithBasis),
            wrapperCount: Math.max(seen.wrapperCount, h.wrapperCount),
            pledgedShares: seen.pledgedShares.add(h.pledgedShares),
            estimatedCostUsd: seen.estimatedCostUsd.add(h.estimatedCostUsd),
            // Said for the wallet whose estimate is the larger part of the stock's.
            estimateSource: h.estimatedCostUsd.gt(seen.estimatedCostUsd)
              ? (h.estimateSource ?? seen.estimateSource)
              : (seen.estimateSource ?? h.estimateSource),
          },
    );
  }
  const changeUsd = add((v) => v.changeUsd);
  const yesterday = add((v) => v.yesterdayUsd);
  return {
    totalValueUsd: toWire(add((v) => v.totalUsd)),
    cashUsd: toWire(add((v) => v.cashUsd)),
    earnUsd: toWire(add((v) => v.earnUsd)),
    basketUsd: toWire(add((v) => v.basketUsd)),
    debtUsd: toWire(add((v) => v.debtUsd)),
    debtIsStale: views.some((v) => v.debtIsStale),
    earnIsStale: views.some((v) => v.earnIsStale),
    changeUsd: toWire(changeUsd),
    changePct: toWire(yesterday.isZero() ? ZERO : changeUsd.div(yesterday).mul(100)),
    holdings: [...holdings.values()].map((h) => ({
      ticker: h.ticker,
      name: h.name,
      shares: toWire(h.shares),
      valueUsd: toWire(h.valueUsd),
      costBasisUsd: toWire(h.costBasisUsd),
      // Measured over the shares a lot covers, not over the holding. Shares
      // that arrived from outside have no cost we can prove, and pretending
      // their basis is zero would report the whole of their value as profit.
      //
      // Three figures where there was one. The total is unchanged and still
      // the dollars; the other two say how much of it the stock did and how
      // much of it was the cost of getting in. See `stackedReturn`.
      unrealisedPnlUsd: toWire(h.unrealisedPnlUsd),
      marketPnlUsd: toWire(h.marketPnlUsd),
      tradingCostUsd: toWire(h.tradingCostUsd),
      sharesWithBasis: toWire(h.sharesWithBasis),
      changePct24h: toWire(h.changePct24h),
      wrapperCount: h.wrapperCount,
      pledgedShares: toWire(h.pledgedShares),
      estimatedCostUsd: toWire(h.estimatedCostUsd),
      estimateSource: h.estimatedCostUsd.gt(ZERO) ? h.estimateSource : null,
    })),
    // Each wallet's own figures, for its card: live, where the summary's are hourly.
    wallets: views.map((v) => ({
      walletId: v.walletId,
      totalValueUsd: toWire(v.totalUsd),
      debtUsd: toWire(v.debtUsd),
      changeUsd: toWire(v.changeUsd),
      changePct: toWire(v.yesterdayUsd.isZero() ? ZERO : v.changeUsd.div(v.yesterdayUsd).mul(100)),
    })),
    baskets: views.flatMap((v) => v.baskets),
  };
};

export function portfolioRoutes(deps: PortfolioDeps): Hono {
  const app = new Hono();

  /**
   * One wallet, valued. Throws `BasketValuationError` when its baskets cannot
   * be read, which is a 503 for the whole page rather than a total that is
   * quietly short.
   */
  const viewWallet = async (userId: string, wallet: ActingWallet): Promise<WalletView> => {
    const owner = { userId, walletId: wallet.id };
    const address = wallet.address;

    const [basketValue, rows, pledged, liveDebt, basketFlows] = await Promise.all([
      deps.baskets(userId, address).catch((error: unknown) => {
        if (error instanceof BasketValuationError) throw error;
        log.error({ err: error }, "basket valuation failed");
        throw new BasketValuationError("Basket balances are temporarily unavailable.");
      }),
      deps.walletHoldings(userId, wallet.id),
      deps.pledged(address).catch(() => [] as readonly TokenBalance[]),
      deps.debt(address),
      deps.basketMovements
        ? deps.basketMovements(owner)
        : Promise.resolve({ movements: [], inKindExits: [] }),
    ]);
    const bases = basketBases(basketFlows.movements, basketFlows.inKindExits);

    /*
     * An unreadable Kamino falls back to the last hour that was readable.
     *
     * Zero would be the easy answer and it is the wrong one: it would report a
     * borrower as owing nothing, which overstates their net worth and tells
     * them they have room they do not have. An hour-old figure is close, and a
     * flag says it is old. A wallet that has never borrowed has zero in every
     * reading, so an outage changes nothing for the people it should not.
     */
    const debtUsd = liveDebt ?? (await deps.lastKnownDebt(owner)) ?? ZERO;
    const pledgedByMint = new Map(pledged.map((p) => [p.mint, p]));

    const mints = [
      ...new Set([
        ...rows.flatMap((r) => r.wrappers.map((w) => w.mint)),
        ...basketStockMints(basketValue.baskets),
      ]),
    ];
    const [board, balances, liveEarn] = await Promise.all([
      deps.prices.pricesFor(mints),
      deps.chain.tokenBalances(address),
      deps.earn?.(address).catch(() => null) ?? ZERO,
    ]);
    /*
     * As with debt: an unreadable Earn is the last hourly reading, flagged.
     * Zero would take the whole Earn balance off net worth and draw it on the
     * chart as a loss.
     */
    const earnUsd = liveEarn ?? (await deps.lastKnownEarn?.(owner)) ?? ZERO;

    // The figures are `valuePortfolio`'s, so that the hourly snapshot behind the
    // chart and the number at the top of this page cannot drift apart. The loop
    // below is only about the per-holding rows.
    const value = valuePortfolio(
      rows,
      board,
      cashFrom(balances, deps.usdcMint),
      debtUsd,
      basketValue.totalUsd,
      earnUsd,
    );
    const holdings: HoldingView[] = [];

    for (const row of rows) {
      if (row.shares.lte(ZERO)) continue; // a closed holding is not a row

      const priced = priceFor(row, board);
      // The pool values the holding; the quote measures what the stock did.
      const perShare = priced === undefined ? ZERO : marketPricePerShare(priced);
      const stacked = stackedReturn(
        {
          sharesWithBasis: row.sharesWithBasis,
          costBasisUsd: row.costBasisUsd,
          referenceBasisUsd: row.referenceBasisUsd,
          feeUsd: row.feeUsd,
        },
        { marketPerShare: perShare, referencePerShare: priced?.pricePerShare ?? null },
      );

      // Pledged tokens are shares too, at the same multiplier as the wallet's.
      const pledgedShares = row.wrappers.reduce((s, w) => {
        const p = pledgedByMint.get(w.mint);
        if (p === undefined) return s;
        const multiplier = board.get(w.mint)?.multiplier ?? D(1);
        return s.add(D(p.rawAmount.toString()).div(D(10).pow(p.decimals)).mul(multiplier));
      }, ZERO);

      holdings.push({
        ticker: row.ticker,
        name: row.name,
        shares: row.shares,
        valueUsd: row.shares.mul(perShare),
        costBasisUsd: row.costBasisUsd,
        unrealisedPnlUsd: stacked.totalPnlUsd,
        marketPnlUsd: stacked.marketPnlUsd,
        tradingCostUsd: stacked.tradingCostUsd,
        sharesWithBasis: row.sharesWithBasis,
        changePct24h: priced?.changePct24h ?? ZERO,
        wrapperCount: row.wrappers.length,
        pledgedShares: pledgedShares.gt(row.shares) ? row.shares : pledgedShares,
        estimatedCostUsd: row.estimatedCostUsd,
        estimateSource: row.estimateSource,
      });
    }

    // Current quantities at their rolling 24-hour token moves, not an account return.
    // Missing quotes contribute no guessed move, as wallet holdings already do.
    const basketStocks = valueBasketStocks(basketValue.baskets, board);
    const changeUsd = value.changeUsd.add(basketStocks.changeUsd);

    return {
      walletId: wallet.id,
      totalUsd: value.totalUsd,
      cashUsd: value.cashUsd,
      earnUsd: value.earnUsd,
      basketUsd: value.basketUsd,
      debtUsd: value.debtUsd,
      debtIsStale: liveDebt === null,
      earnIsStale: liveEarn === null,
      changeUsd,
      yesterdayUsd: value.stocksUsd.add(basketStocks.stocksUsd).sub(changeUsd),
      holdings,
      baskets: basketValue.baskets.map((basket) => {
        const basis = bases.get(basket.portfolioId);
        const valueUsd = D(basket.valueUsd);
        return {
          ...basket,
          changePct24h: basketStocks.byPortfolio.get(basket.portfolioId)?.toString() ?? null,
          /*
           * A total, net of everything Glider charged, and said so wherever it
           * is shown. Unlike a wallet holding there is no way to separate the
           * stocks' move from the cost of trading them: the fills happen
           * inside Glider and we never see one.
           */
          ...(basis === undefined
            ? {}
            : {
                costBasisUsd: toWire(basis.investedUsd),
                pnlUsd: toWire(basketPnl(valueUsd, basis)),
                returnPct: basketReturnPct(valueUsd, basis)?.toString() ?? null,
                basisIsComplete: basis.isComplete,
              }),
        };
      }),
    };
  };

  /**
   * The summary at the top of Home: every followed wallet, whichever is
   * chosen. From the database and the price board alone, so it is cheap to
   * poll; while Home is open it shows the live figures from /v1/portfolio
   * beside these, and these are what it falls back to.
   */
  /*
   * "Set cost" on one holding in the chosen wallet. Mercury's records only, so
   * a linked wallet may: nothing is signed or sent. One wallet at a time; a
   * cost for "all" would not say whose shares it was.
   */
  app.post("/v1/portfolio/holdings/:ticker/cost", oneWalletOnly(), async (c) => {
    if (deps.declareCost === undefined) return c.json(fail("not_found", "No such route."), 404);
    const body: unknown = await c.req.json().catch(() => null);
    const raw =
      body !== null && typeof body === "object" && "unitCostUsd" in body
        ? (body as { unitCostUsd: unknown }).unitCostUsd
        : undefined;
    const text = typeof raw === "number" ? String(raw) : raw;
    if (typeof text !== "string" || !COST.test(text) || !D(text).gt(ZERO)) {
      return c.json(fail("bad_cost", "Enter what you paid per share, in dollars, above zero."), 400);
    }
    const wallet = actingOne(c);
    // A session whose Mercury wallet is still being made has no holding to cost.
    if (wallet === null)
      return c.json(fail("wallet_not_ready", "Your Mercury wallet is still being set up."), 409);
    const result = await deps.declareCost(
      { userId: c.get("identity").userId, walletId: wallet.id },
      c.req.param("ticker").toUpperCase(),
      D(text),
    );
    if (result.kind === "unknown_stock")
      return c.json(fail("unknown_stock", "Mercury doesn't list that stock."), 404);
    if (result.kind === "nothing_estimated") {
      return c.json(fail("nothing_estimated", "Every cost on this holding is exact already."), 409);
    }
    return c.json({ lots: result.lots });
  });

  app.get("/v1/portfolio/summary", async (c) => {
    if (deps.summary === undefined) return c.json(fail("not_found", "No summary here."), 404);
    return c.json(await deps.summary(c.get("identity").userId));
  });

  // Performance is a separate read so a slow Glider curve cannot delay net worth.
  app.get("/v1/portfolio/basket-returns", async (c) => {
    const { wallets } = c.get("acting");
    const read = deps.basketReturns;
    if (wallets.length === 0 || read === undefined) return c.json({ returns: [] });
    try {
      const each = await Promise.all(wallets.map((w) => read(w.address)));
      return c.json({ returns: each.flat() });
    } catch (error) {
      log.error({ err: error }, "basket return read failed");
      return c.json(fail("basket_returns_unavailable", "Basket returns are temporarily unavailable."), 503);
    }
  });

  /**
   * The chosen wallet, or every wallet added together under `all`.
   *
   * Nothing is written here. A GET reports what is known; bringing the
   * records in line with the chain is position-sync's job, on its own clock.
   * See services/api/src/index.ts: position-sync.
   */
  app.get("/v1/portfolio", async (c) => {
    const { userId } = c.get("identity");
    const { wallets } = c.get("acting");
    // A session can be valid before Privy finishes provisioning the wallet.
    // Nothing is owned yet, which is an empty portfolio and not an error.
    if (wallets.length === 0) return c.json(EMPTY);

    try {
      return c.json(sumViews(await Promise.all(wallets.map((w) => viewWallet(userId, w)))));
    } catch (error) {
      if (error instanceof BasketValuationError) return c.json(fail(error.code, error.message), 503);
      throw error;
    }
  });

  /**
   * The line under the total on the portfolio page.
   *
   * Instants go on the wire, never formatted labels: the hour a reading belongs
   * to is the reader's local hour, and only their browser knows which that is.
   */
  app.get("/v1/portfolio/history", async (c) => {
    const asked = c.req.query("range") ?? "1D";
    if (!(asked in RANGES)) {
      return c.json(fail("bad_range", `No chart for ${asked}. Ranges are 1D, 1W and 1M.`), 400);
    }
    const range = asked as Range;

    const { userId } = c.get("identity");
    const walletIds = c.get("acting").wallets.map((w) => w.id);
    // A session can be valid before Privy finishes provisioning the wallet.
    // Nothing has been recorded yet, which is an empty chart and not an error.
    if (walletIds.length === 0) return c.json({ range, points: [] });

    const now = new Date();
    const from = new Date(now.getTime() - RANGES[range].spanHours * 3_600_000);
    const [readings, flows] = await Promise.all([
      deps.snapshots(userId, walletIds, from),
      deps.flows ? deps.flows(userId, walletIds, from) : Promise.resolve([]),
    ]);
    const points = bucketSeries(readings, range, now, flows);

    // One reading is a dot. Withholding it here keeps "is there a chart?" a
    // single decision in a single place, rather than one the client repeats.
    return c.json({ range, points: points.length < MIN_POINTS ? [] : points });
  });

  /** One stock across its wrappers, in the chosen wallet or in every wallet together. */
  app.get("/v1/portfolio/exposure/:ticker", async (c) => {
    const { userId } = c.get("identity");
    const { wallets } = c.get("acting");
    const ticker = c.req.param("ticker").toUpperCase();
    if (wallets.length === 0) return c.json(fail("not_found", "Nothing held."), 404);

    const rowsByWallet = await Promise.all(wallets.map((w) => deps.walletHoldings(userId, w.id)));
    const rows = rowsByWallet.flat().filter((r) => r.ticker === ticker);
    const held = rows.reduce((s, r) => s.add(r.shares), ZERO);
    if (rows.length === 0 || held.lte(ZERO)) {
      return c.json(fail("not_found", `No position in ${ticker}.`), 404);
    }
    /*
     * Every wrapper any of the wallets' rows names, once each. Wallets can hold
     * one stock through different wrappers, and the first row (which may be a
     * closed one) names only its own.
     */
    const wrappers = [...new Map(rows.flatMap((r) => r.wrappers).map((w) => [w.mint, w] as const)).values()];

    const mints = wrappers.map((w) => w.mint);
    // The multipliers are read here, not inside the loop below. Awaiting one
    // mint before asking about the next made this a round trip per wrapper,
    // and nothing underneath can batch calls a loop issues one at a time.
    const [balancesByWallet, board, multipliers] = await Promise.all([
      Promise.all(wallets.map((w) => deps.chain.tokenBalances(w.address))),
      deps.prices.pricesFor(mints),
      deps.multipliers.multipliersFor(mints),
    ]);
    // Raw amounts of one mint add up across wallets; its decimals are the mint's own.
    const balances = new Map<string, TokenBalance>();
    for (const b of balancesByWallet.flat()) {
      const seen = balances.get(b.mint);
      balances.set(b.mint, seen === undefined ? b : { ...seen, rawAmount: seen.rawAmount + b.rawAmount });
    }

    const tokens: WrapperHolding[] = [];
    for (const wrapper of wrappers) {
      const balance = balances.get(wrapper.mint);
      if (balance === undefined || balance.rawAmount === 0n) continue;
      const price = board.get(wrapper.mint);
      const multiplier = multipliers.get(wrapper.mint) ?? price?.multiplier ?? D(1);
      tokens.push({
        mint: wrapper.mint,
        symbol: wrapper.symbol,
        issuer: wrapper.issuer,
        tokenQty: D(balance.rawAmount.toString()).div(D(10).pow(balance.decimals)),
        multiplier,
        pricePerToken: price?.usdPricePerToken ?? ZERO,
      });
    }

    // The arithmetic is `@mercury/core`'s. Shares are summed as tokenQty x
    // multiplier, never by adding token counts: two wrappers of one company are
    // different numbers of shares. See docs/02.
    const result = exposure(ticker, tokens);

    return c.json({
      ticker: result.ticker,
      shares: toWire(result.shares),
      valueUsd: toWire(result.valueUsd),
      wrappers: result.wrappers.map((w) => ({
        mint: w.mint,
        symbol: w.symbol,
        issuer: w.issuer,
        tokenQty: toWire(w.tokenQty),
        multiplier: toWire(w.multiplier),
        shares: toWire(w.shares),
        valueUsd: toWire(w.valueUsd),
        sharePct: toWire(w.sharePct),
      })),
      warnings: result.warnings.map((w) => ({
        code: w.code,
        issuer: w.issuer,
        sharePct: toWire(w.sharePct),
        message: w.message,
      })),
    });
  });

  return app;
}
