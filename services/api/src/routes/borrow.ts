import { Hono } from "hono";
import { z } from "zod";
import { D, Decimal, ONE, toWire, ZERO } from "@mercury/core";
import type { ChainHistory, ChainReader } from "@mercury/chain";
import type { PriceBoard } from "@mercury/market";
import { capacity, safeHeadroomAfter, safeLimitAfter, type CapacityInput } from "../lending/capacity.js";
import { capacityInputFor } from "../lending/input.js";
import { kaminoSetupRent } from "../lending/setup.js";
import {
  closeLoanUsdc,
  leavesDust,
  loanParts,
  outstandingPrincipal,
  type LedgerRow,
} from "../lending/interest.js";
import {
  LendingRefused,
  SponsorShort,
  type LendingIntent,
  type LendingPosition,
  type LendingSource,
} from "../lending/ports.js";
import { landedAmounts, planLoanEvents, type PlannedLoanEvent } from "../lending/events.js";
import type { RecordInput } from "../lending/record.js";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";
import type { SponsoredBuilds } from "../relay/builds.js";
import { logger } from "../log/index.js";

const log = logger("borrow");

export interface BorrowDeps {
  readonly lending: LendingSource;
  readonly chain: ChainReader;
  /** For SOL, which prices what Mercury pays to open a first-time borrower's account. */
  readonly prices: PriceBoard;
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
  /** A borrower's loan events, oldest first: what tells the interest apart from what was lent. */
  readonly ledger: (userId: string) => Promise<readonly LedgerRow[]>;
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

/** Dollars as a sentence says them, rounded the way that keeps the sentence true. */
const dollars = (d: Decimal, rounding: Decimal.Rounding = Decimal.ROUND_HALF_UP) =>
  `$${d.toDecimalPlaces(2, rounding).toFixed(2)}`;

/**
 * Kamino's price for a USDC, from its own two figures for the debt, never
 * above $1. It is what the one-cent minimum is measured at, and a hair under a
 * dollar, so the USDC a cent is worth is a hair over a cent. Capped, because a
 * debt in something other than USDC would push the ratio up and loosen a check
 * that is only safe when it errs tight.
 */
const usdcPrice = (p: LendingPosition | null): Decimal =>
  p === null || p.owedUsdc.lte(0) ? ONE : Decimal.min(ONE, p.debtUsd.div(p.owedUsdc));

/** Kamino's `NetValueRemainingTooSmall`: a position left worth more than nothing and less than the minimum. */
const NET_VALUE_REMAINING_TOO_SMALL = 6092;

/** Native SOL trades under the wrapped-SOL mint, which is how it is priced. */
const SOL_MINT = "So11111111111111111111111111111111111111112";
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

  /**
   * What opening this wallet's Kamino account would cost, in dollars, for the
   * sheet to show struck through: Mercury pays it. Null once the account is
   * open, and null when SOL has no price — the sheet still says Mercury pays,
   * it only has no figure to strike.
   */
  const setupCostUsd = async (input: CapacityInput): Promise<string | null> => {
    if (input.position !== null) return null;
    const [lamports, prices] = await Promise.all([
      kaminoSetupRent(deps.chain),
      deps.prices.pricesFor([SOL_MINT]),
    ]);
    const sol = prices.get(SOL_MINT)?.usdPricePerToken;
    if (sol === undefined || sol.lte(0)) return null;
    return usd(D(lamports.toString()).div(1_000_000_000).mul(sol));
  };

  /**
   * What the loan is made of, in USDC: what is owed, how much of it was lent
   * and how much is interest, and what the wallet must hold to repay all of it.
   * The split is null when the ledger cannot account for the debt, rather than
   * calling all of it interest.
   */
  const loanJson = async (input: CapacityInput, userId: string) => {
    // Micro-USDC, the smallest amount there is; Kamino's figures run to forty digits.
    // What is owed rounds up, so a figure read off the wire is never short of it.
    const owed = (input.position?.owedUsdc ?? ZERO).toDecimalPlaces(6, Decimal.ROUND_UP);
    const parts = owed.lte(0)
      ? { principal: ZERO, interest: ZERO }
      : loanParts(owed, outstandingPrincipal(await deps.ledger(userId)));
    return {
      owedUsdc: toWire(owed),
      principalUsdc: parts.principal === null ? null : toWire(parts.principal),
      interestUsdc: parts.interest === null ? null : toWire(parts.interest),
      closeLoanUsdc: toWire(closeLoanUsdc(owed, input.terms.pool.borrowApy)),
      minPositionUsd: toWire(input.terms.minPositionUsd.toDecimalPlaces(6)),
    };
  };

  const summaryFor = async (wallet: string, userId: string) => {
    const input = await inputFor(wallet);
    const [setup, loan] = await Promise.all([setupCostUsd(input), loanJson(input, userId)]);
    return { ...summaryJson(input), setupCostUsd: setup, ...loan };
  };

  /** The whole position: cash, what is pledged and owed, and what can be spent. */
  app.get("/v1/borrow", async (c) => {
    const wallet = c.get("identity").walletAddress;
    if (wallet === null) return c.json(fail("unauthorized", "No wallet on this session."), 401);
    return c.json(await summaryFor(wallet, c.get("identity").userId));
  });

  /** One stock: whether Kamino accepts it, and what it can be borrowed against. */
  app.get("/v1/borrow/:ticker", async (c) => {
    const wallet = c.get("identity").walletAddress;
    if (wallet === null) return c.json(fail("unauthorized", "No wallet on this session."), 401);
    const ticker = c.req.param("ticker").toUpperCase();
    const summary = await summaryFor(wallet, c.get("identity").userId);
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
    /*
     * Kamino's one-cent rule, checked here so it can be said plainly: after any
     * borrow, repay, pledge or withdrawal, the debt and each stock's collateral
     * must be worth nothing or at least the market's minimum, at Kamino's prices.
     */
    const min = input.terms.minPositionUsd;
    const price = usdcPrice(input.position);
    const owedNow = input.position?.owedUsdc ?? ZERO;
    const pledgedOf = (ticker: string) =>
      input.position?.deposits.find((d) => d.ticker === ticker)?.tokens ?? ZERO;
    const dust = (message: string) => c.json(fail("dust_left", message), 409);
    const tooSmallALoan = (amount: Decimal) =>
      leavesDust(owedNow.add(amount).mul(price), min)
        ? dust(`Borrow at least ${dollars(min)}: Kamino does not lend less.`)
        : null;

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
        const pledgedAfter = pledgedOf(t.ticker).add(tokensOf(body.tokensRaw, t.decimals));
        if (leavesDust(pledgedAfter.mul(t.pricePerToken), min)) {
          return dust(`Pledge at least ${dollars(min)} of ${t.symbol}: Kamino does not take less.`);
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
        const small = tooSmallALoan(amount);
        if (small !== null) return small;
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
        const small = tooSmallALoan(amount);
        if (small !== null) return small;
        intent = { kind: "borrow", usd: amount };
        break;
      }
      case "repay": {
        // In USDC, interest included: what a repay actually sends, not Kamino's dollar value of it.
        if (owedNow.lte(0)) return c.json(fail("nothing_owed", "There is no loan to repay."), 409);
        if (body.usd === "all") {
          const needed = closeLoanUsdc(owedNow, input.terms.pool.borrowApy);
          if (needed.gt(input.cashUsd)) {
            return c.json(
              fail(
                "insufficient_cash",
                `Repaying all of it needs ${dollars(needed, Decimal.ROUND_UP)} in the wallet, to cover the interest until it lands, and the wallet holds ${dollars(input.cashUsd, Decimal.ROUND_DOWN)}.`,
              ),
              409,
            );
          }
          intent = { kind: "repay", usd: "all" };
          break;
        }
        const amount = D(body.usd);
        if (amount.gt(input.cashUsd)) {
          return c.json(fail("insufficient_cash", "Not enough USDC in the wallet to repay that."), 409);
        }
        if (leavesDust(owedNow.sub(amount).mul(price), min)) {
          // The most that still leaves the minimum owing, in USDC at Kamino's price.
          const most = owedNow.sub(min.div(price)).toDecimalPlaces(2, Decimal.ROUND_DOWN);
          return dust(
            `That would leave less than ${dollars(min)} owing, which Kamino does not allow. Repay all of it, or at most ${dollars(most)}.`,
          );
        }
        intent = { kind: "repay", usd: amount };
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
        if (leavesDust(pledged.sub(tokens).mul(t.pricePerToken), min)) {
          return dust(
            `That would leave less than ${dollars(min)} of ${t.symbol} pledged, which Kamino does not allow. Take all of it back, or leave more.`,
          );
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

    let built;
    try {
      built = await deps.lending.build(wallet, intent, deps.relay?.relayer);
    } catch (error: unknown) {
      if (error instanceof SponsorShort) {
        log.error(
          {
            relayer: error.relayer,
            heldLamports: String(error.heldLamports),
            neededLamports: String(error.neededLamports),
          },
          "the relayer is short of SOL to sponsor a loan",
        );
        return c.json(
          fail("upstream_unavailable", "Borrowing is unavailable right now. Please try again shortly."),
          503,
        );
      }
      if (error instanceof LendingRefused) {
        if (error.code === NET_VALUE_REMAINING_TOO_SMALL) {
          return dust(
            `Kamino does not leave a loan or a pledge worth less than ${dollars(min)}. Repay or take back all of it, or leave more.`,
          );
        }
        return c.json(fail("kamino_refused", `Kamino would refuse this transaction (${error.reason}).`), 409);
      }
      throw error;
    }
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

    /*
     * Not yet on chain is a different answer from never: a client can confirm
     * before the node it asks has caught up, and that is worth retrying. It
     * says so in the code the order and basket confirms use, because this is
     * the only account anything has of a loan — no job can infer one from the
     * balances, so a dropped confirm loses the event for good.
     */
    const tx = await deps.history.transaction(signature);
    if (tx === null) {
      return c.json(fail("transaction_pending", "Transaction is not settled yet. Try again shortly."), 409);
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
    // "All" is sized by the chain as it lands, so the figure is read off the transaction.
    const planned = landedAmounts(
      planLoanEvents(intent, (ticker) => collateralOf(ticker)?.decimals ?? 0),
      tx,
      { wallet, usdcMint: deps.usdcMint, mintOf: (ticker) => collateralOf(ticker)?.mint ?? null },
    );

    const usdc = deps.usdcMint;
    const written = await deps.record(planned, {
      userId: c.get("identity").userId,
      signature,
      occurredAt: tx.blockTime === null ? new Date() : new Date(tx.blockTime * 1000),
      borrowApy: terms?.pool.borrowApy ?? null,
      debtAfterUsd: position?.debtUsd ?? ZERO,
      collateralAfterUsd: (position?.deposits ?? []).reduce((s, d) => s.add(d.valueUsd), ZERO),
      // Money moved in USDC and collateral in the stock, whatever stock the borrow names: the
      // feed's unique index is on the mint, and a pledge-and-borrow filed twice under the stock
      // kept only the pledge.
      mintFor: (event) => {
        const stock = event.kind === "pledge" || event.kind === "unpledge" ? event.ticker : null;
        return stock === null ? usdc : (collateralOf(stock)?.mint ?? usdc);
      },
    });

    return c.json({ recorded: written.written, events: planned.map((e) => e.kind) });
  });

  return app;
}
