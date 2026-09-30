import { describe, expect, it } from "vitest";
import { LABEL } from "./ValueChart";

/**
 * The labels are formatted in the reader's own timezone, so these assert their
 * shape rather than their text — the exact hour depends on where the test runs,
 * and pinning it would only prove which machine ran it.
 */
const AT = new Date("2026-09-19T14:00:00.000Z");

describe("LABEL", () => {
  it("names an hour and a minute over a day", () => {
    expect(LABEL["1D"](AT)).toMatch(/^\d{2}:\d{2} [AP]M$/);
  });

  it("puts a comma in the week's label, which is what the axis splits on", () => {
    // DotChart's axis prints everything before the comma, so a label without
    // one would put the hour on the day axis of every 1W chart.
    expect(LABEL["1W"](AT)).toContain(",");
    expect(LABEL["1W"](AT).split(",")[0]).toMatch(/\d/);
  });

  it("names a day and a month over a month, with no hour to crowd the axis", () => {
    expect(LABEL["1M"](AT)).toMatch(/^\d{1,2} [A-Z][a-z]{2}$/);
  });

  it("gives each range its own reading of one instant", () => {
    const all = [LABEL["1D"](AT), LABEL["1W"](AT), LABEL["1M"](AT)];
    expect(new Set(all).size).toBe(3);
  });
});
