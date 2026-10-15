import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { acceptableId, requestId } from "./request-id.js";

const appWith = () => {
  const app = new Hono();
  app.use("*", requestId());
  app.get("/x", (c) => c.json({ id: c.get("requestId") }));
  return app;
};

describe("requestId", () => {
  it("puts the same id on the context and on the response", async () => {
    /* The whole point: one value somebody can read off a failed response and
       hand over, which finds the trace, the log lines and the queries — three
       stores that otherwise share no key. */
    const res = await appWith().request("/x");
    const body = (await res.json()) as { id: string };

    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("x-request-id")).toBe(body.id);
  });

  it("keeps an id a proxy already set, so one request is one id end to end", async () => {
    const res = await appWith().request("/x", { headers: { "x-request-id": "abc-123_XYZ" } });

    expect(res.headers.get("x-request-id")).toBe("abc-123_XYZ");
  });

  it("refuses one that is merely too long", async () => {
    /* Eight kilobytes echoed back on every response is a free amplifier. */
    const res = await appWith().request("/x", { headers: { "x-request-id": "a".repeat(200) } });

    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("refuses one that is too short to be anything", async () => {
    const res = await appWith().request("/x", { headers: { "x-request-id": "a" } });

    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each(["../../etc/passwd", "a b", "a;b", 'a"b', "a<b>", "ä".repeat(20)])(
    "refuses %s, because the alphabet is the check",
    async (given) => {
      const res = await appWith().request("/x", { headers: { "x-request-id": given } });

      expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    },
  );

  it("gives each request its own id", async () => {
    const app = appWith();

    const first = (await (await app.request("/x")).json()) as { id: string };
    const second = (await (await app.request("/x")).json()) as { id: string };

    expect(first.id).not.toBe(second.id);
  });

  it("uses the generator it was given, so a caller can make ids predictable", async () => {
    const app = new Hono();
    app.use(
      "*",
      requestId(() => "fixed-0000-0000"),
    );
    app.get("/x", (c) => c.json({ id: c.get("requestId") }));

    expect((await app.request("/x")).headers.get("x-request-id")).toBe("fixed-0000-0000");
  });
});

describe("acceptableId", () => {
  /*
   * Tested directly, because the case that matters cannot be expressed through
   * a request. Node's HTTP layer rejects a header value containing a newline
   * before any handler runs, and `fetch`'s `Headers` will not construct one —
   * the integration test that tried threw inside `Headers.append` rather than
   * reaching the middleware at all.
   *
   * So this is the second line of defence, asserted where it can be: a
   * different server adapter, a proxy that rewrites headers, or a caller that
   * sets the value from somewhere other than a parsed request would all arrive
   * here, and the value is echoed into a header and into log lines either way.
   */
  it.each([
    ["a newline, which would forge a log entry", "abc12345\ndef: forged"],
    ["a carriage return", "abc12345\r\nx: y"],
    ["a header separator", "abc12345: value"],
    ["a space", "abc 12345"],
    ["a quote", 'abc"12345'],
    ["a semicolon", "abc;12345"],
    ["a path traversal", "../../etc/passwd"],
    ["a non-ASCII letter", "ä".repeat(20)],
    ["too long to echo on every response", "a".repeat(200)],
    ["too short to be meant", "a"],
    ["nothing at all", ""],
  ])("refuses %s", (_why, given) => {
    expect(acceptableId(given)).toBe(false);
  });

  it("refuses an absent header, which is the ordinary case", () => {
    expect(acceptableId(undefined)).toBe(false);
  });

  it.each(["abc-123_XYZ", "0123456789abcdef", "a".repeat(64), "01234567"])("accepts %s", (given) => {
    expect(acceptableId(given)).toBe(true);
  });
});
