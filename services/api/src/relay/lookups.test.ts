import { describe, expect, it } from "vitest";
import type { Address } from "@solana/kit";
import { parseLookupTable, rpcLookupTables } from "./lookups.js";

/*
 * The header and first three addresses of a table Jupiter actually routed
 * through on 30 September 2026 (GvwBveeCABXvtbyQYYyX9133EpvuVRk4HQ8qmcGgox9E).
 * The full account parsed to 245 addresses, matching what the RPC's own
 * parser returned for it — so this fixture pins the header offset against
 * real bytes rather than against a struct we counted ourselves.
 */
const REAL_TABLE_HEAD = Buffer.from(
  "AQAAAP//////////UW+iGQAAAAAAAX0Oo0JAUwU7u9hg90wy8EvD3Icq35pPTtFwwk7g9D7TAAD6jzswda1XaTorZN/Ex4wLyH0FXHqU2QM8WisetadiNrDE9v8lo73NITWSnl3DEpFdfRPrMTTZjlLRKUdwCukqXiiE0K48+UR8aXt8h+wSNTPZ+4JjdLcAR8sF6gIvwuI=",
  "base64",
);

describe("parseLookupTable", () => {
  it("skips the header and reads the addresses mainnet holds", () => {
    const addresses = parseLookupTable(Uint8Array.from(REAL_TABLE_HEAD));
    expect(addresses).toEqual([
      "Hs5bjXDqK8QoaA2cg3R2zbob9G99BvbRtBRDi4vUANpd",
      "Cu2xBrDfp5Eadkmib1TsCEh3EXWuRT6UT3HXhWbSVUNm",
      "7LZACdarCF4ya6isoSxF6WvW8ASjigb1FdK5FPPpyjv9",
    ]);
  });

  it("reads nothing from an account too short to have a header", () => {
    expect(parseLookupTable(new Uint8Array(20))).toEqual([]);
  });

  /* A trailing part-address is not an address; reading it would invent one. */
  it("ignores a trailing fragment", () => {
    const head = Uint8Array.from(REAL_TABLE_HEAD);
    const ragged = new Uint8Array(head.length + 7);
    ragged.set(head);
    expect(parseLookupTable(ragged)).toHaveLength(3);
  });
});

describe("rpcLookupTables", () => {
  const A = "GvwBveeCABXvtbyQYYyX9133EpvuVRk4HQ8qmcGgox9E" as Address;
  const B = "7dJ3Cz3JcFVQC4bM6Ub9gKJNvWPqQHcmCEHmM2eSVcgn" as Address;

  it("asks for every table in one request", async () => {
    const calls: unknown[][] = [];
    const rpc = {
      getMultipleAccounts: (addresses: readonly Address[], config: { encoding: "base64" }) => {
        calls.push([addresses, config]);
        return {
          send: async () => ({
            value: [{ data: [REAL_TABLE_HEAD.toString("base64"), "base64"] as const }, null],
          }),
        };
      },
    };
    const found = await rpcLookupTables(rpc).read([A, B]);
    expect(calls).toHaveLength(1);
    expect(found.get(A)).toHaveLength(3);
    // A table that does not exist is absent rather than empty, so composing fails loudly.
    expect(found.has(B)).toBe(false);
  });

  it("makes no request when nothing names a table", async () => {
    let asked = false;
    const rpc = {
      getMultipleAccounts: () => {
        asked = true;
        return { send: async () => ({ value: [] }) };
      },
    };
    expect((await rpcLookupTables(rpc).read([])).size).toBe(0);
    expect(asked).toBe(false);
  });
});
