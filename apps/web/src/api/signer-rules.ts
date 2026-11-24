import { shortAddress } from "./wallets";

/**
 * The rules a linked wallet's signature is held to, apart from AppKit, so
 * they can be tested without a wallet and loaded without the wallet code.
 */

/** A linked wallet could not sign, said in words the person can act on. */
export class LinkedSignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinkedSignError";
  }
}

/**
 * The wallet connected in the browser is not the one this action is for, and
 * a transaction for one wallet is never handed to another to sign.
 */
export const wrongWalletCopy = (name: string, wanted: string, connected: string): string =>
  `The wallet connected is ${shortAddress(connected)}, not ${name} (${shortAddress(wanted)}). Switch your wallet app to ${shortAddress(wanted)} and try again.`;

/** Whether the wallet signed exactly the message it was given: same bytes, nothing added or rewritten. */
export const unchangedMessage = (before: Uint8Array, after: Uint8Array): boolean =>
  before.length === after.length && before.every((b, i) => b === after[i]);

/** The confirm button for an action taken by a linked wallet: "Continue in Phantom". */
export const continueIn = (name: string): string => `Continue in ${name}`;

/** The line above it: where the person will approve. */
export const approveIn = (name: string): string => `You'll approve this in ${name}.`;
