import { describe, expect, it } from "vitest";
import {
  getCompiledTransactionMessageDecoder,
  getU64Decoder,
  type Address,
  type Blockhash,
  type ReadonlyUint8Array,
} from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { USDC_MINT } from "@mercury/chain";
import { D } from "@mercury/core";
import { buildSponsoredTransfer } from "./transfer.js";

const OWNER = "8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6" as Address;
const RECIPIENT = "Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8" as Address;
const RELAYER = "Xs7ZdzSHLU9GLSSPoSZuMkQ8GHjNKz1F8gUQRA2ZfZ7" as Address;

const ASSOCIATED_TOKEN_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

const lifetime = {
  blockhash: "11111111111111111111111111111111" as Blockhash,
  lastValidBlockHeight: 1n,
};

const ata = async (owner: Address) =>
  (
    await findAssociatedTokenPda({
      owner,
      mint: USDC_MINT as Address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

/** The message as the network will read it: accounts by index, instructions in order. */
const decoded = async (feeUsdc: string, amountRaw = 20_000_000n) => {
  const { messageBytes } = await buildSponsoredTransfer({
    owner: OWNER,
    destination: RECIPIENT,
    amountRaw,
    relayer: RELAYER,
    feeUsdc: D(feeUsdc),
    ...lifetime,
  });
  const message = getCompiledTransactionMessageDecoder().decode(messageBytes);
  const accounts = message.staticAccounts as readonly Address[];
  return {
    feePayer: accounts[0],
    instructions: message.instructions.map((ix) => ({
      program: accounts[ix.programAddressIndex],
      accounts: (ix.accountIndices ?? []).map((i) => accounts[i]),
      data: ix.data ?? (new Uint8Array() as ReadonlyUint8Array),
    })),
  };
};

/** `Transfer` is instruction 3 of the token program, then the amount as a little-endian u64. */
const transferAmount = (data: ReadonlyUint8Array): bigint => {
  expect(data[0]).toBe(3);
  return getU64Decoder().decode(Uint8Array.from(data).subarray(1, 9));
};

describe("buildSponsoredTransfer", () => {
  it("names the relayer as fee payer, so the sender needs no SOL", async () => {
    const { feePayer } = await decoded("0");
    expect(feePayer).toBe(RELAYER);
    // The whole point. A sender who pays the fee is the behaviour this replaces.
    expect(feePayer).not.toBe(OWNER);
  });

  it("has the relayer pay to open the recipient's account", async () => {
    const { instructions } = await decoded("0.22");
    const open = instructions[0]!;
    expect(open.program).toBe(ASSOCIATED_TOKEN_PROGRAM);
    // The payer is the first account of a create, and it is the one thing that
    // has to be ours: a sender with no SOL cannot put up rent.
    expect(open.accounts[0]).toBe(RELAYER);
    expect(open.accounts[1]).toBe(await ata(RECIPIENT));
  });

  it("moves the amount from the sender's account to the recipient's", async () => {
    const { instructions } = await decoded("0.22", 20_000_000n);
    const transfer = instructions[1]!;
    expect(transfer.program).toBe(TOKEN_PROGRAM_ADDRESS);
    expect(transfer.accounts[0]).toBe(await ata(OWNER));
    expect(transfer.accounts[1]).toBe(await ata(RECIPIENT));
    expect(transferAmount(transfer.data)).toBe(20_000_000n);
  });

  it("repays the rent to the relayer, in the same message", async () => {
    const { instructions } = await decoded("0.22");
    expect(instructions).toHaveLength(3);
    const repay = instructions[2]!;
    expect(repay.accounts[0]).toBe(await ata(OWNER));
    expect(repay.accounts[1]).toBe(await ata(RELAYER));
    // $0.22 of a six-decimal token.
    expect(transferAmount(repay.data)).toBe(220_000n);
  });

  /*
   * Nothing owed is the ordinary case — a recipient who already holds USDC
   * needs no account opened — and an instruction moving zero dollars would
   * be a byte cost and a line in the explorer for nothing.
   */
  it("leaves the repayment out entirely when nothing is owed", async () => {
    const { instructions } = await decoded("0");
    expect(instructions).toHaveLength(2);
    expect(instructions.map((ix) => ix.program)).toEqual([ASSOCIATED_TOKEN_PROGRAM, TOKEN_PROGRAM_ADDRESS]);
  });

  /*
   * Rounded down, deliberately. The fee is already rounded up to the cent when
   * it is quoted, so rounding up again here would charge a cent the sender was
   * never shown.
   */
  it("charges to the base unit, never past the figure quoted", async () => {
    const { instructions } = await decoded("0.2299999");
    expect(transferAmount(instructions[2]!.data)).toBe(229_999n);
  });

  it("asks for two signatures and no more, which is what the relayer will sign", async () => {
    const { messageBytes } = await buildSponsoredTransfer({
      owner: OWNER,
      destination: RECIPIENT,
      amountRaw: 1_000_000n,
      relayer: RELAYER,
      feeUsdc: D("0.22"),
      ...lifetime,
    });
    const message = getCompiledTransactionMessageDecoder().decode(messageBytes);
    // `validateSponsored` refuses a third signer, so a build that needed one
    // would be composed here and refused at the route — a dead transaction.
    expect(message.header.numSignerAccounts).toBe(2);
    expect((message.staticAccounts as readonly Address[]).slice(0, 2).sort()).toEqual(
      [RELAYER, OWNER].sort(),
    );
  });
});
