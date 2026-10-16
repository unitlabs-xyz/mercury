import { describe, expect, it } from "vitest";
import {
  age,
  dayLabel,
  minutesBetween,
  seriesByGroup,
  share,
  snapshotStale,
  SNAPSHOT_STALE_MINUTES,
} from "./format";
import { shortDate } from "./ui";

describe("minutesBetween", () => {
  it("measures a gap in whole minutes", () => {
    expect(minutesBetween("2026-10-15T10:00:00Z", "2026-10-15T11:30:00Z")).toBe(90);
  });

  it("answers null for a reading that was never taken", () => {
    expect(minutesBetween(null, "2026-10-15T11:30:00Z")).toBe(null);
  });

  it("answers null rather than NaN for an unparseable instant", () => {
    expect(minutesBetween("not a date", "2026-10-15T11:30:00Z")).toBe(null);
  });
});

describe("age", () => {
  it("distinguishes never from recently", () => {
    /* A fresh deployment has never taken a snapshot. That is not the same
       fact as one whose job stopped a minute ago, and the two are fixed
       differently. */
    expect(age(null)).toBe("never");
    expect(age(0)).toBe("just now");
  });

  it("steps up through minutes, hours and days", () => {
    expect(age(5)).toBe("5m ago");
    expect(age(59)).toBe("59m ago");
    expect(age(60)).toBe("1h ago");
    expect(age(23 * 60 + 59)).toBe("23h ago");
    expect(age(24 * 60)).toBe("1d ago");
  });
});

describe("snapshotStale", () => {
  it("is ninety minutes, because the job runs hourly", () => {
    expect(SNAPSHOT_STALE_MINUTES).toBe(90);
    expect(snapshotStale(89)).toBe(false);
    expect(snapshotStale(91)).toBe(true);
  });

  it("treats never as stale", () => {
    /* The one case a threshold could miss: no snapshot at all is the worst
       version of this, not an exempt one. */
    expect(snapshotStale(null)).toBe(true);
  });
});

describe("share", () => {
  it("rounds to a whole percent", () => {
    expect(share(1, 3)).toBe("33%");
    expect(share(2, 2)).toBe("100%");
  });

  it("answers a dash on an empty database, not zero per cent", () => {
    /* 0% on day one reads as a problem. No signups is an empty database. */
    expect(share(0, 0)).toBe("—");
  });
});

describe("dayLabel", () => {
  it("reads a day as a person would say it", () => {
    /* Whatever `shortDate` renders — the point is that it is the dashboard's
       own formatter and not a second one that drifts from it. */
    expect(dayLabel("2026-09-05")).toBe(shortDate("2026-09-05"));
    expect(dayLabel("2026-09-05")).toMatch(/^5 Sep/);
  });

  it("falls back to the raw value rather than printing Invalid Date", () => {
    expect(dayLabel("nonsense")).toBe("nonsense");
  });
});

describe("seriesByGroup", () => {
  const rows = [
    { chain: "Base", day: "2026-09-01", count: 2 },
    { chain: "Base", day: "2026-09-03", count: 1 },
    { chain: "Arbitrum", day: "2026-09-01", count: 5 },
  ];
  const series = () =>
    seriesByGroup(
      rows,
      (r) => r.chain,
      (r) => r.day,
      (r) => r.count,
    );

  it("gives every group a value on every day in the range", () => {
    /* The bug this exists to prevent: a series that skipped the days a chain
       saw nothing would slope between two points days apart and read as
       steady traffic. */
    const { days, groups } = series();

    expect(days).toEqual(["2026-09-01", "2026-09-03"]);
    expect(groups.every((g) => g.values.length === days.length)).toBe(true);
  });

  it("fills a day a group saw nothing on with zero, not with its neighbour", () => {
    const base = series().groups.find((g) => g.name === "Base");

    expect(base?.values).toEqual([2, 1]);
    expect(series().groups.find((g) => g.name === "Arbitrum")?.values).toEqual([5, 0]);
  });

  it("sums several rows for the same group and day", () => {
    /* The API returns one row per chain, day and status, so two statuses on
       one day are two rows that belong to one point. */
    const { groups } = seriesByGroup(
      [
        { chain: "Base", day: "2026-09-01", count: 2 },
        { chain: "Base", day: "2026-09-01", count: 3 },
      ],
      (r) => r.chain,
      (r) => r.day,
      (r) => r.count,
    );

    expect(groups[0]?.values).toEqual([5]);
  });

  it("puts the busiest group first", () => {
    expect(series().groups.map((g) => g.name)).toEqual(["Arbitrum", "Base"]);
  });

  it("answers empty for no rows rather than failing", () => {
    expect(
      seriesByGroup(
        [],
        () => "",
        () => "",
        () => 0,
      ),
    ).toEqual({ days: [], groups: [] });
  });
});
