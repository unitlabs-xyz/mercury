import { describe, expect, it } from "vitest";
import { usdCompact } from "./format.js";

/**
 * Every expectation here is what `Intl.NumberFormat` with
 * `notation: "compact"` returns in a browser, recorded by running it. The
 * function exists because Hermes ignores that option and returns the long form,
 * so the point of these is that the two clients agree to the character.
 */
describe("usdCompact", () => {
  it("leaves a figure under a thousand whole", () => {
    expect(usdCompact(912)).toBe("$912");
    expect(usdCompact(9)).toBe("$9");
    expect(usdCompact(0)).toBe("$0");
    // Intl rounds to no decimals below a thousand, so sixty cents is a dollar.
    expect(usdCompact(0.6)).toBe("$1");
    expect(usdCompact(999.4)).toBe("$999");
  });

  it("names the unit, to one decimal", () => {
    expect(usdCompact(1450)).toBe("$1.5K");
    expect(usdCompact(12_278.63)).toBe("$12.3K");
    expect(usdCompact(48_200)).toBe("$48.2K");
    expect(usdCompact(1_830_000)).toBe("$1.8M");
    expect(usdCompact(1_830_000_000)).toBe("$1.8B");
    expect(usdCompact(1e12)).toBe("$1T");
  });

  it("drops a trailing zero, as Intl does", () => {
    expect(usdCompact(1000)).toBe("$1K");
    expect(usdCompact(1049)).toBe("$1K");
    expect(usdCompact(1_000_000)).toBe("$1M");
  });

  it("carries a rounding that reaches the next unit", () => {
    // The pair that catches a naive implementation: both are a shade under a
    // million, and only one of them rounds into it.
    expect(usdCompact(999_949)).toBe("$999.9K");
    expect(usdCompact(999_999)).toBe("$1M");
    // And the same step from nothing into thousands.
    expect(usdCompact(999.95)).toBe("$1K");
    expect(usdCompact(999_999_999)).toBe("$1B");
  });

  it("puts the sign outside the dollar, where Intl puts it", () => {
    expect(usdCompact(-2500)).toBe("-$2.5K");
    expect(usdCompact(-912)).toBe("-$912");
  });

  it("takes the decimal strings the API sends", () => {
    expect(usdCompact("12278.63")).toBe("$12.3K");
    expect(usdCompact("0")).toBe("$0");
  });

  it("says nothing rather than zero when there is no figure", () => {
    expect(usdCompact(null)).toBe("—");
    expect(usdCompact(undefined)).toBe("—");
    expect(usdCompact("")).toBe("—");
    expect(usdCompact(Number.NaN)).toBe("—");
  });
});
