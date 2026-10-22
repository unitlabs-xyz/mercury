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

const call = (t: RpcTransport) =>
  t({ payload: { method: "getSlot", params: [] } } as Parameters<RpcTransport>[0]);

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
