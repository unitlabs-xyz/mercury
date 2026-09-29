import { describe, expect, it } from "vitest";
import { QUIET, qrPath } from "./Receive.js";

const ADDRESS = "6Yg9nNQEqCQBMcYHLrrfj6qGjcR6hvhdhHQZPjtDqLRT";

/** Is that module dark, going by the path the component draws? */
const dark = (d: string, col: number, row: number) => d.includes(`M${col + QUIET} ${row + QUIET}h1v1h-1z`);

describe("qrPath", () => {
  it("encodes a Solana address at the version its length needs", () => {
    const path = qrPath(ADDRESS)!;
    // 44 base58 characters in byte mode, error correction Q: 33 modules.
    expect(path.extent).toBe(33 + QUIET * 2);
    expect(path.d.length).toBeGreaterThan(0);
  });

  /*
   * The three finder patterns are the first thing a scanner looks for, and
   * they are fixed by the spec: a 7x7 ring, dark all the way round its border,
   * light one module inside, dark again in the middle 3x3. The block this
   * replaced drew shapes that looked like these and encoded nothing, so
   * checking them is checking the one thing that failed before.
   */
  it.each([
    ["top left", 0, 0],
    ["top right", 33 - 7, 0],
    ["bottom left", 0, 33 - 7],
  ])("puts a real finder pattern at %s", (_where, x, y) => {
    const { d } = qrPath(ADDRESS)!;
    for (let i = 0; i < 7; i++) {
      expect(dark(d, x + i, y)).toBe(true); // top edge
      expect(dark(d, x + i, y + 6)).toBe(true); // bottom edge
      expect(dark(d, x, y + i)).toBe(true); // left edge
      expect(dark(d, x + 6, y + i)).toBe(true); // right edge
    }
    expect(dark(d, x + 1, y + 1)).toBe(false); // the light ring inside it
    expect(dark(d, x + 3, y + 3)).toBe(true); // the solid centre
  });

  it("leaves the quiet zone clear, without which a scanner may never find the code", () => {
    const { d, extent } = qrPath(ADDRESS)!;
    for (let i = 0; i < extent; i++) {
      // Negative indices land in the margin the offset creates.
      expect(dark(d, i - QUIET, -1)).toBe(false);
      expect(dark(d, -1, i - QUIET)).toBe(false);
    }
  });

  it("encodes the address it was given, not some other one", () => {
    const a = qrPath(ADDRESS)!;
    const b = qrPath("94FtPuzn21uWScToB5znUdGh5T75Hnea2Qy9fqxEtUGb")!;
    expect(a.d).not.toBe(b.d);
    // Same input, same code, every time: a wallet scanning twice gets one answer.
    expect(qrPath(ADDRESS)!.d).toBe(a.d);
  });

  it("draws nothing at all when there is no address yet", () => {
    expect(qrPath("")).toBeNull();
  });
});
