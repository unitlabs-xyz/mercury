import { describe, expect, it } from "vitest";
import { getBase58Decoder } from "@solana/kit";
import { testWallet } from "./testing.js";
import { verifyWalletSignature } from "./verify.js";

const MESSAGE = "beta.trymercury.xyz wants you to link this wallet to your Mercury account:";

describe("verifyWalletSignature", () => {
  it("accepts the wallet's own signature over the message", async () => {
    const phantom = await testWallet();
    expect(await verifyWalletSignature(phantom.address, MESSAGE, await phantom.sign(MESSAGE))).toBe(true);
  });

  it("refuses a signature over a different message", async () => {
    const phantom = await testWallet();
    expect(await verifyWalletSignature(phantom.address, MESSAGE, await phantom.sign(`${MESSAGE} `))).toBe(
      false,
    );
  });

  it("refuses another wallet's signature, which is the whole point", async () => {
    const phantom = await testWallet();
    const someoneElse = await testWallet();
    expect(await verifyWalletSignature(phantom.address, MESSAGE, await someoneElse.sign(MESSAGE))).toBe(
      false,
    );
  });

  it("refuses what is not base58 at all", async () => {
    const phantom = await testWallet();
    expect(await verifyWalletSignature(phantom.address, MESSAGE, "0OIl+/")).toBe(false);
  });

  it("refuses a signature of the wrong length", async () => {
    const phantom = await testWallet();
    const short = getBase58Decoder().decode(new Uint8Array(63).fill(1));
    expect(await verifyWalletSignature(phantom.address, MESSAGE, short)).toBe(false);
    expect(await verifyWalletSignature(phantom.address, MESSAGE, "")).toBe(false);
  });

  it("refuses an address that is not one", async () => {
    const phantom = await testWallet();
    expect(await verifyWalletSignature("not-an-address", MESSAGE, await phantom.sign(MESSAGE))).toBe(false);
  });
});
