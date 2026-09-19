import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { buildDeps } from "./deps.js";

const app = createApp(buildDeps({} as NodeJS.ProcessEnv));

const post = (path: string, body: unknown) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** Responses are validated by the SDK in real clients. Tests read them loosely on purpose. */
const json = async <T,>(res: Response | Promise<Response>): Promise<T> => (await (await res).json()) as T;

interface WireCandidate { symbol: string; viable: boolean; rejection: string | null; pricePerShare: string | null }
interface WireDecision {
  kind: string; reason?: string; best: WireCandidate; candidates: WireCandidate[]; fairPricePerShare: string;
}

describe("api", () => {
  it("reports the market as shut on the fixture Saturday", async () => {
    const body = await json<{ isOpen: boolean; isWeekend: boolean }>(app.request("/v1/market/status"));
    expect(body.isOpen).toBe(false);
    expect(body.isWeekend).toBe(true);
  });

  it("returns a decision that picks Backed over Ondo for Nvidia", async () => {
    const res = await post("/v1/orders", { ticker: "NVDA", side: "buy", amount: "1000" });
    expect(res.status).toBe(200);
    const { decision } = await json<{ decision: WireDecision }>(res);
    expect(decision.best.symbol).toBe("NVDAx");
    const ondo = decision.candidates.find((c) => c.symbol === "NVDAon");
    expect(ondo?.viable).toBe(false);
    expect(ondo?.rejection).toBe("impact_too_high");
  });

  it("serialises money as strings, never numbers", async () => {
    const { decision } = await json<{ decision: WireDecision }>(post("/v1/orders", { ticker: "SPY", side: "buy", amount: "1000" }));
    expect(typeof decision.fairPricePerShare).toBe("string");
    expect(typeof decision.best.pricePerShare).toBe("string");
  });

  it("rejects an order below the minimum", async () => {
    const { decision } = await json<{ decision: WireDecision }>(post("/v1/orders", { ticker: "NVDA", side: "buy", amount: "2" }));
    expect(decision.kind).toBe("refuse");
    expect(decision.reason).toBe("below_minimum");
  });

  it("previews every leg of the Core US basket", async () => {
    const body = await json<{ legs: { usdAmount: string }[]; refusedLegs: string[] }>(
      post("/v1/baskets/core-us/preview", { usdAmount: "250", acceptQueued: false }),
    );
    expect(body.legs.map((l) => l.usdAmount)).toEqual(["175", "75"]);
    expect(body.refusedLegs).toEqual([]);
  });

  it("validates its input", async () => {
    expect((await post("/v1/orders", { ticker: "nvda", side: "buy" })).status).toBe(400);
  });
});
