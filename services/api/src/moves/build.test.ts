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
import { validateSponsored } from "../relay/validate.js";
import { buildMove, TOKENS_PER_TRANSACTION, type MoveToken } from "./build.js";

const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const BLOCK = {
  blockhash: "EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k" as Blockhash,
  lastValidBlockHeight: 1n,
};

const world = async () => {
  const [owner, mercury, relayer] = await Promise.all([
    generateKeyPairSigner(),
    generateKeyPairSigner(),
    generateKeyPairSigner(),
  ]);
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
  const base = {
    owner: owner.address,
    destination: mercury.address,
    relayer: relayer.address,
    usdcMint: USDC,
    ...BLOCK,
  };
  return { owner, mercury, relayer, stock, usdc, base };
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
  it("moves each token in its own program, opening the Mercury wallet's account first, the relayer paying", async () => {
    const w = await world();
    const [stock] = [await w.stock(150_000_000n)];
    const [batch] = await buildMove({ ...w.base, tokens: [stock!], feeUsdcRaw: 0n });
    const tx = decoded(batch!.wire);
    expect(tx.feePayer).toBe(w.relayer.address);
    // Open the account (the associated token program), then transferChecked under Token-2022.
    expect(tx.programs).toEqual(["ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", TOKEN_2022]);
    expect(new Set(tx.signers)).toEqual(new Set([w.relayer.address, w.owner.address]));
    expect(batch!.moved).toEqual([{ mint: stock!.mint, amountRaw: 150_000_000n }]);
  });

  it("splits a wallet's worth into small transactions, about four tokens each", async () => {
    const w = await world();
    const tokens = await Promise.all([1n, 2n, 3n, 4n, 5n, 6n].map((n) => w.stock(n)));
    const batches = await buildMove({ ...w.base, tokens, feeUsdcRaw: 0n });
    expect(batches.map((b) => b.moved.length)).toEqual([TOKENS_PER_TRANSACTION, 2]);
    expect(batches.flatMap((b) => b.moved.map((m) => m.amountRaw))).toEqual([1n, 2n, 3n, 4n, 5n, 6n]);
  });

  it("takes the rent from the USDC being moved, repaying the relayer in the same transaction", async () => {
    const w = await world();
    const [batch] = await buildMove({ ...w.base, tokens: [await w.usdc(20_000_000n)], feeUsdcRaw: 450_000n });
    expect(batch!.moved).toEqual([{ mint: USDC, amountRaw: 19_550_000n }]);
    // Open, move, repay: the repayment is a second transfer of the same USDC.
    expect(decoded(batch!.wire).programs).toEqual([
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
      TOKEN,
      TOKEN,
    ]);
  });

  it("charges nothing when no USDC moves: Mercury covers it then", async () => {
    const w = await world();
    const [batch] = await buildMove({ ...w.base, tokens: [await w.stock(5n)], feeUsdcRaw: 450_000n });
    expect(decoded(batch!.wire).programs).toEqual([
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
      TOKEN_2022,
    ]);
  });

  it("charges nothing when the USDC moving is too little to take it from", async () => {
    const w = await world();
    const [batch] = await buildMove({ ...w.base, tokens: [await w.usdc(400_000n)], feeUsdcRaw: 450_000n });
    expect(batch!.moved).toEqual([{ mint: USDC, amountRaw: 400_000n }]);
    expect(decoded(batch!.wire).programs).toHaveLength(2);
  });

  it("takes the rent from one USDC account only, when the wallet keeps USDC in two", async () => {
    const w = await world();
    const [a, b] = [await w.usdc(5_000_000n), await w.usdc(3_000_000n)];
    const [batch] = await buildMove({ ...w.base, tokens: [a, b], feeUsdcRaw: 450_000n });
    expect(batch!.moved).toEqual([
      { mint: USDC, amountRaw: 4_550_000n },
      { mint: USDC, amountRaw: 3_000_000n },
    ]);
    // Open, move, repay; then open (a no-op the second time), move: one repayment.
    expect(decoded(batch!.wire).programs.filter((p) => p === TOKEN)).toHaveLength(3);
  });

  it("builds what the relayer will co-sign once the linked wallet signs, and nothing it would refuse", async () => {
    const w = await world();
    const batches = await buildMove({
      ...w.base,
      tokens: [await w.stock(7n), await w.usdc(10_000_000n)],
      feeUsdcRaw: 300_000n,
    });
    for (const b of batches) {
      const tx = getTransactionDecoder().decode(getBase64Encoder().encode(b.wire));
      const signed = getBase64EncodedWireTransaction(await partiallySignTransaction([w.owner.keyPair], tx));
      const d = decodeSponsored(signed);
      if (!d.ok) throw new Error(d.message);
      expect(validateSponsored(d.tx, w.owner.address, { relayer: w.relayer.address })).toEqual({ ok: true });
      // And not for the Mercury wallet: the linked wallet is the one that signs a move.
      expect(validateSponsored(d.tx, w.mercury.address, { relayer: w.relayer.address }).ok).toBe(false);
    }
  });
});
