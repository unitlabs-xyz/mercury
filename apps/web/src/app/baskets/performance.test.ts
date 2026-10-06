import { expect, it } from "vitest";
import { modeledSeries } from "./performance";

it("rebases cumulative modeled returns to the selected window", () => {
  expect(
    modeledSeries(
      [
        { date: "2026-09-01", percentChange: "10" },
        { date: "2026-10-01", percentChange: "21" },
      ],
      "2026-09-01",
    ),
  ).toEqual([
    { label: "Sep 1", value: 0 },
    { label: "Oct 1", value: 10 },
  ]);
});
