import { describe, expect, it } from "vitest";
import { signAndSendMove } from "./move";
import type { PreparedMove } from "../app/move/move-lines";

const prepared = (n: number): PreparedMove => ({
  transactions: Array.from({ length: n }, (_, i) => ({
    transaction: btoa(String.fromCharCode(i, 200, 255)),
    moved: [],
  })),
  feeUsd: "0",
  rentUsd: "0",
  coveredByMercury: false,
});

describe("signAndSendMove", () => {
  it("signs every step at once, then sends each, in order, as the wallet signed it", async () => {
    const asked: number[] = [];
    const sent: string[] = [];
    const outcome = await signAndSendMove(prepared(3), {
      signAll: async (txs) => {
        asked.push(txs.length);
        return txs.map((t) => Uint8Array.from([...t, 7]));
      },
      submit: async (tx) => {
        sent.push(tx);
        return { signature: "s", status: "confirmed" };
      },
    });
    expect(asked).toEqual([3]);
    expect(sent.map((s) => [...Uint8Array.from(atob(s), (c) => c.charCodeAt(0))])).toEqual([
      [0, 200, 255, 7],
      [1, 200, 255, 7],
      [2, 200, 255, 7],
    ]);
    expect(outcome).toEqual({ kind: "done", count: 3 });
  });

  it("keeps sending after a step is refused, and says how much landed", async () => {
    let n = 0;
    const outcome = await signAndSendMove(prepared(3), {
      signAll: async (txs) => [...txs],
      submit: async () => {
        n += 1;
        if (n === 2) throw new Error("send_failed");
        return { signature: "s", status: n === 3 ? "pending" : "confirmed" };
      },
    });
    expect(n).toBe(3);
    expect(outcome).toEqual({ kind: "partial", landed: 1, count: 3 });
  });

  it("sends nothing when signing is refused", async () => {
    let sent = 0;
    await expect(
      signAndSendMove(prepared(2), {
        signAll: async () => {
          throw new Error("Phantom wasn't connected, so nothing was signed.");
        },
        submit: async () => {
          sent += 1;
          return { signature: "s", status: "confirmed" };
        },
      }),
    ).rejects.toThrow("nothing was signed");
    expect(sent).toBe(0);
  });
});
