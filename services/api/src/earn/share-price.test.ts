import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { sharePriceOn } from "./share-price.js";

const point = (at: string, price: string) => ({ at, apy: D(0.05), tvlUsd: D(1), sharePrice: D(price) });
const api = (points: ReturnType<typeof point>[] | null) => ({ history: async () => points });

describe("sharePriceOn", () => {
  it("takes the last daily reading at or before the moment", async () => {
    const price = await sharePriceOn(
      api([
        point("2026-06-01T00:00:00Z", "1.01"),
        point("2026-06-02T00:00:00Z", "1.02"),
        point("2026-06-03T00:00:00Z", "1.03"),
      ]),
      "Vault",
      new Date("2026-06-02T15:00:00Z"),
    );
    expect(price?.toString()).toBe("1.02");
  });

  it("takes the next day's reading for a moment before the first one it has", async () => {
    const price = await sharePriceOn(
      api([point("2026-06-02T00:00:00Z", "1.02")]),
      "Vault",
      new Date("2026-06-01T09:00:00Z"),
    );
    expect(price?.toString()).toBe("1.02");
  });

  it("says nothing when Kamino has no reading near it, or can't be read", async () => {
    expect(await sharePriceOn(api([]), "Vault", new Date())).toBeNull();
    expect(await sharePriceOn(api(null), "Vault", new Date())).toBeNull();
  });
});
