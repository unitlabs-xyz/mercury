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

/** Mark the pass this call is part of as refused. Outside any pass, a route say, nothing. */
export const noteStrain = (): void => {
  const pass = scope.getStore();
  if (pass !== undefined) pass.strained = true;
};

/** Run one pass of a job in its own scope, so `noteStrain` inside it marks `pass`. */
export const inPass = <T>(pass: Pass, run: () => Promise<T>): Promise<T> => scope.run(pass, run);
