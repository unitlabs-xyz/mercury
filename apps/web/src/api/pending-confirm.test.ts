import { beforeEach, describe, expect, it } from "vitest";
import { forgetConfirm, rememberConfirm } from "./pending-confirm";

/*
 * These tests run in node, as every test in this app does, so the one browser
 * API the store touches is supplied here. Newer node versions happen to define
 * it and older ones do not, which made this pass locally and fail on CI.
 */
const memory = new Map<string, string>();
const storage: Storage = {
  get length() {
    return memory.size;
  },
  key: (index) => [...memory.keys()][index] ?? null,
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => void memory.set(key, value),
  removeItem: (key) => void memory.delete(key),
  clear: () => memory.clear(),
};
globalThis.sessionStorage = storage;

/** The sweep reads session storage directly; these assert what it will find. */
const keys = () =>
  Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k): k is string => k !== null);

describe("pending confirms", () => {
  beforeEach(() => storage.clear());

  it("keeps a claim per transaction, so acting three times loses none", () => {
    /* A borrow, a repay and a withdrawal in a row kept only the withdrawal. */
    rememberConfirm("loan", { signature: "sig-borrow", action: { kind: "borrow" } });
    rememberConfirm("loan", { signature: "sig-repay", action: { kind: "repay" } });
    rememberConfirm("loan", { signature: "sig-withdraw", action: { kind: "withdraw" } });
    expect(keys()).toHaveLength(3);
  });

  it("separates one kind of claim from another", () => {
    rememberConfirm("loan", { signature: "sig" });
    rememberConfirm("order", { signature: "sig" });
    expect(keys().sort()).toEqual(["pending-confirm:loan:sig", "pending-confirm:order:sig"]);
  });

  it("forgets only the transaction it is given", () => {
    rememberConfirm("loan", { signature: "a" });
    rememberConfirm("loan", { signature: "b" });
    forgetConfirm("loan", "a");
    expect(keys()).toEqual(["pending-confirm:loan:b"]);
  });
});
