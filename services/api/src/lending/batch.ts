interface Waiting<V> {
  readonly resolve: (value: V) => void;
  readonly reject: (error: unknown) => void;
}

/**
 * One key at a time on the outside, many at once underneath.
 *
 * Callers ask for a single key. Every key asked for within `windowMs` of the
 * first is loaded by one `loadMany`, and each caller is answered with its own
 * entry; a key asked for twice is loaded once. A failed load fails every
 * caller in that batch, and the next ask starts a fresh one.
 *
 * The window is milliseconds rather than a microtask because the callers this
 * serves do not arrive together: `position-sync`'s workers each run a few
 * database queries first, so they reach the chain a few milliseconds apart.
 */
export const batchedLoader = <K, V>(
  loadMany: (keys: readonly K[]) => Promise<ReadonlyMap<K, V>>,
  missing: V,
  windowMs = 20,
): ((key: K) => Promise<V>) => {
  let queue = new Map<K, Waiting<V>[]>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async (): Promise<void> => {
    const batch = queue;
    queue = new Map();
    timer = null;
    try {
      const loaded = await loadMany([...batch.keys()]);
      for (const [key, waiting] of batch) {
        const value = loaded.has(key) ? loaded.get(key)! : missing;
        for (const w of waiting) w.resolve(value);
      }
    } catch (error: unknown) {
      for (const waiting of batch.values()) for (const w of waiting) w.reject(error);
    }
  };

  return (key) =>
    new Promise<V>((resolve, reject) => {
      const waiting = queue.get(key);
      if (waiting === undefined) queue.set(key, [{ resolve, reject }]);
      else waiting.push({ resolve, reject });
      timer ??= setTimeout(() => void flush(), windowMs);
    });
};
