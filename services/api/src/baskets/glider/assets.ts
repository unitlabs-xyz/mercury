import { z } from "zod";
import type { BasketAssetSource } from "../core/deps.js";
import type { BasketAsset } from "../core/primitives.js";

/**
 * The list of assets a basket may hold, read from Glider.
 *
 * Glider publishes no such list in its documented API: v2 classifies assets
 * you already hold, and the `assetTaxonomy` namespace its docs once described
 * no longer answers. It exists in exactly one place — the tRPC route its own
 * front end browses with, which is public and unauthenticated but unversioned
 * and undocumented.
 *
 * So this adapter is deliberately the only thing that knows about it. Behind
 * the port it is just a list; the day Glider documents a real endpoint, or
 * breaks this one, nothing outside this file has an opinion.
 */
const BROWSE = "https://api.glider.fi/v1/trpc/assets.browseStocksForSelection";

/** Glider's own id for Solana. Not CAIP: this endpoint is its own dialect. */
const SOLANA_CHAIN_ID = "1399811149";

/** The endpoint refuses more, with `too_big`. Nineteen pages for the whole list. */
const PAGE = 24;

/** Pages to read before giving up on a cursor that will not settle. */
const MAX_PAGES = 60;

const entry = z.object({
  metadata: z.object({
    address: z.string().min(32),
    name: z.string().min(1),
    symbol: z.string().min(1),
    decimals: z.number().int().nonnegative(),
    info: z.object({ imageSmallUrl: z.string().url().optional() }).partial().optional(),
  }),
  taxonomy: z.object({
    primaryExposure: z.object({ reference: z.string().nullish() }).nullish(),
  }),
});

const page = z.object({
  result: z.object({
    data: z.object({
      json: z.object({
        items: z.array(z.unknown()),
        nextCursor: z.number().int().nullish(),
      }),
    }),
  }),
});

const url = (cursor: number | null): string => {
  const json: Record<string, unknown> = {
    exposureCategory: "equity",
    issuerSlug: "ondo",
    search: null,
    chainId: SOLANA_CHAIN_ID,
    limit: PAGE,
    direction: "forward",
  };
  if (cursor !== null) json["cursor"] = cursor;
  return `${BROWSE}?input=${encodeURIComponent(JSON.stringify({ json, meta: { values: { search: ["undefined"] }, v: 1 } }))}`;
};

/**
 * One page's assets, and how many of its entries could not be used.
 *
 * A record we cannot read costs that asset rather than the page. Ondo's own
 * treasury products arrive this way — USDY and OUSG are tagged `equity` with
 * an empty exposure slug, so they carry no ticker and are no use to a picker
 * keyed on one. Counted rather than silently dropped, so the day Glider fixes
 * the data is visible in a log.
 */
export const assetsIn = (items: readonly unknown[]): { assets: BasketAsset[]; skipped: number } => {
  const assets: BasketAsset[] = [];
  let skipped = 0;
  for (const raw of items) {
    const parsed = entry.safeParse(raw);
    const ticker = parsed.success ? parsed.data.taxonomy.primaryExposure?.reference : undefined;
    if (!parsed.success || !ticker) {
      skipped += 1;
      continue;
    }
    const { address, name, symbol, decimals, info } = parsed.data.metadata;
    assets.push({ mint: address, ticker, name, symbol, decimals, logoUrl: info?.imageSmallUrl ?? null });
  }
  return { assets, skipped };
};

export class GliderAssets implements BasketAssetSource {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async list(): Promise<readonly BasketAsset[]> {
    const assets: BasketAsset[] = [];
    let skipped = 0;
    let cursor: number | null = null;
    for (let read = 0; read < MAX_PAGES; read++) {
      const response = await this.fetcher(url(cursor));
      if (!response.ok) throw new Error(`glider browse: ${response.status}`);
      const body = page.parse(await response.json()).result.data.json;
      const batch = assetsIn(body.items);
      assets.push(...batch.assets);
      skipped += batch.skipped;
      if (body.nextCursor === null || body.nextCursor === undefined) break;
      cursor = body.nextCursor;
    }
    // Diagnostics, not domain: the port promises assets, not a tally of what
    // Glider got wrong. Logged here so a change upstream is still noticed.
    if (skipped > 0) console.warn(`glider assets: ${skipped} entries carried no ticker`);
    return assets;
  }
}
