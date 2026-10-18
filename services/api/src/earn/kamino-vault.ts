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
  DEFAULT_PUBLIC_KEY,
  DEFAULT_RECENT_SLOT_DURATION_MS,
  KaminoVault,
  buildComputeBudgetIx,
  getCurrentLedgerInstant,
} from "@kamino-finance/klend-sdk";
import Decimal from "decimal.js";
import { D, type Decimal as OurDecimal } from "@mercury/core";
import type { ChainReader } from "@mercury/chain";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { createLendingRpc } from "../lending/rpc.js";
import { topUp, transferSol } from "../lending/sponsor.js";
import { WALLET_BYTES, rentFor } from "../rent.js";
import { SponsorShort, type BuiltTransactions } from "../lending/ports.js";
import type { EarnAllocation, EarnIntent, EarnPosition, EarnSource, EarnVault } from "./ports.js";

/** decimal.js from the SDK is a different copy from ours; go through the string. */
const dec = (v: { toString(): string }): OurDecimal => D(v.toString());

/** The most a serialised transaction may be. */
const MAX_TRANSACTION_BYTES = 1232;

/**
 * Compute for one deposit or withdrawal. A withdrawal refreshes and redeems
 * from every reserve the vault lends to, which is the expensive end; measured
 * well under this on mainnet in October 2026.
 */
const COMPUTE_UNITS = 600_000;

/** What the relayer lends a simulation to measure a top-up. */
const PROBE_LAMPORTS = 10_000_000n;
/** What it keeps besides: the share account's rent, about 0.002 SOL, and its own fees. */
const RELAYER_KEEPS = 5_000_000n;

export interface KaminoEarnConfig {
  readonly rpcUrl: string;
  readonly scanRpcUrl?: string;
  /** Which Kamino Earn vault. It has to hold USDC; nothing else is cash here. */
  readonly vault: string;
  readonly usdcMint: string;
  /** How long a loaded vault and its reserves are reused. */
  readonly ttlMs?: number;
  readonly rent?: Pick<ChainReader, "rentExemption">;
}

/**
 * A Kamino Earn vault (a "kVault"): a curator lends the vault's USDC across
 * Kamino reserves, and a depositor holds shares whose USDC value rises as that
 * interest comes in. Shares sit in the wallet's own token account, so the
 * money stays the wallet's; we never hold a key.
 *
 * Shares are not staked in the vault's farm, if it has one. The farm pays
 * extra rewards in some other token, which this app has nowhere to show, and
 * staking would add instructions to every deposit and withdrawal for them.
 */
export class KaminoEarn implements EarnSource {
  private readonly rpc: ReturnType<typeof createLendingRpc>;
  private readonly ttlMs: number;
  private readonly rent: Pick<ChainReader, "rentExemption">;
  readonly address: Address;
  private cached: { at: number; vault: Promise<KaminoVault> } | null = null;

  constructor(private readonly config: KaminoEarnConfig) {
    this.rpc = createLendingRpc(config.rpcUrl, config.scanRpcUrl);
    this.ttlMs = config.ttlMs ?? 60_000;
    this.rent = config.rent ?? {};
    this.address = address(config.vault);
  }

  /** The vault with its state and reserves loaded, shared for `ttlMs`. */
  private loaded(): Promise<KaminoVault> {
    const now = Date.now();
    if (this.cached !== null && now - this.cached.at < this.ttlMs) return this.cached.vault;
    const vault = (async () => {
      const v = new KaminoVault(this.rpc, this.address, DEFAULT_RECENT_SLOT_DURATION_MS);
      const state = await v.reloadState();
      if (state.tokenMint !== this.config.usdcMint) {
        throw new Error(`earn: vault ${this.address} holds ${state.tokenMint}, not USDC`);
      }
      await v.reloadVaultReserves();
      return v;
    })();
    vault.catch(() => (this.cached = null));
    this.cached = { at: now, vault };
    return vault;
  }

  async vault(): Promise<EarnVault> {
    const [v, instant] = await Promise.all([this.loaded(), this.instant()]);
    const state = await v.getState();
    const [apys, sharePrice] = await Promise.all([v.getAPYs(instant), v.getExchangeRate(instant)]);
    return {
      address: this.address,
      name: v.client.decodeVaultName(state.name),
      // What is earned now, from the reserves' current rates, not a target.
      apy: dec(apys.actualAPY.netAPY),
      sharePrice: dec(sharePrice),
      performanceFee: D(state.performanceFeeBps.toString()).div(10_000),
      managementFee: D(state.managementFeeBps.toString()).div(10_000),
      minDepositUsdc: D(state.minDepositAmount.toString()).div(D(10).pow(state.tokenMintDecimals.toNumber())),
    };
  }

  async allocation(): Promise<readonly EarnAllocation[]> {
    const [v, instant] = await Promise.all([this.loaded(), this.instant()]);
    const holdings = await v.getVaultHoldings(instant);
    const byMarket = new Map<string, OurDecimal>();
    for (const [reserve, usdc] of holdings.investedInReserves) {
      const market = v.vaultReservesStateCache?.get(reserve)?.state.lendingMarket;
      if (market === undefined) continue;
      byMarket.set(String(market), (byMarket.get(String(market)) ?? D(0)).add(dec(usdc)));
    }
    return [...byMarket]
      .map(([market, usdc]) => ({ market, usdc }))
      .filter((a) => a.usdc.gt(0))
      .sort((a, b) => b.usdc.comparedTo(a.usdc));
  }

  /**
   * The ledger instant, shared for a few seconds. Every read below needs one,
   * and a page asking about three vaults at once asked for three.
   */
  private instantCache: { at: number; instant: ReturnType<typeof getCurrentLedgerInstant> } | null = null;
  private instant(): ReturnType<typeof getCurrentLedgerInstant> {
    const now = Date.now();
    if (this.instantCache !== null && now - this.instantCache.at < 5_000) return this.instantCache.instant;
    const instant = getCurrentLedgerInstant(this.rpc);
    instant.catch(() => (this.instantCache = null));
    this.instantCache = { at: now, instant };
    return instant;
  }

  /**
   * The wallet's shares: what its own share account holds, read directly.
   *
   * Not the SDK's `getUserShares`. That one lists every token account the
   * wallet owns with `getProgramAccounts` over the whole token program — the
   * heaviest call an RPC serves — to find the one it could have computed. Run
   * for three vaults on every page load, it spent the plan's allowance for
   * that method ten times over and took borrowing and the portfolio down with
   * it (HTTP 429, 18 October 2026). Shares staked in the vault's farm are not
   * counted; nothing here stakes them.
   */
  private async sharesOf(v: KaminoVault, owner: Address): Promise<OurDecimal> {
    const state = await v.getState();
    const [ata] = await findAssociatedTokenPda({
      owner,
      mint: state.sharesMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const { value } = await this.rpc
      .getTokenAccountBalance(ata)
      .send()
      .catch((e: unknown) => {
        // A wallet that never held shares has no account: nothing, not an error.
        if (String((e as { message?: unknown })?.message ?? e).includes("could not find account")) {
          return { value: null };
        }
        throw e;
      });
    return value === null ? D(0) : D(value.amount).div(D(10).pow(value.decimals));
  }

  async position(wallet: string): Promise<EarnPosition | null> {
    const [v, instant] = await Promise.all([this.loaded(), this.instant()]);
    const [total, rate] = await Promise.all([this.sharesOf(v, address(wallet)), v.getExchangeRate(instant)]);
    if (total.lte(0)) return null;
    return { shares: total, usdc: total.mul(dec(rate)) };
  }

  async build(wallet: string, intent: EarnIntent, sponsor?: string): Promise<BuiltTransactions> {
    const [v, instant] = await Promise.all([this.loaded(), this.instant()]);
    const state = await v.getState();
    const reserves = v.vaultReservesStateCache;
    if (reserves === undefined) throw new Error("earn: vault reserves not loaded");
    const owner = createNoopSigner(address(wallet));
    const payer = sponsor === undefined ? owner : createNoopSigner(address(sponsor));

    let actionIxs: Instruction[];
    if (intent.kind === "deposit") {
      const built = await v.depositIxs(
        owner,
        new Decimal(intent.usdc.toString()),
        reserves,
        null,
        null,
        payer,
      );
      actionIxs = built.depositIxs;
    } else {
      const total = new Decimal((await this.sharesOf(v, owner.address)).toString());
      if (total.lte(0)) throw new Error("earn: nothing in the vault to withdraw");
      // Shares for a dollar amount, at today's rate, never more than are held.
      const wanted =
        intent.usdc === "all"
          ? total
          : Decimal.min(
              total,
              new Decimal(intent.usdc.toString()).div((await v.getExchangeRate(instant)).toString()),
            );
      const built = await v.withdrawIxs(owner, wanted, instant, reserves, null, null, payer);
      actionIxs = [...built.unstakeFromFarmIfNeededIxs, ...built.withdrawIxs, ...built.postWithdrawIxs];
    }
    actionIxs = [buildComputeBudgetIx(COMPUTE_UNITS), ...actionIxs];

    const { value: blockhash } = await this.rpc.getLatestBlockhash().send();
    const luts =
      state.vaultLookupTable === DEFAULT_PUBLIC_KEY
        ? {}
        : await fetchAddressesForLookupTables([state.vaultLookupTable], this.rpc);
    const compile = (ixs: readonly Instruction[]) => {
      const tx = compileTransaction(
        compressTransactionMessageUsingAddressLookupTables(
          pipe(
            createTransactionMessage({ version: 0 }),
            (m) => setTransactionMessageFeePayer(payer.address, m),
            (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
            (m) => appendTransactionMessageInstructions(ixs, m),
          ),
          luts,
        ),
      );
      return { wire: getBase64EncodedWireTransaction(tx), messageBytes: Uint8Array.from(tx.messageBytes) };
    };

    const ixs =
      sponsor === undefined ? actionIxs : await this.fund(owner.address, payer.address, actionIxs, compile);
    const compiled = compile(ixs);
    const bytes = getBase64Encoder().encode(compiled.wire).length;
    if (bytes > MAX_TRANSACTION_BYTES) {
      throw new Error(`earn: a built transaction is ${bytes} bytes, over Solana's ${MAX_TRANSACTION_BYTES}`);
    }
    return {
      transactions: [compiled.wire],
      messages: [compiled.messageBytes],
      firstTime: false,
      expiresAt: new Date(Date.now() + 45_000),
    };
  }

  /**
   * The same top-up the lending adapter does (see `sponsor.ts`): simulate with
   * a probe transfer from the relayer in front, read what the owner spent, and
   * send that much if the wallet cannot cover it. The relayer pays for the
   * share account itself, as `payer`, so this is usually nothing — but a
   * wallet that holds no SOL at all still has to exist to sign.
   */
  private async fund(
    owner: Address,
    relayer: Address,
    ixs: readonly Instruction[],
    compile: (ixs: readonly Instruction[]) => { wire: string },
  ): Promise<readonly Instruction[]> {
    const [{ value: ownerBalance }, { value: relayerBalance }, walletRent] = await Promise.all([
      this.rpc.getBalance(owner).send(),
      this.rpc.getBalance(relayer).send(),
      rentFor(this.rent, WALLET_BYTES),
    ]);
    /*
     * Not everything the relayer holds, as the lending adapter lends: here the
     * relayer is also `payer`, and creates the share account out of what is
     * left. A deposit asks nothing of the owner past a wallet's own rent, so
     * a hundredth of a SOL measures it with room to spare.
     */
    if (relayerBalance < PROBE_LAMPORTS + RELAYER_KEEPS) {
      throw new SponsorShort(relayer, relayerBalance, PROBE_LAMPORTS + RELAYER_KEEPS);
    }
    const probe = PROBE_LAMPORTS;
    const sim = await this.rpc
      .simulateTransaction(compile([transferSol(relayer, owner, probe), ...ixs]).wire as never, {
        encoding: "base64",
        sigVerify: false,
        replaceRecentBlockhash: true,
        accounts: { addresses: [owner], encoding: "base64" },
      })
      .send();
    if (sim.value.err !== null) {
      throw new EarnRefused(
        JSON.stringify(sim.value.err, (_, x) => (typeof x === "bigint" ? String(x) : x)),
        sim.value.logs ?? [],
      );
    }
    const after = sim.value.accounts[0]?.lamports ?? 0n;
    const spend = ownerBalance + probe - BigInt(after);
    const send = topUp(ownerBalance, spend, walletRent);
    if (send > probe) throw new SponsorShort(relayer, relayerBalance, send + RELAYER_KEEPS);
    return send > 0n ? [transferSol(relayer, owner, send), ...ixs] : ixs;
  }
}

/** The vault would refuse this transaction. The route says so plainly; the logs are for us. */
export class EarnRefused extends Error {
  constructor(
    readonly detail: string,
    readonly logs: readonly string[],
  ) {
    super(`earn: the transaction would fail: ${detail}`);
    this.name = "EarnRefused";
  }
}
