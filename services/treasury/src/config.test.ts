import { describe, expect, it } from "vitest";
import { readTreasuryConfig } from "./config.js";

/* Throwaway keys. The derived addresses are cross-checked in packages/keys
   against cast, eth_keys, RFC 8032 and BIP173. */
const KEY_EVM = "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";
const KEY_SVM = `[${[...Uint8Array.from(Buffer.from("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60", "hex"))].join(",")}]`;
const KEY_BVM = "KymWWYtz6iLgVAzxMYNk3TcVQps2BasrSZFB2T8qVp2jgK7NRof2";

const env = (over: Record<string, string | undefined> = {}) => ({
  TREASURY_SECRET: "shared",
  TREASURY_KEY_EVM: KEY_EVM,
  TREASURY_KEY_SVM: KEY_SVM,
  TREASURY_KEY_BVM: KEY_BVM,
  ...over,
});

describe("readTreasuryConfig", () => {
  it("derives all three addresses", async () => {
    const config = await readTreasuryConfig(env());

    expect(config.addresses).toEqual({
      evm: "0x2c7536E3605D9C16a7a3D7b1898e529396a65c23",
      svm: "FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z",
      bvm: "bc1qnduq8yy8h4nr7g9vuuglzklqatmaquq9ac42k2",
    });
  });

  it.each(["TREASURY_KEY_EVM", "TREASURY_KEY_SVM", "TREASURY_KEY_BVM", "TREASURY_SECRET"])(
    "refuses to start without %s",
    async (missing) => {
      await expect(readTreasuryConfig(env({ [missing]: undefined }))).rejects.toThrow(missing);
    },
  );

  it("treats a blank variable as missing", async () => {
    await expect(readTreasuryConfig(env({ TREASURY_KEY_EVM: "   " }))).rejects.toThrow(
      /TREASURY_KEY_EVM is not set/,
    );
  });

  it("names the variable but never its value when a key is malformed", async () => {
    const secret = "0xnotakeyatall";
    await expect(readTreasuryConfig(env({ TREASURY_KEY_EVM: secret }))).rejects.toThrow(/TREASURY_KEY_EVM/);
    await readTreasuryConfig(env({ TREASURY_KEY_EVM: secret })).catch((err: Error) => {
      expect(err.message).not.toContain("notakey");
    });
  });

  it("refuses a testnet Bitcoin WIF, naming the variable", async () => {
    /* The same 32 bytes with a different version byte would derive a plausible
       mainnet address for a key that cannot spend from it. */
    await expect(
      readTreasuryConfig(env({ TREASURY_KEY_BVM: "cQ8VyTtqXn2wecUDjxBsQn7Z34ARr2yYWbPe8sbLzvgjw4CzhJub" })),
    ).rejects.toThrow(/TREASURY_KEY_BVM/);
  });

  it("does not keep the keys once the addresses are derived", async () => {
    const config = await readTreasuryConfig(env());

    /* A key on a field is a key in a heap dump, a log line and an error
       report. Derivation is the only thing v1 does, so nothing needs them
       afterwards. */
    const serialised = JSON.stringify(config);
    expect(serialised).not.toContain(KEY_EVM.slice(2, 20));
    expect(serialised).not.toContain(KEY_BVM);
    expect(serialised).not.toContain("9d61b19d");
  });
});
