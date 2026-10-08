import { describe, expect, it } from "vitest";
import { rebalanceOutcome, rebalanceTerminal } from "./rebalance-status";

describe("rebalanceOutcome", () => {
  it("does not call a swap reconciliation timeout a confirmed failure", () => {
    expect(
      rebalanceOutcome("failed", "Solana swap reconciliation timed out after 120717ms (max 120000ms)"),
    ).toEqual({
      label: "Outcome unconfirmed",
      detail: "Glider could not confirm the swap in time. Check your current holdings before trying again.",
    });
  });

  it("keeps other failed operations marked failed", () => {
    expect(rebalanceOutcome("failed", "Insufficient balance")).toEqual({
      label: "Failed",
      detail: "Insufficient balance",
    });
  });

  it("keeps a completed operation completed", () => {
    expect(rebalanceOutcome("completed", null)).toEqual({ label: "Completed", detail: null });
  });
});

describe("rebalanceTerminal", () => {
  it("refreshes holdings after either a completed or failed operation", () => {
    expect(rebalanceTerminal("completed")).toBe(true);
    expect(rebalanceTerminal("failed")).toBe(true);
    expect(rebalanceTerminal("running")).toBe(false);
  });
});
