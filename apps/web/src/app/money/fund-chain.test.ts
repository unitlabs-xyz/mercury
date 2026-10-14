import { describe, expect, it } from "vitest";
import { cleanAmount, timingCopy } from "./fund-chain";
import { shortAddress } from "./FundFromChain";

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

describe("shortAddress", () => {
  it("keeps both ends, which is what tells two wallets apart", () => {
    /* The middle of an address carries no information anybody checks; the ends
       are what somebody compares against their wallet. */
    expect(shortAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe("0xd8dA…6045");
  });

  it("works on a Solana address, which is not hex and has no prefix", () => {
    expect(shortAddress("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")).toBe("9WzDXw…AWWM");
  });

  it("leaves an address too short to shorten alone", () => {
    /* Below eleven characters the two slices overlap and the result is longer
       than the input. Nothing produces an address this short — but a shortener
       that lengthens its argument is a trap for whoever reuses it. */
    expect(shortAddress("0xabc")).toBe("0xabc");
  });
});

describe("cleanAmount", () => {
  it("puts a 0 before a point typed first", () => {
    expect(cleanAmount(".", 6)).toBe("0.");
    expect(cleanAmount(".5", 6)).toBe("0.5");
  });

  it("keeps one point, and digits only", () => {
    expect(cleanAmount("1.2.3", 6)).toBe("1.23");
    expect(cleanAmount("$1,000.50", 2)).toBe("1000.50");
  });

  it("folds leading zeros away but keeps the one before a point", () => {
    expect(cleanAmount("007", 6)).toBe("7");
    expect(cleanAmount("00.5", 6)).toBe("0.5");
    expect(cleanAmount("0", 6)).toBe("0");
  });

  it("stops at the places the token has, or two for dollars", () => {
    expect(cleanAmount("1.123456789", 6)).toBe("1.123456");
    expect(cleanAmount("12.345", 2)).toBe("12.34");
    expect(cleanAmount("5.", 0)).toBe("5");
  });

  it("keeps a trailing point, which is somebody halfway through typing", () => {
    expect(cleanAmount("12.", 6)).toBe("12.");
  });
});
