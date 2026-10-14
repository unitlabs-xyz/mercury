import { describe, expect, it, vi } from "vitest";
import { pollUnsettledDeposits } from "./poll.js";
import type { RelayClient, RelayStatus } from "./relay.js";
import type { FundingStore } from "./store.js";

const NOW = 1_792_000_000_000;

const intent = (relayRequestId: string, userId = "user-1") =>
  ({ relayRequestId, userId, status: "submitted" }) as never;

type Mock = ReturnType<typeof vi.fn>;

/**
 * A poller with its two upstreams faked.
 *
 * `relay` is cast rather than fully built: a test double for a three-method
 * port only needs the one method under test to be real, and widening the
 * ternary that chooses it is what made this file fail to typecheck while its
 * tests passed.
 */
const deps = (open: readonly ReturnType<typeof intent>[], status: RelayStatus | null | Mock) => {
  const unsettled = vi.fn().mockResolvedValue(open);
  const settle = vi.fn().mockResolvedValue({});
  const relayStatus: Mock = typeof status === "function" ? status : vi.fn().mockResolvedValue(status);
  return {
    store: { unsettled, settle } as unknown as FundingStore,
    relay: { chains: vi.fn(), fundQuote: vi.fn(), status: relayStatus } as unknown as RelayClient,
    now: () => NOW,
    unsettled,
    settle,
    relayStatus,
  };
};

describe("pollUnsettledDeposits", () => {
  it("asks only about deposits nothing has touched for a while", async () => {
    const d = deps([], null);

    await pollUnsettledDeposits({ ...d, staleMs: 90_000, limit: 25 });

    /* Never racing the webhook over a deposit that is merely in flight. */
    expect(d.unsettled).toHaveBeenCalledWith(new Date(NOW - 90_000), 25);
  });

  it("settles a deposit Relay calls successful", async () => {
    const d = deps([intent("0xa")], "success");

    const summary = await pollUnsettledDeposits(d);

    expect(d.settle).toHaveBeenCalledWith("0xa", { status: "success" });
    expect(summary).toEqual({ asked: 1, settled: 1, failed: 0 });
  });

  it.each(["failure", "refund"] as const)("settles a %s too", async (status) => {
    const d = deps([intent("0xa")], status);

    await pollUnsettledDeposits(d);

    expect(d.settle).toHaveBeenCalledWith("0xa", { status });
  });

  it.each(["waiting", "depositing", "pending", "submitted"] as const)(
    "writes nothing when Relay still says %s",
    async (status) => {
      const d = deps([intent("0xa")], status);

      const summary = await pollUnsettledDeposits(d);

      /*
       * Writing a non-terminal status would move updatedAt and push the row
       * out of the next pass's window — the one way this could quietly stop
       * working.
       */
      expect(d.settle).not.toHaveBeenCalled();
      expect(summary.settled).toBe(0);
    },
  );

  it("writes nothing when Relay has no answer", async () => {
    const d = deps([intent("0xa")], null);

    await pollUnsettledDeposits(d);

    expect(d.settle).not.toHaveBeenCalled();
  });

  it("carries on past one it could not ask about", async () => {
    const status = vi
      .fn()
      .mockRejectedValueOnce(new Error("relay /intents/status/v3 failed: 500"))
      .mockResolvedValueOnce("success");
    const d = deps([intent("0xa"), intent("0xb")], status);

    const summary = await pollUnsettledDeposits(d);

    expect(summary).toEqual({ asked: 2, settled: 1, failed: 1 });
    expect(d.settle).toHaveBeenCalledWith("0xb", { status: "success" });
  });

  it("does nothing, cheaply, when there is nothing open", async () => {
    const d = deps([], "success");

    expect(await pollUnsettledDeposits(d)).toEqual({ asked: 0, settled: 0, failed: 0 });
    expect(d.relayStatus).not.toHaveBeenCalled();
  });
});
