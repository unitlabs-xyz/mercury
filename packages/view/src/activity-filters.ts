/*
 * Filtering and grouping the activity feed, for both clients: the phone's
 * Activity tab and the web's must agree on what "Yesterday" is and on which
 * events a filter keeps.
 */
import { GROUPS, KIND_LABEL, type Event, type Group } from "./activity-data.js";

/** A choice in a filter: what it means, and what it says. */
export type FilterOption = { value: string; label: string };

/** Real today: the feed is the user's own, so "Today" has to mean it. */
const today = () => new Date().toISOString().slice(0, 10);

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
  const [ty, tm, td] = today().split("-").map(Number) as [number, number, number];
  if (y === ty && m === tm && d === td) return `Today, ${d} ${MONTH_NAMES[m - 1]}`;
  if (y === ty && m === tm && d === td - 1) return `Yesterday, ${d} ${MONTH_NAMES[m - 1]}`;
  // The current year is implicit; only older entries carry it.
  return y === ty ? `${d} ${MONTH_NAMES[m - 1]}` : `${d} ${MONTH_NAMES[m - 1]} ${y}`;
};

export const TYPE_OPTIONS: FilterOption[] = GROUPS.map((g) => ({ value: g.key, label: g.label }));

/** Only the years the feed actually covers, so the filter cannot promise an empty one. */
export const yearOptions = (events: readonly Event[]): FilterOption[] => [
  { value: "all", label: "All years" },
  ...[...new Set(events.map((e) => e.date.slice(0, 4)))]
    .sort()
    .reverse()
    .map((y) => ({ value: y, label: y })),
];

export const MONTH_OPTIONS: FilterOption[] = [
  { value: "all", label: "All months" },
  ...MONTH_NAMES.map((name, i) => ({ value: String(i + 1).padStart(2, "0"), label: name })),
];

const matches = (e: Event, q: string) =>
  [e.title, e.sub, ...e.details.flatMap((d) => [d.label, d.value])].join(" ").toLowerCase().includes(q);

export const filterEvents = (
  events: readonly Event[],
  group: Group,
  year: string,
  month: string,
  query: string,
) => {
  const kinds = GROUPS.find((g) => g.key === group)?.kinds ?? [];
  const q = query.trim().toLowerCase();
  return events.filter(
    (e) =>
      (kinds.length === 0 || kinds.includes(e.kind)) &&
      (year === "all" || e.date.slice(0, 4) === year) &&
      (month === "all" || e.date.slice(5, 7) === month) &&
      (q === "" || matches(e, q)),
  );
};

/** Group a page of events into days, preserving order. */
export const groupByDay = (events: readonly Event[]) => {
  const days: { date: string; label: string; events: Event[] }[] = [];
  for (const e of events) {
    const last = days[days.length - 1];
    if (last && last.date === e.date) last.events.push(e);
    else days.push({ date: e.date, label: dayLabel(e.date), events: [e] });
  }
  return days;
};

/** The feed as a spreadsheet, the same columns on both clients. */
/** RFC 4180: quote everything, double any embedded quote. */
const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;

const HEADERS = ["Date", "Type", "Event", "Detail", "Amount", "Direction", "Signature"];

export const toCsv = (events: readonly Event[]): string =>
  [
    HEADERS.map(cell).join(","),
    ...events.map((e) =>
      [
        e.date,
        KIND_LABEL[e.kind],
        e.title,
        e.sub,
        e.amount ?? "",
        e.flow === "in" ? "In" : e.flow === "out" ? "Out" : "No cash movement",
        e.signature ?? "",
      ]
        .map(cell)
        .join(","),
    ),
  ].join("\r\n");
