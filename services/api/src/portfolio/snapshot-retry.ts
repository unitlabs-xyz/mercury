import { hourOf } from "./history.js";

/**
 * The accounts an hour's snapshot could not read, kept until that hour ends.
 *
 * A reading belongs to its hour and nothing can take it afterwards, so a
 * failed account waiting for the next hourly pass is a gap in its chart. After
 * the deploy on 22 October 2026, five of seventeen accounts missed the hour
 * that way. A short retry asks for these and takes them while it is still the
 * same hour; once the hour is over they are forgotten, as the reading is.
 *
 * Memory, and one process: a restart forgets them, and the next pass is the
 * restart's own first snapshot.
 */
export const missedSnapshots = () => {
  let hour: number | null = null;
  let pending: ReadonlySet<string> = new Set();
  return {
    /** What a pass, hourly or retry, could not read; `at` is the time the pass was given. */
    missed(at: Date, userIds: readonly string[]) {
      hour = hourOf(at).getTime();
      pending = new Set(userIds);
    },
    /** The accounts to try again now, or null: none left, or their hour is over. */
    due(now: Date): ReadonlySet<string> | null {
      if (hour === null || pending.size === 0) return null;
      if (hourOf(now).getTime() !== hour) {
        hour = null;
        pending = new Set();
        return null;
      }
      return pending;
    },
  };
};
