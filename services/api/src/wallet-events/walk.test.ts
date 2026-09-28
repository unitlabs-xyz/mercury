import { describe, expect, it } from "vitest";
import type { ChainHistory, SignaturePage, SignatureRef } from "@mercury/chain";
import { walkStream } from "./walk.js";

const ADDRESS = "6Yg9nNQEqCQBMcYHLrrfj6qGjcR6hvhdhHQZPjtDqLRT";

const ref = (n: number, failed = false): SignatureRef => ({
  signature: `sig-${String(n).padStart(4, "0")}`,
  slot: 1000 + n,
  blockTime: 1_790_000_000 + n,
  failed,
});

/**
 * A node holding a fixed history, newest first, answering `until` and `before`
 * the way the real one does. The walk's correctness is entirely about paging,
 * so the fake has to page properly or the test proves nothing.
 */
const nodeWith = (history: readonly SignatureRef[]) => {
  const asked: SignaturePage[] = [];
  const h: ChainHistory = {
    tokenAccountsFor: () => Promise.resolve([]),
    transaction: () => Promise.resolve(null),
    signatures: (_address, page) => {
      asked.push(page);
      let window = [...history];
      if (page.before !== undefined) {
        const at = window.findIndex((s) => s.signature === page.before);
        window = at < 0 ? window : window.slice(at + 1);
      }
      if (page.until !== undefined) {
        const at = window.findIndex((s) => s.signature === page.until);
        window = at < 0 ? window : window.slice(0, at);
      }
      return Promise.resolve(window.slice(0, page.limit));
    },
  };
  return { history: h, asked };
};

describe("walkStream", () => {
  it("records where it is and emits nothing on first sight, because there is no backfill", async () => {
    const n = nodeWith([ref(9), ref(8), ref(7)]);
    const walk = await walkStream(n.history, ADDRESS, null);
    expect(walk.signatures).toEqual([]);
    expect(walk.newestSignature).toBe("sig-0009");
    // One signature is all it takes to know where to start.
    expect(n.asked).toEqual([{ limit: 1 }]);
  });

  it("returns nothing at all for an address with no history", async () => {
    const walk = await walkStream(nodeWith([]).history, ADDRESS, null);
    expect(walk.signatures).toEqual([]);
    expect(walk.newestSignature).toBeNull();
  });

  it("returns everything since the cursor, oldest first", async () => {
    const n = nodeWith([ref(5), ref(4), ref(3), ref(2), ref(1)]);
    const walk = await walkStream(n.history, ADDRESS, "sig-0002");
    expect(walk.signatures.map((s) => s.signature)).toEqual(["sig-0003", "sig-0004", "sig-0005"]);
    expect(walk.newestSignature).toBe("sig-0005");
  });

  it("pages back with before until a short page, so a busy window loses nothing", async () => {
    // 250 new signatures: more than two full pages of 100.
    const history = Array.from({ length: 251 }, (_, i) => ref(251 - i));
    const n = nodeWith(history);
    const walk = await walkStream(n.history, ADDRESS, "sig-0001");

    expect(walk.signatures).toHaveLength(250);
    expect(walk.signatures[0]!.signature).toBe("sig-0002");
    expect(walk.signatures[249]!.signature).toBe("sig-0251");
    expect(walk.newestSignature).toBe("sig-0251");

    // Three calls: two full pages, then a short one that ends the walk.
    expect(n.asked).toHaveLength(3);
    expect(n.asked[0]).toEqual({ limit: 100, until: "sig-0001" });
    expect(n.asked[1]).toEqual({ limit: 100, until: "sig-0001", before: "sig-0152" });
    expect(n.asked[2]).toEqual({ limit: 100, until: "sig-0001", before: "sig-0052" });
  });

  it("drops failed transactions, which moved nothing", async () => {
    const n = nodeWith([ref(3), ref(2, true), ref(1)]);
    const walk = await walkStream(n.history, ADDRESS, "sig-0000");
    expect(walk.signatures.map((s) => s.signature)).toEqual(["sig-0001", "sig-0003"]);
    // The cursor still advances past the failure, or it would be retried forever.
    expect(walk.newestSignature).toBe("sig-0003");
  });

  it("walks the whole history on first sight when backfill is set, instead of baselining", async () => {
    const n = nodeWith([ref(3), ref(2), ref(1)]);
    const walk = await walkStream(n.history, ADDRESS, null, { backfill: true });
    expect(walk.signatures.map((s) => s.signature)).toEqual(["sig-0001", "sig-0002", "sig-0003"]);
    expect(walk.newestSignature).toBe("sig-0003");
    // No `until`: a freshly discovered stream has no cursor to bound the walk.
    expect(n.asked).toEqual([{ limit: 100 }]);
  });

  it("throws once paging passes the cap, rather than reading a whole address's history in one pass", async () => {
    // 5,001 signatures — enough for 50 full pages plus one more — and a
    // cursor that is not among them. That is what a cursor aged out of the
    // node's index looks like: `until` is never satisfied, so nothing but the
    // cap stops the walk from paging back through everything.
    const history = Array.from({ length: 5001 }, (_, i) => ref(5001 - i));
    const n = nodeWith(history);
    await expect(walkStream(n.history, ADDRESS, "sig-9999")).rejects.toThrow(/50 pages/);
  });

  it("names the stream in the cap error, never the address", async () => {
    const history = Array.from({ length: 5001 }, (_, i) => ref(5001 - i));
    const n = nodeWith(history);
    await expect(walkStream(n.history, ADDRESS, "sig-9999", { label: "its USDC stream" })).rejects.toThrow(
      /its USDC stream/,
    );
  });
});
