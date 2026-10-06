import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  compressTransactionMessageUsingAddressLookupTables,
  createNoopSigner,
  createTransactionMessage,
  fetchAddressesForLookupTables,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
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
import { batchedLoader } from "./batch.js";
import { rentForMissing, tokenAccountsCreatedBy, topUp, transferSol } from "./sponsor.js";
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
  private readonly positionOf: (wallet: string) => Promise<LendingPosition | null>;

  constructor(config: KaminoLendingConfig) {
    this.rpc = createLendingRpc(config.rpcUrl, config.scanRpcUrl);
    this.ttlMs = config.ttlMs ?? 30_000;
    this.positionOf = batchedLoader((wallets) => this.positions(wallets), null);
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

  /**
   * One wallet's loan, read together with every other wallet asked for at the
   * same moment. `position-sync` asks for each wallet every two seconds; read
   * one by one, that was a `getAccountInfo` and a slot lookup per wallet per
   * pass, which is what ran the RPC plan into 429s.
   */
  position(wallet: string): Promise<LendingPosition | null> {
    return this.positionOf(wallet);
  }

  /** Many loans in one `getMultipleAccounts` per hundred, priced at one shared ledger instant. */
  private async positions(wallets: readonly string[]): Promise<ReadonlyMap<string, LendingPosition | null>> {
    const market = await this.market();
    const vanilla = new VanillaObligation(PROGRAM_ID);
    const [pdas, instant] = await Promise.all([
      Promise.all(wallets.map((w) => vanilla.toPda(market.getAddress(), address(w)))),
      getCurrentLedgerInstant(this.rpc),
    ]);
    const loaded: (KaminoObligation | null)[] = [];
    // getMultipleAccounts takes at most 100 addresses.
    for (let i = 0; i < pdas.length; i += 100) {
      loaded.push(...(await market.getMultipleObligationsByAddress(pdas.slice(i, i + 100), instant)));
    }
    return new Map(
      wallets.map((w, i) => {
        const ob = loaded[i] ?? null;
        return [w, ob === null ? null : toPosition(market, ob)] as const;
      }),
    );
  }

  async build(wallet: string, intent: LendingIntent, sponsor?: string): Promise<BuiltTransactions> {
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
    const payer = sponsor === undefined ? owner.address : address(sponsor);
    const compile = (ixs: readonly Instruction[]) => {
      const tx = compileTransaction(
        compressTransactionMessageUsingAddressLookupTables(
          pipe(
            createTransactionMessage({ version: 0 }),
            (m) => setTransactionMessageFeePayer(payer, m),
            (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
            (m) => appendTransactionMessageInstructions(ixs, m),
          ),
          luts,
        ),
      );
      return { wire: getBase64EncodedWireTransaction(tx), messageBytes: Uint8Array.from(tx.messageBytes) };
    };

    const firstTime = setup.length > 0;
    let groups: readonly (readonly Instruction[])[] = firstTime ? [setup, actionIxs] : [actionIxs];
    if (sponsor !== undefined) groups = await this.fund(owner.address, payer, groups, firstTime, compile);

    const compiled = groups.map(compile);
    for (const { wire } of compiled) {
      const bytes = getBase64Encoder().encode(wire).length;
      if (bytes > MAX_TRANSACTION_BYTES) {
        throw new Error(
          `kamino: a built transaction is ${bytes} bytes, over Solana's ${MAX_TRANSACTION_BYTES}`,
        );
      }
    }

    return {
      transactions: compiled.map((c) => c.wire),
      messages: compiled.map((c) => c.messageBytes),
      firstTime,
      // A blockhash lives about 150 slots, a minute; leave room for signing.
      expiresAt: new Date(Date.now() + 45_000),
    };
  }

  /**
   * Prepend a relayer-to-owner transfer to each transaction that needs one.
   *
   * What a transaction spends from the owner is measured by simulating it with
   * a probe transfer in front and reading the owner's balance after. The one
   * transaction that cannot be simulated is a first-time action, which needs
   * the setup before it to have landed; its only rent is token accounts it
   * creates, counted instead. See `sponsor.ts`.
   */
  private async fund(
    owner: Address,
    relayer: Address,
    groups: readonly (readonly Instruction[])[],
    firstTime: boolean,
    compile: (ixs: readonly Instruction[]) => { wire: string },
  ): Promise<readonly (readonly Instruction[])[]> {
    const [{ value: ownerBalance }, { value: relayerBalance }] = await Promise.all([
      this.rpc.getBalance(owner).send(),
      this.rpc.getBalance(relayer).send(),
    ]);
    const probe: bigint = relayerBalance - FEE_RESERVE;
    if (probe <= 0n) throw new Error("kamino: the relayer has no SOL to sponsor with");

    let held: bigint = ownerBalance;
    let given = 0n;
    const funded: (readonly Instruction[])[] = [];
    for (const [i, ixs] of groups.entries()) {
      const afterSetup = firstTime && i > 0;
      let spend: bigint;
      if (afterSetup) {
        const created = tokenAccountsCreatedBy(ixs);
        const { value } = await this.rpc
          .getMultipleAccounts(
            created.map((c) => c.account),
            { encoding: "base64", dataSlice: { offset: 0, length: 0 } },
          )
          .send();
        const exists = new Set(created.filter((_, j) => value[j] !== null).map((c) => String(c.account)));
        spend = rentForMissing(created, exists);
      } else {
        const sim = await this.rpc
          .simulateTransaction(compile([transferSol(relayer, owner, probe), ...ixs]).wire as never, {
            encoding: "base64",
            sigVerify: false,
            replaceRecentBlockhash: true,
            accounts: { addresses: [owner], encoding: "base64" },
          })
          .send();
        if (sim.value.err !== null) {
          throw new Error(
            `kamino: the sponsored transaction would fail: ${JSON.stringify(sim.value.err, (_, v) => (typeof v === "bigint" ? String(v) : v))}`,
          );
        }
        const after = sim.value.accounts[0]?.lamports ?? 0n;
        spend = held + probe - BigInt(after);
      }

      const send = topUp(held, spend);
      given += send;
      held = held + send - spend;
      funded.push(send > 0n ? [transferSol(relayer, owner, send), ...ixs] : ixs);
    }

    if (given > probe) throw new Error("kamino: the relayer does not hold enough SOL to sponsor this");
    return funded;
  }
}

/** The most a serialised transaction may be. */
const MAX_TRANSACTION_BYTES = 1232;

/** SOL the relayer keeps for its own signature fees while probing what a top-up needs. */
const FEE_RESERVE = 1_000_000n;

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
  // `refreshedStats`, not the `get*Value()` getters: those read the obligation's stored
  // `*Sf` fields, written by the last on-chain refresh. A borrow refreshes *before* it
  // borrows, so right after one they still say nothing is owed.
  debtBfAdjustedUsd: dec(ob.refreshedStats.userTotalBorrowBorrowFactorAdjusted),
  allowedBorrowUsd: dec(ob.refreshedStats.borrowLimit),
  liquidationBorrowUsd: dec(ob.refreshedStats.borrowLiquidationLimit),
});
