import { describe, expect, it } from "vitest";
import { getBase58Decoder } from "@solana/kit";
import { keypairRelaySigner, parseSecretKey } from "./signer.js";

describe("parseSecretKey", () => {
  const sixtyFour = Uint8Array.from({ length: 64 }, (_, i) => i);

  it("reads the JSON array solana-keygen writes", () => {
    expect(parseSecretKey(JSON.stringify([...sixtyFour]))).toEqual(sixtyFour);
  });

  it("reads the base58 a wallet exports", () => {
    expect(parseSecretKey(getBase58Decoder().decode(sixtyFour))).toEqual(sixtyFour);
  });

  it("ignores surrounding whitespace, which an env var collects", () => {
    expect(parseSecretKey(`  ${JSON.stringify([...sixtyFour])}\n`)).toEqual(sixtyFour);
  });

  /*
   * These are the deploy-time failures. Each one says what is wrong, because
   * the alternative is a container that crash-loops on a stack trace.
   */
  it("says what is wrong rather than throwing something opaque", () => {
    expect(() => parseSecretKey("")).toThrow(/empty/);
    expect(() => parseSecretKey("[1,2,")).toThrow(/does not parse/);
    expect(() => parseSecretKey('["a","b"]')).toThrow(/array of numbers/);
    expect(() => parseSecretKey(JSON.stringify([1, 2, 3]))).toThrow(/3 bytes; expected 64 or 32/);
  });
});

describe("keypairRelaySigner", () => {
  /* Seeds we own, because a generated signer's key is deliberately not extractable. */
  const seed = (fill: number) => Uint8Array.from({ length: 32 }, () => fill);

  it("reports the address the key belongs to", async () => {
    const { createKeyPairSignerFromPrivateKeyBytes } = await import("@solana/kit");
    const bytes = seed(7);
    const expected = await createKeyPairSignerFromPrivateKeyBytes(bytes);
    const signer = await keypairRelaySigner(getBase58Decoder().decode(bytes));
    expect(signer.address).toBe(expected.address);
  });

  it("reaches the same address from base58 and from a JSON array", async () => {
    const bytes = seed(11);
    const a = await keypairRelaySigner(getBase58Decoder().decode(bytes));
    const b = await keypairRelaySigner(JSON.stringify([...bytes]));
    expect(a.address).toBe(b.address);
  });

  /*
   * The property the whole scheme rests on. The buyer signs first and the
   * relayer signs second; a full sign in `cosign` would discard the buyer's
   * signature and produce a transaction the network rejects for a missing one.
   */
  it("adds its signature to the buyer's rather than replacing it", async () => {
    const {
      AccountRole,
      appendTransactionMessageInstruction,
      compileTransaction,
      createKeyPairSignerFromPrivateKeyBytes,
      createTransactionMessage,
      getBase64Decoder,
      getTransactionEncoder,
      partiallySignTransaction,
      pipe,
      setTransactionMessageFeePayerSigner,
      setTransactionMessageLifetimeUsingBlockhash,
    } = await import("@solana/kit");

    const relayerBytes = seed(3);
    const relayer = await createKeyPairSignerFromPrivateKeyBytes(relayerBytes);
    const buyer = await createKeyPairSignerFromPrivateKeyBytes(seed(5));

    // Fee payer plus one more required signer, so the message genuinely needs two.
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(relayer, m),
      (m) =>
        setTransactionMessageLifetimeUsingBlockhash(
          { blockhash: "11111111111111111111111111111111" as never, lastValidBlockHeight: 1n },
          m,
        ),
      (m) =>
        appendTransactionMessageInstruction(
          {
            programAddress: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" as never,
            accounts: [{ address: buyer.address, role: AccountRole.READONLY_SIGNER }],
            data: new Uint8Array([1]),
          },
          m,
        ),
    );

    const compiled = compileTransaction(message);
    const byBuyer = await partiallySignTransaction([buyer.keyPair], compiled);
    expect(byBuyer.signatures[buyer.address]).not.toBeNull();
    expect(byBuyer.signatures[relayer.address]).toBeNull();

    const signer = await keypairRelaySigner(getBase58Decoder().decode(relayerBytes));
    const out = await signer.cosign(getBase64Decoder().decode(getTransactionEncoder().encode(byBuyer)));

    const { getBase64Encoder, getTransactionDecoder } = await import("@solana/kit");
    const back = getTransactionDecoder().decode(getBase64Encoder().encode(out));
    expect(back.signatures[relayer.address]).not.toBeNull();
    // The buyer's signature survived, unchanged.
    expect(back.signatures[buyer.address]).toEqual(byBuyer.signatures[buyer.address]);
  });
});
