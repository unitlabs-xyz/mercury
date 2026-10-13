import { describe, expect, it } from "vitest";
import { fetchTreasuryAddresses } from "./treasury.js";

const ADDRESSES = {
  evm: "0x2c7536E3605D9C16a7a3D7b1898e529396a65c23",
  svm: "FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z",
  bvm: "bc1qnduq8yy8h4nr7g9vuuglzklqatmaquq9ac42k2",
};

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe("fetchTreasuryAddresses", () => {
  it("sends the secret in a header and returns the three families", async () => {
    let seen: { url: string; secret: string | null } | null = null;

    const addresses = await fetchTreasuryAddresses("http://treasury:8080", "shared", (input, init) => {
      seen = { url: String(input), secret: new Headers(init?.headers).get("x-treasury-secret") };
      return ok({ addresses: ADDRESSES });
    });

    expect(addresses).toEqual(ADDRESSES);
    expect(seen!.url).toBe("http://treasury:8080/addresses");
    expect(seen!.secret).toBe("shared");
  });

  it("tolerates a trailing slash on the url", async () => {
    let url = "";
    await fetchTreasuryAddresses("http://treasury:8080/", "s", (input) => {
      url = String(input);
      return ok({ addresses: ADDRESSES });
    });
    expect(url).toBe("http://treasury:8080/addresses");
  });

  it("refuses a partial answer rather than mounting with a family missing", async () => {
    /* A missing family would quote `undefined` as a refund address, or skip it
       silently. Not offering the method is the safe failure. */
    await expect(
      fetchTreasuryAddresses("http://t", "s", () => ok({ addresses: { evm: ADDRESSES.evm } })),
    ).rejects.toThrow(/all three families/);
  });

  it("refuses an empty address", async () => {
    await expect(
      fetchTreasuryAddresses("http://t", "s", () => ok({ addresses: { ...ADDRESSES, bvm: "" } })),
    ).rejects.toThrow(/all three families/);
  });

  it("refuses a body with no addresses at all", async () => {
    await expect(fetchTreasuryAddresses("http://t", "s", () => ok({}))).rejects.toThrow(/all three families/);
  });

  it("surfaces the status when the treasury refuses us", async () => {
    await expect(
      fetchTreasuryAddresses("http://t", "wrong", () => Promise.resolve(new Response("{}", { status: 401 }))),
    ).rejects.toThrow(/failed: 401/);
  });

  it("never puts the secret in the url", async () => {
    let url = "";
    await fetchTreasuryAddresses("http://t", "super-secret", (input) => {
      url = String(input);
      return ok({ addresses: ADDRESSES });
    });
    expect(url).not.toContain("super-secret");
  });
});
