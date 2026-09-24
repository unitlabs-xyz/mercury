import { describe, expect, it } from "vitest";
import { fails, fakeFetch } from "./fake-fetch.js";

describe("fakeFetch", () => {
  it("answers a url that contains a registered pattern", async () => {
    const f = fakeFetch({ "/price/v3": { hello: "world" } });
    const res = await f("https://lite-api.jup.ag/price/v3?ids=abc");
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ hello: "world" });
  });

  it("names the url it could not answer, so a wrong request is obvious", async () => {
    const f = fakeFetch({ "/price/v3": {} });
    await expect(f("https://lite-api.jup.ag/tokens/v2/search?query=x")).rejects.toThrow("/tokens/v2/search");
  });

  it("serves a failure when one is registered", async () => {
    const f = fakeFetch({ "/price/v3": fails(503) });
    const res = await f("https://lite-api.jup.ag/price/v3");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
  });

  it("accepts a URL object and a Request, because adapters build both", async () => {
    const f = fakeFetch({ "/quote": { outAmount: "1" } });
    expect((await f(new URL("https://lite-api.jup.ag/swap/v1/quote?a=1"))).ok).toBe(true);
    expect((await f(new Request("https://lite-api.jup.ag/swap/v1/quote"))).ok).toBe(true);
  });
});

import { jupSearchImpostors, jupSearchXStock, rpcMintNvda, NVDAX_MINT } from "./fixtures.js";

describe("fixtures", () => {
  it("has a verified xStocks universe to build a registry from", () => {
    const verified = jupSearchXStock.filter((t) => t.isVerified === true);
    expect(verified.length).toBeGreaterThanOrEqual(15);
    expect(verified.every((t) => (t.tags ?? []).includes("xstocks"))).toBe(true);
  });

  it("has impersonators, or Task 2's filter is untested", () => {
    const impostors = jupSearchImpostors.filter((t) => t.isVerified !== true);
    expect(impostors.length).toBeGreaterThan(0);
    expect(impostors.some((t) => t.symbol === "NVDAx")).toBe(true);
  });

  it("has a mint carrying both Token-2022 extensions we read", () => {
    const info = rpcMintNvda.result.value.data.parsed.info;
    const names = info.extensions.map((e) => e.extension);
    expect(names).toContain("scaledUiAmountConfig");
    expect(names).toContain("pausableConfig");
    expect(rpcMintNvda.result.value.owner).toBe("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
    expect(NVDAX_MINT).toBe("Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh");
  });
});
