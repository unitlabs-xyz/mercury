import { describe, expect, it } from "vitest";
import type { Notice } from "../notify/ports.js";
import { feedbackRoutes } from "./feedback.js";

const appWith = (ok = true, perHour?: number) => {
  const sent: Notice[] = [];
  const app = feedbackRoutes({
    to: "hello@example.com",
    notifier: { send: async (n) => (sent.push(n), ok) },
    ...(perHour === undefined ? {} : { perHour }),
  });
  const post = (body: unknown) =>
    app.request("/feedback", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
      body: JSON.stringify(body),
    });
  return { sent, post };
};

describe("POST /feedback", () => {
  it("emails the message with screenshots attached and replies to the sender", async () => {
    const { sent, post } = appWith();
    const png = Buffer.from("not really a png").toString("base64");
    const res = await post({
      message: "The chart is blank\non the stock page",
      email: "Ada@Example.com",
      page: "/stocks/AAPL",
      images: [{ name: "a.png", type: "image/png", data: png }],
    });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("hello@example.com");
    expect(sent[0]!.subject).toBe("Feedback: The chart is blank…");
    expect(sent[0]!.replyTo).toBe("ada@example.com");
    expect(sent[0]!.body).toContain("/stocks/AAPL");
    expect(sent[0]!.attachments?.[0]?.filename).toBe("screenshot-1.png");
  });

  it("refuses an empty message and too many images", async () => {
    const { sent, post } = appWith();
    expect((await post({ message: "   " })).status).toBe(400);
    const img = { name: "a", type: "image/png", data: "aGk=" };
    expect((await post({ message: "hi", images: [img, img, img, img] })).status).toBe(400);
    expect((await post({ message: "hi", images: [{ ...img, type: "text/html" }] })).status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it("limits sends per address, and a failed send does not count", async () => {
    const failing = appWith(false, 1);
    expect((await failing.post({ message: "hi" })).status).toBe(502);
    expect((await failing.post({ message: "hi" })).status).toBe(502);

    const { post } = appWith(true, 2);
    expect((await post({ message: "1" })).status).toBe(200);
    expect((await post({ message: "2" })).status).toBe(200);
    expect((await post({ message: "3" })).status).toBe(429);
  });
});
