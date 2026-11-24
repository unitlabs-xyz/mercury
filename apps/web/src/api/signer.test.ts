import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { getPublicKeyFromAddress, verifySignature, type Address } from "@solana/kit";

/*
 * Who signs, end to end in the browser code: `useTransactionSigner` as every
 * flow uses it, the real linked signer behind its dynamic import, and the
 * pop-ups stood in for. AppKit's connect dialog and Phantom's signing pop-up
 * are a fake AppKit holding a real ed25519 key; Privy's signing is a fake that
 * records it was asked. What is tested is which pop-up appears, and when.
 */
const phantom = Keypair.generate();
const relayer = Keypair.generate();

const state = vi.hoisted(() => ({
  acting: { kind: "mercury" } as { kind: "mercury" } | { kind: "linked"; wallet: unknown },
  privyAsked: 0,
  // AppKit, as the signer sees it.
  connected: null as string | null,
  dialogOpened: 0,
  phantomAsked: 0,
  accountListeners: [] as (() => void)[],
  signWith: null as null | ((tx: unknown) => unknown),
}));

vi.mock("./acting-wallet", () => ({ useActingWallet: () => ({ acting: state.acting }) }));
vi.mock("../auth/embedded", () => ({ useEmbeddedWallet: () => ({ wallet: { address: "MercuryWallet" } }) }));
vi.mock("@privy-io/react-auth/solana", () => ({
  useSignTransaction: () => ({
    signTransaction: async ({ transaction }: { transaction: Uint8Array }) => {
      state.privyAsked += 1;
      return { signedTransaction: transaction };
    },
  }),
}));
vi.mock("../wallet/appkit", () => ({
  appKit: {
    getAddressByChainNamespace: () => state.connected,
    // Phantom's signing pop-up: counted, then signed with the real key.
    getProvider: () => ({
      signTransaction: async (tx: unknown) => {
        state.phantomAsked += 1;
        return state.signWith!(tx);
      },
    }),
    subscribeAccount: (cb: () => void) => {
      state.accountListeners.push(cb);
      return () => undefined;
    },
    subscribeState: () => () => undefined,
    // AppKit's connect dialog.
    open: async () => {
      state.dialogOpened += 1;
    },
  },
}));

const { useTransactionSigner } = await import("./signer");

/** The hook as a flow holds it, read through a render the way a sheet reads it. */
const signer = () => {
  let held: ReturnType<typeof useTransactionSigner> | undefined;
  renderToStaticMarkup(
    createElement(() => {
      held = useTransactionSigner();
      return null;
    }),
  );
  return held!;
};

const built = (): Uint8Array =>
  new VersionedTransaction(
    new TransactionMessage({
      payerKey: relayer.publicKey,
      recentBlockhash: "EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k",
      instructions: [
        new TransactionInstruction({
          programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
          keys: [{ pubkey: phantom.publicKey, isSigner: true, isWritable: false }],
          data: Buffer.from([1]),
        }),
      ],
    }).compileToV0Message(),
  ).serialize();

const PHANTOM = {
  id: "w-phantom",
  address: phantom.publicKey.toBase58(),
  kind: "external",
  isPrimary: false,
  label: "Phantom",
  linkedAt: null,
};

beforeEach(() => {
  state.acting = { kind: "mercury" };
  state.privyAsked = 0;
  state.connected = null;
  state.dialogOpened = 0;
  state.phantomAsked = 0;
  state.accountListeners.length = 0;
  state.signWith = (tx) => {
    (tx as VersionedTransaction).sign([phantom]);
    return tx;
  };
});

describe("useTransactionSigner: which pop-up appears", () => {
  it("signs with Privy for the Mercury wallet, and never opens Phantom or its connect dialog", async () => {
    const s = signer();
    expect(s.approver).toBeNull();
    await s.sign(built());
    expect(state.privyAsked).toBe(1);
    expect(state.dialogOpened).toBe(0);
    expect(state.phantomAsked).toBe(0);
  });

  it("asks Phantom, in its own pop-up, once Phantom is the wallet chosen and connected", async () => {
    state.acting = { kind: "linked", wallet: PHANTOM };
    state.connected = PHANTOM.address;
    const s = signer();
    expect(s.approver).toBe("Phantom");

    const signed = VersionedTransaction.deserialize(await s.sign(built()));

    expect(state.phantomAsked).toBe(1);
    expect(state.privyAsked).toBe(0);
    expect(state.dialogOpened).toBe(0);
    const i = signed.message.staticAccountKeys.findIndex((k) => k.equals(phantom.publicKey));
    expect(
      await verifySignature(
        await getPublicKeyFromAddress(PHANTOM.address as Address),
        signed.signatures[i]! as never,
        signed.message.serialize(),
      ),
    ).toBe(true);
  });

  it("opens the connect dialog first when Phantom is chosen but not connected, then signs in Phantom", async () => {
    state.acting = { kind: "linked", wallet: PHANTOM };
    const signing = signer().sign(built());
    // Let the dynamic import of the linked signer settle and the dialog open.
    await vi.waitFor(() => expect(state.dialogOpened).toBe(1));
    expect(state.phantomAsked).toBe(0);

    state.connected = PHANTOM.address;
    for (const l of state.accountListeners) l();
    await signing;
    expect(state.phantomAsked).toBe(1);
    expect(state.privyAsked).toBe(0);
  });
});
