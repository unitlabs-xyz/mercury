import { describe, expect, it } from "vitest";
import { maxSendable, NO_SEND_QUOTE } from "./send.js";

const owing = (feeUsd: string) => ({ feeUsd, sponsored: true });

describe("maxSendable", () => {
  /*
   * Max has to subtract the charge or it fails by construction: a sender
   * holding exactly $20 cannot send $20 and repay $0.25 out of the same $20.
   * That is the bug `investable` exists to prevent on the buy side, in the one
   * place a sender meets it on this side.
   */
  it("reserves the charge, so the most it offers can actually be sent", () => {
    expect(maxSendable("20", owing("0.25"))).toBe("19.75");
  });

  it("offers the whole balance when nothing is owed", () => {
    expect(maxSendable("20", owing("0"))).toBe("20");
    expect(maxSendable("20", NO_SEND_QUOTE)).toBe("20");
  });

  /*
   * Never a negative amount in the field. A balance smaller than the rent is a
   * transfer that cannot happen, and "$-0.05" is not how to say so.
   */
  it("offers zero rather than a negative when the balance is under the charge", () => {
    expect(maxSendable("0.10", owing("0.25"))).toBe("0");
    expect(maxSendable("0", owing("0.25"))).toBe("0");
  });

  it("keeps the cents a balance actually has", () => {
    expect(maxSendable("1234.567891", owing("0.25"))).toBe("1234.317891");
  });

  it("treats a balance it has not been given as nothing to send", () => {
    expect(maxSendable(undefined, owing("0.25"))).toBe("0");
    expect(maxSendable(null, NO_SEND_QUOTE)).toBe("0");
  });
});
