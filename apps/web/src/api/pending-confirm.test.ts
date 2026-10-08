import { beforeEach, describe, expect, it } from "vitest";
import { forgetConfirm, rememberConfirm } from "./pending-confirm";

/** The sweep reads session storage directly; these assert what it will find. */
const keys = () =>
  Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i)).filter(
    (k): k is string => k !== null,
  );

describe("pending confirms", () => {
  beforeEach(() => sessionStorage.clear());

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
