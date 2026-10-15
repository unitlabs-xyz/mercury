import { describe, expect, it } from "vitest";
import { signatureOf } from "./fund-swap";

/**
 * What the wallet answers when it has sent a Solana transaction.
 *
 * The deposit failed on the last step with "Invalid Solana signature: expected
 * base58." — Relay's adapter reads `.signature` off whatever our callback
 * returns, and this file had been handing it AppKit's bare string. A property
 * read on a string is `undefined`, so the adapter was right and the value it
 * complained about was one we had broken on the way in.
 */
const SIG = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";

describe("signatureOf", () => {
  it("takes AppKit's bare string, which is what it actually returns", () => {
    /* `signAndSendTransaction: (tx, options?) => Promise<TransactionSignature>`,
       and TransactionSignature is `string`. */
    expect(signatureOf(SIG)).toBe(SIG);
  });

  it("takes the wrapped shape too, which Phantom's own API answers", () => {
    expect(signatureOf({ signature: SIG })).toBe(SIG);
  });

  it("says so plainly when a wallet returns neither", () => {
    /* One sentence here beats a base58 complaint three frames down about a
       value that was never a signature. */
    for (const answered of [{}, { signature: undefined }, { signature: 42 }, ""] as const) {
      expect(() => signatureOf(answered as never)).toThrow(/did not return a transaction signature/);
    }
  });

  it("refuses an empty string rather than passing it on", () => {
    expect(() => signatureOf({ signature: "" })).toThrow(/did not return a transaction signature/);
  });
});
