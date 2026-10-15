import { describe, expect, it } from "vitest";
import { fundErrorCopy, isRejection } from "./fund-error";

describe("fundErrorCopy", () => {
  it("never returns an empty message, which is the bug it exists for", () => {
    /* An Error with a blank message rendered a red box with nothing in it:
       something broke, and the interface would not say what. */
    expect(fundErrorCopy(new Error("")).message.length).toBeGreaterThan(0);
    expect(fundErrorCopy(undefined).message.length).toBeGreaterThan(0);
    expect(fundErrorCopy(null).message.length).toBeGreaterThan(0);
    expect(fundErrorCopy({}).message.length).toBeGreaterThan(0);
  });

  it("prefers viem's shortMessage over its annotated report", () => {
    /* viem's `message` is the full report — request body, docs url, version
       footer — and `shortMessage` is the line of it written for a person. */
    const err = {
      shortMessage: "Gas price below the network minimum.",
      message: "Execution reverted.\n\nRequest Arguments:\n  from: 0x…\n\nDocs: https://viem.sh/…",
    };

    expect(fundErrorCopy(err).message).toBe("Gas price below the network minimum.");
  });

  it("falls back through message and details", () => {
    expect(fundErrorCopy({ message: "Nonce too low." }).message).toBe("Nonce too low.");
    expect(fundErrorCopy({ message: "   ", details: "Replacement fee too low." }).message).toBe(
      "Replacement fee too low.",
    );
  });

  it("clips a message too long for a sheet on a phone", () => {
    const long = fundErrorCopy({ shortMessage: "x".repeat(400) }).message;

    expect(long.length).toBe(90);
    expect(long.endsWith("…")).toBe(true);
  });

  it("treats whitespace as absent rather than as a message", () => {
    expect(fundErrorCopy({ shortMessage: "\n  \t " }).message).toBe(
      "Couldn't complete the deposit. Try again.",
    );
  });
});

describe("isRejection", () => {
  it("knows EIP-1193's code for a person saying no", () => {
    expect(isRejection({ code: 4001 })).toBe(true);
  });

  it("knows viem's named error", () => {
    expect(isRejection({ name: "UserRejectedRequestError", message: "" })).toBe(true);
  });

  it.each([
    "User rejected the request.",
    "user denied transaction signature",
    "User rejected the request",
    "Transaction was cancelled",
    "User canceled",
  ])("knows how a wallet words it: %s", (message) => {
    /* Rabby, MetaMask and Phantom all phrase this differently, and the code
       does not always survive being wrapped by a library or two. */
    expect(isRejection({ message })).toBe(true);
  });

  it("finds a rejection wrapped one layer down", () => {
    /* viem keeps the provider's original error on `cause`, which is often the
       only place the code is left. */
    expect(isRejection({ message: "Transaction failed", cause: { code: 4001 } })).toBe(true);
  });

  it("does not call an ordinary failure a rejection", () => {
    expect(isRejection({ shortMessage: "Insufficient funds for gas." })).toBe(false);
    expect(isRejection(new Error("Execution reverted"))).toBe(false);
  });

  it("survives a cause chain that loops", () => {
    /* Nothing should produce one, but an error that referenced itself would
       hang the interface rather than fail it, which is worse. */
    const looped: { message: string; cause?: unknown } = { message: "boom" };
    looped.cause = looped;

    expect(() => isRejection(looped)).not.toThrow();
  });

  it("says nothing was sent, because that is the thing somebody needs to know", () => {
    const { message, rejected } = fundErrorCopy({ code: 4001 });

    expect(rejected).toBe(true);
    expect(message).toContain("Nothing was sent");
  });
});

describe("fundErrorCopy · values that are not Errors", () => {
  it("reads a thrown string, which the Relay SDK does throw", () => {
    /* `throw `Unable to find chain: Chain id ${chainId}`` in
       executeSteps/index.js, among others. Treating it as unreadable turned
       the most specific error in the system into "please try again". */
    expect(fundErrorCopy("Unable to find chain: Chain id 8453").message).toBe(
      "Unable to find chain: Chain id 8453",
    );
  });

  it("reads a plain object thrown off the wire", () => {
    /* `throw json` — the API's error body, with no Error wrapper. */
    expect(fundErrorCopy({ message: "Quote expired" }).message).toBe("Quote expired");
  });

  it("still catches a rejection phrased as a bare string", () => {
    expect(isRejection("User rejected the request")).toBe(true);
  });

  it("does not read a number or a boolean as a message", () => {
    expect(fundErrorCopy(42).message).toBe("Couldn't complete the deposit. Try again.");
    expect(fundErrorCopy(false).message).toBe("Couldn't complete the deposit. Try again.");
  });
});

describe("fundErrorCopy · a revert", () => {
  it("says what a revert means rather than repeating the word", () => {
    /* `throw 'Transaction Reverted'` in the SDK's transaction.js, when a
       receipt comes back with status 'reverted'. True, and no use to
       somebody holding a phone. */
    const { message, rejected } = fundErrorCopy("Transaction Reverted");

    expect(rejected).toBe(false);
    expect(message).toMatch(/nothing was sent/i);
    expect(message).toContain("gas");
  });

  it("matches however the word arrives", () => {
    expect(fundErrorCopy(new Error("transaction reverted")).message).toMatch(/nothing was sent/i);
  });

  it("does not swallow a revert that came with a real reason", () => {
    /* A named revert reason is more specific than the generic sentence, so
       it wins — said plainly rather than in the contract's words. */
    expect(
      fundErrorCopy({ shortMessage: "execution reverted: ERC20: transfer amount exceeds balance" }).message,
    ).toMatch(/Not enough of this token/);
  });
});

describe("fundErrorCopy · a wallet that says only 'internal error'", () => {
  /* What viem builds from MetaMask's "Internal JSON-RPC error" when the
     wallet cannot pay for gas: the reason is on `details`, not the summary. */
  const internal = (details: string) => ({
    name: "InternalRpcError",
    shortMessage: "An internal error was received.",
    details,
    code: -32603,
  });

  it("names a wallet short of the gas coin", () => {
    const { message } = fundErrorCopy(internal("insufficient funds for gas * price + value"));
    expect(message).toMatch(/Not enough gas/);
  });

  it("finds the reason a cause or two down", () => {
    const { message } = fundErrorCopy({
      shortMessage: "An internal error was received.",
      cause: { cause: { message: "insufficient funds for gas * price + value" } },
    });
    expect(message).toMatch(/Not enough gas/);
  });

  it("names a wallet short of the token", () => {
    expect(
      fundErrorCopy(internal("execution reverted: ERC20: transfer amount exceeds balance")).message,
    ).toMatch(/Not enough of this token/);
  });

  it("names a wallet that changed networks", () => {
    expect(fundErrorCopy("Current chain id: 1 does not match expected chain id: 8453").message).toMatch(
      /switched networks/,
    );
  });

  it("says anything else plainly, not in viem's words", () => {
    const { message } = fundErrorCopy(internal("nonce too low"));
    expect(message).toBe("Your wallet couldn't send it. Try again.");
  });

  it("still says something when the wallet left no reason at all", () => {
    const { message } = fundErrorCopy({ shortMessage: "An internal error was received." });
    expect(message).toBe("Your wallet couldn't send it. Try again.");
  });
});

describe("fundErrorCopy · MetaMask's own shape", () => {
  /* As viem receives it from MetaMask when the wallet cannot pay for gas: the
     reason is on the provider error's `data`, not on any message. */
  const metamask = (reason: string) => ({
    name: "InternalRpcError",
    shortMessage: "An internal error was received.",
    details: "Internal JSON-RPC error.",
    cause: { code: -32603, message: "Internal JSON-RPC error.", data: { code: -32000, message: reason } },
  });

  it("reads the reason off the provider error's data", () => {
    expect(fundErrorCopy(metamask("insufficient funds for gas * price + value")).message).toBe(
      "Not enough gas for the network fee.",
    );
  });

  it("reads a reason nested under error, as some wallets send it", () => {
    expect(
      fundErrorCopy({
        shortMessage: "An internal error was received.",
        cause: { error: { message: "insufficient funds for transfer" } },
      }).message,
    ).toBe("Not enough gas for the network fee.");
  });
});

describe("fundErrorCopy · a confirmation that ran out of blocks", () => {
  it("does not put web3.js's sentence in front of a person", () => {
    /* What the panel showed over a deposit that had in fact finalized:
       "TransactionExpiredBlockheightExceededError: Signature 46pg9yr3… has
       expired: block height exceeded." Every word of that is for us. */
    const { message, rejected } = fundErrorCopy(
      new Error(
        "TransactionExpiredBlockheightExceededError: Signature 46pg9yr3BFbanL4dhk4gZ66BMx3XEpi6vjf has expired: block height exceeded.",
      ),
    );

    expect(rejected).toBe(false);
    expect(message).toBe("We couldn't confirm this in time. Check the transaction before sending again.");
  });

  it("does not claim nothing was sent, because something may well have been", () => {
    /* This sentence is only reached once the chain has been asked and could
       not confirm the signature — which is not the same as it not existing. */
    const { message } = fundErrorCopy(new Error("block height exceeded"));

    expect(message).not.toMatch(/nothing was sent/i);
  });

  it("still lets a revert win, which is a different and worse answer", () => {
    expect(fundErrorCopy(new Error("Transaction Reverted")).message).not.toMatch(/confirm this in time/);
  });
});
