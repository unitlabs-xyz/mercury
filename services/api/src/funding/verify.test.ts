import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyRelayWebhook } from "./verify.js";

const SECRET = "relay-api-key";
const BODY = JSON.stringify({ event: "request.status.updated" });
const sign = (timestamp: string, body: string, secret = SECRET) =>
  createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

const at = (ms: number) => () => ms;

describe("verifyRelayWebhook", () => {
  const now = 1_792_000_000_000;
  const ts = String(now);

  it("accepts a correctly signed, fresh delivery", () => {
    expect(
      verifyRelayWebhook({
        body: BODY,
        timestamp: ts,
        signature: sign(ts, BODY),
        secret: SECRET,
        now: at(now),
      }),
    ).toEqual({ ok: true });
  });

  it("accepts a signature in upper case hex", () => {
    expect(
      verifyRelayWebhook({
        body: BODY,
        timestamp: ts,
        signature: sign(ts, BODY).toUpperCase(),
        secret: SECRET,
        now: at(now),
      }),
    ).toEqual({ ok: true });
  });

  it("refuses a body that changed after signing", () => {
    expect(
      verifyRelayWebhook({
        body: JSON.stringify({ event: "request.status.updated", status: "success" }),
        timestamp: ts,
        signature: sign(ts, BODY),
        secret: SECRET,
        now: at(now),
      }),
    ).toEqual({ ok: false, code: "bad_signature" });
  });

  it("refuses a signature made with another key", () => {
    expect(
      verifyRelayWebhook({
        body: BODY,
        timestamp: ts,
        signature: sign(ts, BODY, "someone-elses-key"),
        secret: SECRET,
        now: at(now),
      }),
    ).toEqual({ ok: false, code: "bad_signature" });
  });

  it("refuses a timestamp that was not the one signed over", () => {
    /* The timestamp is inside the signed string, so swapping it has to fail —
       otherwise the replay window could be sidestepped by relabelling. */
    expect(
      verifyRelayWebhook({
        body: BODY,
        timestamp: String(now + 1),
        signature: sign(ts, BODY),
        secret: SECRET,
        now: at(now),
      }),
    ).toEqual({ ok: false, code: "bad_signature" });
  });

  it("refuses a replay from outside the window, even with a valid signature", () => {
    const old = String(now - 10 * 60_000);
    expect(
      verifyRelayWebhook({
        body: BODY,
        timestamp: old,
        signature: sign(old, BODY),
        secret: SECRET,
        now: at(now),
      }),
    ).toEqual({ ok: false, code: "stale" });
  });

  it("refuses a timestamp from the future by more than the window", () => {
    const ahead = String(now + 10 * 60_000);
    expect(
      verifyRelayWebhook({
        body: BODY,
        timestamp: ahead,
        signature: sign(ahead, BODY),
        secret: SECRET,
        now: at(now),
      }),
    ).toEqual({ ok: false, code: "stale" });
  });

  it("accepts a delivery at the edge of the window", () => {
    const edge = String(now - 5 * 60_000);
    expect(
      verifyRelayWebhook({
        body: BODY,
        timestamp: edge,
        signature: sign(edge, BODY),
        secret: SECRET,
        now: at(now),
      }),
    ).toEqual({ ok: true });
  });

  it.each([
    ["missing", null],
    ["not a number", "yesterday"],
    ["empty", ""],
  ])("refuses a %s timestamp", (_label, timestamp) => {
    expect(
      verifyRelayWebhook({ body: BODY, timestamp, signature: sign(ts, BODY), secret: SECRET, now: at(now) }),
    ).toEqual({ ok: false, code: "malformed" });
  });

  it("refuses a missing signature without attempting a comparison", () => {
    expect(
      verifyRelayWebhook({ body: BODY, timestamp: ts, signature: null, secret: SECRET, now: at(now) }),
    ).toEqual({ ok: false, code: "malformed" });
  });

  it("refuses a signature of the wrong length rather than throwing", () => {
    expect(
      verifyRelayWebhook({ body: BODY, timestamp: ts, signature: "abcd", secret: SECRET, now: at(now) }),
    ).toEqual({ ok: false, code: "bad_signature" });
  });

  it("refuses a signature that is not hex rather than throwing", () => {
    expect(
      verifyRelayWebhook({
        body: BODY,
        timestamp: ts,
        signature: "z".repeat(64),
        secret: SECRET,
        now: at(now),
      }),
    ).toEqual({ ok: false, code: "bad_signature" });
  });

  it("verifies an empty body, which is still a body", () => {
    expect(
      verifyRelayWebhook({ body: "", timestamp: ts, signature: sign(ts, ""), secret: SECRET, now: at(now) }),
    ).toEqual({ ok: true });
  });
});
