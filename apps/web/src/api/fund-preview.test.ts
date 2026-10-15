import { describe, expect, it } from "vitest";
import { previewBody, previewFrom } from "./fund-preview";

const RECIPIENT = "0x999999cf1046e68e36E1aA2E0E07105eDDD1f08E";
const input = {
  chainId: 8453,
  currency: "0x0000000000000000000000000000000000000000",
  vmType: "evm",
  amountRaw: 10_000_000_000_000_000n,
  user: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  recipient: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
};

/*
 * The preview is priced in the browser and the deposit on the server. If the
 * two ask Relay different questions, somebody is shown one figure and signs
 * for another — so the preview asks for exactly the fee the server will.
 */
describe("previewBody", () => {
  it("asks Relay for Mercury's fee when the token owes one", () => {
    const body = previewBody({ ...input, appFee: { recipient: RECIPIENT, bps: 30 } });
    expect(body["appFees"]).toEqual([{ recipient: RECIPIENT, fee: "30" }]);
  });

  it("asks for no fee on a token that owes none", () => {
    expect(previewBody({ ...input, appFee: null })).not.toHaveProperty("appFees");
  });

  /* A server older than the fee sends no `appFee` at all, and it then charges none. */
  it("asks for no fee when the server said nothing about one", () => {
    expect(previewBody(input)).not.toHaveProperty("appFees");
  });
});

/* The shape Relay answered with for 0.01 ETH on Base at 30 bps, 15 October 2026. */
const answer = (app: { amountUsd: string } | undefined) => ({
  details: { currencyOut: { amountFormatted: "23.473486" } },
  fees: { gas: { amountUsd: "0.000499" }, relayer: { amountUsd: "0.042912" }, app },
});

describe("previewFrom", () => {
  /* Two fees to two parties: Relay's for the work, Mercury's for the service. Named apart, not summed. */
  it("keeps Mercury's fee apart from Relay's", () => {
    const preview = previewFrom(answer({ amountUsd: "0.070814" }));
    expect(preview).toMatchObject({
      relayFeeUsd: 0.042912,
      mercuryFeeUsd: 0.070814,
      networkFeeUsd: 0.000499,
    });
  });

  it("reads a deposit with no Mercury fee as none", () => {
    expect(previewFrom(answer(undefined)).mercuryFeeUsd).toBe(0);
  });

  it("reports what lands, as Relay formats it", () => {
    expect(previewFrom(answer(undefined)).outAmount).toBe("23.473486");
  });
});
