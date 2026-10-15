import { describe, expect, it } from "vitest";
import { decimal } from "./money.js";

describe("decimal", () => {
  it("trims the scale Postgres pads a numeric(38,18) with", () => {
    expect(decimal("400.000000000000000000")).toBe("400");
    expect(decimal("5.500000000000000000")).toBe("5.5");
    expect(decimal("0.000000000000000000")).toBe("0");
  });

  it("answers zero for a sum over no rows", () => {
    /* `sum()` of nothing is null, and a dashboard that renders null as a blank
       where a figure belongs looks broken rather than empty. */
    expect(decimal(null)).toBe("0");
    expect(decimal(undefined)).toBe("0");
    expect(decimal("")).toBe("0");
  });

  it("keeps significant trailing zeros", () => {
    /* The bug a careless trim introduces: 1000 is not 1. */
    expect(decimal("1000")).toBe("1000");
    expect(decimal("1000.500000000000000000")).toBe("1000.5");
  });

  it("keeps a negative, because realised P&L can be one", () => {
    expect(decimal("-12.340000000000000000")).toBe("-12.34");
    expect(decimal("-0.000000000000000000")).toBe("0");
  });

  it("never parses the value, so precision beyond a double survives", () => {
    /* 9007199254740993 is 2^53 + 1, which a JavaScript number cannot hold.
       Through `Number()` it would come back as ...992. */
    expect(decimal("9007199254740993.000000000000000000")).toBe("9007199254740993");
  });
});
