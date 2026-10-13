import { describe, expect, it } from "vitest";
import catalogJson from "../../../../catalog.json" with { type: "json" };
import { randomSuffix, slugFor } from "../primitives.js";

const curated: readonly string[] = (catalogJson as { strategies: { slug: string }[] }).strategies.map(
  (s) => s.slug,
);

describe("slugFor", () => {
  it("reads as the name somebody typed", () => {
    expect(slugFor("My AI Bet", "7fq2kx9m")).toBe("my-ai-bet-7fq2kx9m");
  });

  it("folds punctuation and runs of spaces into single hyphens", () => {
    expect(slugFor("  NVDA / TSLA  —  50:50!! ", "aaaaaaaa")).toBe("nvda-tsla-5050-aaaaaaaa");
  });

  /*
   * A name of pure emoji is a name somebody will type. Refusing it here would
   * be a validation rule hiding inside a formatter, and the basket still needs
   * an address.
   */
  it("still produces a slug for a name with nothing usable in it", () => {
    expect(slugFor("🚀🚀🚀", "aaaaaaaa")).toBe("basket-aaaaaaaa");
    expect(slugFor("", "aaaaaaaa")).toBe("basket-aaaaaaaa");
    expect(slugFor("---", "aaaaaaaa")).toBe("basket-aaaaaaaa");
  });

  it("caps the stem so a long name cannot make an unwieldy URL", () => {
    const slug = slugFor("a".repeat(200), "aaaaaaaa");
    expect(slug).toBe(`${"a".repeat(40)}-aaaaaaaa`);
  });

  /*
   * The whole reason for the suffix. Slugs share one namespace with the
   * curated catalogue because every basket route resolves `/:slug` through a
   * single lookup, so a custom basket named "Magnificent Seven" must not be
   * able to address the curated one.
   */
  it("never collides with a curated slug, even when the name is one", () => {
    for (const slug of curated) {
      expect(slugFor(slug, randomSuffix())).not.toBe(slug);
      expect(curated).not.toContain(slugFor(slug, randomSuffix()));
    }
  });

  it("is a valid URL segment whatever the name was", () => {
    for (const name of ["My AI Bet", "🚀", "NVDA/TSLA", "a".repeat(200), "Ünïcôdé Çafé"]) {
      expect(slugFor(name, randomSuffix())).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

describe("randomSuffix", () => {
  it("leaves out the characters people misread aloud", () => {
    // 2000 draws over a 32-character alphabet: every character appears, so an
    // absent one is absent by design rather than by luck.
    const seen = new Set(Array.from({ length: 2000 }, () => randomSuffix()).join(""));
    for (const ambiguous of ["i", "l", "o", "u"]) expect(seen.has(ambiguous)).toBe(false);
  });

  it("draws from the whole alphabet rather than a corner of it", () => {
    const seen = new Set(Array.from({ length: 2000 }, () => randomSuffix()).join(""));
    expect(seen.size).toBe(32);
  });

  it("is eight characters, which is what the collision estimate assumed", () => {
    expect(randomSuffix()).toHaveLength(8);
  });
});
