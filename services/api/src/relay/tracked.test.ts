import { describe, expect, it } from "vitest";
import { trackedSends, type Attempt } from "./tracked.js";

const BYTES = new Uint8Array([1, 2, 3]);
const OTHER = new Uint8Array([9, 9, 9]);

/** An attempt that answers from a script, one answer per call, and keeps what it was asked. */
const scripted = (...answers: (Attempt | Error)[]) => {
  const calls: { item: string; signature: string }[] = [];
  const attempt = async (item: string, signature: string): Promise<Attempt> => {
    calls.push({ item, signature });
    const next = answers.shift() ?? "recorded";
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, attempt };
};

const sends = (attempt: Parameters<typeof trackedSends<string>>[1]) =>
  trackedSends<string>("test", attempt, { waits: [1, 1, 1], sleep: async () => {} });

describe("trackedSends", () => {
  it("records what was built once the node accepts its transaction, without the app", async () => {
    const r = scripted();
    const s = sends(r.attempt);
    s.remember(BYTES, "order-1");
    await s.accepted(BYTES, "sig");
    expect(r.calls).toEqual([{ item: "order-1", signature: "sig" }]);
  });

  it("asks again until the node can return the transaction", async () => {
    const r = scripted("pending", new Error("node busy"), "recorded");
    const s = sends(r.attempt);
    s.remember(BYTES, "order-1");
    await s.accepted(BYTES, "sig");
    expect(r.calls).toHaveLength(3);
  });

  it("stops after its last try", async () => {
    const r = scripted("pending", "pending", "pending", "recorded");
    const s = sends(r.attempt);
    s.remember(BYTES, "order-1");
    await s.accepted(BYTES, "sig");
    expect(r.calls).toHaveLength(3);
  });

  it("does not ask again once the answer is final", async () => {
    const r = scripted("refused", "recorded");
    const s = sends(r.attempt);
    s.remember(BYTES, "order-1");
    await s.accepted(BYTES, "sig");
    expect(r.calls).toHaveLength(1);
  });

  it("ignores a transaction it did not build", async () => {
    const r = scripted();
    const s = sends(r.attempt);
    s.remember(BYTES, "order-1");
    await s.accepted(OTHER, "sig");
    expect(r.calls).toHaveLength(0);
  });

  it("records the same bytes sent again only once", async () => {
    const r = scripted();
    const s = sends(r.attempt);
    s.remember(BYTES, "order-1");
    await s.accepted(BYTES, "sig");
    await s.accepted(BYTES, "sig");
    expect(r.calls).toHaveLength(1);
  });

  it("forgets a build after its time", async () => {
    let at = 0;
    const r = scripted();
    const s = trackedSends<string>("test", r.attempt, {
      waits: [1],
      sleep: async () => {},
      ttlMs: 1000,
      now: () => at,
    });
    s.remember(BYTES, "order-1");
    at = 1001;
    await s.accepted(BYTES, "sig");
    expect(r.calls).toHaveLength(0);
  });
});
