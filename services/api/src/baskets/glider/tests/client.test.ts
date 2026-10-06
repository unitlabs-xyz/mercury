import { describe, expect, it } from "vitest";
import { GliderClient } from "../client.js";

const NVDA_ID = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:gEGtLTPNQ7jcg25zTetkbmF7teoDLcrfTnQfmn2ondo";
const remote = {
  strategyId: "remote-1",
  name: "Mercury Solana - Nvidia",
  description: "One Ondo token.",
  allocation: { assets: [{ assetId: NVDA_ID, weight: "100.00" }] },
  schedule: { type: "interval", frequency: "daily" },
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("GliderClient", () => {
  it("requests a weighted Solana allocation breakdown and resolves the inherited swap fee", async () => {
    const calls: { path: string; body: unknown }[] = [];
    const fetcher: typeof fetch = async (input) => {
      const request = input as Request;
      const path = new URL(request.url).pathname;
      calls.push({ path, body: request.method === "POST" ? JSON.parse(await request.text()) : null });
      if (path.endsWith("allocation-breakdown"))
        return json({
          success: true,
          data: {
            breakdowns: [
              {
                dimension: "sector",
                buckets: [{ key: "technology", label: "Technology", weight: "1", holdingCount: 1 }],
              },
            ],
            diagnostics: { unresolved: [], unsupported: [], unclassified: [], lowConfidence: [] },
          },
        });
      return json({ success: true, data: { swapBps: path.includes("/strategies/") ? null : 50 } });
    };
    const client = new GliderClient("test-key", fetcher);

    expect(await client.allocationBreakdown([{ assetId: NVDA_ID, weightBps: 10_000 }])).toEqual({
      sectors: [{ label: "Technology", weightPercent: "100", holdingCount: 1 }],
      themes: [],
      unclassifiedCount: 0,
      lowConfidenceCount: 0,
    });
    expect(await client.effectiveSwapFeeBps("remote-1")).toBe(50);
    expect(calls).toEqual([
      {
        path: "/v2/assets/allocation-breakdown",
        body: {
          dimensions: ["sector", "gliderTheme"],
          multiCategoryMode: "primary",
          holdings: [{ caipAssetId: NVDA_ID, weight: "100.00" }],
        },
      },
      { path: "/v2/strategies/remote-1/fees", body: null },
      { path: "/v2/tenant/fees", body: null },
    ]);
  });
  it("reads modeled performance for our Solana strategy", async () => {
    const fetcher: typeof fetch = async () =>
      json({
        success: true,
        data: {
          strategyId: "remote-1",
          meta: { method: "TWR", asOf: "2026-10-05T16:16:11.358Z" },
          points: [{ date: "2025-10-05", percentChange: "0.0000" }],
          summary: { windows: [{ window: "12m", percentChange: "18.1627", since: "2025-10-05" }] },
        },
      });

    expect(await new GliderClient("test-key", fetcher).strategyPerformance("remote-1")).toEqual({
      asOf: "2026-10-05T16:16:11.358Z",
      points: [{ date: "2025-10-05", percentChange: "0.0000" }],
      windows: [{ window: "12m", percentChange: "18.1627", since: "2025-10-05" }],
    });
  });

  it("accepts decimal provider weights despite binary floating-point multiplication", async () => {
    const fetcher: typeof fetch = async () =>
      json({
        success: true,
        data: { strategies: [{ ...remote, allocation: { assets: [{ assetId: NVDA_ID, weight: "8.30" }] } }] },
        nextCursor: null,
      });
    const [basket] = await new GliderClient("test-key", fetcher).list();
    expect(basket?.assets).toEqual([{ assetId: NVDA_ID, weightBps: 830 }]);
  });

  it("lists every page and converts provider percentages to basis points", async () => {
    const paths: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL((input as Request).url);
      paths.push(url.pathname + url.search);
      return url.searchParams.has("cursor")
        ? json({ success: true, data: { strategies: [remote] }, nextCursor: null })
        : json({ success: true, data: { strategies: [] }, nextCursor: "page-two" });
    };

    expect(await new GliderClient("test-key", fetcher).list()).toEqual([
      {
        id: "remote-1",
        name: remote.name,
        description: remote.description,
        assets: [{ assetId: NVDA_ID, weightBps: 10_000 }],
        schedule: remote.schedule,
      },
    ]);
    expect(paths).toEqual(["/v2/strategies?limit=200", "/v2/strategies?limit=200&cursor=page-two"]);
  });

  it("validates and creates with percent strings, then reads back the provider record", async () => {
    const calls: { path: string; body: unknown }[] = [];
    const fetcher: typeof fetch = async (input) => {
      const request = input as Request;
      const path = new URL(request.url).pathname;
      const body = request.method === "POST" ? JSON.parse(await request.text()) : null;
      calls.push({ path, body });
      if (path.endsWith("/validate")) return json({ success: true, data: { valid: true } });
      if (request.method === "POST") return json({ success: true, data: { strategyId: "remote-1" } }, 201);
      return json({ success: true, data: remote });
    };
    const client = new GliderClient("test-key", fetcher);
    const definition = {
      slug: "nvidia",
      name: remote.name,
      description: remote.description,
      assets: [{ assetId: NVDA_ID, weightBps: 10_000 }],
      schedule: { type: "interval" as const, frequency: "daily" as const },
    };

    await client.validate(definition);
    expect(await client.create(definition)).toBe("remote-1");
    expect(await client.get("remote-1")).toEqual(
      expect.objectContaining({ id: "remote-1", assets: definition.assets }),
    );
    expect(calls).toEqual([
      {
        path: "/v2/strategies/validate",
        body: {
          name: remote.name,
          description: remote.description,
          allocation: { assets: [{ assetId: NVDA_ID, weight: "100.00" }] },
          schedule: remote.schedule,
          isPublic: false,
        },
      },
      {
        path: "/v2/strategies",
        body: {
          name: remote.name,
          description: remote.description,
          allocation: { assets: [{ assetId: NVDA_ID, weight: "100.00" }] },
          schedule: remote.schedule,
          isPublic: false,
        },
      },
      { path: "/v2/strategies/remote-1", body: null },
    ]);
  });

  it("preserves a Glider rejection without exposing the API key", async () => {
    const client = new GliderClient("secret-test-key", async () =>
      json({ success: false, error: { code: "API_104", message: "Cron schedules are not enabled" } }, 403),
    );
    await expect(client.get("remote-1")).rejects.toThrow(
      "Glider strategy request failed: 403 /v2/strategies/remote-1 API_104: Cron schedules are not enabled",
    );
  });
});
