import { Hono } from "hono";
import { z } from "zod";
import { D, toWire, ZERO, type Decimal } from "@mercury/core";
import type { ChainHistory, ChainReader } from "@mercury/chain";
import { capacity, safeHeadroomAfter, safeLimitAfter, type CapacityInput } from "../lending/capacity.js";
import { capacityInputFor } from "../lending/input.js";
import type { LendingIntent, LendingSource } from "../lending/ports.js";
import { planLoanEvents, type PlannedLoanEvent } from "../lending/events.js";
import type { RecordInput } from "../lending/record.js";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";
import type { SponsoredBuilds } from "../relay/builds.js";

export interface BorrowDeps {
  readonly lending: LendingSource;
  readonly chain: ChainReader;
  readonly usdcMint: string;
  /** For confirming that a signature reached the chain before it is recorded. */
  readonly history: ChainHistory;
  /** Writes the loan ledger and the feed row. */
  readonly record: (
    planned: readonly PlannedLoanEvent[],
    input: Omit<RecordInput, "mintFor"> & { readonly mintFor: RecordInput["mintFor"] },
  ) => Promise<{ written: number }>;
  /**
   * The relayer, when sponsorship is on. Every lending transaction is then
   * built with it as fee payer, topped up with any rent the wallet cannot
   * cover, and remembered so the send route will co-sign it.
   */
  readonly relay?: { readonly relayer: string; readonly builds: SponsoredBuilds };
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

const ConfirmRequest = z.object({ signature: z.string().min(1), action: Request });

/**
 * A request body as an intent, with no capacity checks.
 *
 * The checks on the build path all ask whether something *should* happen. By
 * the time this runs it already has, and refusing to record a transaction that
 * is on the chain would leave the books further from the truth, not closer.
 */
const intentFrom = (body: z.infer<typeof Request>, canonical: (ticker: string) => string): LendingIntent => {
  switch (body.kind) {
    case "deposit_and_borrow":
      return {
        kind: "deposit_and_borrow",
        ticker: canonical(body.ticker),
        tokensRaw: body.tokensRaw,
        usd: D(body.usd),
      };
    case "deposit":
      return { kind: "deposit", ticker: canonical(body.ticker), tokensRaw: body.tokensRaw };
    case "borrow":
      return { kind: "borrow", usd: D(body.usd) };
    case "repay":
      return { kind: "repay", usd: body.usd === "all" ? "all" : D(body.usd) };
    case "withdraw":
      return { kind: "withdraw", ticker: canonical(body.ticker), tokensRaw: body.tokensRaw };
  }
};

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
  const inputFor = async (wallet: string): Promise<CapacityInput> =>
    capacityInputFor(deps, wallet, await deps.chain.tokenBalances(wallet));

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
        // What is actually owed, not the borrow-factor-weighted figure the limits use.
        const owed = input.position?.debtUsd ?? ZERO;
        if (owed.isZero()) return c.json(fail("nothing_owed", "There is no loan to repay."), 409);
        // Repaying everything also covers interest accrued since the last refresh, so ask for a little more.
        const needed = body.usd === "all" ? owed.mul("1.001") : D(body.usd);
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

    const built = await deps.lending.build(wallet, intent, deps.relay?.relayer);
    if (deps.relay !== undefined) for (const m of built.messages) deps.relay.builds.remember(m);
    return c.json({
      transactions: built.transactions,
      firstTime: built.firstTime,
      expiresAt: built.expiresAt.toISOString(),
    });
  });

  /**
   * Record what a signed lending transaction did.
   *
   * Without this the server never learns a loan happened. Kamino sends borrowed
   * USDC to the borrower's own wallet, so `wallet-events` sees a dollar balance
   * rise and writes "Added cash" — a loan and a deposit are the same event to
   * anything watching only balances. And a `deposit_and_borrow` moves a stock in
   * the same transaction, which that job treats as a swap and skips entirely, so
   * the commonest way to borrow produced no row at all.
   *
   * The checks here are deliberately shallow: the signature is on chain, and the
   * position it left behind is read from Kamino rather than taken from the
   * request. The intent is the client's word, which is worth stating plainly —
   * it decides only what this person's own history says, never what they owe.
   * `debt_after_usd` is Kamino's number and it is the one the books use.
   */
  app.post("/v1/borrow/confirm", async (c) => {
    const wallet = c.get("identity").walletAddress;
    if (wallet === null) return c.json(fail("unauthorized", "No wallet on this session."), 401);

    const parsed = ConfirmRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", parsed.error.message), 400);
    const { signature, action } = parsed.data;

    // Not yet on chain is a different answer from never: a client can confirm
    // before the node it asks has caught up, and that is worth retrying.
    const tx = await deps.history.transaction(signature);
    if (tx === null) {
      return c.json(fail("not_found", "That transaction has not reached the chain yet."), 404);
    }
    if (!tx.accountKeys.includes(wallet)) {
      return c.json(fail("validation_failed", "That transaction is not this wallet's."), 422);
    }

    const [terms, position] = await Promise.all([
      deps.lending.terms().catch(() => null),
      deps.lending.position(wallet),
    ]);
    const collateralOf = (ticker: string) =>
      terms?.collateral.find((t) => t.isStock && t.ticker === ticker.toUpperCase());

    const intent = intentFrom(action, (ticker) => collateralOf(ticker)?.ticker ?? ticker.toUpperCase());
    const planned = planLoanEvents(intent, (ticker) => collateralOf(ticker)?.decimals ?? 0);

    const usdc = deps.usdcMint;
    const written = await deps.record(planned, {
      userId: c.get("identity").userId,
      signature,
      occurredAt: tx.blockTime === null ? new Date() : new Date(tx.blockTime * 1000),
      borrowApy: terms?.pool.borrowApy ?? null,
      debtAfterUsd: position?.debtUsd ?? ZERO,
      collateralAfterUsd: (position?.deposits ?? []).reduce((s, d) => s.add(d.valueUsd), ZERO),
      mintFor: (event) => (event.ticker === null ? usdc : (collateralOf(event.ticker)?.mint ?? usdc)),
    });

    return c.json({ recorded: written.written, events: planned.map((e) => e.kind) });
  });

  return app;
}
