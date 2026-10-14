import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { SOLANA_ERROR__JSON_RPC__SERVER_ERROR_BLOCK_NOT_AVAILABLE, SolanaError } from "@solana/kit";
import { errorLine, exitOnUncaught, oneLineErrors } from "./log.js";

describe("errorLine", () => {
  it("is the message alone for a plain Error", () => {
    expect(errorLine(new Error("could not create or find user for did:privy:abc"))).toBe(
      "could not create or find user for did:privy:abc",
    );
  });

  it("names any other kind of error", () => {
    expect(errorLine(new TypeError("x is not a function"))).toBe("TypeError: x is not a function");
  });

  it("says what the RPC node said, not how to decode it", () => {
    // In production the message is "Solana error #-32004; Decode this error by
    // running `npx @solana/errors decode ...`", which nobody reading a log can
    // act on. The node's own words are in the context.
    const error = new SolanaError(SOLANA_ERROR__JSON_RPC__SERVER_ERROR_BLOCK_NOT_AVAILABLE, {
      __serverMessage: "Block not available for slot 456685548",
    });
    expect(errorLine(error)).toBe("solana error -32004: Block not available for slot 456685548");
  });

  it("follows a cause", () => {
    const error = new Error("debt unreadable", { cause: new Error("rpc down") });
    expect(errorLine(error)).toBe("debt unreadable (cause: rpc down)");
  });

  it("keeps a message on one line", () => {
    expect(errorLine(new Error("first line\n  second line\n"))).toBe("first line second line");
  });

  it("lists what an AggregateError gathered", () => {
    const error = new AggregateError([new Error("a"), new RangeError("b")], "both failed");
    expect(errorLine(error)).toBe("AggregateError: both failed: a; RangeError: b");
  });

  it("prints something that was thrown without being an Error", () => {
    expect(errorLine("boom")).toBe("boom");
    expect(errorLine({ status: 500 })).toBe('{"status":500}');
  });

  it("never carries a stack frame", () => {
    const deep = new Error("outer", { cause: new TypeError("inner", { cause: new Error("root") }) });
    expect(errorLine(deep)).not.toMatch(/\n|\bat .*:\d+:\d+/);
  });
});

/** A console that records what it was handed. */
const recorder = () => {
  const lines: unknown[][] = [];
  const write =
    (level: string) =>
    (...args: unknown[]) =>
      lines.push([level, ...args]);
  return {
    lines,
    target: { error: write("error"), warn: write("warn"), log: write("log"), info: write("info") },
  };
};

describe("oneLineErrors", () => {
  it("turns every Error handed to the console into its one line", () => {
    const { lines, target } = recorder();
    oneLineErrors(target, {});

    target.error("position-sync: wallet for user u1 failed", new Error("node said no"));
    target.warn(new TypeError("bad"));
    target.log("plain", 42);

    expect(lines).toEqual([
      ["error", "position-sync: wallet for user u1 failed", "node said no"],
      ["warn", "TypeError: bad"],
      ["log", "plain", 42],
    ]);
  });

  it("leaves the console alone when LOG_STACKS=1, for a session that needs the frames", () => {
    const { lines, target } = recorder();
    oneLineErrors(target, { LOG_STACKS: "1" });
    const error = new Error("with its stack");
    target.error(error);
    expect(lines).toEqual([["error", error]]);
  });
});

describe("exitOnUncaught", () => {
  const fakeProcess = () => {
    const proc = Object.assign(new EventEmitter(), { exitCode: undefined as number | undefined });
    const exits: number[] = [];
    return { proc, exits, exit: (code: number) => exits.push(code) };
  };

  it("logs an uncaught error in one line and still exits", () => {
    // A migration that fails at boot reaches here. The process must still
    // end, so the platform keeps the old container; only the trace goes.
    const { lines, target } = recorder();
    const { proc, exits, exit } = fakeProcess();
    exitOnUncaught(proc, target, exit);

    proc.emit("uncaughtException", new Error("migrations failed"));
    proc.emit("unhandledRejection", new TypeError("nobody caught this"));

    expect(lines).toEqual([
      ["error", "fatal: migrations failed"],
      ["error", "fatal: TypeError: nobody caught this"],
    ]);
    expect(exits).toEqual([1, 1]);
  });

  it("leaves Node's own handling, trace and all, when LOG_STACKS=1", () => {
    const { target } = recorder();
    const { proc, exit } = fakeProcess();
    exitOnUncaught(proc, target, exit, { LOG_STACKS: "1" });
    expect(proc.listenerCount("uncaughtException")).toBe(0);
    expect(proc.listenerCount("unhandledRejection")).toBe(0);
  });
});
