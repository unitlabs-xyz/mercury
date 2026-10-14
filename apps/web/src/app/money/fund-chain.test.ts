import { describe, expect, it } from "vitest";
import { anyInFlight, statusCopy, timingCopy } from "./fund-chain";

describe("anyInFlight", () => {
  it.each(["waiting", "depositing", "pending", "submitted"])("is true while %s", (status) => {
    expect(anyInFlight([status])).toBe(true);
  });

  it.each(["success", "failure", "refund"])("is false once %s", (status) => {
    expect(anyInFlight([status])).toBe(false);
  });

  it("is true when any one of several is still moving", () => {
    expect(anyInFlight(["success", "refund", "pending"])).toBe(true);
  });

  it("is false with nothing to watch", () => {
    expect(anyInFlight([])).toBe(false);
  });
});

describe("statusCopy", () => {
  it("does not make waiting sound like a problem", () => {
    const { label, done } = statusCopy("waiting");
    expect(label).toBe("Waiting for your transfer");
    expect(done).toBe(false);
  });

  it("marks only the terminal states as done", () => {
    expect(statusCopy("success").done).toBe(true);
    expect(statusCopy("refund").done).toBe(true);
    expect(statusCopy("submitted").done).toBe(false);
  });

  it("says something sane about a status Relay has not told us about", () => {
    expect(statusCopy("quantum").label).toBe("In progress");
  });
});

describe("timingCopy", () => {
  it("tells the truth about Bitcoin", () => {
    /* "About a minute" would have somebody refreshing for forty of them,
       convinced their money was gone. */
    expect(timingCopy("bvm")).toMatch(/10 to 60 minutes/);
  });

  it("is about a minute everywhere else", () => {
    for (const vm of ["evm", "svm", "tvm", "tonvm"]) expect(timingCopy(vm)).toMatch(/about a minute/);
  });
});
