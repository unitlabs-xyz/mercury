import { ACTIVITY, GROUPS, type Event, type Group } from "./activity-data";
import type { Option } from "../ui/Select";

/** The product's "today", so relative day labels stay stable. */
const TODAY = "2026-09-19";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = TODAY.split("-").map(Number) as [number, number, number];
  if (y === ty && m === tm && d === td) return `Today, ${d} ${MONTH_NAMES[m - 1]}`;
  if (y === ty && m === tm && d === td - 1) return `Yesterday, ${d} ${MONTH_NAMES[m - 1]}`;
  // The current year is implicit; only older entries carry it.
  return y === ty ? `${d} ${MONTH_NAMES[m - 1]}` : `${d} ${MONTH_NAMES[m - 1]} ${y}`;
};

export const TYPE_OPTIONS: Option[] = GROUPS.map((g) => ({ value: g.key, label: g.label }));

export const YEAR_OPTIONS: Option[] = [
  { value: "all", label: "All years" },
  ...[...new Set(ACTIVITY.map((e) => e.date.slice(0, 4)))]
    .sort()
    .reverse()
    .map((y) => ({ value: y, label: y })),
];

export const MONTH_OPTIONS: Option[] = [
  { value: "all", label: "All months" },
  ...MONTH_NAMES.map((name, i) => ({ value: String(i + 1).padStart(2, "0"), label: name })),
];

const matches = (e: Event, q: string) =>
  [e.title, e.sub, ...e.details.flatMap((d) => [d.label, d.value])].join(" ").toLowerCase().includes(q);

export const filterEvents = (group: Group, year: string, month: string, query: string) => {
  const kinds = GROUPS.find((g) => g.key === group)?.kinds ?? [];
  const q = query.trim().toLowerCase();
  return ACTIVITY.filter(
    (e) =>
      (kinds.length === 0 || kinds.includes(e.kind)) &&
      (year === "all" || e.date.slice(0, 4) === year) &&
      (month === "all" || e.date.slice(5, 7) === month) &&
      (q === "" || matches(e, q)),
  );
};

/** Group a page of events into days, preserving order. */
export const groupByDay = (events: Event[]) => {
  const days: { date: string; label: string; events: Event[] }[] = [];
  for (const e of events) {
    const last = days[days.length - 1];
    if (last && last.date === e.date) last.events.push(e);
    else days.push({ date: e.date, label: dayLabel(e.date), events: [e] });
  }
  return days;
};
