import { describe, expect, it } from "vitest";
import { inMemoryBuilds } from "./builds.js";

const bytes = (...n: number[]) => Uint8Array.from(n);

describe("inMemoryBuilds", () => {
  it("recognises a message it composed", () => {
    const builds = inMemoryBuilds();
    builds.remember(bytes(1, 2, 3));
    expect(builds.recognises(bytes(1, 2, 3))).toBe(true);
  });

  it("does not recognise one it never saw", () => {
    const builds = inMemoryBuilds();
    builds.remember(bytes(1, 2, 3));
    expect(builds.recognises(bytes(9, 9, 9))).toBe(false);
  });

  /*
   * The property the charge rests on. Dropping the transfer, lowering its
   * amount or redirecting it all change the message, and none of them survive
   * this — which is why the relayer needs no decoder to be safe.
   */
  it("refuses a message altered by a single byte", () => {
    const builds = inMemoryBuilds();
    builds.remember(bytes(1, 2, 3, 4));
    expect(builds.recognises(bytes(1, 2, 3, 5))).toBe(false);
    expect(builds.recognises(bytes(1, 2, 3))).toBe(false);
    expect(builds.recognises(bytes(1, 2, 3, 4, 0))).toBe(false);
  });

  it("forgets a build once its blockhash would be long dead", () => {
    let clock = 1_000;
    const builds = inMemoryBuilds({ ttlMs: 60_000, now: () => clock });
    builds.remember(bytes(7));
    clock += 59_000;
    expect(builds.recognises(bytes(7))).toBe(true);
    clock += 2_000;
    expect(builds.recognises(bytes(7))).toBe(false);
  });

  /* Unbounded growth would be a slow leak in a long-running process. */
  it("drops expired builds rather than holding them forever", () => {
    let clock = 0;
    const builds = inMemoryBuilds({ ttlMs: 10, now: () => clock });
    for (let i = 0; i < 50; i++) builds.remember(bytes(i));
    expect(builds.size).toBe(50);
    clock += 11;
    expect(builds.size).toBe(0);
  });

  it("remembers more than one build at a time", () => {
    const builds = inMemoryBuilds();
    builds.remember(bytes(1));
    builds.remember(bytes(2));
    expect(builds.recognises(bytes(1))).toBe(true);
    expect(builds.recognises(bytes(2))).toBe(true);
  });
});
