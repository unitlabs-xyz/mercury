import { describe, expect, it } from "vitest";
import { earnSub } from "./Summary";

describe("earnSub", () => {
  it("says what is in Earn besides the cash", () => {
    expect(earnSub(300, false)).toBe("+ $300.00 in Earn");
    expect(earnSub(0, false)).toBe("Ready to invest");
  });

  /* The figure is the last hourly reading when Kamino cannot be read: say so, as debt does. */
  it("says when the Earn figure is an hour old, or missing", () => {
    expect(earnSub(300, true)).toBe("+ $300.00 in Earn, as of an hour ago");
    expect(earnSub(0, true)).toBe("Earn could not be read");
  });
});
