/**
 * A market time in the reader's own zone: "Wed, 1:30 AM IST" for someone in
 * India, "Wed, 4:00 PM EDT" in New York. The clock is formatted in en-US so
 * every reader gets the same shape; the zone's short name comes from their own
 * locale, which is what turns "GMT+5:30" into "IST" where the locale has one.
 */
/*
 * Each locale only knows the short names of its own region's zones: en-US
 * calls India "GMT+5:30", en-IN calls it "IST". So the reader's locale first,
 * then a few English ones, and the first real abbreviation wins; an offset is
 * the fallback, never a wrong name.
 */
const LOCALES = [undefined, "en-US", "en-IN", "en-GB", "en-AU", "en-CA", "en-SG"] as const;
const zoneName = (date: Date) => {
  let fallback = "";
  for (const locale of LOCALES) {
    const name = new Intl.DateTimeFormat(locale, { timeZoneName: "short" })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")?.value;
    if (!name) continue;
    if (!/^(GMT|UTC)[+-]/.test(name)) return name;
    fallback ||= name;
  }
  return fallback;
};

export const localTime = (date: Date, opts: { weekday?: "short" | "long" } = {}) => {
  const time = date.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
  const day = opts.weekday ? date.toLocaleString("en-US", { weekday: opts.weekday }) : null;
  const clock = day ? `${day}, ${time}` : time;
  return `${clock} ${zoneName(date)}`.trim();
};
