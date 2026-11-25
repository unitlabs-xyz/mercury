import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createKeyPairFromBytes,
  getPublicKeyFromAddress,
  signBytes,
  verifySignature,
  type Address,
} from "@solana/kit";

/*
 * The linked wallet signer, run for real with only the wallet app stood in:
 * a "Phantom" with a real ed25519 key, signing the way a wallet's provider
 * does. AppKit is replaced by what the signer asks of it: which Solana wallet
 * is connected, its provider, and the connect dialog.
 */
const kit = vi.hoisted(() => ({
  connected: null as string | null,
  provider: undefined as unknown,
  opened: 0,
  accountListeners: [] as (() => void)[],
  stateListeners: [] as ((s: { open: boolean }) => void)[],
}));
vi.mock("./appkit", () => ({
  appKit: {
    getAddressByChainNamespace: () => kit.connected,
    getProvider: () => kit.provider,
    subscribeAccount: (cb: () => void) => {
      kit.accountListeners.push(cb);
      return () => undefined;
    },
    subscribeState: (cb: (s: { open: boolean }) => void) => {
      kit.stateListeners.push(cb);
      return () => undefined;
    },
    open: async () => {
      kit.opened += 1;
    },
  },
}));

const { signAllWithLinked, signMessageWithLinked, signWithLinked } = await import("./linkedSigner");

const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const relayer = Keypair.generate();
const phantom = Keypair.generate();

/** What the server hands the browser: the relayer pays, Phantom must sign, nobody has signed yet. */
const built = (): Uint8Array => {
  const message = new TransactionMessage({
    payerKey: relayer.publicKey,
    recentBlockhash: "EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k",
    instructions: [
      new TransactionInstruction({
        programId: MEMO,
        keys: [{ pubkey: phantom.publicKey, isSigner: true, isWritable: false }],
        data: Buffer.from([1]),
      }),
    ],
  }).compileToV0Message();
  return new VersionedTransaction(message).serialize();
};

/** A wallet that signs what it is given with its own key, and nothing else. */
const honest = (key: Keypair) => ({
  signTransaction: async (tx: VersionedTransaction) => {
    tx.sign([key]);
    return tx;
  },
});

const signatureOf = (bytes: Uint8Array, who: Keypair) => {
  const tx = VersionedTransaction.deserialize(bytes);
  const i = tx.message.staticAccountKeys.findIndex((k) => k.equals(who.publicKey));
  return { tx, signature: tx.signatures[i]! };
};

beforeEach(() => {
  kit.connected = null;
  kit.provider = honest(phantom);
  kit.opened = 0;
  kit.accountListeners.length = 0;
  kit.stateListeners.length = 0;
});

describe("signWithLinked, with a real key in place of Phantom", () => {
  it("signs with the linked wallet when it is the one connected: its signature, valid, and nobody else's", async () => {
    kit.connected = phantom.publicKey.toBase58();
    const signed = await signWithLinked(phantom.publicKey.toBase58(), "Phantom", built());

    const { tx, signature } = signatureOf(signed, phantom);
    const valid = await verifySignature(
      await getPublicKeyFromAddress(phantom.publicKey.toBase58() as Address),
      signature as never,
      tx.message.serialize(),
    );
    expect(valid).toBe(true);
    // The relayer's place is left empty: it co-signs on the server, never here.
    expect(signatureOf(signed, relayer).signature.every((b) => b === 0)).toBe(true);
    expect(kit.opened).toBe(0);
  });

  it("refuses when another wallet is connected, rather than handing it this wallet's transaction", async () => {
    const other = Keypair.generate();
    kit.connected = other.publicKey.toBase58();
    let asked = false;
    kit.provider = {
      signTransaction: async () => {
        asked = true;
        throw new Error("should not be asked");
      },
    };
    await expect(signWithLinked(phantom.publicKey.toBase58(), "Phantom", built())).rejects.toThrow(
      /The wallet connected is .*, not Phantom/,
    );
    expect(asked).toBe(false);
  });

  it("refuses a transaction the wallet changed while signing, which the relayer would refuse", async () => {
    kit.connected = phantom.publicKey.toBase58();
    // A wallet that adds its own instruction before signing, as some protections do.
    kit.provider = {
      signTransaction: async (tx: VersionedTransaction) => {
        const changed = new VersionedTransaction(
          new TransactionMessage({
            payerKey: relayer.publicKey,
            recentBlockhash: "EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k",
            instructions: [
              new TransactionInstruction({
                programId: MEMO,
                keys: [{ pubkey: phantom.publicKey, isSigner: true, isWritable: false }],
                data: Buffer.from([1, 2]),
              }),
            ],
          }).compileToV0Message(),
        );
        changed.sign([phantom]);
        void tx;
        return changed;
      },
    };
    await expect(signWithLinked(phantom.publicKey.toBase58(), "Phantom", built())).rejects.toThrow(
      "Phantom changed the transaction while signing",
    );
  });

  it("opens the wallet to connect when nothing is connected, then signs once the right one is", async () => {
    const signing = signWithLinked(phantom.publicKey.toBase58(), "Phantom", built());
    await Promise.resolve();
    expect(kit.opened).toBe(1);
    kit.connected = phantom.publicKey.toBase58();
    for (const l of kit.accountListeners) l();
    const signed = await signing;
    expect(signatureOf(signed, phantom).signature.some((b) => b !== 0)).toBe(true);
  });

  it("stops, having signed nothing, when the connect dialog is closed without connecting", async () => {
    const signing = signWithLinked(phantom.publicKey.toBase58(), "Phantom", built());
    await Promise.resolve();
    for (const l of kit.stateListeners) l({ open: true });
    for (const l of kit.stateListeners) l({ open: false });
    await expect(signing).rejects.toThrow("Phantom wasn't connected, so nothing was signed.");
  });

  it("refuses when the wallet connected in the dialog is not the linked one", async () => {
    const signing = signWithLinked(phantom.publicKey.toBase58(), "Phantom", built());
    await Promise.resolve();
    kit.connected = Keypair.generate().publicKey.toBase58();
    for (const l of kit.accountListeners) l();
    await expect(signing).rejects.toThrow(/not Phantom/);
  });
});

describe("signAllWithLinked: a move's small transactions, approved once", () => {
  /** A wallet that signs a batch with one approval, counting the approvals. */
  const batching = (key: Keypair) => {
    const asked = { all: 0, one: 0 };
    return {
      asked,
      provider: {
        signTransaction: async (tx: VersionedTransaction) => {
          asked.one += 1;
          tx.sign([key]);
          return tx;
        },
        signAllTransactions: async (txs: VersionedTransaction[]) => {
          asked.all += 1;
          for (const tx of txs) tx.sign([key]);
          return txs;
        },
      },
    };
  };

  it("asks the wallet once for all of them, and every one comes back validly signed by it", async () => {
    kit.connected = phantom.publicKey.toBase58();
    const w = batching(phantom);
    kit.provider = w.provider;
    const signed = await signAllWithLinked(phantom.publicKey.toBase58(), "Phantom", [
      built(),
      built(),
      built(),
    ]);

    expect(w.asked).toEqual({ all: 1, one: 0 });
    expect(signed).toHaveLength(3);
    for (const bytes of signed) {
      const { tx, signature } = signatureOf(bytes, phantom);
      const valid = await verifySignature(
        await getPublicKeyFromAddress(phantom.publicKey.toBase58() as Address),
        signature as never,
        tx.message.serialize(),
      );
      expect(valid).toBe(true);
    }
  });

  it("asks for each in turn when the wallet can't sign several at once", async () => {
    kit.connected = phantom.publicKey.toBase58();
    let one = 0;
    kit.provider = {
      signTransaction: async (tx: VersionedTransaction) => {
        one += 1;
        tx.sign([phantom]);
        return tx;
      },
    };
    const signed = await signAllWithLinked(phantom.publicKey.toBase58(), "Phantom", [built(), built()]);
    expect(one).toBe(2);
    expect(signed.every((b) => signatureOf(b, phantom).signature.some((x) => x !== 0))).toBe(true);
  });

  it("returns none of them if the wallet rewrote any, so half a move is never sent", async () => {
    kit.connected = phantom.publicKey.toBase58();
    kit.provider = {
      signTransaction: async () => {
        throw new Error("not asked");
      },
      signAllTransactions: async (txs: VersionedTransaction[]) => {
        const [first, second] = txs;
        first!.sign([phantom]);
        const changed = new VersionedTransaction(
          new TransactionMessage({
            payerKey: relayer.publicKey,
            recentBlockhash: "EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k",
            instructions: [
              new TransactionInstruction({
                programId: MEMO,
                keys: [{ pubkey: phantom.publicKey, isSigner: true, isWritable: false }],
                data: Buffer.from([9]),
              }),
            ],
          }).compileToV0Message(),
        );
        changed.sign([phantom]);
        void second;
        return [first!, changed];
      },
    };
    await expect(
      signAllWithLinked(phantom.publicKey.toBase58(), "Phantom", [built(), built()]),
    ).rejects.toThrow("Phantom changed the transaction while signing");
  });

  it("refuses a batch the wallet signed only part of", async () => {
    kit.connected = phantom.publicKey.toBase58();
    kit.provider = {
      signTransaction: async () => {
        throw new Error("not asked");
      },
      signAllTransactions: async (txs: VersionedTransaction[]) => {
        txs[0]!.sign([phantom]);
        return [txs[0]!];
      },
    };
    await expect(
      signAllWithLinked(phantom.publicKey.toBase58(), "Phantom", [built(), built()]),
    ).rejects.toThrow("Phantom didn't sign every step, so nothing was sent.");
  });

  it("refuses, having asked nothing, when another wallet is connected", async () => {
    kit.connected = Keypair.generate().publicKey.toBase58();
    const w = batching(phantom);
    kit.provider = w.provider;
    await expect(signAllWithLinked(phantom.publicKey.toBase58(), "Phantom", [built()])).rejects.toThrow(
      /not Phantom/,
    );
    expect(w.asked).toEqual({ all: 0, one: 0 });
  });
});

describe("signMessageWithLinked: a basket owner's approval", () => {
  const MESSAGE = new TextEncoder().encode("Withdraw 2 TSLAx to your Mercury wallet");
  const signing = (shape: "bytes" | "object") => ({
    signTransaction: async () => {
      throw new Error("not asked");
    },
    signMessage: async (message: Uint8Array) => {
      const keys = await createKeyPairFromBytes(phantom.secretKey);
      const signature = new Uint8Array(await signBytes(keys.privateKey, message));
      return shape === "bytes" ? signature : { signature };
    },
  });

  it("returns Phantom's own signature over the message, whichever shape the wallet answers in", async () => {
    kit.connected = phantom.publicKey.toBase58();
    for (const shape of ["bytes", "object"] as const) {
      kit.provider = signing(shape);
      const signature = await signMessageWithLinked(phantom.publicKey.toBase58(), "Phantom", MESSAGE);
      expect(
        await verifySignature(
          await getPublicKeyFromAddress(phantom.publicKey.toBase58() as Address),
          signature as never,
          MESSAGE,
        ),
        shape,
      ).toBe(true);
    }
  });

  it("says plainly when the wallet can't sign messages, or answers with something that isn't a signature", async () => {
    kit.connected = phantom.publicKey.toBase58();
    kit.provider = { signTransaction: async () => undefined };
    await expect(signMessageWithLinked(phantom.publicKey.toBase58(), "Phantom", MESSAGE)).rejects.toThrow(
      "Phantom can't sign messages here",
    );
    kit.provider = { signTransaction: async () => undefined, signMessage: async () => new Uint8Array(12) };
    await expect(signMessageWithLinked(phantom.publicKey.toBase58(), "Phantom", MESSAGE)).rejects.toThrow(
      "Phantom didn't return a signature",
    );
  });

  it("refuses, having asked nothing, when another wallet is connected", async () => {
    kit.connected = Keypair.generate().publicKey.toBase58();
    let asked = false;
    kit.provider = {
      signTransaction: async () => undefined,
      signMessage: async () => ((asked = true), new Uint8Array(64)),
    };
    await expect(signMessageWithLinked(phantom.publicKey.toBase58(), "Phantom", MESSAGE)).rejects.toThrow(
      /not Phantom/,
    );
    expect(asked).toBe(false);
  });
});
