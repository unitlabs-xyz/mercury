import { describe, expect, it } from "vitest";
import {
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  getU64Decoder,
  type Address,
  type Blockhash,
  type ReadonlyUint8Array,
} from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { USDC_MINT } from "@mercury/chain";
import { buildFundTransfer } from "./fund-transfer";

/** The wallet somebody connects to fund with: Phantom, Backpack, whatever. */
const FUNDER = "8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6" as Address;
/** The Mercury wallet the money lands in. */
const MERCURY = "Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8" as Address;

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
const decoded = async (amountRaw = 20_000_000n) => {
  const wire = await buildFundTransfer({
    from: FUNDER,
    to: MERCURY,
    amountRaw,
    ...lifetime,
  });
  const { messageBytes } = getTransactionDecoder().decode(wire);
  const message = getCompiledTransactionMessageDecoder().decode(messageBytes);
  /* Kit's decoder returns a union: the v1 variant carries config values rather
     than instructions, and this builder never produces one. */
  if (!("instructions" in message)) throw new Error("expected an instruction-bearing message");
  const accounts = message.staticAccounts as readonly Address[];
  return {
    feePayer: accounts[0],
    signerCount: message.header.numSignerAccounts,
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

describe("buildFundTransfer", () => {
  /*
   * The whole difference from the sponsored transfer in services/api: here the
   * sender pays, because it is their own wallet and they chose to use it. No
   * relayer is named, so nothing of ours signs and nothing of ours is owed.
   */
  it("names the funding wallet as fee payer, because it is theirs to spend", async () => {
    const { feePayer } = await decoded();
    expect(feePayer).toBe(FUNDER);
  });

  it("needs exactly one signature, so no server has to countersign", async () => {
    const { signerCount } = await decoded();
    expect(signerCount).toBe(1);
  });

  it("opens the recipient's USDC account before paying into it", async () => {
    const { instructions } = await decoded();
    expect(instructions).toHaveLength(2);
    expect(instructions[0]?.program).toBe(ASSOCIATED_TOKEN_PROGRAM);
    expect(instructions[1]?.program).toBe(TOKEN_PROGRAM_ADDRESS);
  });

  /*
   * Idempotent, because whether the Mercury wallet already holds USDC is not
   * something this can know without a read it would then be racing. A first
   * deposit has to create the account; a second must not fail for finding it.
   */
  it("charges the account rent to the funder, who is the only one here with SOL", async () => {
    const { instructions } = await decoded();
    const open = instructions[0];
    // Payer first, then the account being opened, then its owner.
    expect(open?.accounts[0]).toBe(FUNDER);
    expect(open?.accounts[1]).toBe(await ata(MERCURY));
    expect(open?.accounts[2]).toBe(MERCURY);
  });

  it("moves the dollars from the funder's token account to Mercury's", async () => {
    const { instructions } = await decoded();
    const transfer = instructions[1];
    expect(transfer?.accounts[0]).toBe(await ata(FUNDER));
    expect(transfer?.accounts[1]).toBe(await ata(MERCURY));
    expect(transfer?.accounts[2]).toBe(FUNDER);
  });

  it("transfers exactly the base units it was given", async () => {
    const { instructions } = await decoded(1_230_000n);
    expect(transferAmount(instructions[1]!.data)).toBe(1_230_000n);
  });

  /*
   * Privy's signAndSendTransaction takes bytes, not a base64 string like the
   * server's relay path returns. Returning the wrong one of those typechecks
   * and then fails in the wallet, so it is worth a test of its own.
   */
  it("returns bytes a wallet can sign, not a base64 string", async () => {
    const wire = await buildFundTransfer({ from: FUNDER, to: MERCURY, amountRaw: 1n, ...lifetime });
    expect(wire).toBeInstanceOf(Uint8Array);
  });
});
