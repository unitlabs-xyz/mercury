import { getBase58Decoder, type Address } from "@solana/kit";
import { logger } from "../log/index.js";

/**
 * Address lookup tables, which Jupiter's routes will not fit without.
 *
 * A Solana transaction is capped at 1232 bytes and a route through several
 * pools names more accounts than that allows. A lookup table lets the message
 * refer to them by index instead, so reading one is not optional here.
 *
 * Note where this is used: composing. The relayer still refuses to *judge* a
 * transaction whose programs hide in a table, because there it would be
 * trusting the client's bytes. Here it is assembling its own.
 */

/**
 * Addresses begin after the table's fixed header: a four-byte discriminator,
 * two slots, an index byte, and an optional authority. Fifty-six bytes in
 * total, and the figure is checked against mainnet rather than counted from
 * a struct — the account below parsed to 245 addresses this way, matching
 * exactly what the RPC's own parser returned for it.
 */
const HEADER_BYTES = 56;
const ADDRESS_BYTES = 32;

const log = logger("relay");

export const parseLookupTable = (data: Uint8Array): readonly Address[] => {
  if (data.length < HEADER_BYTES) return [];
  const decoder = getBase58Decoder();
  const out: Address[] = [];
  for (let at = HEADER_BYTES; at + ADDRESS_BYTES <= data.length; at += ADDRESS_BYTES) {
    out.push(decoder.decode(data.subarray(at, at + ADDRESS_BYTES)) as Address);
  }
  return out;
};

export interface LookupTableReader {
  /** Every table named, as the addresses each one loads. */
  read(addresses: readonly Address[]): Promise<ReadonlyMap<Address, readonly Address[]>>;
}

interface AccountInfoRpc {
  getMultipleAccounts(
    addresses: readonly Address[],
    config: { encoding: "base64" },
  ): { send(): Promise<{ value: readonly ({ data: readonly [string, string] } | null)[] }> };
}

/**
 * One request for every table, not one each: a route naming four tables
 * should not cost four round trips on the path a buyer is waiting on.
 */
export const rpcLookupTables = (rpc: AccountInfoRpc): LookupTableReader => ({
  async read(addresses) {
    const found = new Map<Address, readonly Address[]>();
    if (addresses.length === 0) return found;
    const { value } = await rpc.getMultipleAccounts(addresses, { encoding: "base64" }).send();
    addresses.forEach((address, i) => {
      const account = value[i];
      if (account === null || account === undefined) return;
      const [raw] = account.data;
      found.set(address, parseLookupTable(Uint8Array.from(Buffer.from(raw, "base64"))));
    });
    /*
     * A table the RPC did not return is a Jupiter route that cannot be built,
     * and skipping it silently is how a sponsored transaction fails with
     * nothing saying why. `warn`, because the usual cause is the RPC rather
     * than us — these accounts do not disappear.
     *
     * The count rather than the addresses. They are public, program-owned
     * accounts and would be harmless to name, but a field called `address`
     * is redacted and renaming one to get past that is a habit worth not
     * starting. A count is what an alert needs; `debug` on the RPC side has
     * the rest.
     */
    if (found.size !== addresses.length) {
      log.warn({ asked: addresses.length, missing: addresses.length - found.size }, "lookup tables missing");
    }
    return found;
  },
});

/**
 * How long a table's addresses are believed. A lookup table only ever grows:
 * an address once in it keeps its index for the table's life. One kept ten
 * minutes misses at most what was appended since, and an address it misses is
 * written out in full instead, which costs bytes, not correctness. Read on
 * every order, the same few Jupiter tables were one account call each time.
 */
const LOOKUP_TTL_MS = 10 * 60_000;

/** `reader`, asking only for tables it has not seen in the last ten minutes, all in one call. */
export const cachedLookupTables = (
  reader: LookupTableReader,
  opts: { readonly ttlMs?: number; readonly now?: () => number } = {},
): LookupTableReader => {
  const ttlMs = opts.ttlMs ?? LOOKUP_TTL_MS;
  const now = opts.now ?? Date.now;
  const kept = new Map<Address, { readonly at: number; readonly addresses: readonly Address[] }>();
  return {
    async read(addresses) {
      const at = now();
      const found = new Map<Address, readonly Address[]>();
      const missing: Address[] = [];
      for (const a of addresses) {
        const k = kept.get(a);
        if (k !== undefined && at - k.at < ttlMs) found.set(a, k.addresses);
        else missing.push(a);
      }
      if (missing.length === 0) return found;
      // A table the node did not return is not kept, so the next order asks again.
      for (const [a, table] of await reader.read(missing)) {
        kept.set(a, { at, addresses: table });
        found.set(a, table);
      }
      if (kept.size > 1_000) for (const [a, k] of kept) if (at - k.at >= ttlMs) kept.delete(a);
      return found;
    },
  };
};
