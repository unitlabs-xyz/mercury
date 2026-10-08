import { describe, expect, it } from "vitest";
import { ApiError } from "./client";
import { sendUsdc, SendSubmissionUncertain, type SendIo } from "./send";

const intent = { amount: "20.00", to: "6WLXfCuBfFGfw4adcVDmqfzqT1pGqJzPbG1xNhd4uTe2" };

describe("sendUsdc", () => {
  it("prepares, signs, then broadcasts the reviewed transfer", async () => {
    const calls: string[] = [];
    const io: SendIo = {
      prepare: async (input) => {
        expect(input).toEqual(intent);
        calls.push("prepare");
        return "unsigned";
      },
      sign: async (wire) => {
        expect(wire).toBe("unsigned");
        calls.push("sign");
        return "signed";
      },
      submit: async (wire) => {
        expect(wire).toBe("signed");
        calls.push("submit");
        return { signature: "signature", status: "pending" };
      },
    };

    expect(await sendUsdc(io, intent)).toEqual({ signature: "signature", status: "pending" });
    expect(calls).toEqual(["prepare", "sign", "submit"]);
  });

  it("does not call an uncertain submission a failed transfer", async () => {
    const io: SendIo = {
      prepare: async () => "unsigned",
      sign: async () => "signed",
      submit: async () => {
        throw new Error("connection lost");
      },
    };
    await expect(sendUsdc(io, intent)).rejects.toBeInstanceOf(SendSubmissionUncertain);
  });

  it("preserves a definite preflight rejection", async () => {
    const io: SendIo = {
      prepare: async () => "unsigned",
      sign: async () => "signed",
      submit: async () => {
        throw new ApiError(422, "send_failed", "Not enough SOL for the network fee.");
      },
    };
    await expect(sendUsdc(io, intent)).rejects.toThrow("Not enough SOL");
  });
});
