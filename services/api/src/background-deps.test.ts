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

  /* Solana Vibe Station and Pocket refuse batches; each call goes on its own. */
  it("sends each call on its own rather than batched", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { id: number };
      bodies.push(body);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { value: [] } }));
    });
    const config = readConfig({ ...base, SOLANA_PUBLIC_RPC_URLS: "https://one.example" });
    await backgroundDeps(buildDeps(config), config).deps.chain.tokenBalances("WaLLeT");
    expect(bodies).toHaveLength(2);
    expect(bodies.some(Array.isArray)).toBe(false);
  });

  /* Solana Vibe Station keeps only recent history; a signature cursor older than that fails there. */
  it("never asks Solana Vibe Station for history", async () => {
    const asked: [string, string][] = [];
    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { id: number; method: string };
      asked.push([new URL(String(input)).host, body.method]);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: [] }));
    });
    const config = readConfig(base);
    const jobs = backgroundDeps(buildDeps(config), config);
    for (let i = 0; i < 4; i++) await jobs.deps.history.signatures("WaLLeT", { limit: 5 });
    expect(asked.filter(([, m]) => m === "getSignaturesForAddress").map(([h]) => h)).toEqual(
      Array(4).fill("api.mainnet-beta.solana.com"),
    );
  });

  it("falls back to the paid endpoint for what every public one refuses", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      asked.push(String(input));
      const body = JSON.parse(String(init?.body)) as { id: number };
      return String(input) === "https://paid.example"
        ? new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { value: [] } }))
        : new Response(null, { status: 429 });
    });
    const config = readConfig({ ...base, SOLANA_PUBLIC_RPC_URLS: "https://one.example" });
    const jobs = backgroundDeps(buildDeps(config), config);
    await jobs.deps.chain.tokenBalances("WaLLeT");
    expect(asked).toContain("https://paid.example");
    expect(jobs.lane?.strainedAt).toBe(0);
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
