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
  it("reads the portfolio's all-time money-weighted return", async () => {
    const client = new GliderClient("test-key", async (input) => {
      const url = new URL((input as Request).url);
      expect(url.pathname).toBe("/v2/portfolios/p-1/performance");
      expect(url.searchParams.get("returnMethod")).toBe("MWR");
      return json({
        success: true,
        data: {
          portfolioId: "p-1",
          meta: { method: "MWR" },
          summary: { windows: [{ window: "all", percentChange: "2.5" }] },
        },
      });
    });
    expect(await client.portfolioReturn("p-1")).toBe("2.5");
  });
  it("paginates the authenticated owner's portfolios without requiring a strategy filter", async () => {
    const owner = "solana:owner";
    const queries: URLSearchParams[] = [];
    const client = new GliderClient("test-key", async (input) => {
      const url = new URL((input as Request).url);
      queries.push(url.searchParams);
      const second = url.searchParams.get("cursor") === "next-page";
      return json({
        success: true,
        data: {
          portfolios: [
            {
              portfolioId: second ? "p-2" : "p-1",
              ownerAccountId: owner,
              strategyId: second ? "s-2" : "s-1",
              smartAccounts: [],
            },
          ],
        },
        nextCursor: second ? null : "next-page",
      });
    });
    expect((await client.portfoliosForOwner(owner)).map((item) => item.portfolioId)).toEqual(["p-1", "p-2"]);
    expect(queries).toHaveLength(2);
    expect(queries[0]?.get("ownerAccountId")).toBe(owner);
    expect(queries[0]?.has("strategyId")).toBe(false);
    expect(queries[1]?.get("cursor")).toBe("next-page");
  });

  it("submits a manual rebalance without a body and preserves the cooldown", async () => {
    const requests: Request[] = [];
    const client = new GliderClient("test-key", async (input) => {
      const request = input as Request;
      requests.push(request);
      return requests.length === 1
        ? json({ success: true, data: { operationId: "op-1", submittedAt: "2026-10-06T00:00:00Z" } }, 202)
        : new Response(JSON.stringify({ error: { code: "cooldown", message: "Too soon" } }), {
            status: 429,
            headers: { "retry-after": "30" },
          });
    });
    expect(await client.triggerRebalance("p-1")).toMatchObject({ operationId: "op-1" });
    expect(requests[0]?.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/portfolios/p-1/rebalance");
    expect(await requests[0]!.text()).toBe("");
    await expect(client.triggerRebalance("p-1")).rejects.toMatchObject({ retryAfterSeconds: 30 });
  });
  it.each([
    { mode: "in_kind", submission: "withdraw" },
    { mode: "liquidate_usdc", submission: "liquidate_all" },
    { mode: "liquidate_usdc", submission: "withdraw" },
  ] as const)(
    "uses Glider's $submission submission for $mode without changing signed terms",
    async ({ mode, submission }) => {
      const recipientAccountId = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:Owner";
      const assetId =
        "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
      const message = {
        portfolioId: "p-1",
        recipientAccountId,
        assets: [{ assetId, amountRaw: "1000000" }],
        nonce: `0x${"a".repeat(64)}`,
        expiresAt: 9999999999,
        ...(mode === "liquidate_usdc" ? { liquidate: true, settlementAssetId: assetId } : {}),
      };
      const calls: { path: string; body: unknown }[] = [];
      const client = new GliderClient("test-key", async (input) => {
        const request = input as Request;
        const path = new URL(request.url).pathname;
        calls.push({ path, body: JSON.parse(await request.text()) });
        return path.endsWith("/signature")
          ? json({
              success: true,
              data: {
                authorizationId: message.nonce,
                expiresAt: "2286-11-20T17:46:39Z",
                authorization: { kind: "solana-message", text: "Sign exact exit", message },
              },
            })
          : json({ success: true, data: { operationId: "op-1", submittedAt: "2026-10-06T00:00:00Z" } }, 202);
      });
      const prepared = await client.prepareExit("p-1", mode, recipientAccountId, message.assets, submission);
      expect(prepared.message).toEqual(message);
      expect(
        await client.submitExit("p-1", mode, prepared.message, "base58-signature", submission),
      ).toMatchObject({ operationId: "op-1" });
      expect(calls.map((call) => call.path)).toEqual(
        submission === "withdraw"
          ? ["/v2/portfolios/p-1/withdraw/signature", "/v2/portfolios/p-1/withdraw"]
          : ["/v2/portfolios/p-1/liquidate-all/signature", "/v2/portfolios/p-1/liquidate-all"],
      );
      expect(calls[0]?.body).toEqual(
        submission === "withdraw"
          ? {
              recipientAccountId,
              assets: message.assets,
              liquidate: mode === "liquidate_usdc",
              ...(mode === "liquidate_usdc" ? { settlementAssetId: assetId } : {}),
            }
          : { recipientAccountId, settlementAssetId: assetId },
      );
      expect(calls[1]?.body).toEqual({ message, signature: "base58-signature" });
    },
  );
  it("reads live portfolio balances, schedule, warnings, and operation state", async () => {
    const fetcher: typeof fetch = async (input) => {
      const path = new URL((input as Request).url).pathname;
      if (path.endsWith("/positions"))
        return json({
          success: true,
          data: {
            portfolioId: "p-1",
            totalValueUsd: "50.000000",
            inTransit: { totalUsd: "0", items: [] },
            fetchedAt: "2026-10-06T00:00:00Z",
            smartAccounts: [],
            assets: [
              {
                assetId: NVDA_ID,
                smartAccountId: "solana:account",
                symbol: "NVDA",
                decimals: 6,
                balance: "1",
                balanceRaw: "1000000",
                priceUsd: "50",
                valueUsd: "50",
              },
            ],
            warnings: [{ kind: "MISSING_PRICE", message: "another asset has no price" }],
          },
        });
      if (path.endsWith("/operations/op-1"))
        return json({
          success: true,
          data: {
            operationId: "op-1",
            portfolioId: "p-1",
            kind: "rebalance",
            state: "running",
            createdAt: "2026-10-06T00:00:00Z",
            updatedAt: "2026-10-06T00:00:01Z",
            finishedAt: null,
            error: null,
          },
        });
      return json({
        success: true,
        data: {
          portfolioId: "p-1",
          ownerAccountId: "solana:owner",
          strategyId: "remote-1",
          smartAccounts: [],
          schedule: {
            status: "active",
            frequency: "daily",
            intervalMs: 86_400_000,
            nextDueAt: "2026-10-07T00:00:00Z",
            lastRebalanceAt: null,
          },
        },
      });
    };
    const client = new GliderClient("test-key", fetcher);
    expect((await client.portfolio("p-1")).schedule?.nextDueAt).toBe("2026-10-07T00:00:00Z");
    expect(await client.positions("p-1")).toMatchObject({
      totalValueUsd: "50.000000",
      inTransitUsd: "0",
      assets: [{ balanceRaw: "1000000" }],
      warnings: [{ kind: "MISSING_PRICE" }],
    });
    expect(await client.operation("p-1", "op-1")).toMatchObject({ kind: "rebalance", state: "running" });
  });
  it("enrolls a Solana owner with the stage-one transaction and its exact flow", async () => {
    const calls: { path: string; body: unknown }[] = [];
    const fetcher: typeof fetch = async (input) => {
      const request = input as Request;
      const path = new URL(request.url).pathname;
      const body = request.method === "POST" ? JSON.parse(await request.text()) : null;
      calls.push({ path, body });
      if (path.endsWith("/enroll/signature"))
        return json({
          success: true,
          data: {
            flowId: "flow-1",
            accountIndex: "0",
            agentAccountId: "solana:agent",
            message: { kind: "solana-message", text: "Sign me" },
            solanaTransaction: "unsigned-base64",
          },
        });
      return json({
        success: true,
        data: {
          portfolioId: "portfolio-1",
          strategyId: "strategy-1",
          portfolioName: null,
          smartAccounts: [{ accountId: "solana:deposit", depositAccountId: "solana:deposit" }],
        },
      });
    };
    const client = new GliderClient("test-key", fetcher);
    const owner = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:owner";
    const challenge = await client.prepareEnrollment(owner, "strategy-1");
    expect(challenge.solanaTransaction).toBe("unsigned-base64");
    expect(await client.enroll(owner, "strategy-1", challenge, "signed-base64", "Magnificent Seven")).toEqual(
      {
        portfolioId: "portfolio-1",
        ownerAccountId: owner,
        strategyId: "strategy-1",
        smartAccounts: [{ accountId: "solana:deposit", depositAccountId: "solana:deposit" }],
      },
    );
    expect(calls).toEqual([
      {
        path: "/v2/enroll/signature",
        body: {
          ownerAccountId: owner,
          strategyId: "strategy-1",
          chainIds: [1399811149],
          accountType: "ECDSA",
        },
      },
      {
        path: "/v2/enroll",
        body: {
          ownerAccountId: owner,
          strategyId: "strategy-1",
          chainIds: [1399811149],
          accountType: "ECDSA",
          flowId: "flow-1",
          accountIndex: "0",
          agentAccountId: "solana:agent",
          signedSolanaTransaction: "signed-base64",
          portfolioName: "Magnificent Seven",
        },
      },
    ]);
  });
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
