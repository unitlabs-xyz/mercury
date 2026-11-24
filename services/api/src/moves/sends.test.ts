import { describe, expect, it } from "vitest";
import type { TransactionDetail } from "@mercury/chain";
import { moveSends, type BuiltMove } from "./sends.js";
import type { MoveRecord } from "./record.js";

const MOVE: BuiltMove = {
  userId: "user-1",
  fromWalletId: "w-phantom",
  toWalletId: "w-mercury",
  startedAt: new Date("2026-11-20T10:00:00.000Z"),
  moved: [{ mint: "NVDAx", amountRaw: 100n }],
};
const BYTES = new Uint8Array([1, 2, 3]);
const landed = (over: Partial<TransactionDetail> = {}): TransactionDetail => ({
  signature: "sig",
  blockTime: 1_763_632_830,
  succeeded: true,
  accountKeys: [],
  feeLamports: 5000n,
  preLamports: [],
  postLamports: [],
  preTokens: [],
  postTokens: [],
  ...over,
});

const harness = (reads: (TransactionDetail | null | Error)[], over: { now?: () => number } = {}) => {
  const recorded: MoveRecord[] = [];
  const slept: number[] = [];
  let read = 0;
  const sends = moveSends(
    {
      history: {
        transaction: async () => {
          const next = reads[Math.min(read++, reads.length - 1)];
          if (next instanceof Error) throw next;
          return next ?? null;
        },
      },
      record: async (move) => {
        recorded.push(move);
      },
    },
    {
      waits: [1, 2, 3],
      sleep: async (ms) => {
        slept.push(ms);
      },
      ...over,
    },
  );
  return { sends, recorded, slept, reads: () => read };
};

describe("moveSends", () => {
  it("records a move it built once the node says it succeeded, at the time it landed", async () => {
    const h = harness([landed()]);
    h.sends.remember(BYTES, MOVE);
    await h.sends.accepted(BYTES, "sig");
    expect(h.recorded).toEqual([
      { ...MOVE, signature: "sig", occurredAt: new Date("2025-11-20T10:00:30.000Z") },
    ]);
  });

  it("waits for the transaction to become readable, and stops once it is", async () => {
    const h = harness([null, new Error("429"), landed()]);
    h.sends.remember(BYTES, MOVE);
    await h.sends.accepted(BYTES, "sig");
    expect(h.slept).toEqual([1, 2, 3]);
    expect(h.recorded).toHaveLength(1);
  });

  it("records nothing for a move that failed on chain: it moved nothing", async () => {
    const h = harness([landed({ succeeded: false })]);
    h.sends.remember(BYTES, MOVE);
    await h.sends.accepted(BYTES, "sig");
    expect(h.recorded).toEqual([]);
    expect(h.reads()).toBe(1);
  });

  it("gives up quietly when the transaction never becomes readable", async () => {
    const h = harness([null]);
    h.sends.remember(BYTES, MOVE);
    await expect(h.sends.accepted(BYTES, "sig")).resolves.toBeUndefined();
    expect(h.recorded).toEqual([]);
    expect(h.reads()).toBe(3);
  });

  it("ignores a transaction it did not build, and records one it did only once", async () => {
    const h = harness([landed()]);
    await h.sends.accepted(new Uint8Array([9]), "other");
    expect(h.reads()).toBe(0);
    h.sends.remember(BYTES, MOVE);
    await h.sends.accepted(BYTES, "sig");
    await h.sends.accepted(BYTES, "sig");
    expect(h.recorded).toHaveLength(1);
  });

  it("forgets a build whose blockhash has long expired", async () => {
    let at = 0;
    const h = harness([landed()], { now: () => at });
    h.sends.remember(BYTES, MOVE);
    at = 5 * 60_000;
    await h.sends.accepted(BYTES, "sig");
    expect(h.recorded).toEqual([]);
  });

  it("never throws when recording fails", async () => {
    const sends = moveSends(
      {
        history: { transaction: async () => landed() },
        record: async () => {
          throw new Error("db down");
        },
      },
      { waits: [0], sleep: async () => undefined },
    );
    sends.remember(BYTES, MOVE);
    await expect(sends.accepted(BYTES, "sig")).resolves.toBeUndefined();
  });

  it("uses now as the time when the node gives no block time", async () => {
    const h = harness([landed({ blockTime: null })], { now: () => 1_000 });
    h.sends.remember(BYTES, MOVE);
    await h.sends.accepted(BYTES, "sig");
    expect(h.recorded[0]!.occurredAt).toEqual(new Date(1_000));
  });
});
