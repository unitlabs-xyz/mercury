import { describe, expect, it } from "vitest";
import {
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type Address,
  type Blockhash,
} from "@solana/kit";
import { composeFundSwap, relayInstruction, type RelayWireInstruction } from "./compose.js";

const PAYER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" as Address;
const PROGRAM = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const RECIPIENT = "62Y5aQzjXHqYkpRAC4DCt78MivUdG2bMahnCBxxcaTam";

const lifetime = {
  blockhash: "11111111111111111111111111111111" as Blockhash,
  lastValidBlockHeight: 1_000n,
};

const ix = (over: Partial<RelayWireInstruction> = {}): RelayWireInstruction => ({
  programId: PROGRAM,
  keys: [
    { pubkey: PAYER, isSigner: true, isWritable: true },
    { pubkey: RECIPIENT, isSigner: false, isWritable: true },
  ],
  data: Buffer.from([1, 2, 3]).toString("base64"),
  ...over,
});

const decode = (wire: string) => {
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(wire));
  return getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
};

describe("relayInstruction", () => {
  it("reads Relay's `keys`, which Jupiter calls `accounts`", () => {
    /* Feeding one shape to the other's reader makes a transaction with no
       accounts, and the chain explains that badly. */
    const converted = relayInstruction(ix());

    expect(converted.programAddress).toBe(PROGRAM);
    expect(converted.accounts).toHaveLength(2);
  });

  it("packs writable and signer into kit's role bits", () => {
    const converted = relayInstruction(
      ix({
        keys: [
          { pubkey: PAYER, isSigner: true, isWritable: true }, // 3
          { pubkey: RECIPIENT, isSigner: false, isWritable: true }, // 1
          { pubkey: PROGRAM, isSigner: true, isWritable: false }, // 2
          { pubkey: RECIPIENT, isSigner: false, isWritable: false }, // 0
        ],
      }),
    );

    expect(converted.accounts?.map((a) => a.role)).toEqual([3, 1, 2, 0]);
  });

  it("decodes the base64 data as bytes", () => {
    expect(relayInstruction(ix()).data).toEqual(Uint8Array.from([1, 2, 3]));
  });
});

describe("composeFundSwap", () => {
  it("names the funder as fee payer, not our relayer", () => {
    /* The opposite of composeSponsored. A wallet holding arbitrary tokens is a
       funded account by definition, so nothing here is sponsored. */
    const { wire } = composeFundSwap({
      payer: PAYER,
      instructions: [ix()],
      lookupTables: new Map(),
      ...lifetime,
    });

    expect(decode(wire).staticAccounts[0]).toBe(PAYER);
  });

  it("keeps Relay's instructions in the order Relay gave them", () => {
    const first = ix({ data: Buffer.from([1]).toString("base64") });
    const second = ix({ data: Buffer.from([2]).toString("base64") });

    const { wire } = composeFundSwap({
      payer: PAYER,
      instructions: [first, second],
      lookupTables: new Map(),
      ...lifetime,
    });

    const message = decode(wire);
    expect(message.instructions).toHaveLength(2);
    expect(message.instructions[0]!.data).toEqual(Uint8Array.from([1]));
    expect(message.instructions[1]!.data).toEqual(Uint8Array.from([2]));
  });

  it("compiles a versioned message, so lookup tables are possible at all", () => {
    const { wire } = composeFundSwap({
      payer: PAYER,
      instructions: [ix()],
      lookupTables: new Map(),
      ...lifetime,
    });

    expect(decode(wire).version).toBe(0);
  });

  it("returns the message bytes, so the relay build record can remember them", () => {
    const { messageBytes } = composeFundSwap({
      payer: PAYER,
      instructions: [ix()],
      lookupTables: new Map(),
      ...lifetime,
    });

    expect(messageBytes.byteLength).toBeGreaterThan(0);
  });

  it("refuses a route with no instructions rather than signing an empty transaction", () => {
    expect(() =>
      composeFundSwap({ payer: PAYER, instructions: [], lookupTables: new Map(), ...lifetime }),
    ).toThrow(/no instructions/i);
  });
});
