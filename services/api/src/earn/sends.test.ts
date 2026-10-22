import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { earnSends, type EarnMove } from "./sends.js";
import type { Recorded } from "./record.js";

const MOVE: EarnMove = { userId: "user-1", wallet: "WaLLeT", kind: "deposit", vault: "Vault" };
const BYTES = new Uint8Array([1, 2, 3]);
const RECORDED: Recorded = { kind: "recorded", written: true, usdc: D(20) };

/** A recorder that answers from a script, one answer per call, and keeps what it was asked. */
const recorder = (...answers: (Recorded | Error)[]) => {
  const calls: unknown[] = [];
  const record = async (m: EarnMove & { signature: string }): Promise<Recorded> => {
    calls.push(m);
    const next = answers.shift() ?? RECORDED;
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, record };
};

const sends = (record: Parameters<typeof earnSends>[0]) =>
  earnSends(record, { waits: [1, 1, 1], sleep: async () => {} });

describe("earnSends", () => {
  /*
   * The app's confirm is not the only way a move gets into the ledger. A
   * deposit sent while the tab closed used to land unrecorded, and "earned so
   * far" then counted the whole deposit as interest.
   */
  it("records a move once the node accepts its transaction, without the app", async () => {
    const r = recorder();
    const s = sends(r.record);
    s.remember(BYTES, MOVE);
    await s.accepted(BYTES, "sig");
    expect(r.calls).toEqual([{ ...MOVE, signature: "sig" }]);
  });

  it("asks again until the node can return the transaction", async () => {
    const r = recorder({ kind: "pending" }, new Error("node busy"), RECORDED);
    const s = sends(r.record);
    s.remember(BYTES, MOVE);
    await s.accepted(BYTES, "sig");
    expect(r.calls).toHaveLength(3);
  });

  it("stops after its last try", async () => {
    const r = recorder({ kind: "pending" }, { kind: "pending" }, { kind: "pending" }, RECORDED);
    const s = sends(r.record);
    s.remember(BYTES, MOVE);
    await s.accepted(BYTES, "sig");
    expect(r.calls).toHaveLength(3);
  });

  it("stops at a refusal: a failed transaction is not worth asking about again", async () => {
    const r = recorder({ kind: "refused", code: "transaction_failed", message: "failed" });
    const s = sends(r.record);
    s.remember(BYTES, MOVE);
    await s.accepted(BYTES, "sig");
    expect(r.calls).toHaveLength(1);
  });

  it("ignores every transaction that is not an Earn move, and each move after the first time", async () => {
    const r = recorder();
    const s = sends(r.record);
    await s.accepted(BYTES, "sig");
    s.remember(BYTES, MOVE);
    await s.accepted(BYTES, "sig");
    await s.accepted(BYTES, "sig");
    expect(r.calls).toHaveLength(1);
  });

  it("forgets a move nobody sent", async () => {
    let now = 0;
    const r = recorder();
    const s = earnSends(r.record, { waits: [1], sleep: async () => {}, ttlMs: 10, now: () => now });
    s.remember(BYTES, MOVE);
    now = 11;
    await s.accepted(BYTES, "sig");
    expect(r.calls).toHaveLength(0);
  });
});
