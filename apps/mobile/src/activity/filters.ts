import { useSyncExternalStore } from "react";
import type { Event } from "@mercury/view";

/** How the feed is ordered. Newest is the feed's own order. */
export type ActivitySort = "newest" | "oldest" | "largest";

export interface ActivityFilters {
  readonly year: string;
  readonly month: string;
  readonly sort: ActivitySort;
}

export const DEFAULT_ACTIVITY: ActivityFilters = { year: "all", month: "all", sort: "newest" };

export const ACTIVITY_SORTS: readonly { key: ActivitySort; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "largest", label: "Largest amount" },
];

/** What the sheet needs from the screen behind it: which years there are, and how many events match. */
export interface ActivityMeta {
  readonly years: readonly string[];
  readonly count: number;
}

/*
 * Shared by the Activity tab and its filter sheet, which are two routes: the
 * invest filters' pattern. The sheet writes, the list redraws behind it.
 */
let filters: ActivityFilters = DEFAULT_ACTIVITY;
let meta: ActivityMeta = { years: [], count: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useActivityFilters = () => useSyncExternalStore(subscribe, () => filters);
export const useActivityMeta = () => useSyncExternalStore(subscribe, () => meta);

export const setActivityFilters = (patch: Partial<ActivityFilters>) => {
  filters = { ...filters, ...patch };
  emit();
};

export const resetActivityFilters = () => {
  filters = DEFAULT_ACTIVITY;
  emit();
};

export const setActivityMeta = (next: ActivityMeta) => {
  if (next.count === meta.count && next.years.join("|") === meta.years.join("|")) return;
  meta = next;
  emit();
};

export const activeActivityCount = (f: ActivityFilters) =>
  (f.year !== "all" ? 1 : 0) + (f.month !== "all" ? 1 : 0) + (f.sort !== "newest" ? 1 : 0);

/** "$1,234.50" or "12.5 USDC" → 1234.5. A row with no money in it sorts last. */
const size = (e: Event) => (e.amount === null ? -1 : Number(e.amount.replace(/[^0-9.]/g, "")) || 0);

export const sortEvents = (events: readonly Event[], sort: ActivitySort): Event[] =>
  sort === "oldest"
    ? [...events].reverse()
    : sort === "largest"
      ? [...events].sort((a, b) => size(b) - size(a))
      : [...events];
