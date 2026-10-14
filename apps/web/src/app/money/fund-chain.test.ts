import { describe, expect, it } from "vitest";
import { timingCopy } from "./fund-chain";
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
