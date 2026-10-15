import { describe, expect, it } from "vitest";
import browse from "./fixtures/browse-stocks.json" with { type: "json" };
import { GliderAssets, assetsIn } from "../assets.js";

const items = browse.result.data.json.items as readonly unknown[];

describe("assetsIn", () => {
  it("reads a ticker, a mint and a logo off Glider's shape", () => {
    const { assets } = assetsIn(items);
    const nvda = assets.find((a) => a.ticker === "NVDA");
    expect(nvda).toMatchObject({
      mint: "gEGtLTPNQ7jcg25zTetkbmF7teoDLcrfTnQfmn2ondo",
      ticker: "NVDA",
      symbol: "NVDAon",
      decimals: 9,
    });
    expect(nvda?.logoUrl).toContain("https://");
  });

  /*
   * Ondo's treasury products come back tagged `equity` with an empty exposure
   * slug, so they carry no ticker. A picker keyed on one cannot show them, and
   * inventing a ticker would put "equity-" in front of somebody.
   */
  it("skips an asset with no ticker rather than inventing one", () => {
    const { assets, skipped } = assetsIn(items);
    expect(skipped).toBe(2);
    expect(assets.map((a) => a.symbol)).not.toContain("USDY");
    expect(assets.every((a) => a.ticker.length > 0)).toBe(true);
  });

  it("drops one malformed entry without losing the page", () => {
    const { assets, skipped } = assetsIn([...items, { metadata: { address: "x" } }]);
    expect(skipped).toBe(3);
    expect(assets.length).toBe(assetsIn(items).assets.length);
  });
});

describe("GliderAssets", () => {
  const paged = (cursors: readonly (number | null)[]) => {
    const asked: string[] = [];
    const fetcher = ((input: Parameters<typeof fetch>[0]) => {
      const nextCursor = cursors[asked.length] ?? null;
      asked.push(String(input));
      return Promise.resolve(
        new Response(JSON.stringify({ result: { data: { json: { items, nextCursor } } } }), {
          headers: { "content-type": "application/json" },
        }),
      );
    }) as typeof fetch;
    return { fetcher, asked };
  };

  it("follows the cursor until the list runs out", async () => {
    const { fetcher, asked } = paged([24, 48, null]);
    const assets = await new GliderAssets(fetcher).list();
    expect(asked.length).toBe(3);
    expect(assets.length).toBe(assetsIn(items).assets.length * 3);
    // The cursor is carried, not just the first page asked for again.
    expect(asked[1]).toContain(encodeURIComponent('"cursor":24'));
  });

  it("asks only for Ondo equities on Solana, a page at a time", async () => {
    const { fetcher, asked } = paged([null]);
    await new GliderAssets(fetcher).list();
    const query = decodeURIComponent(asked[0]!);
    expect(query).toContain('"issuerSlug":"ondo"');
    expect(query).toContain('"chainId":"1399811149"');
    expect(query).toContain('"exposureCategory":"equity"');
    // 24 is the ceiling; the endpoint rejects more with `too_big`.
    expect(query).toContain('"limit":24');
  });

  it("throws on a refusal rather than reporting an empty catalogue", async () => {
    const fetcher = (() => Promise.resolve(new Response("nope", { status: 503 }))) as typeof fetch;
    await expect(new GliderAssets(fetcher).list()).rejects.toThrow("503");
  });
});
