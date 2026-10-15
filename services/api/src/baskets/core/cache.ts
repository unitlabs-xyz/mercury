/**
 * Keys are Glider strategy ids, which anybody can mint by writing a basket, so
 * a plain `Map` is a leak whose size a user controls. `Map` keeps insertion
 * order, which is the whole eviction policy.
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
