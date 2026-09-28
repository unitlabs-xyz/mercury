/**
 * Records the fixtures in ./fixtures. Run by hand when an upstream changes shape:
 *
 *   node packages/chain/src/testing/record.ts
 *
 * Never run in CI. The point of a fixture is that it does not move when the
 * market does; the point of recording it is that its shape is real and not
 * something we imagined. Dated in the file it writes.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const JUP = "https://lite-api.jup.ag";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const SPYX = "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W";

const get = async (url: string, headers: Record<string, string> = {}): Promise<unknown> => {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
};

/** Yahoo answers 429 to a request with no User-Agent. Measured 28 September 2026. */
const BROWSER_UA = { "user-agent": "Mozilla/5.0" };

const rpc = async (method: string, params: unknown[]): Promise<unknown> => {
  const res = await fetch(process.env["SOLANA_RPC_URL"] ?? "https://api.mainnet-beta.solana.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`${method} returned ${res.status}`);
  return res.json();
};

const save = async (name: string, body: unknown) => {
  await writeFile(join(OUT, `${name}.json`), `${JSON.stringify(body, null, 2)}\n`);
  console.log(`wrote ${name}.json`);
};

await mkdir(OUT, { recursive: true });

await save("jup-search-xstock", await get(`${JUP}/tokens/v2/search?query=xStock`));
await save(
  "jup-search-ondo",
  await get(`${JUP}/tokens/v2/search?query=${encodeURIComponent("Ondo Tokenized")}`),
);
// Deliberately an ambiguous query: it returns the real NVDAx next to several
// "Nvidia Stonk" impersonators with one holder each. That is the filter's test.
await save("jup-search-impostors", await get(`${JUP}/tokens/v2/search?query=NVDAx`));
await save("jup-price", await get(`${JUP}/price/v3?ids=${NVDAX},${SPYX},${USDC}`));
await save(
  "jup-quote",
  await get(`${JUP}/swap/v1/quote?inputMint=${USDC}&outputMint=${NVDAX}&amount=100000000&slippageBps=50`),
);
await save("pyth-spy", await get("https://hermes.pyth.network/v2/price_feeds?query=SPY&asset_type=equity"));
await save(
  "kamino-reserves",
  await get(
    "https://api.kamino.finance/kamino-market/5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua/reserves/metrics",
  ),
);
await save("rpc-mint-nvda", await rpc("getAccountInfo", [NVDAX, { encoding: "jsonParsed" }]));
await save(
  "yahoo-chart-nvda",
  await get("https://query1.finance.yahoo.com/v8/finance/chart/NVDA?range=1mo&interval=1d", BROWSER_UA),
);
