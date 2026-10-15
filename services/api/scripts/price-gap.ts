/**
 * The "same stock, two tokens" post, with today's numbers.
 *
 *   pnpm --filter @mercury/api price-gap            # Apple, $100 and $1,000
 *   pnpm --filter @mercury/api price-gap NVDA 250   # any ticker, any size
 *
 * Reads the stock and its tokens from the live API, asks Jupiter what the
 * buy would cost through each token (a quote, nothing is traded), then prints
 * the post and saves the image to ~/Downloads/mercury-price-gap-<ticker>.png.
 */
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import satori from "satori";

const API = process.env["MERCURY_API"] ?? "https://mercury-dev.thecircleco.xyz";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const ticker = (process.argv[2] ?? "AAPL").toUpperCase();
const small = Number(process.argv[3] ?? 100);
const large = small * 10;

interface Wrapper {
  mint: string;
  symbol: string;
  decimals: number;
  multiplier: string;
}

const money = (n: number) =>
  `$${n.toLocaleString("en-US", Number.isInteger(n) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Dollars per share for a buy of `usd` through one token, or null with no route. */
async function pricePerShare(w: Wrapper, usd: number): Promise<number | null> {
  const url = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${USDC}&outputMint=${w.mint}&amount=${Math.round(usd * 1e6)}&slippageBps=50`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const q = (await res.json()) as { outAmount?: string };
  if (!q.outAmount) return null;
  const shares = (Number(q.outAmount) / 10 ** w.decimals) * Number(w.multiplier);
  return shares > 0 ? usd / shares : null;
}

const res = await fetch(`${API}/v1/instruments/${ticker}`);
if (!res.ok) throw new Error(`${ticker}: the API answered ${res.status}`);
const { instrument } = (await res.json()) as {
  instrument: { name: string; pricePerShare: string; wrappers: Wrapper[] };
};
if (instrument.wrappers.length < 2) throw new Error(`${ticker} has only one token; nothing to compare.`);

const rows = await Promise.all(
  instrument.wrappers.map(async (w) => ({
    w,
    small: await pricePerShare(w, small),
    large: await pricePerShare(w, large),
  })),
);
const priced = rows.filter((r) => r.small !== null).sort((a, b) => a.small! - b.small!);
if (priced.length < 2) throw new Error(`Only one of ${ticker}'s tokens has a route right now.`);
const [best, worst] = [priced[0]!, priced[priced.length - 1]!];
const pct = ((worst.small! / best.small! - 1) * 100).toFixed(1);
const largeRatio = worst.large && best.large ? worst.large / best.large : null;
const largeLine =
  largeRatio === null
    ? `At ${money(large)}, the second one can't fill the order at all.`
    : largeRatio >= 2
      ? `At ${money(large)}, the second one charges ${largeRatio.toFixed(0)}× the real price.`
      : `At ${money(large)}, the gap grows to ${((largeRatio - 1) * 100).toFixed(0)}%.`;

const post = [
  `Same ${instrument.name} share. Two tokens.`,
  "",
  `${money(small)} buys it at ${money(best.small!)} from one, ${money(worst.small!)} from the other.`,
  largeLine,
  "",
  "Mercury checks every token on every buy and picks the right one.",
].join("\n");

// The image: the buy, then the two tokens, the cheaper one ticked.
const assets = new URL("../assets/brand/", import.meta.url);
const require = createRequire(import.meta.url);
await initWasm(await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm")));
const [regular, medium, logo] = await Promise.all([
  readFile(new URL("fonts/ABCDiatype-Regular.ttf", assets)),
  readFile(new URL("fonts/ABCDiatype-Medium.ttf", assets)),
  readFile(new URL("logo.svg", assets), "utf8"),
]);
type Node = { type: string; props: Record<string, unknown> };
const div = (style: Record<string, unknown>, children?: unknown): Node => ({
  type: "div",
  props: { style: { display: "flex", ...style }, children },
});
const row = (r: (typeof priced)[number], picked: boolean) =>
  div(
    {
      justifyContent: "space-between",
      alignItems: "center",
      padding: "28px 34px",
      borderRadius: 22,
      border: picked ? "3px solid #8fc496" : "3px solid rgba(243,243,243,0.14)",
      background: picked ? "rgba(143,196,150,0.12)" : "transparent",
      color: picked ? "#fcfcff" : "rgba(243,243,243,0.6)",
    },
    [
      div({ fontSize: 40 }, r.w.symbol),
      div({ flexDirection: "column", alignItems: "flex-end" }, [
        div({ fontSize: 40 }, `${money(r.small!)} a share`),
        div(
          { fontSize: 22, color: picked ? "#8fc496" : "rgba(243,243,243,0.5)", marginTop: 6 },
          picked ? "Better price, picked" : `${pct}% more for the same share`,
        ),
      ]),
    ],
  );
const tree = div(
  {
    width: 1600,
    height: 900,
    padding: 80,
    flexDirection: "column",
    fontFamily: "Diatype",
    fontWeight: 500,
    letterSpacing: "-0.02em",
    color: "#f3f3f3",
    backgroundImage: "radial-gradient(circle at 0% 0%, #20301f 0%, #141614 60%)",
  },
  [
    {
      type: "img",
      props: {
        src: `data:image/svg+xml;base64,${Buffer.from(logo).toString("base64")}`,
        width: 180,
        height: 40,
      },
    },
    div({ fontSize: 64, marginTop: 64 }, `Buy ${money(small)} of ${instrument.name}`),
    div({ flexDirection: "column", marginTop: "auto", gap: 22 }, [row(best, true), row(worst, false)]),
    div({ justifyContent: "space-between", marginTop: 36, fontSize: 24, color: "#d4d4d4" }, [
      div({}, `Live quotes, ${new Date().toUTCString().slice(5, 16)}`),
      div({}, "trymercury.xyz"),
    ]),
  ],
);
const svg = await satori(tree as Parameters<typeof satori>[0], {
  width: 1600,
  height: 900,
  fonts: [
    { name: "Diatype", data: regular, weight: 400, style: "normal" },
    { name: "Diatype", data: medium, weight: 500, style: "normal" },
  ],
});
const out = join(homedir(), "Downloads", `mercury-price-gap-${ticker.toLowerCase()}.png`);
await writeFile(out, new Resvg(svg, { fitTo: { mode: "width", value: 1600 } }).render().asPng());

console.log(`\n${post}\n`);
console.log(`Image: ${out}`);
console.log(
  `Reference price ${money(Number(instrument.pricePerShare))}; ${best.w.symbol} cheapest at ${money(small)}.`,
);
