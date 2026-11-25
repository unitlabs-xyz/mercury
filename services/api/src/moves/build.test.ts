import { describe, expect, it } from "vitest";
import {
  generateKeyPairSigner,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  partiallySignTransaction,
  getBase64EncodedWireTransaction,
  type Blockhash,
} from "@solana/kit";
import { decodeSponsored } from "../relay/decode.js";
import { buildMove, TOKENS_PER_TRANSACTION, type MoveToken } from "./build.js";

const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const BLOCK = {
  blockhash: "EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k" as Blockhash,
  lastValidBlockHeight: 1n,
};

const world = async () => {
  const [owner, mercury] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
  /** A token the linked wallet holds, in an account of its own; a fresh mint each time. */
  const stock = async (amountRaw: bigint, programId = TOKEN_2022): Promise<MoveToken> => ({
    mint: (await generateKeyPairSigner()).address,
    source: (await generateKeyPairSigner()).address,
    programId,
    decimals: 8,
    amountRaw,
  });
  const usdc = async (amountRaw: bigint): Promise<MoveToken> => ({
    mint: USDC,
    source: (await generateKeyPairSigner()).address,
    programId: TOKEN,
    decimals: 6,
    amountRaw,
  });
  const base = { owner: owner.address, destination: mercury.address, ...BLOCK };
  return { owner, mercury, stock, usdc, base };
};

/** The instructions of one built transaction, with the programs they call. */
const decoded = (wire: string) => {
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(wire));
  const message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  const keys = message.staticAccounts as readonly string[];
  return {
    feePayer: keys[0],
    programs: message.instructions.map((i) => keys[i.programAddressIndex]!),
    signers: keys.slice(0, message.header.numSignerAccounts),
  };
};

describe("buildMove", () => {
  it("moves each token in its own program, opening the Mercury wallet's account first, the linked wallet paying", async () => {
    const w = await world();
    const [stock] = [await w.stock(150_000_000n)];
    const [batch] = await buildMove({ ...w.base, tokens: [stock!] });
    const tx = decoded(batch!.wire);
    // The linked wallet's own SOL: its keys are its own, so Mercury puts up nothing there.
    expect(tx.feePayer).toBe(w.owner.address);
    expect(tx.signers).toEqual([w.owner.address]);
    // Open the account (the associated token program), then transferChecked under Token-2022.
    expect(tx.programs).toEqual(["ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", TOKEN_2022]);
    expect(batch!.moved).toEqual([{ mint: stock!.mint, amountRaw: 150_000_000n }]);
  });

  it("splits a wallet's worth into small transactions, about four tokens each", async () => {
    const w = await world();
    const tokens = await Promise.all([1n, 2n, 3n, 4n, 5n, 6n].map((n) => w.stock(n)));
    const batches = await buildMove({ ...w.base, tokens });
    expect(batches.map((b) => b.moved.length)).toEqual([TOKENS_PER_TRANSACTION, 2]);
    expect(batches.flatMap((b) => b.moved.map((m) => m.amountRaw))).toEqual([1n, 2n, 3n, 4n, 5n, 6n]);
  });

  it("moves all the USDC asked for: nothing is taken out of it", async () => {
    const w = await world();
    const [batch] = await buildMove({ ...w.base, tokens: [await w.usdc(20_000_000n)] });
    expect(batch!.moved).toEqual([{ mint: USDC, amountRaw: 20_000_000n }]);
    expect(decoded(batch!.wire).programs).toEqual(["ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", TOKEN]);
  });

  it("builds a transaction the linked wallet sends on its own signature, which the relayer never pays for", async () => {
    const w = await world();
    const batches = await buildMove({ ...w.base, tokens: [await w.stock(7n), await w.usdc(10_000_000n)] });
    for (const b of batches) {
      const tx = getTransactionDecoder().decode(getBase64Encoder().encode(b.wire));
      const signed = getBase64EncodedWireTransaction(await partiallySignTransaction([w.owner.keyPair], tx));
      const d = decodeSponsored(signed);
      if (!d.ok) throw new Error(d.message);
      expect(d.tx.feePayer).toBe(w.owner.address);
      expect(d.tx.signedBy).toEqual([w.owner.address]);
    }
  });
});
