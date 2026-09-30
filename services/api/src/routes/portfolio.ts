import { Hono } from "hono";
import { D, exposure, toWire, ZERO, type Decimal, type Issuer, type WrapperHolding } from "@mercury/core";
import type { ChainReader, TokenBalance } from "@mercury/chain";
import type { MultiplierSource, PriceBoard } from "@mercury/market";
import { cashFrom, priceFor, valuePortfolio } from "../portfolio/value.js";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";

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
  readonly avgUnitCostUsd: Decimal;
  readonly wrappers: readonly HoldingWrapper[];
}

export interface PortfolioDeps {
  readonly holdings: (userId: string) => Promise<readonly HoldingRow[]>;
  readonly prices: PriceBoard;
  readonly chain: ChainReader;
  readonly multipliers: MultiplierSource;
  readonly usdcMint: string;
  /** Stock pledged to Kamino by mint, raw. Still held: it counts in the position. */
  readonly pledged: (walletAddress: string) => Promise<readonly TokenBalance[]>;
}

const fail = (code: string, message: string) => ({ error: { code, message } });

const EMPTY = {
  totalValueUsd: "0",
  cashUsd: "0",
  changeUsd: "0",
  changePct: "0",
  holdings: [] as const,
};

export function portfolioRoutes(deps: PortfolioDeps): Hono {
  const app = new Hono();

  app.get("/v1/portfolio", async (c) => {
    const identity = c.get("identity");
    // A session can be valid before Privy finishes provisioning the wallet.
    // Nothing is owned yet, which is an empty portfolio and not an error.
    if (identity.walletAddress === null) return c.json(EMPTY);

    // Nothing is written here. A GET reports what is known; bringing the
    // records in line with the chain is position-sync's job, on its own
    // clock. See services/api/src/index.ts: position-sync.

    const [rows, balances, pledged] = await Promise.all([
      deps.holdings(identity.userId),
      deps.chain.tokenBalances(identity.walletAddress),
      deps.pledged(identity.walletAddress).catch(() => [] as readonly TokenBalance[]),
    ]);
    const pledgedByMint = new Map(pledged.map((p) => [p.mint, p]));

    const mints = rows.flatMap((r) => r.wrappers.map((w) => w.mint));
    const board = await deps.prices.pricesFor(mints);

    // The figures are `valuePortfolio`'s, so that the hourly snapshot behind the
    // chart and the number at the top of this page cannot drift apart. The loop
    // below is only about the per-holding rows.
    const cashUsd = cashFrom(balances, deps.usdcMint);
    const value = valuePortfolio(rows, board, cashUsd);
    const holdings = [];

    for (const row of rows) {
      if (row.shares.lte(ZERO)) continue; // a closed holding is not a row

      const priced = priceFor(row, board);
      const perShare = priced?.pricePerShare ?? ZERO;
      const changePct24h = priced?.changePct24h ?? ZERO;

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
        shares: toWire(row.shares),
        valueUsd: toWire(row.shares.mul(perShare)),
        costBasisUsd: toWire(row.costBasisUsd),
        // Measured over the shares a lot covers, not over the holding. Shares
        // that arrived from outside have no cost we can prove, and pretending
        // their basis is zero would report the whole of their value as profit.
        unrealisedPnlUsd: toWire(row.sharesWithBasis.mul(perShare).sub(row.costBasisUsd)),
        sharesWithBasis: toWire(row.sharesWithBasis),
        changePct24h: toWire(changePct24h),
        wrapperCount: row.wrappers.length,
        pledgedShares: toWire(pledgedShares.gt(row.shares) ? row.shares : pledgedShares),
      });
    }

    // Cash does not move, so the percentage is of what actually could.
    const yesterday = value.stocksUsd.sub(value.changeUsd);
    const changePct = yesterday.isZero() ? ZERO : value.changeUsd.div(yesterday).mul(100);

    return c.json({
      totalValueUsd: toWire(value.totalUsd),
      cashUsd: toWire(value.cashUsd),
      changeUsd: toWire(value.changeUsd),
      changePct: toWire(changePct),
      holdings,
    });
  });

  app.get("/v1/portfolio/exposure/:ticker", async (c) => {
    const identity = c.get("identity");
    const ticker = c.req.param("ticker").toUpperCase();
    if (identity.walletAddress === null) return c.json(fail("not_found", "Nothing held."), 404);

    const rows = await deps.holdings(identity.userId);
    const row = rows.find((r) => r.ticker === ticker);
    if (row === undefined || row.shares.lte(ZERO)) {
      return c.json(fail("not_found", `No position in ${ticker}.`), 404);
    }

    const [balances, board] = await Promise.all([
      deps.chain.tokenBalances(identity.walletAddress),
      deps.prices.pricesFor(row.wrappers.map((w) => w.mint)),
    ]);

    const held: WrapperHolding[] = [];
    for (const wrapper of row.wrappers) {
      const balance = balances.find((b) => b.mint === wrapper.mint);
      if (balance === undefined || balance.rawAmount === 0n) continue;
      const price = board.get(wrapper.mint);
      const multiplier = (await deps.multipliers.multiplierFor(wrapper.mint)) ?? price?.multiplier ?? D(1);
      held.push({
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
    const result = exposure(ticker, held);

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
