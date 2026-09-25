/**
 * Prepares the logo strip art from the exports in src/assets/brand.
 *
 * Two problems with the raw exports: most ship an opaque white plate, and they
 * are 22-33px tall while the strip renders them at 30 on a 2x screen. So:
 *
 *   1. flood-fill the white plate away from the borders inward, which keeps any
 *      white *inside* a mark (the counters in the xStocks X) and leaves gradient
 *      marks alone,
 *   2. trim, upscale with Lanczos, restore the edges with an unsharp mask, and
 *      land at 90px tall — 3x the display size.
 *
 * Run with: bun run logos
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const NAMES = ["Backed", "Ondo", "xStocks", "Solana", "Privy", "Jupiter"];
const DIR = "src/assets/brand";
const PLATE = 236; // luminance at or above this, on the border, is backdrop
const DISPLAY_HEIGHT = 90;

const dekey = async (file: string) => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const px = (x: number, y: number) => (y * width + x) * 4;
  const lum = (i: number) => 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;

  const seen = new Uint8Array(width * height);
  const queue: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const n = y * width + x;
    if (seen[n]) return;
    seen[n] = 1;
    const i = n * 4;
    if (data[i + 3]! === 0 || lum(i) >= PLATE) queue.push(n);
  };

  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }

  while (queue.length) {
    const n = queue.pop()!;
    data[n * 4 + 3] = 0;
    const x = n % width;
    const y = (n / width) | 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }

  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
};

for (const name of NAMES) {
  const src = `${DIR}/${name}.png`;
  const before = await sharp(src).metadata();
  const flat = await dekey(src);
  // No trim: the export's box is what the design lays out against, so cropping to
  // the ink would rescale each mark by a different amount.
  // Never scale up. An export at or below 3x is left at its own resolution — any
  // resample would only cost detail — and anything taller is brought down to 3x,
  // which stays crisp. Every pixel the export has, the page gets.
  let pipe = sharp(flat);
  const downsampling = before.height! > DISPLAY_HEIGHT;
  if (downsampling) {
    pipe = pipe
      .resize({ height: DISPLAY_HEIGHT, kernel: "lanczos3" })
      // Just enough to counter the softening a downsample introduces.
      .sharpen({ sigma: 0.6, m1: 0.5, m2: 1.4 });
  }
  const out = await pipe.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
  writeFileSync(`${DIR}/${name}@3x.png`, out.data);
  console.log(
    `${name.padEnd(9)} ${before.width}x${before.height} -> ${out.info.width}x${out.info.height}` +
      `  ${(out.data.length / 1024).toFixed(1)}KB  ` +
      `${(out.info.height / 30).toFixed(1)}x the display size, ${downsampling ? "downsampled" : "untouched"}`,
  );
}
