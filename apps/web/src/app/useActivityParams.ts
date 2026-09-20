import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { GROUPS, type Group } from "./activity-data";
import { MONTH_OPTIONS, YEAR_OPTIONS } from "./activity-filters";

export type ActivityState = {
  group: Group;
  year: string;
  month: string;
  query: string;
  page: number;
};

const DEFAULTS: ActivityState = { group: "all", year: "all", month: "all", query: "", page: 1 };

/** Anything unrecognised in the URL falls back to the default rather than breaking. */
const readGroup = (v: string | null): Group =>
  GROUPS.some((g) => g.key === v) ? (v as Group) : DEFAULTS.group;

const readYear = (v: string | null): string =>
  YEAR_OPTIONS.some((o) => o.value === v) ? (v as string) : DEFAULTS.year;

const readMonth = (v: string | null): string =>
  MONTH_OPTIONS.some((o) => o.value === v) ? (v as string) : DEFAULTS.month;

const readPage = (v: string | null): number => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : DEFAULTS.page;
};

/**
 * Filters and pagination live in the query string, so the view survives a
 * reload and can be shared. Defaults are left out to keep the URL readable.
 */
export const useActivityParams = () => {
  const [params, setParams] = useSearchParams();

  const state: ActivityState = useMemo(
    () => ({
      group: readGroup(params.get("type")),
      year: readYear(params.get("year")),
      month: readMonth(params.get("month")),
      query: params.get("q") ?? DEFAULTS.query,
      page: readPage(params.get("page")),
    }),
    [params],
  );

  const write = useCallback(
    (next: Partial<ActivityState>, { replace = false } = {}) => {
      const merged = { ...state, ...next };
      // Changing any filter invalidates the page you were on.
      if (next.page === undefined) merged.page = 1;

      const q = new URLSearchParams();
      if (merged.group !== DEFAULTS.group) q.set("type", merged.group);
      if (merged.year !== DEFAULTS.year) q.set("year", merged.year);
      if (merged.month !== DEFAULTS.month) q.set("month", merged.month);
      if (merged.query.trim() !== "") q.set("q", merged.query);
      if (merged.page !== DEFAULTS.page) q.set("page", String(merged.page));

      setParams(q, { replace });
    },
    [state, setParams],
  );

  const reset = useCallback(() => setParams(new URLSearchParams()), [setParams]);

  return { ...state, write, reset };
};
