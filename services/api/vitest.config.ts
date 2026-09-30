import { defineConfig } from "vitest/config";

/**
 * Most of this suite runs against PGlite — a real Postgres, compiled to wasm,
 * started fresh per test file. Bringing one up and applying the schema costs
 * a second or two on an idle machine and rather more on a busy one, and that
 * cost lands entirely on the first test in each file.
 *
 * At vitest's default five seconds, those first tests fail whenever the
 * machine is loaded: four of them went red together on a full run and every
 * one passed alone. A timeout that fires on how busy the laptop is measures
 * the laptop, not the code.
 *
 * Twenty seconds is far above what any of these tests need and still well
 * under a wait anyone would sit through, so a genuine hang is still caught.
 */
export default defineConfig({
  test: { testTimeout: 20_000, hookTimeout: 20_000 },
});
