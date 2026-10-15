import { describe, expect, it } from "vitest";
import type { BasketOperation, BasketPortfolioSummary } from "@mercury/types";
import { sortOperationRows, type BasketOperationRow } from "./operations";

const portfolio = { portfolioId: "p1", slug: "magnificent-seven" } as BasketPortfolioSummary;

const row = (
  key: string,
  state: BasketOperation["state"] | undefined,
  occurredAt: string | null,
): BasketOperationRow => ({
  key,
  portfolio,
  name: "Manual rebalance",
  label: state ?? "Checking",
  state,
  unavailable: false,
  occurredAt,
});

describe("sortOperationRows", () => {
  it.each([
    {
      name: "running work outranks a newer finished run",
      rows: [
        row("done", "completed", "2026-10-08T12:00:00Z"),
        row("busy", "running", "2026-10-01T09:00:00Z"),
      ],
      expected: ["busy", "done"],
    },
    {
      name: "an unreported state counts as in flight",
      rows: [row("done", "completed", "2026-10-08T12:00:00Z"), row("checking", undefined, null)],
      expected: ["checking", "done"],
    },
    {
      name: "finished runs are newest first",
      rows: [
        row("older", "completed", "2026-10-01T09:00:00Z"),
        row("newer", "failed", "2026-10-08T12:00:00Z"),
      ],
      expected: ["newer", "older"],
    },
  ])("$name", ({ rows, expected }) => {
    expect(sortOperationRows(rows).map((item) => item.key)).toEqual(expected);
  });
});
