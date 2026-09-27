import { Hono } from "hono";
import { z } from "zod";
import { D, toWire, ZERO, type Decimal } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import { capacity, safeHeadroomAfter, safeLimitAfter, type CapacityInput } from "../lending/capacity.js";
import type { LendingIntent, LendingSource } from "../lending/ports.js";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";

export interface BorrowDeps {
  readonly lending: LendingSource;
  readonly chain: ChainReader;
  readonly usdcMint: string;
}

const fail = (code: string, message: string) => ({ error: { code, message } });

const Amount = z.string().regex(/^\d+(\.\d+)?$/, "expected a decimal string");
const RawAmount = z.string().regex(/^\d+$/, "expected an integer in base units");

const Request = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("deposit_and_borrow"), ticker: z.string(), tokensRaw: RawAmount, usd: Amount }),
  z.object({ kind: z.literal("deposit"), ticker: z.string(), tokensRaw: RawAmount }),
  z.object({ kind: z.literal("borrow"), usd: Amount }),
  z.object({ kind: z.literal("repay"), usd: z.union([Amount, z.literal("all")]) }),
  z.object({
    kind: z.literal("withdraw"),
    ticker: z.string(),
    tokensRaw: z.union([RawAmount, z.literal("all")]),
  }),
]);

const usd = (d: Decimal) => toWire(d.toDecimalPlaces(2));
const pct = (d: Decimal | null) => (d === null ? null : toWire(d.toDecimalPlaces(4)));

/**
 * Borrowing USDC against xStocks on Kamino. Reads are Kamino's live terms and
 * the wallet's own obligation; writes return unsigned transactions for the
 * wallet to sign. Every borrow and withdrawal is checked against the 80% safety
 * target before a transaction is built, so a figure past it never reaches a
 * wallet to sign.
 */
export function borrowRoutes(deps: BorrowDeps): Hono {
  const app = new Hono();

  /** Everything the capacity maths needs for one wallet, fetched together. */
  const inputFor = async (wallet: string): Promise<CapacityInput> => {
    const [terms, position, balances] = await Promise.all([
      deps.lending.terms(),
      deps.lending.position(wallet),
      deps.chain.tokenBalances(wallet),
    ]);
    const usdc = balances.find((b) => b.mint === deps.usdcMint);
    const cashUsd = usdc === undefined ? ZERO : D(usdc.rawAmount.toString()).div(D(10).pow(usdc.decimals));
    const walletByMint = new Map<string, bigint>();
    for (const b of balances) walletByMint.set(b.mint, (walletByMint.get(b.mint) ?? 0n) + b.rawAmount);
    return { terms, position, wallet: walletByMint, cashUsd };
  };

  const summaryJson = (input: CapacityInput) => {
    const s = capacity(input);
    return {
      safetyTarget: toWire(s.safetyTarget),
      cashUsd: usd(s.cashUsd),
      collateralUsd: usd(s.collateralUsd),
      debtUsd: usd(s.debtUsd),
      borrowableNowUsd: usd(s.borrowableNowUsd),
      overTargetUsd: usd(s.overTargetUsd),
      health: s.health,
      locked: s.locked,
      usage: pct(s.usage),
      repayToClearMarginCallUsd: usd(s.repayToClearMarginCallUsd),
      dropToMarginCall: pct(s.dropToMarginCall),
      borrowableUsd: usd(s.borrowableUsd),
      spendableUsd: usd(s.spendableUsd),
      ltv: pct(s.ltv),
      liquidationLtv: pct(s.liquidationLtv),
      safeUntilDrop: pct(s.safeUntilDrop),
      poolAvailableUsd: usd(s.poolAvailableUsd),
      borrowApy: pct(s.borrowApy),
      obligation: input.position?.obligation ?? null,
      collateral: s.rows.map((r) => ({
        ticker: r.ticker,
        isStock: r.isStock,
        decimals: r.decimals,
        ltv: pct(r.ltv),
        liquidationThreshold: pct(r.liquidationThreshold),
        pricePerToken: usd(r.pricePerToken),
        depositedTokens: toWire(r.depositedTokens),
        depositedUsd: usd(r.depositedUsd),
        depositableTokens: toWire(r.depositableTokens),
        depositableUsd: usd(r.depositableUsd),
        safeLimitUsd: usd(r.safeLimitUsd),
        borrowableUsd: usd(r.borrowableUsd),
        cushionAtTarget: pct(r.cushionAtTarget),
        liquidationPrice: r.liquidationPrice === null ? null : usd(r.liquidationPrice),
        liquidationDistance: pct(r.liquidationDistance),
      })),
    };
  };

  /** The whole position: cash, what is pledged and owed, and what can be spent. */
  app.get("/v1/borrow", async (c) => {
    const wallet = c.get("identity").walletAddress;
    if (wallet === null) return c.json(fail("unauthorized", "No wallet on this session."), 401);
    return c.json(summaryJson(await inputFor(wallet)));
  });

  /** One stock: whether Kamino accepts it, and what it can be borrowed against. */
  app.get("/v1/borrow/:ticker", async (c) => {
    const wallet = c.get("identity").walletAddress;
    if (wallet === null) return c.json(fail("unauthorized", "No wallet on this session."), 401);
    const ticker = c.req.param("ticker").toUpperCase();
    const summary = summaryJson(await inputFor(wallet));
    // Only stocks are offered here; other collateral in the market still counts in `account`.
    const row = summary.collateral.find((r) => r.isStock && r.ticker === ticker) ?? null;
    return c.json({
      ticker,
      accepted: row !== null,
      collateral: row,
      account: { ...summary, collateral: undefined },
    });
  });

  /**
   * Unsigned transactions for one action. Checked here first, against the live
   * position: a borrow past the safety target, a withdrawal that would push the
   * loan past it, or an amount the wallet does not hold is refused with a
   * reason, before anything is built.
   */
  app.post("/v1/borrow/transactions", async (c) => {
    const wallet = c.get("identity").walletAddress;
    if (wallet === null) return c.json(fail("unauthorized", "No wallet on this session."), 401);
    const parsed = Request.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", parsed.error.message), 400);
    const body = parsed.data;

    const input = await inputFor(wallet);

    // A loan past the limit is locked: repaying and adding collateral are the only ways out.
    if (body.kind === "borrow" || body.kind === "deposit_and_borrow" || body.kind === "withdraw") {
      const s = capacity(input);
      if (s.locked) {
        const what = body.kind === "withdraw" ? "Withdrawals" : "New borrowing";
        const why =
          s.health === "margin_call" || s.health === "liquidation"
            ? `Margin call: repay at least ${usd(s.repayToClearMarginCallUsd)} now`
            : "Your loan is past the 80% limit";
        return c.json(
          fail(
            "locked",
            `${what} are paused. ${why}; repaying ${usd(s.overTargetUsd)}, or pledging more stock, unlocks everything.`,
          ),
          409,
        );
      }
    }
    const termsOf = (ticker: string) =>
      input.terms.collateral.find((t) => t.isStock && t.ticker === ticker.toUpperCase());
    const tokensOf = (raw: string, decimals: number) => D(raw).div(D(10).pow(decimals));
    const debt = input.position?.debtBfAdjustedUsd ?? ZERO;

    let intent: LendingIntent;
    switch (body.kind) {
      case "deposit_and_borrow":
      case "deposit": {
        const t = termsOf(body.ticker);
        if (t === undefined)
          return c.json(fail("not_collateral", `Kamino does not accept ${body.ticker} as collateral.`), 409);
        const held = input.wallet.get(t.mint) ?? 0n;
        if (BigInt(body.tokensRaw) <= 0n || BigInt(body.tokensRaw) > held) {
          return c.json(fail("insufficient_tokens", `The wallet holds fewer ${t.symbol} than that.`), 409);
        }
        if (body.kind === "deposit") {
          intent = { kind: "deposit", ticker: t.ticker, tokensRaw: body.tokensRaw };
          break;
        }
        const amount = D(body.usd);
        const room = safeHeadroomAfter(input, {
          ticker: t.ticker,
          tokensDelta: tokensOf(body.tokensRaw, t.decimals),
        });
        if (amount.lte(0) || amount.gt(room)) {
          return c.json(
            fail(
              "above_safety_target",
              `At most ${usd(room)} can be borrowed against that at the safety target.`,
            ),
            409,
          );
        }
        intent = { kind: "deposit_and_borrow", ticker: t.ticker, tokensRaw: body.tokensRaw, usd: amount };
        break;
      }
      case "borrow": {
        const amount = D(body.usd);
        const room = safeHeadroomAfter(input);
        if (amount.lte(0) || amount.gt(room)) {
          return c.json(
            fail("above_safety_target", `At most ${usd(room)} can be borrowed at the safety target.`),
            409,
          );
        }
        intent = { kind: "borrow", usd: amount };
        break;
      }
      case "repay": {
        if (debt.isZero()) return c.json(fail("nothing_owed", "There is no loan to repay."), 409);
        // Repaying everything also covers interest accrued since the last refresh, so ask for a little more.
        const needed = body.usd === "all" ? debt.mul("1.001") : D(body.usd);
        if (needed.gt(input.cashUsd)) {
          return c.json(fail("insufficient_cash", "Not enough USDC in the wallet to repay that."), 409);
        }
        intent = { kind: "repay", usd: body.usd === "all" ? "all" : D(body.usd) };
        break;
      }
      case "withdraw": {
        const t = termsOf(body.ticker);
        const pledged = input.position?.deposits.find((d) => d.ticker === t?.ticker)?.tokens ?? ZERO;
        if (t === undefined || pledged.isZero()) {
          return c.json(fail("nothing_pledged", `No ${body.ticker} is pledged to withdraw.`), 409);
        }
        const tokens = body.tokensRaw === "all" ? pledged : tokensOf(body.tokensRaw, t.decimals);
        if (tokens.lte(0) || tokens.gt(pledged)) {
          return c.json(fail("insufficient_tokens", `Only ${toWire(pledged)} ${t.symbol} is pledged.`), 409);
        }
        if (safeLimitAfter(input, { ticker: t.ticker, tokensDelta: tokens.neg() }).lt(debt)) {
          return c.json(
            fail(
              "above_safety_target",
              "Repay some of the loan first: withdrawing that would push it past the safety target.",
            ),
            409,
          );
        }
        intent = { kind: "withdraw", ticker: t.ticker, tokensRaw: body.tokensRaw };
        break;
      }
    }

    const built = await deps.lending.build(wallet, intent);
    return c.json({
      transactions: built.transactions,
      firstTime: built.firstTime,
      expiresAt: built.expiresAt.toISOString(),
    });
  });

  return app;
}
