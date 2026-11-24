import { VersionedTransaction } from "@solana/web3.js";
import { appKit } from "./appkit";
import { LinkedSignError, unchangedMessage, wrongWalletCopy } from "../api/signer-rules";

/*
 * AppKit, so this is only ever reached by a dynamic `import()` from
 * `api/signer.ts`, at the moment a linked wallet is asked to sign: nothing in
 * the eager bundle may import AppKit. See `app/money/FundFromChainWithWallet.tsx`.
 */

/** What AppKit's Solana provider is asked for here: one transaction signed, never sent. */
interface SolanaSigner {
  signTransaction<T extends VersionedTransaction>(transaction: T): Promise<T>;
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
 * One transaction signed by a linked wallet, in its own pop-up.
 *
 * Signed only, never sent: Mercury's relayer pays the network fee, co-signs
 * and submits it, and it co-signs only bytes this server built. A wallet that
 * adds or rewrites instructions while signing would be refused there; this
 * says so here first, plainly, rather than as a refusal from the server.
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
  if (!unchangedMessage(before, signed.message.serialize())) {
    throw new LinkedSignError(
      `${name} changed the transaction while signing, so Mercury can't send it. If it has a setting that adds protections to transactions, turn it off for this one and try again.`,
    );
  }
  return signed.serialize();
};
