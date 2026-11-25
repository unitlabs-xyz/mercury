import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createSolanaRpc,
  createTransactionMessage,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Base64EncodedWireTransaction,
  type Blockhash,
  type Instruction,
  type Signature,
} from "@solana/kit";
import { findAssociatedTokenPda, getCreateAssociatedTokenIdempotentInstruction } from "@solana-program/token";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { sponsoredTokenAccounts } from "../../db/schema.js";
import type { RelaySigner } from "../../relay/signer.js";

/** The chain calls this needs, so a test can stand in for the node. */
export interface AccountsRpc {
  /** Each account's owning program, or null where it does not exist. */
  owners(addresses: readonly Address[]): Promise<readonly (string | null)[]>;
  latestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: bigint }>;
  send(wire: string): Promise<void>;
  /** "confirmed", "failed", or null while not yet seen. */
  status(signature: string): Promise<"confirmed" | "failed" | null>;
}

export const solanaAccountsRpc = (rpcUrl: string): AccountsRpc => {
  const rpc = createSolanaRpc(rpcUrl);
  return {
    async owners(addresses) {
      const { value } = await rpc.getMultipleAccounts([...addresses], { encoding: "base64" }).send();
      return value.map((a) => (a === null ? null : String(a.owner)));
    },
    async latestBlockhash() {
      const { value } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
      return value;
    },
    async send(wire) {
      await rpc
        .sendTransaction(wire as Base64EncodedWireTransaction, {
          encoding: "base64",
          preflightCommitment: "confirmed",
          maxRetries: 3n,
        })
        .send();
    },
    async status(signature) {
      const { value } = await rpc.getSignatureStatuses([signature as Signature]).send();
      const s = value[0];
      if (s === null || s === undefined) return null;
      if (s.err !== null) return "failed";
      return s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized"
        ? "confirmed"
        : null;
    },
  };
};

/**
 * Which accounts the relayer has opened before, for whom: each is opened once
 * ever (`sponsored_token_account`). An account its owner closed since, taking
 * the rent back, is not opened again on the relayer's SOL.
 */
export interface SponsoredAccounts {
  /** Of these mints, the ones the relayer already opened an account for, for this owner. */
  opened(owner: string, mints: readonly string[]): Promise<ReadonlySet<string>>;
  record(owner: string, mints: readonly string[]): Promise<void>;
}

export const pgSponsoredAccounts = (db: Db): SponsoredAccounts => ({
  async opened(owner, mints) {
    if (mints.length === 0) return new Set();
    const rows = await db
      .select({ mint: sponsoredTokenAccounts.mint })
      .from(sponsoredTokenAccounts)
      .where(and(eq(sponsoredTokenAccounts.owner, owner), inArray(sponsoredTokenAccounts.mint, [...mints])));
    return new Set(rows.map((r) => r.mint));
  },
  async record(owner, mints) {
    if (mints.length === 0) return;
    await db
      .insert(sponsoredTokenAccounts)
      .values(mints.map((mint) => ({ owner, mint })))
      .onConflictDoNothing();
  },
});

/** A token account that could not be opened before an exit paid into it. */
export class AccountsNotOpened extends Error {
  constructor(detail: string) {
    super(`the Mercury wallet's token accounts could not be opened: ${detail}`);
    this.name = "AccountsNotOpened";
  }
}

const CONFIRM_MS = 30_000;
const POLL_MS = 1_000;

/**
 * Opens the token accounts the Mercury wallet lacks for `mints`, paid by the
 * relayer, before a linked wallet's basket is paid out into it.
 *
 * Glider pays an exit to any address the owner signs for, and its paymaster
 * pays the network fee, but its documentation says nothing about opening the
 * recipient's token account for an asset it has never held (checked against
 * docs.glider.fi/llms-full.txt, 25 November 2026). Rather than find out on a
 * signed exit, every account the payout needs is made to exist first.
 *
 * Mercury pays the rent, as it does for the Mercury wallet's accounts. Its
 * owner can close one and take the rent back (a Privy key can be exported), so
 * the relayer opens any one account once ever (`SponsoredAccounts`): one closed
 * since stays closed, and the payout into it is the owner's to have broken. It
 * runs only for an exit the owner has signed, which the caller checks first
 * (`BasketService.openForPayout`). Opening needs the payer's signature alone
 * (the idempotent instruction makes the owner's account, and is a no-op where
 * it already exists), so nothing more is asked of the person. One transaction
 * for at most ten accounts, which is as many assets as an exit can name.
 */
export const openTokenAccounts =
  (deps: {
    readonly rpc: AccountsRpc;
    readonly signer: RelaySigner;
    readonly ledger: SponsoredAccounts;
    readonly now?: () => number;
  }) =>
  async (owner: string, mints: readonly string[]): Promise<number> => {
    const unique = [...new Set(mints)];
    if (unique.length === 0) return 0;
    const wallet = address(owner);
    // Each mint's own token program: xStocks are Token-2022, USDC is the classic program.
    const programs = await deps.rpc.owners(unique.map((m) => address(m)));
    const wanted: { mint: Address; program: Address; ata: Address }[] = [];
    for (const [i, mint] of unique.entries()) {
      const program = programs[i];
      if (program === null || program === undefined) throw new AccountsNotOpened(`no mint at ${mint}`);
      const [ata] = await findAssociatedTokenPda({
        owner: wallet,
        mint: address(mint),
        tokenProgram: address(program),
      });
      wanted.push({ mint: address(mint), program: address(program), ata });
    }
    const [existing, before] = await Promise.all([
      deps.rpc.owners(wanted.map((w) => w.ata)),
      deps.ledger.opened(owner, unique),
    ]);
    // Missing, and never opened on the relayer's SOL before: one opened and closed since stays closed.
    const missing = wanted.filter(
      (w, i) => (existing[i] === null || existing[i] === undefined) && !before.has(w.mint),
    );
    if (missing.length === 0) return 0;

    const payer = createNoopSigner(address(deps.signer.address));
    const ixs: Instruction[] = missing.map((m) =>
      getCreateAssociatedTokenIdempotentInstruction({
        payer,
        ata: m.ata,
        owner: wallet,
        mint: m.mint,
        tokenProgram: m.program,
      }),
    );
    const { blockhash, lastValidBlockHeight } = await deps.rpc.latestBlockhash();
    const tx = compileTransaction(
      pipe(
        createTransactionMessage({ version: 0 }),
        (msg) => setTransactionMessageFeePayer(payer.address, msg),
        (msg) =>
          setTransactionMessageLifetimeUsingBlockhash(
            { blockhash: blockhash as Blockhash, lastValidBlockHeight },
            msg,
          ),
        (msg) => appendTransactionMessageInstructions(ixs, msg),
      ),
    );
    const signed = await deps.signer.cosign(getBase64EncodedWireTransaction(tx));
    const signature = feePayerSignature(signed);
    try {
      await deps.rpc.send(signed);
    } catch (error: unknown) {
      throw new AccountsNotOpened(error instanceof Error ? error.message : String(error));
    }
    const now = deps.now ?? Date.now;
    const deadline = now() + CONFIRM_MS;
    for (;;) {
      const status = await deps.rpc.status(signature);
      if (status === "confirmed") {
        await deps.ledger.record(
          owner,
          missing.map((m) => String(m.mint)),
        );
        return missing.length;
      }
      if (status === "failed") throw new AccountsNotOpened("the transaction failed");
      if (now() >= deadline) throw new AccountsNotOpened("not confirmed in time");
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  };

/** The first signature on a signed wire transaction: the fee payer's, which names it. */
const feePayerSignature = (base64: string): string => {
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  // A compact-u16 count of signatures (one byte below 128), then 64 bytes each.
  return getBase58Decoder().decode(bytes.subarray(1, 65));
};
