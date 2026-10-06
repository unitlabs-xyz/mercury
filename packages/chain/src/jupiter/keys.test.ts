import { describe, expect, it } from "vitest";
import { JUPITER_PRO, jupiterAccess, jupiterKeyedFetch, parseJupiterKeys } from "./keys.js";

/** Records the `x-api-key` each request went out with. */
const recorder = () => {
  const sent: (string | null)[] = [];
  const inner = (async (_input: string | URL | Request, init?: RequestInit) => {
    sent.push(new Headers(init?.headers).get("x-api-key"));
    return new Response("{}");
  }) as typeof fetch;
  return { sent, inner };
};

describe("parseJupiterKeys", () => {
  it("splits on commas and drops blanks and whitespace", () => {
    expect(parseJupiterKeys(" a, b,,c ,")).toEqual(["a", "b", "c"]);
  });

  it("reads unset or empty as no keys", () => {
    expect(parseJupiterKeys(undefined)).toEqual([]);
    expect(parseJupiterKeys("")).toEqual([]);
  });
});

describe("jupiterKeyedFetch", () => {
  it("hands out the keys in turn, wrapping around", async () => {
    const { sent, inner } = recorder();
    const f = jupiterKeyedFetch(["a", "b", "c"], inner);
    for (let i = 0; i < 5; i++) await f("https://api.jup.ag/price/v3");
    expect(sent).toEqual(["a", "b", "c", "a", "b"]);
  });

  it("keeps the caller's own headers", async () => {
    let seen: Headers | undefined;
    const inner = (async (_i: string | URL | Request, init?: RequestInit) => {
      seen = new Headers(init?.headers);
      return new Response("{}");
    }) as typeof fetch;
    await jupiterKeyedFetch(["k"], inner)("https://api.jup.ag/swap/v1/swap", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(seen?.get("content-type")).toBe("application/json");
    expect(seen?.get("x-api-key")).toBe("k");
  });

  it("refuses an empty key list rather than sending unsigned requests to the paid host", () => {
    expect(() => jupiterKeyedFetch([])).toThrow();
  });
});

describe("jupiterAccess", () => {
  it("leaves the adapters on their keyless default with no keys", () => {
    expect(jupiterAccess([])).toBeUndefined();
  });

  it("points at the paid host with keys", () => {
    expect(jupiterAccess(["k"])?.baseUrl).toBe(JUPITER_PRO);
  });
});
