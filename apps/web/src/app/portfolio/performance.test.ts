import { expect, it } from "vitest";
import { performancePercent } from "./Summary";

it("keeps a zero-balance account finite without inventing a return from zero", () => {
  expect(performancePercent(0, 0)).toBe(0);
  expect(performancePercent(100, 0)).toBeNull();
});
