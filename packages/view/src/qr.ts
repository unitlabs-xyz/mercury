import qrcode from "qrcode-generator";

/**
 * Four clear modules on every side. Part of the code, not padding around it:
 * without them a scanner may not find the code at all.
 */
export const QUIET = 4;

/**
 * An address as one SVG path of dark modules, offset by its quiet zone.
 *
 * Shared so the browser and the phone draw the same code from the same
 * encoder: a QR code that renders beautifully and decodes to nothing looks
 * exactly like one that works. Error correction Q recovers a quarter of the
 * code, and for a Solana address that is the same 33 modules as level M.
 */
export const qrPath = (value: string): { d: string; extent: number } | null => {
  if (value.length === 0) return null;
  const qr = qrcode(0, "Q");
  qr.addData(value, "Byte");
  qr.make();
  const count = qr.getModuleCount();
  let d = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) d += `M${col + QUIET} ${row + QUIET}h1v1h-1z`;
    }
  }
  return { d, extent: count + QUIET * 2 };
};
