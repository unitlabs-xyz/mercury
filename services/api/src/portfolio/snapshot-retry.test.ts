import { describe, expect, it } from "vitest";
import { missedSnapshots } from "./snapshot-retry.js";

const at = (iso: string) => new Date(iso);

describe("missedSnapshots", () => {
  /*
   * After the deploy on 22 October 2026, five of seventeen accounts missed the
   * hour's reading and the job waited a full hour, by which time the hour was
   * gone. A reading has to be taken inside its own hour or never.
   */
  it("hands back this hour's missed accounts while it is still that hour", () => {
    const m = missedSnapshots();
    m.missed(at("2026-10-22T11:00:00Z"), ["a", "b"]);
    expect([...(m.due(at("2026-10-22T11:05:00Z")) ?? [])]).toEqual(["a", "b"]);
  });

  it("files a pass under the hour it was given, whenever in that hour it ran", () => {
    const m = missedSnapshots();
    m.missed(at("2026-10-22T11:42:10Z"), ["a"]);
    expect(m.due(at("2026-10-22T11:59:00Z"))).not.toBeNull();
  });

  it("forgets them once the hour is over", () => {
    const m = missedSnapshots();
    m.missed(at("2026-10-22T11:00:00Z"), ["a"]);
    expect(m.due(at("2026-10-22T12:00:01Z"))).toBeNull();
    expect(m.due(at("2026-10-22T11:30:00Z"))).toBeNull();
  });

  it("keeps only what a retry missed again, and nothing once all are taken", () => {
    const m = missedSnapshots();
    m.missed(at("2026-10-22T11:00:00Z"), ["a", "b"]);
    m.missed(at("2026-10-22T11:00:00Z"), ["b"]);
    expect([...(m.due(at("2026-10-22T11:10:00Z")) ?? [])]).toEqual(["b"]);
    m.missed(at("2026-10-22T11:00:00Z"), []);
    expect(m.due(at("2026-10-22T11:15:00Z"))).toBeNull();
  });
});
