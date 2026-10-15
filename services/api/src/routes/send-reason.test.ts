import { describe, expect, it, vi } from "vitest";
import {
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
  SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND,
  SolanaError,
} from "@solana/kit";
import { failureText, logsFrom, reasonFrom } from "./send.js";

/**
 * A preflight failure as `@solana/kit` reports one: the useful part is base64,
 * inside a sentence telling the operator to decode it by hand.
 */
const kitError = (context: Record<string, string>): string => {
  const encoded = Buffer.from(new URLSearchParams(context).toString()).toString("base64");
  return `Solana error #-32002; Decode this error by running \`npx @solana/errors decode -- -32002 '${encoded}'\``;
};

const withLogs = (...logs: string[]) =>
  kitError({ accounts: "null", fee: "22182", innerInstructions: "null", logs: logs.join(",") });

describe("logsFrom", () => {
  it("unpacks the logs out of the base64 the client hands us", () => {
    const raw = withLogs("Program 11111111 invoke [1]", "Program log: Error: Insufficient Funds");
    expect(logsFrom(raw)).toEqual(["Program 11111111 invoke [1]", "Program log: Error: Insufficient Funds"]);
  });

  it("is empty for an error carrying no context, which is not a failure to read one", () => {
    expect(logsFrom("Transaction simulation failed")).toEqual([]);
    expect(logsFrom(kitError({ accounts: "null", logs: "null" }))).toEqual([]);
  });

  it("is empty rather than throwing when the context will not decode", () => {
    expect(logsFrom("decode -- -32002 'not~valid~base64'")).toEqual([]);
  });
});

describe("reasonFrom", () => {
  it("names the missing network fee, wherever the chain said it", () => {
    const expected =
      "the wallet has no SOL to pay the network fee. Add a little SOL (0.01 is plenty) and try again.";
    expect(reasonFrom("AccountNotFound")).toBe(expected);
    expect(reasonFrom(withLogs("Transfer: insufficient lamports 0, need 5000"))).toBe(expected);
  });

  it("names an empty wallet, from a token program error nobody can read", () => {
    // 0x1 from the token program is InsufficientFunds. A buyer should never be
    // shown the hex.
    expect(reasonFrom(withLogs("Program Tokenkeg failed: custom program error: 0x1"))).toBe(
      "there was not enough in the wallet to cover this. Check your cash and try again.",
    );
  });

  it("says the price ran away rather than quoting a slippage code", () => {
    expect(reasonFrom(withLogs("Program log: SlippageToleranceExceeded"))).toMatch(/price moved further/);
  });

  it("passes on Anchor's own sentence, which is already written for a reader", () => {
    expect(reasonFrom(withLogs("Program log: AnchorError. Error Message: Pool is paused."))).toBe(
      "Pool is paused.",
    );
  });

  it("falls back to a program's logged error over anything generic", () => {
    expect(reasonFrom(withLogs("Program log: Error: Market is halted"))).toBe("Market is halted");
  });

  /*
   * The defect this exists to stop. A buyer was shown four hundred characters
   * of base64 where a sentence belonged, because the raw string used to be the
   * fallback.
   */
  it("never hands back the raw error, however little it can make of it", () => {
    /* The log goes through pino now rather than the console, so this watches
       stdout — which is where pino writes — rather than a console spy. The
       assertion is unchanged in substance: the sentence the buyer reads says
       nothing technical, and the raw error is still recorded for us. */
    const written: string[] = [];
    const quiet = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => (written.push(String(chunk)), true));
    const raw = withLogs("Program ComputeBudget111 invoke [1]", "Program ComputeBudget111 success");
    const said = reasonFrom(raw);
    quiet.mockRestore();

    expect(said).not.toContain("Solana error #");
    expect(said).not.toMatch(/[A-Za-z0-9+/]{40,}/);
    expect(said).toBe("the network rejected this order and did not say why. Nothing has been charged.");
    // Lost to the reader, kept for us.
    const line = written.find((l) => l.includes("no reason we could name"));
    expect(line).toBeDefined();
    /* The error's own one-line form, which is what this logged before pino
       too: `oneLineErrors` reduced the second console argument the same way.
       Under a key other than `err` it would have serialized to `{}`. */
    expect(JSON.parse(line!).err).toContain("Solana error");
  });
});

describe("failureText", () => {
  /** A preflight failure with no logs, the reason only in `cause`, as kit builds one. */
  const preflight = (cause?: SolanaError) =>
    new SolanaError(SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE, {
      accounts: null,
      fee: null,
      innerInstructions: null,
      loadedAccountsDataSize: 0,
      loadedAddresses: null,
      logs: [],
      postBalances: null,
      postTokenBalances: null,
      preBalances: null,
      preTokenBalances: null,
      replacementBlockhash: null,
      returnData: null,
      unitsConsumed: 0n,
      ...(cause === undefined ? {} : { cause }),
    } as never);

  it("reads the reason kit keeps in `cause`, so an expired blockhash is named", () => {
    const err = preflight(new SolanaError(SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND));
    expect(reasonFrom(failureText(err))).toBe("the order took too long to reach the network. Try again.");
  });

  it("is the message alone when there is no cause", () => {
    const err = preflight();
    expect(failureText(err)).toBe(err.message);
  });
});
