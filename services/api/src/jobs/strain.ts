import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Which job's pass a refused request belongs to.
 *
 * The background jobs share one lane of endpoints, and a refusal used to be
 * the lane's: a call that every endpoint refused made every job running at
 * that moment wait longer and log that it had been refused. A snapshot that
 * read seventeen accounts of seventeen said so, and wallet-events sat at its
 * two-minute cap for a night on other jobs' refusals (23 October 2026). Each
 * pass now runs in a scope of its own, and a refusal marks only the pass whose
 * call it was.
 */
export interface Pass {
  strained: boolean;
}

const scope = new AsyncLocalStorage<Pass>();

/**
 * When the jobs' lane was last refused, by any pass. The history reader reads
 * nothing while this is recent: the jobs' own reads come first, and a reader
 * in the same process is the only kind that can see this at all (memory, one
 * process, like `presence.ts`).
 */
let lastRefusal = Number.NEGATIVE_INFINITY;

/** Whether the jobs' lane was refused within the last `ms`. */
export const laneRefusedWithin = (ms: number, now: number = Date.now()): boolean => now - lastRefusal < ms;

/** Mark the pass this call is part of as refused. Outside any pass, a route say, nothing. */
export const noteStrain = (): void => {
  const pass = scope.getStore();
  if (pass === undefined) return;
  pass.strained = true;
  lastRefusal = Date.now();
};

/** Run one pass of a job in its own scope, so `noteStrain` inside it marks `pass`. */
export const inPass = <T>(pass: Pass, run: () => Promise<T>): Promise<T> => scope.run(pass, run);
