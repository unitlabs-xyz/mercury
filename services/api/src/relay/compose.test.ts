import { describe, expect, it } from "vitest";
import {
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type Address,
  type Blockhash,
} from "@solana/kit";
import { composeSponsored, toInstruction, type JupiterInstruction } from "./compose.js";
import { parseLookupTable } from "./lookups.js";
import { transferInstruction } from "./usdc.js";
import jupiter from "./__fixtures__/jupiter-swap-instructions.json" with { type: "json" };
import tables from "./__fixtures__/lookup-table.json" with { type: "json" };

/*
 * A real 5 USDC into SPCXx route, and the real table it goes through, both
 * captured from Jupiter on 30 September 2026. A synthetic instruction would
 * only prove we can compose something we invented; this proves we can compose
 * what Jupiter actually returns, 24 accounts and all.
 */
const RELAYER = "AkZjMBy3SAfbend3qq22aMh9nsAehS7a8HXk15VxGJmJ" as Address;
const BUYER = "8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6" as Address;
const BLOCKHASH = "11111111111111111111111111111111" as Blockhash;

const lookupTables = new Map<Address, readonly Address[]>(
  Object.entries(tables).map(([address, data]) => [
    address as Address,
    parseLookupTable(Uint8Array.from(Buffer.from(data, "base64"))),
  ]),
);

const charge = transferInstruction({
  source: "VKV7c5f5RJ5zJd23ukB63fDtv6QNjBys1MvdeNBVWKR" as Address,
  destination: "3emsAVdmGKERbHjmGfQ6oZ1e35dkf5z6TmFszLJJ1U1E" as Address,
  owner: BUYER,
  amount: 250_000n,
});

const compose = (withCharge: boolean, chargePosition: "before" | "after" = "before") =>
  composeSponsored({
    relayer: RELAYER,
    blockhash: BLOCKHASH,
    lastValidBlockHeight: 1n,
    computeBudget: (jupiter.computeBudgetInstructions as JupiterInstruction[]).map(toInstruction),
    charge: withCharge ? charge : null,
    swap: [toInstruction(jupiter.swapInstruction as JupiterInstruction)],
    lookupTables,
    chargePosition,
  });

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;
const JUPITER_PROGRAM = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4" as Address;

const read = (wire: string) => {
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(wire));
  return getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
};

describe("composeSponsored", () => {
  it("puts the relayer first, so the relayer pays", () => {
    const m = read(compose(true).wire);
    expect(m.staticAccounts[0]).toBe(RELAYER);
  });

  it("needs the buyer's signature as well as ours", () => {
    const m = read(compose(true).wire);
    expect(m.header.numSignerAccounts).toBe(2);
    expect(m.staticAccounts.slice(0, 2)).toContain(BUYER);
  });

  it("leaves the charge out when nothing is owed", () => {
    const m = read(compose(false).wire);
    const programs = m.instructions.map((i) => m.staticAccounts[i.programAddressIndex]);
    expect(programs).not.toContain(TOKEN_PROGRAM);
  });

  /*
   * The reason lookup tables are read at all. A 24-account route plus a
   * transfer does not fit in 1232 bytes uncompressed, and a transaction over
   * that limit is rejected outright.
   */
  it("fits inside Solana's transaction limit, which is why the tables are read", () => {
    const { wire } = compose(true);
    const bytes = Buffer.from(wire, "base64").length;
    expect(bytes).toBeLessThanOrEqual(1232);
  });

  it("compresses through the lookup table rather than naming every account", () => {
    // Lookups exist only on a v0 message, which is what this composes.
    const m = read(compose(true).wire) as { addressTableLookups?: readonly unknown[] };
    expect(m.addressTableLookups?.length ?? 0).toBeGreaterThan(0);
  });

  /* The bytes handed to `builds.remember` must be the bytes that come back. */
  it("returns the message bytes that the wire carries", () => {
    const { wire, messageBytes } = compose(true);
    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(wire));
    expect(Uint8Array.from(tx.messageBytes)).toEqual(messageBytes);
  });

  it("changes the message when the charge changes, so a different fee is a different build", () => {
    const a = compose(true).messageBytes;
    const b = composeSponsored({
      relayer: RELAYER,
      blockhash: BLOCKHASH,
      lastValidBlockHeight: 1n,
      computeBudget: (jupiter.computeBudgetInstructions as JupiterInstruction[]).map(toInstruction),
      charge: transferInstruction({
        source: "VKV7c5f5RJ5zJd23ukB63fDtv6QNjBys1MvdeNBVWKR" as Address,
        destination: "3emsAVdmGKERbHjmGfQ6oZ1e35dkf5z6TmFszLJJ1U1E" as Address,
        owner: BUYER,
        amount: 1n,
      }),
      swap: [toInstruction(jupiter.swapInstruction as JupiterInstruction)],
      lookupTables,
      chargePosition: "before",
    }).messageBytes;
    expect(a).not.toEqual(b);
  });
});

/**
 * Which way round the charge and the swap go, which is the whole of what
 * separates a sponsored buy from a sponsored sell.
 */
describe("where the charge sits", () => {
  const order = (wire: string) => {
    const m = read(wire);
    const programs = m.instructions.map((i) => m.staticAccounts[i.programAddressIndex]);
    return { token: programs.indexOf(TOKEN_PROGRAM), jup: programs.indexOf(JUPITER_PROGRAM) };
  };

  it("puts it before the swap for a buy, where the USDC already is", () => {
    const { token, jup } = order(compose(true, "before").wire);
    expect(token).toBeGreaterThanOrEqual(0);
    expect(jup).toBeGreaterThan(token);
  });

  it("puts it after the swap for a sell, because the USDC does not exist yet", () => {
    const { token, jup } = order(compose(true, "after").wire);
    expect(jup).toBeGreaterThanOrEqual(0);
    expect(token).toBeGreaterThan(jup);
  });
});

describe("toInstruction", () => {
  it("packs Jupiter's two booleans into kit's role", () => {
    const ix = toInstruction({
      programId: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
      accounts: [
        { pubkey: BUYER, isSigner: false, isWritable: false },
        { pubkey: BUYER, isSigner: false, isWritable: true },
        { pubkey: BUYER, isSigner: true, isWritable: false },
        { pubkey: BUYER, isSigner: true, isWritable: true },
      ],
      data: "",
    });
    expect(ix.accounts?.map((a) => a.role)).toEqual([0, 1, 2, 3]);
  });
});
