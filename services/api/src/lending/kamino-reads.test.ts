import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ load: vi.fn(), instant: vi.fn() }));

vi.mock("@kamino-finance/klend-sdk", async (actual) => ({
  ...(await actual<typeof import("@kamino-finance/klend-sdk")>()),
  KaminoMarket: { load: sdk.load },
  getCurrentLedgerInstant: sdk.instant,
}));

const { KaminoLending } = await import("./kamino.js");

/** The private readers under test, reached the way only a test should. */
interface Readers {
  market(): Promise<{ loadReserves(): Promise<void> }>;
  instant(): Promise<unknown>;
}
const readers = (l: InstanceType<typeof KaminoLending>) => l as unknown as Readers;

const fakeMarket = () => ({ loadReserves: vi.fn(async () => {}) });

describe("KaminoLending's reads", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    sdk.load.mockReset();
    sdk.instant.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  /*
   * A full load scans the program for the market's reserves: the heaviest read
   * here, and it ran every thirty seconds on each lane (23 October 2026).
   */
  it("loads the market whole once, then refreshes the reserves it knows", async () => {
    const m = fakeMarket();
    sdk.load.mockResolvedValue(m);
    const l = readers(new KaminoLending({ rpcUrl: "https://rpc.example", ttlMs: 30_000 }));

    await l.market();
    await l.market();
    expect(sdk.load).toHaveBeenCalledTimes(1);
    expect(m.loadReserves).not.toHaveBeenCalled();

    vi.setSystemTime(30_000);
    await l.market();
    expect(sdk.load).toHaveBeenCalledTimes(1);
    expect(m.loadReserves).toHaveBeenCalledTimes(1);

    // Ten minutes on, whole again, so a reserve Kamino added is found.
    vi.setSystemTime(10 * 60_000);
    await l.market();
    expect(sdk.load).toHaveBeenCalledTimes(2);
  });

  it("loads whole again after a refresh fails", async () => {
    const m = fakeMarket();
    m.loadReserves.mockRejectedValueOnce(new Error("Reserve account was not found"));
    sdk.load.mockResolvedValue(m);
    const l = readers(new KaminoLending({ rpcUrl: "https://rpc.example", ttlMs: 30_000 }));

    await l.market();
    vi.setSystemTime(30_000);
    await expect(l.market()).rejects.toThrow("not found");
    await l.market();
    expect(sdk.load).toHaveBeenCalledTimes(2);
  });

  /* Terms and positions each asked: two slot reads and two block-time reads per money request. */
  it("shares the ledger's slot and time for two seconds, and never keeps a failed read", async () => {
    sdk.instant.mockResolvedValue({ slot: 1n, blockTime: 1n });
    const l = readers(new KaminoLending({ rpcUrl: "https://rpc.example" }));

    await Promise.all([l.instant(), l.instant()]);
    vi.setSystemTime(1_999);
    await l.instant();
    expect(sdk.instant).toHaveBeenCalledTimes(1);

    vi.setSystemTime(2_000);
    sdk.instant.mockRejectedValueOnce(new Error("429"));
    await expect(l.instant()).rejects.toThrow("429");
    await l.instant();
    expect(sdk.instant).toHaveBeenCalledTimes(3);
  });
});
