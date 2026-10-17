import { describe, expect, it } from "vitest";
import { captureRef, clearRef, pendingRef, settles } from "./pending";

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
const DAY = 86_400_000;
const t0 = Date.UTC(2026, 9, 17);

describe("the pending invite code", () => {
  it("keeps the code from the address the visitor arrived on", () => {
    const store = memory();
    captureRef("?ref=abcdefgh&utm_source=x", store, t0);
    expect(pendingRef(store, t0 + DAY)).toBe("abcdefgh");
  });

  it("keeps a newer link over an older one", () => {
    const store = memory();
    captureRef("?ref=abcdefgh", store, t0);
    captureRef("?ref=hgfedcba", store, t0 + 1);
    expect(pendingRef(store, t0 + 2)).toBe("hgfedcba");
  });

  it("leaves a stored code alone when the address has none", () => {
    const store = memory();
    captureRef("?ref=abcdefgh", store, t0);
    captureRef("", store, t0 + 1);
    expect(pendingRef(store, t0 + 2)).toBe("abcdefgh");
  });

  it("ignores something that is not a code", () => {
    const store = memory();
    captureRef("?ref=%3Cscript%3E", store, t0);
    expect(pendingRef(store, t0)).toBeNull();
  });

  it("forgets a code after 30 days", () => {
    const store = memory();
    captureRef("?ref=abcdefgh", store, t0);
    expect(pendingRef(store, t0 + 30 * DAY)).toBeNull();
  });

  it("forgets it when told to", () => {
    const store = memory();
    captureRef("?ref=abcdefgh", store, t0);
    clearRef(store);
    expect(pendingRef(store, t0)).toBeNull();
  });

  it("survives a browser with no storage at all", () => {
    expect(() => captureRef("?ref=abcdefgh", null, t0)).not.toThrow();
    expect(pendingRef(null, t0)).toBeNull();
  });
});

/*
 * A refusal is final, so the code goes. A network failure is not, so it stays
 * for the next visit. Errors are built by hand rather than as `ApiError`:
 * `api/client.ts` loads Privy at import, which a node test has no business doing.
 */
const refused = (status: number) => Object.assign(new Error("refused"), { status });

describe("settles", () => {
  it("is true for a refusal", () => {
    expect(settles(refused(409))).toBe(true);
    expect(settles(refused(404))).toBe(true);
  });
  it("is false for a server or network failure", () => {
    expect(settles(refused(503))).toBe(false);
    expect(settles(new TypeError("Failed to fetch"))).toBe(false);
  });
});
