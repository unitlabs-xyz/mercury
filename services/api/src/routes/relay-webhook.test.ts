import { createHmac } from "node:crypto";
import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { relayWebhookRoutes } from "./relay-webhook.js";

const SECRET = "relay-api-key";

const deliver = (app: Hono, body: string, over: { timestamp?: string; signature?: string } = {}) => {
  const timestamp = over.timestamp ?? String(Date.now());
  const signature =
    over.signature ?? createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex");
  return app.request("/webhooks/relay", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature-timestamp": timestamp,
      "x-signature-sha256": signature,
    },
    body,
  });
};

const payload = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    event: "request.status.updated",
    data: {
      status: "success",
      requestId: "0xregenerated",
      txHashes: ["0xout"],
      depositAddress: { address: "0xdeposit", depositTxHash: "0xin" },
      ...over,
    },
  });

const harness = (advanceResult: unknown = { userId: "user-1", status: "success", outTxHash: "0xout" }) => {
  const advance = vi.fn().mockResolvedValue(advanceResult);
  const app = relayWebhookRoutes({
    store: {
      create: vi.fn(),
      byDepositAddress: vi.fn(),
      advance,
      forUser: vi.fn(),
      byId: vi.fn(),
      settleById: vi.fn(),
    },
    secret: SECRET,
  });
  return { app, advance };
};

describe("relayWebhookRoutes", () => {
  it("advances the deposit on a correctly signed delivery", async () => {
    const { app, advance } = harness();

    const res = await deliver(app, payload());

    expect(res.status).toBe(200);
    expect(advance).toHaveBeenCalledWith(
      "0xdeposit",
      expect.objectContaining({ status: "success", inTxHash: "0xin", outTxHash: "0xout" }),
    );
  });

  it("writes nothing when the signature is wrong", async () => {
    const { app, advance } = harness();

    const res = await deliver(app, payload(), { signature: "00".repeat(32) });

    expect(res.status).toBe(401);
    expect(advance).not.toHaveBeenCalled();
  });

  it("writes nothing when the signature is valid but the timestamp is old", async () => {
    const { app, advance } = harness();

    const res = await deliver(app, payload(), { timestamp: String(Date.now() - 10 * 60_000) });

    expect(res.status).toBe(401);
    expect(advance).not.toHaveBeenCalled();
  });

  it("matches on the deposit address, not on the requestId we minted", async () => {
    const { app, advance } = harness();

    await deliver(app, payload({ requestId: "0xnothing-we-have-ever-seen" }));

    /* Relay regenerates the quote on over- or underpayment and the fill lands
       under a new id, while the one we minted stays waiting forever. */
    expect(advance).toHaveBeenCalledWith("0xdeposit", expect.objectContaining({ status: "success" }));
  });

  it("answers 200 for an address it does not know, so Relay stops retrying", async () => {
    const { app } = harness(null);

    const res = await deliver(app, payload());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: "unknown deposit address" });
  });

  it("verifies the bytes it was sent, not a re-serialised parse of them", async () => {
    const { app, advance } = harness();
    /* Key order reversed and whitespace added: JSON.stringify(JSON.parse(x)) is not x. */
    const raw =
      '{\n  "data": { "depositAddress": { "depositTxHash": "0xin", "address": "0xdeposit" }, "txHashes": ["0xout"], "status": "success" },\n  "event": "request.status.updated"\n}';

    expect((await deliver(app, raw)).status).toBe(200);
    expect(advance).toHaveBeenCalled();
  });

  it("ignores a delivery carrying no deposit address", async () => {
    const { app, advance } = harness();

    const res = await deliver(app, payload({ depositAddress: null }));

    expect(res.status).toBe(200);
    expect(advance).not.toHaveBeenCalled();
  });

  it("ignores a delivery carrying no status", async () => {
    const { app, advance } = harness();

    expect((await deliver(app, payload({ status: undefined }))).status).toBe(200);
    expect(advance).not.toHaveBeenCalled();
  });

  it("does not record Relay's N/A as a failure reason", async () => {
    const { app, advance } = harness();

    await deliver(app, payload({ status: "submitted", failReason: "N/A" }));

    expect(advance.mock.calls[0]![1]).not.toHaveProperty("failReason");
  });

  it("records a real failure reason", async () => {
    const { app, advance } = harness();

    await deliver(app, payload({ status: "refund", failReason: "DOUBLE_SPEND" }));

    expect(advance.mock.calls[0]![1]).toMatchObject({ failReason: "DOUBLE_SPEND" });
  });

  it("refuses a body that is not json, having verified it", async () => {
    const { app, advance } = harness();

    expect((await deliver(app, "not json")).status).toBe(400);
    expect(advance).not.toHaveBeenCalled();
  });

  it("passes no transaction for a waiting heartbeat", async () => {
    const { app, advance } = harness();

    await deliver(
      app,
      payload({ status: "waiting", txHashes: [], depositAddress: { address: "0xdeposit" } }),
    );

    expect(advance.mock.calls[0]![1]).not.toHaveProperty("inTxHash");
    expect(advance.mock.calls[0]![1]).not.toHaveProperty("outTxHash");
  });
});
