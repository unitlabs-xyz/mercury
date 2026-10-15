import { describe, expect, it } from "vitest";
import { banned, safeAttributes } from "./attributes.js";

describe("safeAttributes", () => {
  it("keeps the attributes worth having", () => {
    expect(safeAttributes({ job: "position-sync", rows: 12, failed: false })).toEqual({
      job: "position-sync",
      rows: 12,
      failed: false,
    });
  });

  it.each([
    "email",
    "user_email",
    "userEmail",
    "privy_user_id",
    "privyUserId",
    "wallet_address",
    "walletAddress",
    "recipient_address",
    "deposit_address",
    "authorization",
    "x-privy-identity-token",
    "cookie",
    "tx_signature",
    "txSignature",
    "balance_usd",
    "total_usd",
    "amountUsd",
    "realised_pnl_usd",
    "unrealisedPnlUsd",
    "cost_basis_usd",
    "shares",
    "secret_key",
    "relayer_secret_key",
    "jupiter_api_key",
    "public_key",
    "mnemonic",
  ])("refuses %s, whatever the instrumentation thought it was doing", (key) => {
    /* A rule kept by remembering it at each call site is a rule the next call
       site breaks. There are dozens across this service and the packages it
       runs, and telemetry is a classic way to leak a database one attribute at
       a time — into a store with different retention and different access than
       the database it came from. */
    expect(safeAttributes({ [key]: "anything", job: "ok" })).toEqual({ job: "ok" });
  });

  it("matches a banned name however it is cased or separated", () => {
    expect(safeAttributes({ WALLET_ADDRESS: "x" })).toEqual({});
    expect(safeAttributes({ "user.email": "x" })).toEqual({});
    expect(safeAttributes({ "Wallet-Address": "x" })).toEqual({});
  });

  it("allows user_id, which is our own name for somebody and not theirs", () => {
    /* Our UUID, on our own infrastructure, and a trace that cannot say whose
       request it was cannot answer the question anybody actually asks. It is
       kept out of metric labels by construction instead — nothing in metrics.ts
       accepts an id — because there it is unbounded cardinality rather than a
       privacy problem. */
    expect(safeAttributes({ user_id: "6f1b0c2e", userId: "6f1b0c2e" })).toEqual({
      user_id: "6f1b0c2e",
      userId: "6f1b0c2e",
    });
  });

  it("drops a value that is not a scalar rather than stringifying it", () => {
    /* An object stringified into an attribute is how a whole order row, or an
       entire `decision` blob, reaches a log aggregator in one go. */
    expect(safeAttributes({ order: { usdAmount: "100" }, job: "ok" })).toEqual({ job: "ok" });
    expect(safeAttributes({ when: new Date(), job: "ok" })).toEqual({ job: "ok" });
    expect(safeAttributes({ nothing: null, missing: undefined, job: "ok" })).toEqual({ job: "ok" });
  });

  it("keeps an array of scalars, which OTel accepts as an attribute", () => {
    expect(safeAttributes({ chains: ["base", "arbitrum"] })).toEqual({
      chains: ["base", "arbitrum"],
    });
  });

  it("drops an array holding anything that is not a scalar", () => {
    expect(safeAttributes({ rows: [{ id: 1 }], job: "ok" })).toEqual({ job: "ok" });
  });

  it("is empty for an empty input, and never returns undefined", () => {
    expect(safeAttributes({})).toEqual({});
  });
});

describe("banned", () => {
  it("is exported so a reviewer can check a name without constructing an object", () => {
    expect(banned("wallet_address")).toBe(true);
    expect(banned("job")).toBe(false);
  });

  it("does not catch an ordinary word that merely contains a banned fragment", () => {
    /* `addressable`, `shareholder` and `emailed` would each be caught by a
       naive substring rule, and an over-eager guard that silently drops
       `rows_addressed` teaches people to stop using the helper. */
    expect(banned("rows")).toBe(false);
    expect(banned("quiet")).toBe(false);
    expect(banned("outcome")).toBe(false);
    expect(banned("duration_ms")).toBe(false);
    expect(banned("chain")).toBe(false);
    expect(banned("status_code")).toBe(false);
  });
});
