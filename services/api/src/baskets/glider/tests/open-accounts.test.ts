import { describe, expect, it } from "vitest";
import {
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type Address,
} from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import {
  AccountsNotOpened,
  openTokenAccounts,
  pgSponsoredAccounts,
  type AccountsRpc,
  type SponsoredAccounts,
} from "../open-accounts.js";
import { testDb } from "../../../db/testing.js";
import type { RelaySigner } from "../../../relay/signer.js";

const MERCURY = "2Z7zhqp1eddmHNmEqexftST6DFPWmoL4QqfgiG5uJMJx";
const RELAYER = "KvauGMspG5k6rtzrqqn7WNn3oZdyKqLKwK2XWQ8FLjd";
const TSLAX = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

const ata = async (mint: string, program: string) =>
  (
    await findAssociatedTokenPda({
      owner: MERCURY as Address,
      mint: mint as Address,
      tokenProgram: program as Address,
    })
  )[0];

/** A node where the mints exist, each under its own program, and `held` token accounts already do. */
const node = (held: readonly string[], status: "confirmed" | "failed" = "confirmed") => {
  const sent: string[] = [];
  const programOf: Record<string, string> = { [TSLAX]: TOKEN_2022, [USDC]: TOKEN };
  const rpc: AccountsRpc = {
    owners: async (addresses) =>
      addresses.map((a) => programOf[a] ?? (held.includes(a) ? "account-program" : null)),
    latestBlockhash: async () => ({
      blockhash: "EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k",
      lastValidBlockHeight: 100n,
    }),
    send: async (wire) => void sent.push(wire),
    status: async () => status,
  };
  return { rpc, sent };
};
const signer: RelaySigner = { address: RELAYER, cosign: async (wire) => wire };

/** The ledger of accounts opened before, in memory. */
const memoryLedger = (
  seen: [string, string][] = [],
): SponsoredAccounts & { all: () => [string, string][] } => {
  const rows = [...seen];
  return {
    opened: async (owner, mints) =>
      new Set(rows.filter(([o, m]) => o === owner && mints.includes(m)).map(([, m]) => m)),
    record: async (owner, mints) => void rows.push(...mints.map((m): [string, string] => [owner, m])),
    all: () => rows,
  };
};

/** The accounts each instruction of a sent transaction names, by instruction. */
const instructionsOf = (wire: string) => {
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(wire));
  const message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  return {
    feePayer: message.staticAccounts[0],
    accounts: message.instructions.map((ix) =>
      (ix.accountIndices ?? []).map((i) => message.staticAccounts[i]),
    ),
  };
};

describe("openTokenAccounts", () => {
  it("opens only the accounts the wallet lacks, each under its mint's own program, paid by the relayer", async () => {
    const tslaAta = await ata(TSLAX, TOKEN_2022);
    const usdcAta = await ata(USDC, TOKEN);
    const n = node([usdcAta]);
    const opened = await openTokenAccounts({ rpc: n.rpc, signer, ledger: memoryLedger() })(MERCURY, [
      TSLAX,
      USDC,
      TSLAX,
    ]);
    expect(opened).toBe(1);
    expect(n.sent).toHaveLength(1);
    const { feePayer, accounts } = instructionsOf(n.sent[0]!);
    expect(feePayer).toBe(RELAYER);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toEqual(expect.arrayContaining([RELAYER, tslaAta, MERCURY, TSLAX, TOKEN_2022]));
  });

  it("sends nothing when every account exists already", async () => {
    const n = node([await ata(TSLAX, TOKEN_2022)]);
    expect(await openTokenAccounts({ rpc: n.rpc, signer, ledger: memoryLedger() })(MERCURY, [TSLAX])).toBe(0);
    expect(n.sent).toEqual([]);
  });

  it("says so when the opening failed on chain, rather than let a payout follow into nothing", async () => {
    const n = node([], "failed");
    await expect(
      openTokenAccounts({ rpc: n.rpc, signer, ledger: memoryLedger() })(MERCURY, [TSLAX]),
    ).rejects.toBeInstanceOf(AccountsNotOpened);
  });

  it("refuses a mint that does not exist", async () => {
    const n = node([]);
    await expect(
      openTokenAccounts({ rpc: n.rpc, signer, ledger: memoryLedger() })(MERCURY, [
        "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD",
      ]),
    ).rejects.toBeInstanceOf(AccountsNotOpened);
  });

  it("records what it opened, and never opens the same account on the relayer's SOL again", async () => {
    const ledger = memoryLedger();
    const first = node([]);
    expect(await openTokenAccounts({ rpc: first.rpc, signer, ledger })(MERCURY, [TSLAX])).toBe(1);
    expect(ledger.all()).toEqual([[MERCURY, TSLAX]]);
    // Its owner closed it since, taking the rent back: it stays closed.
    const again = node([]);
    expect(await openTokenAccounts({ rpc: again.rpc, signer, ledger })(MERCURY, [TSLAX, USDC])).toBe(1);
    const { accounts } = instructionsOf(again.sent[0]!);
    expect(accounts.flat()).not.toContain(TSLAX);
    expect(accounts.flat()).toContain(USDC);
  });

  it("records nothing for an opening that failed", async () => {
    const ledger = memoryLedger();
    await openTokenAccounts({ rpc: node([], "failed").rpc, signer, ledger })(MERCURY, [TSLAX]).catch(
      () => undefined,
    );
    expect(ledger.all()).toEqual([]);
  });
});

describe("pgSponsoredAccounts", () => {
  it("says which of an owner's mints were opened before, and keeps each once", async () => {
    const ledger = pgSponsoredAccounts(await testDb());
    await ledger.record(MERCURY, [TSLAX]);
    await ledger.record(MERCURY, [TSLAX]);
    expect([...(await ledger.opened(MERCURY, [TSLAX, USDC]))]).toEqual([TSLAX]);
    expect([...(await ledger.opened(RELAYER, [TSLAX]))]).toEqual([]);
  });
});
