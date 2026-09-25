/**
 * Keys the plate out of the QR export.
 *
 * The source is white modules on a near-black plate. Masking it by its own
 * luminance in CSS leaves the plate at ~9% alpha — rgb(23,24,28) is not black —
 * which reads as a grey square on a light card. So the alpha is baked here
 * instead, with a levels curve: everything under the black point goes fully
 * transparent, everything over the white point stays fully opaque, and the
 * ramp between keeps the module edges antialiased.
 *
 * Every pixel is forced to white, so nothing tints: the centre of these exports
 * carries a blue badge that is not ours, and it must not fringe past the mark
 * we lay over it.
 *
 * Run: bun run qr
 */
import sharp from "sharp";

const ASSETS = ["QRCode.png", "BackedWhiteLogo.png", "OndoWhiteLogo.png"];
const DIR = "src/assets/brand/";

const BLACK = 40; // at or under this luminance: fully transparent
const WHITE = 230; // at or over this luminance: fully opaque

for (const name of ASSETS) {
  const src = DIR + name;
  const out = DIR + name.replace(/\.png$/, "-keyed.png");

  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const keyed = Buffer.alloc(info.width * info.height * 4);

  let peak = 0;
  for (let i = 0, o = 0; i < data.length; i += info.channels, o += 4) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if (lum > peak) peak = lum;
    const t = Math.min(1, Math.max(0, (lum - BLACK) / (WHITE - BLACK)));
    keyed[o] = keyed[o + 1] = keyed[o + 2] = 255;
    keyed[o + 3] = Math.round(t * (data[i + 3] / 255) * 255);
  }

  await sharp(keyed, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(out);

  const check = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const a = (x: number, y: number) => check.data[(y * info.width + x) * 4 + 3];
  let opaque = 0;
  for (let i = 3; i < check.data.length; i += 4) if (check.data[i] > 250) opaque++;

  console.log(
    `${name.padEnd(22)} ${(info.width + "x" + info.height).padEnd(8)}` +
      ` plate=${a(0, 0)} top-mid=${a(info.width >> 1, 0)}` +
      `  brightest source=${peak.toFixed(0)}  fully-opaque px=${opaque}`,
  );
}
