import { toCsv, type Event } from "@mercury/view";

/* The CSV itself is built in `@mercury/view`, so the phone exports the same file. */
export { toCsv };

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
