import { KIND_LABEL, type Event } from "./activity-data";

/** RFC 4180: quote everything, double any embedded quote. */
const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;

const HEADERS = ["Date", "Type", "Event", "Detail", "Amount", "Direction", "Signature"];

export const toCsv = (events: Event[]): string =>
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

export const downloadCsv = (events: Event[]) => {
  const blob = new Blob([toCsv(events)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `harbor-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
