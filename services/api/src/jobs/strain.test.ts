import { describe, expect, it, vi } from "vitest";
import { inPass, laneRefusedWithin, noteStrain, type Pass } from "./strain.js";

describe("noteStrain", () => {
  it("marks only the pass whose call was refused", async () => {
    const refused: Pass = { strained: false };
    const clean: Pass = { strained: false };
    await Promise.all([inPass(refused, async () => noteStrain()), inPass(clean, async () => undefined)]);
    expect(refused.strained).toBe(true);
    expect(clean.strained).toBe(false);
  });

  it("says the jobs' lane was refused lately, for a reader that must give way to it", async () => {
    await inPass({ strained: false }, async () => noteStrain());
    const at = Date.now();
    expect(laneRefusedWithin(60_000, at)).toBe(true);
    expect(laneRefusedWithin(60_000, at + 61_000)).toBe(false);
  });

  it("notes nothing outside a pass, where a route's own refusal is not the jobs' lane", async () => {
    vi.resetModules();
    const fresh = await import("./strain.js");
    fresh.noteStrain();
    expect(fresh.laneRefusedWithin(60_000)).toBe(false);
  });
});
