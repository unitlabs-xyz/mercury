import { describe, expect, it, vi } from "vitest";
import { logsFrom, reasonFrom } from "./send.js";

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
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const raw = withLogs("Program ComputeBudget111 invoke [1]", "Program ComputeBudget111 success");
    const said = reasonFrom(raw);
    expect(said).not.toContain("Solana error #");
    expect(said).not.toMatch(/[A-Za-z0-9+/]{40,}/);
    expect(said).toBe("the network rejected this order and did not say why. Nothing has been charged.");
    // Lost to the reader, kept for us.
    expect(quiet).toHaveBeenCalledWith(expect.stringContaining("no reason we could name"), raw);
    quiet.mockRestore();
  });
});
