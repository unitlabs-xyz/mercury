/** Glider points are cumulative TWR; a selected window needs its own opening baseline. */
export const modeledSeries = (points: readonly { date: string; percentChange: string }[], since?: string) => {
  const selected = points.filter((point) => since === undefined || point.date >= since);
  const opening = Number(selected[0]?.percentChange);
  if (!Number.isFinite(opening) || opening <= -100) return [];
  return selected
    .map((point) => ({
      label: new Date(`${point.date}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      value: Number((((1 + Number(point.percentChange) / 100) / (1 + opening / 100) - 1) * 100).toFixed(6)),
    }))
    .filter((point) => Number.isFinite(point.value));
};
