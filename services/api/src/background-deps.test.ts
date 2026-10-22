import { afterEach, describe, expect, it, vi } from "vitest";
import { backgroundDeps, buildDeps, readConfig } from "./deps.js";

const base = {
  DATABASE_URL: "postgresql://localhost/test",
  PRIVY_APP_ID: "app",
  SOLANA_RPC_URL: "https://paid.example",
};

afterEach(() => vi.unstubAllGlobals());

describe("backgroundDeps", () => {
  /* The jobs read every wallet on a clock. On the paid plan a deploy had them refused every call. */
  it("reads the chain over the public endpoints in turn, never the paid one", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      asked.push(String(input));
      const body = JSON.parse(String(init?.body)) as { id: number } | { id: number }[];
      const answer = (id: number) => ({ jsonrpc: "2.0", id, result: { value: [] } });
      return new Response(
        JSON.stringify(Array.isArray(body) ? body.map((b) => answer(b.id)) : answer(body.id)),
        {
          headers: { "content-type": "application/json" },
        },
      );
    });
    const config = readConfig({ ...base, SOLANA_PUBLIC_RPC_URLS: "https://one.example,https://two.example" });
    const deps = buildDeps(config);
    const jobs = backgroundDeps(deps, config);
    await jobs.deps.chain.tokenBalances("WaLLeT");
    await jobs.deps.chain.tokenBalances("WaLLeT");
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((url) => url === "https://one.example" || url === "https://two.example")).toBe(true);
    expect(new Set(asked)).toEqual(new Set(["https://one.example", "https://two.example"]));
    expect(jobs.lane?.urls).toEqual(["https://one.example", "https://two.example"]);
  });

  it("rebuilds only what reads the chain, and shares the rest", () => {
    const config = readConfig(base);
    const deps = buildDeps(config);
    const jobs = backgroundDeps(deps, config).deps;
    expect(jobs.chain).not.toBe(deps.chain);
    expect(jobs.history).toBe(jobs.chain);
    expect(jobs.lending).not.toBe(deps.lending);
    expect(jobs.earn).not.toBe(deps.earn);
    expect(jobs.earn.api).toBe(deps.earn.api);
    expect(jobs.prices).toBe(deps.prices);
    expect(jobs.registry).toBe(deps.registry);
  });

  it("leaves the jobs on the paid endpoint when the list is set empty", () => {
    const config = readConfig({ ...base, SOLANA_PUBLIC_RPC_URLS: "" });
    const deps = buildDeps(config);
    expect(backgroundDeps(deps, config)).toEqual({ deps, lane: null });
  });
});
