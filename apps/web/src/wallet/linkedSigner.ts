import { VersionedTransaction } from "@solana/web3.js";
import { appKit } from "./appkit";
import { LinkedSignError, unchangedMessage, wrongWalletCopy } from "../api/signer-rules";

/*
 * AppKit, so this is only ever reached by a dynamic `import()` from
 * `api/signer.ts`, at the moment a linked wallet is asked to sign: nothing in
 * the eager bundle may import AppKit. See `app/money/FundFromChainWithWallet.tsx`.
 */

/** What AppKit's Solana provider is asked for here: transactions signed, never sent. */
interface SolanaSigner {
  signTransaction<T extends VersionedTransaction>(transaction: T): Promise<T>;
  /** Several at once, approved once. Not every wallet has it. */
  signAllTransactions?<T extends VersionedTransaction>(transactions: T[]): Promise<T[]>;
  /** Raw bytes signed with the wallet's key: what Glider takes as a basket owner's approval. */
  signMessage?(message: Uint8Array): Promise<Uint8Array | { signature: Uint8Array }>;
}

/** How long the connect dialog may stay open before the action gives up. */
const CONNECT_WAIT_MS = 5 * 60_000;

const connectedNow = (): string | null => appKit?.getAddressByChainNamespace("solana") ?? null;

/**
 * The linked wallet connected in this browser, or connected now.
 *
 * Linked is not the same as connected: a linked wallet is followed from its
 * address alone, and needs to be connected only when it is asked to sign. If
 * it is not, AppKit opens to connect it. If another wallet is connected, the
 * action stops and says so: a transaction for one wallet is never handed to
 * another to sign.
 */
const ensureConnected = async (address: string, name: string): Promise<void> => {
  const kit = appKit;
  if (kit === null) throw new LinkedSignError("Signing with another wallet isn't set up on this site yet.");
  const now = connectedNow();
  if (now === address) return;
  if (now !== null) throw new LinkedSignError(wrongWalletCopy(name, address, now));

  await new Promise<void>((resolve, reject) => {
    let opened = false;
    const done = (fn: () => void) => {
      clearTimeout(timer);
      stopAccount();
      stopState();
      fn();
    };
    const timer = setTimeout(
      () => done(() => reject(new LinkedSignError(`${name} wasn't connected, so nothing was signed.`))),
      CONNECT_WAIT_MS,
    );
    const stopAccount = kit.subscribeAccount(() => {
      const connected = connectedNow();
      if (connected === null) return;
      done(() =>
        connected === address
          ? resolve()
          : reject(new LinkedSignError(wrongWalletCopy(name, address, connected))),
      );
    }, "solana");
    // Closing the dialog without connecting is a no, not a wait.
    const stopState = kit.subscribeState((state) => {
      if (state.open) opened = true;
      else if (opened && connectedNow() === null) {
        done(() => reject(new LinkedSignError(`${name} wasn't connected, so nothing was signed.`)));
      }
    });
    void kit.open({ view: "Connect", namespace: "solana" });
  });
};

/**
 * Connect the linked wallet now, as somebody chooses it: the wallet's own
 * dialog, once, and AppKit keeps the connection for later. Choosing is what
 * asks; nothing connects a linked wallet before somebody picks it.
 */
export const connectLinked = (address: string, name: string): Promise<void> => ensureConnected(address, name);

/**
 * One transaction signed by a linked wallet, in its own pop-up.
 *
 * Signed only, never sent: Mercury submits it. A linked wallet is the fee
 * payer of its own transactions and pays its own rent, in SOL (Mercury
 * sponsors only the Mercury wallet), so its signature is the only one. A
 * wallet that adds or rewrites instructions while signing changes what this
 * server built; this says so here first, plainly.
 */
export const signWithLinked = async (
  address: string,
  name: string,
  bytes: Uint8Array,
): Promise<Uint8Array> => {
  await ensureConnected(address, name);
  const provider = appKit?.getProvider<SolanaSigner>("solana");
  if (provider === undefined) throw new LinkedSignError(`${name} isn't ready to sign. Try again.`);

  const transaction = VersionedTransaction.deserialize(bytes);
  const before = transaction.message.serialize();
  const signed = await provider.signTransaction(transaction);
  return unchangedOrRefused(name, before, signed);
};

/** The signed transaction's bytes, or a plain refusal if the wallet rewrote it, which the relayer would refuse. */
const unchangedOrRefused = (name: string, before: Uint8Array, signed: VersionedTransaction): Uint8Array => {
  if (!unchangedMessage(before, signed.message.serialize())) {
    throw new LinkedSignError(
      `${name} changed the transaction while signing, so Mercury can't send it. If it has a setting that adds protections to transactions, turn it off for this one and try again.`,
    );
  }
  return signed.serialize();
};

/**
 * Several transactions signed by a linked wallet, approved once where the
 * wallet can: a move split into small transactions still asks only once.
 * A wallet without `signAllTransactions` is asked for each in turn.
 *
 * Every one is checked as a single one is, and if the wallet rewrote any,
 * none is returned: half a move sent is worse than none.
 */
export const signAllWithLinked = async (
  address: string,
  name: string,
  all: readonly Uint8Array[],
): Promise<Uint8Array[]> => {
  await ensureConnected(address, name);
  const provider = appKit?.getProvider<SolanaSigner>("solana");
  if (provider === undefined) throw new LinkedSignError(`${name} isn't ready to sign. Try again.`);

  const transactions = all.map((b) => VersionedTransaction.deserialize(b));
  const before = transactions.map((t) => t.message.serialize());
  const signed =
    provider.signAllTransactions === undefined
      ? await transactions.reduce<Promise<VersionedTransaction[]>>(
          async (done, t) => [...(await done), await provider.signTransaction(t)],
          Promise.resolve([]),
        )
      : await provider.signAllTransactions(transactions);
  if (signed.length !== transactions.length) {
    throw new LinkedSignError(`${name} didn't sign every step, so nothing was sent.`);
  }
  return signed.map((t, i) => unchangedOrRefused(name, before[i]!, t));
};

/**
 * A message signed by a linked wallet, in its own pop-up: a basket owner's
 * approval, which Glider checks against the wallet's key. The signature only,
 * 64 bytes: some wallets answer with the bytes, some with `{ signature }`.
 */
export const signMessageWithLinked = async (
  address: string,
  name: string,
  message: Uint8Array,
): Promise<Uint8Array> => {
  await ensureConnected(address, name);
  const provider = appKit?.getProvider<SolanaSigner>("solana");
  if (provider?.signMessage === undefined) {
    throw new LinkedSignError(`${name} can't sign messages here. Try again, or reconnect it.`);
  }
  const answer = await provider.signMessage(message);
  const signature = answer instanceof Uint8Array ? answer : answer.signature;
  if (signature.length !== 64) throw new LinkedSignError(`${name} didn't return a signature. Try again.`);
  return signature;
};
