/**
 * A small cache that forgets, by age and by size.
 *
 * Both basket caches are keyed by Glider strategy id, and anybody can mint
 * strategy ids by writing baskets — so a plain `Map` is a leak whose size a
 * user controls. Capacity is the fix; the TTL is what the callers already
 * wanted.
 *
 * `Map` keeps insertion order, which is the whole of the eviction policy:
 * re-inserting on a hit moves a key to the end, so the first key is always
 * the least recently used.
 */
export class Expiring<T> {
  private readonly entries = new Map<string, { until: number; value: T }>();

  constructor(
    private readonly capacity: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): T | undefined {
    const hit = this.entries.get(key);
    if (hit === undefined) return undefined;
    this.entries.delete(key);
    if (hit.until <= this.now()) return undefined;
    this.entries.set(key, hit);
    return hit.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.entries.delete(key);
    this.entries.set(key, { until: this.now() + ttlMs, value });
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.capacity) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
