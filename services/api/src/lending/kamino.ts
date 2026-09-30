import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  compressTransactionMessageUsingAddressLookupTables,
  createNoopSigner,
  createTransactionMessage,
  fetchAddressesForLookupTables,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Instruction,
} from "@solana/kit";
import {
  DEFAULT_RECENT_SLOT_DURATION_MS,
  KaminoAction,
  KaminoMarket,
  PROGRAM_ID,
  U64_MAX,
  VanillaObligation,
  getCurrentLedgerInstant,
  type KaminoObligation,
  type KaminoReserve,
} from "@kamino-finance/klend-sdk";
import BN from "bn.js";
import { D, ZERO, type Decimal } from "@mercury/core";
import { createLendingRpc } from "./rpc.js";
import type {
  BuiltTransactions,
  CollateralTerms,
  LendingIntent,
  LendingPosition,
  LendingSource,
  LendingTerms,
} from "./ports.js";

/** Kamino's xStocks market: the only one where tokenised stocks are collateral. */
export const XSTOCKS_MARKET = address("5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua");
/** The market's own address lookup table, from GET /v2/kamino-market. */
const XSTOCKS_LUT = address("8ofreL6hKfEet1DnhHVGvCTnSdz4pg85PpbuCUHnEcKm");
const USDC = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

/** Reserve status 0 is active. 1 is obsolete and 2 hidden: neither takes new collateral. */
const ACTIVE = 0;

/**
 * Setup that must land before the action can. Sent in the same transaction as
 * the deposit it fails with IncorrectInstructionInPosition, so a first-time
 * user signs two transactions: these, then the action.
 */
const FIRST_TIME = /^(createUserLutIx|initUserMetadata|InitObligation|InitObligationForFarm)\b/;

/** "SPYx" is SPY; anything else keeps its own symbol. */
const tickerOf = (symbol: string) => (/x$/.test(symbol) ? symbol.slice(0, -1) : symbol);

/** decimal.js from the SDK is a different copy from ours; go through the string. */
const dec = (v: { toString(): string }): Decimal => D(v.toString());

export interface KaminoLendingConfig {
  readonly rpcUrl: string;
  /** For program scans, which a starter RPC plan may refuse. Defaults to Solana's public RPC. */
  readonly scanRpcUrl?: string;
  /** How long a loaded market is reused. Loading reads every reserve and its oracle. */
  readonly ttlMs?: number;
}

/**
 * Kamino lending through the klend SDK, server side. It reads the market and a
 * wallet's obligation, and builds unsigned transactions for the wallet to sign:
 * we never hold a key (ADR 0003). The SDK's amounts are raw base units and its
 * values are USD at Kamino's own oracle price, which is what Kamino enforces.
 */
/**
 * Kamino's lending program, as the SDK gives it.
 *
 * The wallet watcher needs it to tell a loan from a cash transfer. Taken from
 * the SDK rather than written out here, because an address typed by hand is one
 * that nothing verifies, and being wrong about this one means every borrow gets
 * a second row saying "Added cash".
 */
export const KAMINO_LENDING_PROGRAM: string = String(PROGRAM_ID);

export class KaminoLending implements LendingSource {
  private readonly rpc: ReturnType<typeof createLendingRpc>;
  private readonly ttlMs: number;
  private cached: { at: number; market: Promise<KaminoMarket> } | null = null;

  constructor(config: KaminoLendingConfig) {
    this.rpc = createLendingRpc(config.rpcUrl, config.scanRpcUrl);
    this.ttlMs = config.ttlMs ?? 30_000;
  }

  private market(): Promise<KaminoMarket> {
    const now = Date.now();
    if (this.cached !== null && now - this.cached.at < this.ttlMs) return this.cached.market;
    const market = KaminoMarket.load(this.rpc, XSTOCKS_MARKET, DEFAULT_RECENT_SLOT_DURATION_MS).then((m) => {
      if (m === null) throw new Error("kamino: xStocks market not found");
      return m;
    });
    // A failed load is not cached; the next caller tries again.
    market.catch(() => (this.cached = null));
    this.cached = { at: now, market };
    return market;
  }

  async terms(): Promise<LendingTerms> {
    const [market, instant] = await Promise.all([this.market(), getCurrentLedgerInstant(this.rpc)]);
    const usdc = market.getExistingFloatRateReserveByMint(USDC);
    if (usdc === undefined) throw new Error("kamino: no USDC reserve in the xStocks market");

    const collateral: CollateralTerms[] = [];
    for (const r of market.reserves.values()) {
      const symbol = r.getTokenSymbol();
      const c = r.state.config;
      // Every active reserve Kamino lets you borrow against. Only xStocks are
      // offered, but all of them count towards a position, as they do for Kamino.
      if (c.status !== ACTIVE || c.loanToValuePct <= 0) continue;
      const isStock = /x$/.test(symbol);
      const factor = D(10).pow(r.getMintDecimals());
      const cap = dec(c.depositLimit);
      collateral.push({
        ticker: tickerOf(symbol),
        isStock,
        symbol,
        mint: r.getLiquidityMint(),
        reserve: r.address,
        decimals: r.getMintDecimals(),
        ltv: D(c.loanToValuePct).div(100),
        liquidationThreshold: D(c.liquidationThresholdPct).div(100),
        pricePerToken: dec(r.getOracleMarketPrice()),
        // Zero is Kamino's "no limit".
        depositCapTokens: cap.isZero() ? null : cap.div(factor),
        depositedTokens: dec(r.getTotalSupply()).div(factor),
      });
    }

    const usdcFactor = D(10).pow(usdc.getMintDecimals());
    const borrowCap = dec(usdc.state.config.borrowLimit).div(usdcFactor);
    return {
      collateral: collateral.sort((a, b) => b.ltv.comparedTo(a.ltv)),
      pool: {
        reserve: usdc.address,
        availableUsd: dec(usdc.getLiquidityAvailableAmount()).div(usdcFactor),
        borrowedUsd: dec(usdc.getBorrowedAmount()).div(usdcFactor),
        borrowCapUsd: borrowCap,
        borrowFactor: dec(usdc.getBorrowFactor()),
        // Interest compounds continuously, so APY is e^APR − 1.
        borrowApy: D(usdc.calculateBorrowAPR(instant, market.state.referralFeeBps)).exp().sub(1),
      },
    };
  }

  async position(wallet: string): Promise<LendingPosition | null> {
    const market = await this.market();
    const ob = await market.getObligationByWallet(address(wallet), new VanillaObligation(PROGRAM_ID));
    if (ob === null) return null;
    return toPosition(market, ob);
  }

  async build(wallet: string, intent: LendingIntent): Promise<BuiltTransactions> {
    const market = await this.market();
    const owner = createNoopSigner(address(wallet));
    const existing = await market.getObligationByWallet(owner.address, new VanillaObligation(PROGRAM_ID));
    const obligation = existing ?? new VanillaObligation(PROGRAM_ID);
    const instant = await getCurrentLedgerInstant(this.rpc);
    const usdc = market.getExistingFloatRateReserveByMint(USDC)!;
    const common = {
      kaminoMarket: market,
      owner,
      obligation,
      useV2Ixs: true,
      scopeRefreshConfig: undefined,
      currentLedgerInstant: instant,
    };

    const reserveOf = (ticker: string): KaminoReserve => {
      const r = [...market.reserves.values()].find((x) => x.getTokenSymbol() === `${ticker}x`);
      if (r === undefined) throw new Error(`kamino: ${ticker} is not collateral in the xStocks market`);
      return r;
    };
    const usdRaw = (usd: Decimal) => new BN(usd.mul(D(10).pow(usdc.getMintDecimals())).floor().toFixed(0));

    let action: KaminoAction;
    switch (intent.kind) {
      case "deposit_and_borrow":
        action = await KaminoAction.buildDepositAndBorrowTxns({
          ...common,
          depositAmount: new BN(intent.tokensRaw),
          depositReserveAddress: reserveOf(intent.ticker).address,
          borrowAmount: usdRaw(intent.usd),
          borrowReserveAddress: usdc.address,
        });
        break;
      case "deposit":
        action = await KaminoAction.buildDepositTxns({
          ...common,
          amount: new BN(intent.tokensRaw),
          reserveAddress: reserveOf(intent.ticker).address,
        });
        break;
      case "borrow":
        action = await KaminoAction.buildBorrowTxns({
          ...common,
          amount: usdRaw(intent.usd),
          reserveAddress: usdc.address,
        });
        break;
      case "repay":
        action = await KaminoAction.buildRepayTxns({
          ...common,
          amount: intent.usd === "all" ? U64_MAX : usdRaw(intent.usd),
          reserveAddress: usdc.address,
        });
        break;
      case "withdraw":
        action = await KaminoAction.buildWithdrawTxns({
          ...common,
          amount: intent.tokensRaw === "all" ? U64_MAX : new BN(intent.tokensRaw),
          reserveAddress: reserveOf(intent.ticker).address,
        });
        break;
    }

    // Split first-time setup into its own transaction, in the order it must land.
    const setup: Instruction[] = [];
    const rest: Instruction[] = [];
    action.setupIxs.forEach((ix, i) =>
      (FIRST_TIME.test(action.setupIxsLabels[i] ?? "") ? setup : rest).push(ix),
    );
    const actionIxs = [
      ...action.computeBudgetIxs,
      ...rest,
      ...KaminoAction.actionToLendingIxs(action),
      ...action.postLendingIxs,
      ...action.cleanupIxs,
    ];

    const { value: blockhash } = await this.rpc.getLatestBlockhash().send();
    const luts = await fetchAddressesForLookupTables([XSTOCKS_LUT], this.rpc);
    const compile = (ixs: readonly Instruction[]) =>
      getBase64EncodedWireTransaction(
        compileTransaction(
          compressTransactionMessageUsingAddressLookupTables(
            pipe(
              createTransactionMessage({ version: 0 }),
              (m) => setTransactionMessageFeePayer(owner.address, m),
              (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
              (m) => appendTransactionMessageInstructions(ixs, m),
            ),
            luts,
          ),
        ),
      );

    return {
      transactions: [...(setup.length > 0 ? [compile(setup)] : []), compile(actionIxs)],
      firstTime: setup.length > 0,
      // A blockhash lives about 150 slots, a minute; leave room for signing.
      expiresAt: new Date(Date.now() + 45_000),
    };
  }
}

const toPosition = (market: KaminoMarket, ob: KaminoObligation): LendingPosition => ({
  obligation: ob.obligationAddress,
  deposits: ob.getDeposits().flatMap((p) => {
    const r = market.getReserveByAddress(p.reserveAddress);
    if (r === undefined) return [];
    const factor = D(10).pow(r.getMintDecimals());
    return [
      {
        ticker: tickerOf(r.getTokenSymbol()),
        isStock: /x$/.test(r.getTokenSymbol()),
        mint: p.mintAddress as Address,
        raw: BigInt(dec(p.amount).floor().toFixed(0)),
        decimals: r.getMintDecimals(),
        tokens: dec(p.amount).div(factor),
        valueUsd: dec(p.marketValueRefreshed),
      },
    ];
  }),
  debtUsd: ob.getBorrows().reduce((s, b) => s.add(dec(b.marketValueRefreshed)), ZERO),
  debtBfAdjustedUsd: dec(ob.getBorrowedMarketValueBFAdjusted()),
  allowedBorrowUsd: dec(ob.getMaxAllowedBorrowValue()),
  liquidationBorrowUsd: dec(ob.getUnhealthyBorrowValue()),
});
