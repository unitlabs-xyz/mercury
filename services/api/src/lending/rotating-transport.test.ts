import { describe, expect, it } from "vitest";
import type { RpcTransport } from "@solana/kit";
import { rotation } from "@mercury/chain";
import { rotatingTransport } from "./rpc.js";

const A = "https://a.example";
const B = "https://b.example";

/** The error Kit's HTTP transport throws for a refused request. */
const refused = (statusCode: number) =>
  Object.assign(new Error(`HTTP ${statusCode}`), { context: { statusCode } });

/** A transport per URL that throws what is scripted for it, then answers. */
const transports = (script: Record<string, (Error | "ok")[]>) => {
  const asked: string[] = [];
  const make =
    (url: string): RpcTransport =>
    async <T>() => {
      asked.push(url);
      const next = script[url]?.shift() ?? "ok";
      if (next !== "ok") throw next;
      return { jsonrpc: "2.0", id: 0, result: url } as T;
    };
  return { asked, make };
};

const call = (t: RpcTransport, method = "getSlot") =>
  t({ payload: { method, params: [] } } as Parameters<RpcTransport>[0]);

describe("rotatingTransport", () => {
  it("sends a refused request straight on to the next URL, and rests the one that refused", async () => {
    const t = transports({ [A]: [refused(429)] });
    const r = rotation([A, B]);
    const transport = rotatingTransport(r, t.make);
    expect(await call(transport)).toMatchObject({ result: B });
    expect(await call(transport)).toMatchObject({ result: B });
    expect(t.asked).toEqual([A, B, B]);
  });

  it("rotates past a dropped connection too", async () => {
    const t = transports({ [A]: [new TypeError("fetch failed")] });
    expect(await call(rotatingTransport(rotation([A, B]), t.make))).toMatchObject({ result: B });
  });

  it("hands back an error that is not a refusal at once", async () => {
    const t = transports({ [A]: [new Error("invalid params")] });
    await expect(call(rotatingTransport(rotation([A, B]), t.make))).rejects.toThrow("invalid params");
    expect(t.asked).toEqual([A]);
  });

  /* Thrown as a 429, so the retry wrapped around this backs off as it does for one endpoint. */
  it("answers as rate limited, and records the strain, when every URL refuses", async () => {
    const t = transports({ [A]: [refused(429)], [B]: [refused(503)] });
    const r = rotation([A, B], { now: () => 7 });
    const error = await call(rotatingTransport(r, t.make)).catch((e: unknown) => e);
    expect((error as { context?: { statusCode?: number } }).context?.statusCode).toBe(503);
    expect(r.strainedAt).toBe(7);
    const resting = await call(rotatingTransport(r, t.make)).catch((e: unknown) => e);
    expect((resting as { context?: { statusCode?: number } }).context?.statusCode).toBe(429);
  });
});

describe("rotatingTransport, method by method", () => {
  it("rests an endpoint for the method it refused, and keeps it for the others", async () => {
    const asked: [string, string][] = [];
    const make =
      (url: string): RpcTransport =>
      async <T>(config: Parameters<RpcTransport>[0]) => {
        const method = (config.payload as { method: string }).method;
        asked.push([url, method]);
        if (url === A && method === "getTokenAccountsByOwner") throw refused(403);
        return { jsonrpc: "2.0", id: 0, result: url } as T;
      };
    const t = rotatingTransport(rotation([A, B]), make);
    await call(t, "getTokenAccountsByOwner");
    await call(t, "getTokenAccountsByOwner");
    await call(t, "getSlot");
    expect(asked).toEqual([
      [A, "getTokenAccountsByOwner"],
      [B, "getTokenAccountsByOwner"],
      [B, "getTokenAccountsByOwner"],
      [A, "getSlot"],
    ]);
  });

  /* Pocket answers getTokenAccountsByOwner with a 200 and "Method not found". */
  it("treats a refusal inside a 200 as one", async () => {
    const make =
      (url: string): RpcTransport =>
      async <T>() =>
        (url === A
          ? { jsonrpc: "2.0", id: 0, error: { code: -32601, message: "Method not found" } }
          : { jsonrpc: "2.0", id: 0, result: url }) as T;
    expect(await call(rotatingTransport(rotation([A, B]), make), "getTokenAccountsByOwner")).toMatchObject({
      result: B,
    });
  });

  it("passes back a call's own error, such as a bad parameter", async () => {
    const own = { jsonrpc: "2.0", id: 0, error: { code: -32602, message: "Invalid param: WrongSize" } };
    const make =
      (): RpcTransport =>
      async <T>() =>
        own as T;
    expect(await call(rotatingTransport(rotation([A, B]), make))).toEqual(own);
  });
});

describe("rotatingTransport, paced", () => {
  it("waits its turn before every request it sends", async () => {
    let waits = 0;
    const r = rotation([A, B]);
    const paced = { ...r, wait: async () => void (waits += 1) } as typeof r;
    const t = transports({ [A]: [refused(429)] });
    await call(rotatingTransport(paced, t.make));
    expect(waits).toBe(2);
  });
});

describe("rotatingTransport, with a fallback", () => {
  it("sends what every endpoint refuses to the fallback", async () => {
    const P = "https://paid.example";
    const t = transports({ [A]: [refused(429)], [B]: [refused(429)] });
    const r = rotation([A, B], { fallback: P });
    expect(await call(rotatingTransport(r, t.make))).toMatchObject({ result: P });
    expect(r.strainedAt).toBe(0);
  });
});
