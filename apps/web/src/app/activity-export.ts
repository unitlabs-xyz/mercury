import { KIND_LABEL, type Day } from "./activity-data";

/** RFC 4180: quote everything, double any embedded quote. */
const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;

const HEADERS = ["Date", "Type", "Event", "Detail", "Amount", "Direction", "Signature"];

export const toCsv = (days: Day[]): string => {
  const rows = [HEADERS.map(cell).join(",")];
  for (const day of days) {
    for (const e of day.events) {
      rows.push(
        [
          day.date,
          KIND_LABEL[e.kind],
          e.title,
          e.sub,
          e.amount ?? "",
          e.flow === "in" ? "In" : e.flow === "out" ? "Out" : "No cash movement",
          e.signature ?? "",
        ]
          .map(cell)
          .join(","),
      );
    }
  }
  return rows.join("\r\n");
};

export const downloadCsv = (days: Day[]) => {
  const blob = new Blob([toCsv(days)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `harbor-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
