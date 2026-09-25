/**
 * Rasterise every icon the site ships from `public/favicon.svg`, so the mark
 * only ever has to be updated in one place.  `bun run icons`
 */
import sharp from "sharp";

const src = await Bun.file("public/favicon.svg").arrayBuffer();
const sizes = [
  ["favicon-32.png", 32],
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
] as const;

for (const [name, size] of sizes) {
  // density scales the vector before rasterising: the source viewBox is 26px,
  // so rendering straight to 512 without it would upscale a 26px bitmap.
  await sharp(Buffer.from(src), { density: Math.ceil((size / 26) * 72) })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(`public/${name}`);
  console.log(`${name.padEnd(22)} ${size}×${size}`);
}
