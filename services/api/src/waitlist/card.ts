import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import satori from "satori";

/** The founding cohort. Past it, a card still has a number, just not "of 500". */
export const FOUNDING_SEATS = 500;

/** X's large-image card ratio (1.91:1), which is also what email clients show well. */
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/** The one line every card carries, the same on all of them. */
export const CARD_LINE = "Money that stays invested and spendable.";

/** Who gets in when: the first hundred, then the rest of the founding 500, then everyone. Shown in the welcome email. */
export function waveFor(position: number): string {
  if (position <= 100) return "First, 1–100";
  if (position <= FOUNDING_SEATS) return `Second, 101–${FOUNDING_SEATS}`;
  return "Public";
}

export interface CardInput {
  /** Their X handle without the @, or null when they gave none. */
  readonly handle: string | null;
  /** Shown only when there is no handle. */
  readonly name: string | null;
  readonly position: number;
  /** A file name in `assets/card/backgrounds`, or null for one chosen by position. */
  readonly background: string | null;
}

/**
 * Where the card's files are.
 *
 * Beside the bundle on Vercel (the build copies them there), and two folders up
 * from this source file everywhere else.
 */
const ASSETS = [new URL("./assets/card/", import.meta.url), new URL("../../assets/card/", import.meta.url)]
  .map((u) => fileURLToPath(u))
  .find((dir) => existsSync(dir));

const asset = (...parts: string[]) => {
  if (ASSETS === undefined) throw new Error("card: assets/card is missing");
  return join(ASSETS, ...parts);
};

const IMAGE = new Set([".jpg", ".jpeg", ".png"]);

/** The backgrounds on disk, in a stable order. */
export async function listBackgrounds(): Promise<readonly string[]> {
  const files = await readdir(asset("backgrounds"));
  return files.filter((f) => IMAGE.has(extname(f).toLowerCase())).sort();
}

/**
 * One at random for a new signup, never the photo the signup before them got,
 * so two people who join back to back never share a card. Kept on their row
 * from then on.
 */
export async function pickBackground(previous: string | null = null, random = Math.random): Promise<string> {
  const all = await listBackgrounds();
  if (all.length === 0) throw new Error("card: no backgrounds in assets/card/backgrounds");
  const others = all.length > 1 ? all.filter((f) => f !== previous) : all;
  return others[Math.floor(random() * others.length)]!;
}

/*
 * Loaded once per process. The WebAssembly sits beside the bundle on Vercel and
 * in node_modules everywhere else, the same arrangement as the assets above.
 */
let ready: Promise<{ fonts: Parameters<typeof satori>[1]["fonts"]; wordmark: string }> | undefined;

const load = () =>
  (ready ??= (async () => {
    const beside = fileURLToPath(new URL("./index_bg.wasm", import.meta.url));
    const wasm = existsSync(beside)
      ? beside
      : createRequire(import.meta.url).resolve("@resvg/resvg-wasm/index_bg.wasm");
    await initWasm(await readFile(wasm));
    const [regular, medium, wordmark] = await Promise.all([
      readFile(asset("fonts", "ABCDiatype-Regular.ttf")),
      readFile(asset("fonts", "ABCDiatype-Medium.ttf")),
      readFile(asset("logo.svg"), "utf8"),
    ]);
    return {
      fonts: [
        { name: "Diatype", data: regular, weight: 400 as const, style: "normal" as const },
        { name: "Diatype", data: medium, weight: 500 as const, style: "normal" as const },
      ],
      wordmark: `data:image/svg+xml;base64,${Buffer.from(wordmark).toString("base64")}`,
    };
  })());

/**
 * The photo for a card: the one it was given, or, when that is unset or has
 * since been removed from the folder, one chosen by position so the same card
 * still always draws the same way.
 */
async function backgroundFor(input: CardInput): Promise<string> {
  let file = input.background;
  if (file === null || !existsSync(asset("backgrounds", file))) {
    const all = await listBackgrounds();
    if (all.length === 0) throw new Error("card: no backgrounds in assets/card/backgrounds");
    file = all[input.position % all.length]!;
  }
  const type = extname(file).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  return `data:${type};base64,${(await readFile(asset("backgrounds", file))).toString("base64")}`;
}

type Style = Record<string, string | number>;
/** Satori has no `inset`; this is the whole card, spelled out. */
const FILL: Style = { position: "absolute", top: 0, left: 0, width: CARD_WIDTH, height: CARD_HEIGHT };
type Node = { type: string; props: { style?: Style; src?: string; children?: Node | Node[] | string } };
const div = (style: Style, children?: Node | Node[] | string): Node => ({
  type: "div",
  props: { style: { display: "flex", ...style }, ...(children === undefined ? {} : { children }) },
});

/**
 * The wordmark for the welcome email: white, on a small dark badge, as a PNG
 * at twice the size it is shown.
 *
 * One image that reads on any background. Mail apps that force a dark mode
 * (Gmail's, on phones) darken the email's colours but never its images, so a
 * dark wordmark disappears there and a white one disappears on white. The
 * badge carries its own background, and email clients will not draw SVG.
 */
let badgePng: Promise<Buffer> | undefined;
export const renderWordmark = () =>
  (badgePng ??= (async () => {
    await load();
    const white = await readFile(asset("wordmark.svg"), "utf8");
    const inner = white.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="145" height="44" viewBox="0 0 145 44">
<rect width="145" height="44" rx="12" fill="#141614"/>
<svg x="14" y="10" width="117" height="24" viewBox="0 0 117 24">${inner}</svg>
</svg>`;
    return Buffer.from(new Resvg(svg, { fitTo: { mode: "height", value: 88 } }).render().asPng());
  })());

/**
 * The card, as a PNG.
 *
 * One template; only the handle, the number and the photo change. Layout is
 * deliberately plain for now, to be replaced once the design lands.
 */
export async function renderCard(input: CardInput): Promise<Buffer> {
  const { fonts, wordmark } = await load();
  const background = await backgroundFor(input);
  const who = input.handle ? `@${input.handle}` : (input.name ?? "");
  const founding = input.position <= FOUNDING_SEATS;

  // Positions from the design (cardcollayoutref.svg), placed by baseline. Every
  // text box has a line height of 1, which puts Diatype's baseline 0.85 of the
  // size below the box's top; `top` below is that baseline less 0.85 × size.
  const text = (size: number, color: string, style: Style = {}) => ({
    fontSize: size,
    fontWeight: 500,
    lineHeight: 1,
    letterSpacing: "-0.02em",
    color,
    ...style,
  });
  const at = (left: number, baseline: number, size: number): Style => ({
    position: "absolute",
    left,
    top: Math.round((baseline - 0.85 * size) * 10) / 10,
  });

  const tree = div(
    {
      position: "relative",
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      fontFamily: "Diatype",
    },
    [
      {
        type: "img",
        props: { src: background, style: { ...FILL, objectFit: "cover" } },
      },
      // A soft shade under the text, so the brighter photos still read.
      div({
        ...FILL,
        backgroundImage:
          "linear-gradient(90deg, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.12) 45%, rgba(0,0,0,0) 75%)",
      }),
      {
        type: "img",
        props: { src: wordmark, style: { position: "absolute", left: 64, top: 64, width: 180, height: 40 } },
      },
      div({ ...at(64, 215.4, 24), ...text(24, "#D4D4D4") }, founding ? "Early access" : "On the list"),
      // The number, and "/ 500" beside it on a slightly higher baseline.
      div({ ...at(60, 346, 134), alignItems: "flex-end" }, [
        div(text(134, "#FCFCFF"), `#${input.position}`),
        ...(founding
          ? [div(text(40, "#D4D4D4", { marginLeft: 16, marginBottom: 19.5 }), `/ ${FOUNDING_SEATS}`)]
          : []),
      ]),
      ...(who
        ? [div({ ...at(64, 405, 36), ...text(36, "#FCFCFF", { letterSpacing: "-0.01em" }) }, who)]
        : []),
      div({ ...at(64, 559, 24), ...text(24, "#D4D4D4", { maxWidth: 820 }) }, CARD_LINE),
      div(
        {
          ...text(20, "#D4D4D4"),
          position: "absolute",
          right: 64,
          top: Math.round((559 - 0.85 * 20) * 10) / 10,
        },
        "trymercury.xyz",
      ),
    ],
  );

  const svg = await satori(tree as Parameters<typeof satori>[0], {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts,
  });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: "width", value: CARD_WIDTH } }).render().asPng());
}
