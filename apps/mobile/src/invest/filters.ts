import { useSyncExternalStore } from "react";
import type { Span } from "../api";

/** How the list is ordered. "default" is the shelf's own order. */
export type Sort = "default" | "gainers" | "losers" | "priceHigh" | "priceLow" | "name";

export interface Filters {
  readonly range: Span;
  readonly sector: string;
  readonly sort: Sort;
  readonly owned: boolean;
}

export const DEFAULT_FILTERS: Filters = { range: "1D", sector: "all", sort: "default", owned: false };

/** What the screen behind the sheet knows and the sheet needs: the shelf's sectors, and how many rows match. */
export interface ListMeta {
  readonly sectors: readonly string[];
  readonly count: number;
}

/*
 * One small store, shared by the Invest tab and its filter sheet. They are two
 * routes, so React state in either cannot reach the other; the sheet writes
 * here, the tab redraws behind it, and the count the sheet shows on its button
 * is the tab's own answer for the filters as they stand.
 */
let filters: Filters = DEFAULT_FILTERS;
let meta: ListMeta = { sectors: [], count: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useFilters = () => useSyncExternalStore(subscribe, () => filters);
export const useListMeta = () => useSyncExternalStore(subscribe, () => meta);

export const setFilters = (patch: Partial<Filters>) => {
  filters = { ...filters, ...patch };
  emit();
};

export const resetFilters = () => {
  filters = DEFAULT_FILTERS;
  emit();
};

export const setListMeta = (next: ListMeta) => {
  if (next.count === meta.count && next.sectors.join("|") === meta.sectors.join("|")) return;
  meta = next;
  emit();
};

/** Filters that narrow or reorder the list. The range only changes what each row shows, so it does not count. */
export const activeCount = (f: Filters) =>
  (f.sector !== "all" ? 1 : 0) + (f.sort !== "default" ? 1 : 0) + (f.owned ? 1 : 0);

export const SORTS: readonly { key: Sort; label: string }[] = [
  { key: "default", label: "Recommended" },
  { key: "gainers", label: "Biggest gainers" },
  { key: "losers", label: "Biggest losers" },
  { key: "priceHigh", label: "Price, high to low" },
  { key: "priceLow", label: "Price, low to high" },
  { key: "name", label: "Name, A to Z" },
];

export const RANGES: readonly { key: Span; label: string }[] = [
  { key: "1D", label: "1D" },
  { key: "1W", label: "1W" },
  { key: "1M", label: "1M" },
  { key: "1Y", label: "1Y" },
];
