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
import type { ChainReader, Rotation } from "@mercury/chain";
import { createLendingRpc } from "./rpc.js";
import { batchedLoader } from "./batch.js";
import { fromCode } from "@kamino-finance/klend-sdk/dist/@codegen/klend/errors/index.js";
import { topUp, transferSol } from "./sponsor.js";
import { kaminoSetupRent } from "./setup.js";
import { WALLET_BYTES, rentFor } from "../rent.js";
import { LendingRefused, SponsorShort } from "./ports.js";
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
 * The SDK's labels for opening a wallet's Kamino account: what makes an
 * action a first one.
 *
 * These went out as a transaction of their own, ahead of the loan, because
 * sending them with it once failed with IncorrectInstructionInPosition. It no
 * longer does — a first deposit-and-borrow with its setup in front simulated
 * cleanly on mainnet on 15 October 2026, at 833 of Solana's 1,232 bytes — and
 * one transaction is what lets Mercury pay for accounts only when a loan uses
 * them. Sent apart, a setup could land and the loan behind it fail, leaving
 * the relayer's rent in an account nobody borrowed through.
 */
const FIRST_TIME = /^(createUserLutIx|initUserMetadata|InitObligation|InitObligationForFarm)\b/;

/**
 * A new user's Kamino setup, without the lookup table the SDK makes by default.
 *
 * The SDK opens a lookup table for every new user, and nothing here ever puts
 * an address in it or reads one from it: every transaction `build` compiles is
 * compressed against the market's own table, XSTOCKS_LUT. It holds rent all the
 * same, 934,720 lamports at mainnet's rate in October 2026, and for a sponsored
 * wallet that rent is the relayer's — paid once per borrower, for an empty
 * table. Skipped, the user's metadata names the default key instead, which is
 * what the SDK itself writes when it is told not to make one.
 */
export const USER_SETUP = { skipInitialization: false, skipLutCreation: true } as const;

/** "SPYx" is SPY; anything else keeps its own symbol. */
const tickerOf = (symbol: string) => (/x$/.test(symbol) ? symbol.slice(0, -1) : symbol);

/** decimal.js from the SDK is a different copy from ours; go through the string. */
const dec = (v: { toString(): string }): Decimal => D(v.toString());

export interface KaminoLendingConfig {
  readonly rpcUrl: string;
  /** For program scans, which a starter RPC plan may refuse. Defaults to Solana's public RPC. */
  readonly scanRpcUrl?: string;
  /** The background jobs' public endpoints, taken in turn instead of `rpcUrl`. See `backgroundDeps`. */
  readonly rotation?: Rotation;
  /** How long a loaded market is reused. Loading reads every reserve and its oracle. */
  readonly ttlMs?: number;
  /**
   * Where rent is asked: the app's own chain reader, so the hour it keeps an
   * answer for is shared with trades. Left out, the rate measured on mainnet
   * in October 2026 is used.
   */
  readonly rent?: Pick<ChainReader, "rentExemption">;
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
  private readonly rent: Pick<ChainReader, "rentExemption">;

  constructor(config: KaminoLendingConfig) {
    this.rpc = createLendingRpc(config.rpcUrl, config.scanRpcUrl, config.rotation);
    this.ttlMs = config.ttlMs ?? 30_000;
    this.rent = config.rent ?? {};
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
      // A scaled fraction, as Kamino stores every value: the number over 2^60.
      minPositionUsd: dec(market.state.minNetValueInObligationSf).div(D(2).pow(60)),
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
      initUserMetadata: USER_SETUP,
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

    // A first action opens the account in the same transaction, in the SDK's own order.
    const firstTime = action.setupIxsLabels.some((label) => FIRST_TIME.test(label));
    const actionIxs = [
      ...action.computeBudgetIxs,
      ...action.setupIxs,
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

    const ixs =
      sponsor === undefined
        ? actionIxs
        : await this.fund(owner.address, payer, actionIxs, compile, firstTime);

    const compiled = compile(ixs);
    const bytes = getBase64Encoder().encode(compiled.wire).length;
    if (bytes > MAX_TRANSACTION_BYTES) {
      throw new Error(
        `kamino: a built transaction is ${bytes} bytes, over Solana's ${MAX_TRANSACTION_BYTES}`,
      );
    }

    return {
      transactions: [compiled.wire],
      messages: [compiled.messageBytes],
      firstTime,
      // A blockhash lives about 150 slots, a minute; leave room for signing.
      expiresAt: new Date(Date.now() + 45_000),
    };
  }

  /**
   * Put a relayer-to-owner transfer in front of the transaction, if it needs one.
   *
   * What it spends from the owner is measured by simulating it with a probe
   * transfer in front and reading the owner's balance after. A first loan's
   * account setup rides in the same transaction, so its rent is measured
   * exactly like everything else's, and paid only if the loan lands with it.
   * See `sponsor.ts`.
   *
   * That setup is about 0.03 SOL, far more than anything else a loan asks of
   * the relayer, so a relayer that cannot cover it is told apart before the
   * simulation runs out of SOL halfway through creating accounts — which is
   * how it was first found, as a bare `Custom: 1` and a 500.
   */
  private async fund(
    owner: Address,
    relayer: Address,
    ixs: readonly Instruction[],
    compile: (ixs: readonly Instruction[]) => { wire: string },
    opensAccount: boolean,
  ): Promise<readonly Instruction[]> {
    const [{ value: ownerBalance }, { value: relayerBalance }, walletRent, setupRent] = await Promise.all([
      this.rpc.getBalance(owner).send(),
      this.rpc.getBalance(relayer).send(),
      rentFor(this.rent, WALLET_BYTES),
      opensAccount ? kaminoSetupRent(this.rent) : Promise.resolve(0n),
    ]);
    const needs = opensAccount ? setupRent + walletRent : 0n;
    const probe = probeFor(relayer, relayerBalance, needs);

    const sim = await this.rpc
      .simulateTransaction(compile([transferSol(relayer, owner, probe), ...ixs]).wire as never, {
        encoding: "base64",
        sigVerify: false,
        replaceRecentBlockhash: true,
        accounts: { addresses: [owner], encoding: "base64" },
      })
      .send();
    if (sim.value.err !== null) {
      // The probe's transfer is instruction 0, so the message's instruction i is ixs[i - 1].
      const refused = refusalOf(sim.value.err, (i) =>
        i === 0 ? undefined : String(ixs[i - 1]?.programAddress ?? ""),
      );
      if (refused !== null) throw refused;
      throw new Error(
        `kamino: the sponsored transaction would fail: ${JSON.stringify(sim.value.err, (_, v) => (typeof v === "bigint" ? String(v) : v))}`,
      );
    }
    const after = sim.value.accounts[0]?.lamports ?? 0n;
    const spend = ownerBalance + probe - BigInt(after);

    const send = topUp(ownerBalance, spend, walletRent);
    if (send > probe) throw new SponsorShort(relayer, relayerBalance, send + FEE_RESERVE);
    return send > 0n ? [transferSol(relayer, owner, send), ...ixs] : ixs;
  }
}

/** The most a serialised transaction may be. */
const MAX_TRANSACTION_BYTES = 1232;

/** SOL the relayer keeps for its own signature fees while probing what a top-up needs. */
const FEE_RESERVE = 1_000_000n;

/**
 * What the relayer can lend the simulation to measure a top-up: all it holds
 * but its reserve. Refused outright when that cannot cover `needs`, the least
 * this transaction is known to take, so a relayer short of SOL is reported as
 * one instead of as whichever instruction ran dry first. Exported for its tests.
 */
export const probeFor = (relayer: string, heldLamports: bigint, needs: bigint): bigint => {
  const probe = heldLamports - FEE_RESERVE;
  if (probe <= 0n || probe < needs) throw new SponsorShort(relayer, heldLamports, needs + FEE_RESERVE);
  return probe;
};

/**
 * A simulation's failure as Kamino's own refusal, when it is one.
 *
 * Kamino's lending program numbers its errors from 6000, and the SDK names
 * them; `programAt` says which program the failing instruction belongs to,
 * because the farms program is Anchor too and numbers its errors from 6000 as
 * well. Anything else — a system or token program code, a failure that is not
 * an instruction's — is not Kamino's to explain, and is left as it came.
 */
export const refusalOf = (
  err: unknown,
  programAt: (index: number) => string | undefined,
): LendingRefused | null => {
  const failure = (err as { InstructionError?: unknown } | null)?.InstructionError;
  if (!Array.isArray(failure)) return null;
  const [index, detail] = failure as [unknown, unknown];
  const custom = (detail as { Custom?: unknown } | null)?.Custom;
  if (custom === undefined) return null;
  const code = Number(custom);
  if (!Number.isInteger(code) || code < 6000) return null;
  if (programAt(Number(index)) !== String(PROGRAM_ID)) return null;
  return new LendingRefused(code, fromCode(code)?.name ?? `error ${code}`);
};

/** Exported for its tests: it is where Kamino's units become ours. */
export const toPosition = (market: KaminoMarket, ob: KaminoObligation): LendingPosition => ({
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
  // The SDK's amount is the stored borrow scaled by Kamino's interest index to
  // now, in base units. Only USDC is lent here; anything else was borrowed
  // elsewhere and is not repaid in USDC.
  owedUsdc: ob
    .getBorrows()
    .filter((b) => String(b.mintAddress) === String(USDC))
    .reduce((s, b) => {
      const r = market.getReserveByAddress(b.reserveAddress);
      return r === undefined ? s : s.add(dec(b.amount).div(D(10).pow(r.getMintDecimals())));
    }, ZERO),
  // `refreshedStats`, not the `get*Value()` getters: those read the obligation's stored
  // `*Sf` fields, written by the last on-chain refresh. A borrow refreshes *before* it
  // borrows, so right after one they still say nothing is owed.
  debtBfAdjustedUsd: dec(ob.refreshedStats.userTotalBorrowBorrowFactorAdjusted),
  allowedBorrowUsd: dec(ob.refreshedStats.borrowLimit),
  liquidationBorrowUsd: dec(ob.refreshedStats.borrowLiquidationLimit),
});
