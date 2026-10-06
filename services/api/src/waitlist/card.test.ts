import { describe, expect, it } from "vitest";
import { CARD_HEIGHT, CARD_WIDTH, listBackgrounds, pickBackground, renderCard } from "./card.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Width and height, from the IHDR chunk every PNG starts with. */
const size = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)];

describe("the founding card", () => {
  it("draws a PNG at X's large-card size, from the real fonts and photos", async () => {
    const png = await renderCard({ handle: "ada", name: null, position: 186, background: null });
    expect(png.subarray(0, 8)).toEqual(PNG);
    expect(size(png)).toEqual([CARD_WIDTH, CARD_HEIGHT]);
  });

  it("still draws when its photo has been removed from the folder", async () => {
    const png = await renderCard({ handle: null, name: "Ada", position: 612, background: "gone.jpg" });
    expect(png.subarray(0, 8)).toEqual(PNG);
  });

  it("has at least one background to choose from", async () => {
    expect((await listBackgrounds()).length).toBeGreaterThan(0);
  });
});

describe("choosing a photo", () => {
  it("never gives a signup the photo the one before them got", async () => {
    const all = await listBackgrounds();
    for (const previous of all) {
      for (const r of [0, 0.5, 0.999]) {
        expect(await pickBackground(previous, () => r)).not.toBe(previous);
      }
    }
  });
});
