import { expect, it } from "vitest";
import {
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type Address,
  type Blockhash,
} from "@solana/kit";
import { USDC_MINT } from "@mercury/chain";
import { associatedTokenAddress, TOKEN_PROGRAM, ASSOCIATED_TOKEN_PROGRAM } from "../../../relay/usdc.js";
import { buildFundingTransaction } from "../funding.js";

it("builds an owner-paid USDC transfer to the enrolled account's ATA", async () => {
  const owner = "8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6" as Address;
  const destination = "AkZjMBy3SAfbend3qq22aMh9nsAehS7a8HXk15VxGJmJ" as Address;
  const wire = await buildFundingTransaction({
    owner,
    destination,
    amountRaw: 12_345_678n,
    blockhash: "11111111111111111111111111111111" as Blockhash,
    lastValidBlockHeight: 1n,
  });
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(wire));
  const message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  const programs = message.instructions.map((ix) => message.staticAccounts[ix.programAddressIndex]);
  const destinationAta = await associatedTokenAddress(destination, USDC_MINT as Address);

  expect(message.staticAccounts[0]).toBe(owner);
  expect(message.header.numSignerAccounts).toBe(1);
  expect(programs).toEqual([ASSOCIATED_TOKEN_PROGRAM, TOKEN_PROGRAM]);
  expect(message.staticAccounts).toContain(destinationAta);
  expect(message.instructions[0]?.data).toEqual(new Uint8Array([1]));
  expect(message.instructions[1]?.data).toEqual(new Uint8Array([3, 78, 97, 188, 0, 0, 0, 0, 0]));
});
