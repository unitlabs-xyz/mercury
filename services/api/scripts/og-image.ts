/**
 * The web app's share image (og:image), drawn the way the waitlist cards are:
 * one of the card photos, Diatype, the white wordmark. 1200 × 630.
 *
 *   pnpm --filter @mercury/api og-image   # → apps/web/public/og-mercury-beta.png
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import satori from "satori";

const W = 1200;
const H = 630;
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const asset = (p: string) => here(`../assets/card/${p}`);
const OUT = here("../../../apps/web/public/og-mercury-beta.png");

await initWasm(await readFile(createRequire(import.meta.url).resolve("@resvg/resvg-wasm/index_bg.wasm")));
const [regular, medium, logo, photo] = await Promise.all([
  readFile(asset("fonts/ABCDiatype-Regular.ttf")),
  readFile(asset("fonts/ABCDiatype-Medium.ttf")),
  readFile(asset("logo.svg"), "utf8"),
  readFile(asset("backgrounds/card-05.jpg")),
]);
const uri = (type: string, data: Buffer | string) => `data:${type};base64,${Buffer.from(data).toString("base64")}`;

type Style = Record<string, string | number>;
type Node = { type: string; props: { style?: Style; src?: string; children?: Node | Node[] | string } };
const div = (style: Style, children?: Node | Node[] | string): Node => ({
  type: "div",
  props: { style: { display: "flex", ...style }, ...(children === undefined ? {} : { children }) },
});
const FILL: Style = { position: "absolute", top: 0, left: 0, width: W, height: H };

const tree = div({ position: "relative", width: W, height: H, fontFamily: "Diatype", color: "#FCFCFF" }, [
  { type: "img", props: { src: uri("image/jpeg", photo), style: { ...FILL, objectFit: "cover" } } },
  // Darker toward the lower left, where the line sits, so it reads on any part of the photo.
  div({ ...FILL, backgroundImage: "linear-gradient(20deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.32) 45%, rgba(0,0,0,0.08) 100%)" }),
  { type: "img", props: { src: uri("image/svg+xml", logo), style: { position: "absolute", left: 64, top: 64, width: 180, height: 40 } } },
  // "Live in beta", top right.
  div(
    {
      position: "absolute",
      right: 64,
      top: 66,
      alignItems: "center",
      padding: "10px 18px",
      borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.14)",
      border: "1px solid rgba(255,255,255,0.22)",
      fontSize: 22,
      fontWeight: 500,
      letterSpacing: "-0.01em",
    },
    [div({ width: 10, height: 10, borderRadius: 10, backgroundColor: "#6EE7A8", marginRight: 10 }), div({}, "Live in beta")],
  ),
  // Set from the top, line by line: satori misplaces wrapped text anchored to the bottom.
  div({ position: "absolute", left: 64, top: 368, fontSize: 64, fontWeight: 500, lineHeight: 1, letterSpacing: "-0.035em" }, "Buy stocks, borrow against"),
  div({ position: "absolute", left: 64, top: 440, fontSize: 64, fontWeight: 500, lineHeight: 1, letterSpacing: "-0.035em" }, "them, and spend."),
  div({ position: "absolute", left: 64, top: 530, fontSize: 30, fontWeight: 400, lineHeight: 1, letterSpacing: "-0.02em", color: "#D4D4D4" }, "Without ever selling. On Solana."),
  div({ position: "absolute", right: 64, top: 536, fontSize: 22, fontWeight: 500, color: "#D4D4D4", letterSpacing: "-0.01em" }, "beta.trymercury.xyz"),
]);

const svg = await satori(tree as never, {
  width: W,
  height: H,
  fonts: [
    { name: "Diatype", data: regular, weight: 400, style: "normal" },
    { name: "Diatype", data: medium, weight: 500, style: "normal" },
  ],
});
await writeFile(OUT, Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng()));
console.log(`og image → ${OUT}`);
