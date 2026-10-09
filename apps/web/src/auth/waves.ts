/**
 * When the beta opens its doors.
 *
 * The first wave admits everyone already on the waitlist. After it, a wave
 * every six hours takes whoever joined since. Both are fixed instants, so the
 * countdown reads the same moment to everyone, in their own clock.
 */
const WAVE_MS = 6 * 60 * 60 * 1000;

/*
 * Midnight IST on the tenth. In an env var because a launch that slips a day
 * should be a config change and not a release — and because the hour only
 * means anything with an offset attached, which a bare date string would drop.
 */
export const FIRST_WAVE = new Date(
  (import.meta.env["VITE_FIRST_WAVE"] as string | undefined) ?? "2026-10-10T00:00:00+05:30",
);

/** The next door to open after `now`. The first wave until it has passed. */
export const nextWave = (now: Date, first: Date = FIRST_WAVE): Date => {
  const elapsed = now.getTime() - first.getTime();
  if (elapsed < 0) return first;
  return new Date(first.getTime() + (Math.floor(elapsed / WAVE_MS) + 1) * WAVE_MS);
};

/** The countdown split for a clock face. Numbers: the display pads them. */
export const waveParts = (ms: number): { hours: number; minutes: number; seconds: number } => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
};

/** The wave itself, for the line that names the hour it opens. */
export const waveClock = (at: Date): string =>
  at.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
