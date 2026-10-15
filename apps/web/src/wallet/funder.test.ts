import { describe, expect, it } from "vitest";
import { funderForChain, funderFrom, namespaceOf, vmOfChain, type Funder } from "./funder";
import { SOLANA_CHAIN_ID } from "./chains";

const SOL = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

describe("funderFrom", () => {
  it("reads an EVM wallet and keeps the chain id Relay uses", () => {
    expect(funderFrom("eip155:8453:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toEqual({
      address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      vmType: "evm",
      chainId: 8453,
    });
  });

  it("reads a Solana wallet and renumbers it to Relay's id", () => {
    expect(funderFrom(SOL)).toEqual({
      address: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      vmType: "svm",
      chainId: 792703809,
    });
  });

  it("recognises every EVM chain this app declared", () => {
    for (const id of [1, 10, 56, 130, 137, 8453, 42161, 43114]) {
      expect(funderFrom(`eip155:${id}:0xabc`)?.chainId).toBe(id);
    }
  });

  it("refuses an EVM chain the app has not declared", () => {
    /* A chain we cannot switch to cannot be quoted either, and presenting it
       as connected moves the failure somewhere much harder to explain. */
    expect(funderFrom("eip155:324:0xabc")).toBeNull();
  });

  it("refuses a namespace it does not know", () => {
    expect(funderFrom("tron:0x2b6653dc:TR7NHq")).toBeNull();
    expect(funderFrom("bip122:000000000019d6689c085ae165831e93:bc1q")).toBeNull();
  });

  it("is null when nothing is connected", () => {
    expect(funderFrom(undefined)).toBeNull();
  });

  it("refuses a malformed caip address rather than guessing at it", () => {
    expect(funderFrom("")).toBeNull();
    expect(funderFrom("eip155")).toBeNull();
    expect(funderFrom("eip155:8453")).toBeNull();
    expect(funderFrom("eip155:8453:")).toBeNull();
    expect(funderFrom("eip155:not-a-number:0xabc")).toBeNull();
  });
});

/*
 * Which wallet signs, when two can be connected at once.
 *
 * A wallet that has approved both Ethereum and Solana holds two accounts, and
 * only one of them can sign any given token. Reading "the active account" —
 * which is what `useAppKitAccount()` with no argument answers — got this wrong
 * in a way that reached the screen: an 0x… address queried for an SPL balance,
 * reported as "Balance unavailable", under a button offering to "Switch to
 * Solana and send". A namespace is not a chain and cannot be switched to.
 */
const EVM_WALLET: Funder = {
  address: "0x458d000000000000000000000000000000002aE5",
  vmType: "evm",
  chainId: 8453,
};
const SOL_WALLET: Funder = {
  address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  vmType: "svm",
  chainId: SOLANA_CHAIN_ID,
};

const BASE = 8453;
const ETHEREUM = 1;

describe("funderForChain", () => {
  it("takes the Solana wallet for a Solana token when both are connected", () => {
    /* The case the user hit: both approved, and the EVM one was answering. */
    expect(funderForChain({ evm: EVM_WALLET, svm: SOL_WALLET }, SOLANA_CHAIN_ID)).toBe(SOL_WALLET);
  });

  it("takes the EVM wallet for an EVM token when both are connected", () => {
    expect(funderForChain({ evm: EVM_WALLET, svm: SOL_WALLET }, BASE)).toBe(EVM_WALLET);
  });

  it("has nothing for a Solana token when only an EVM wallet is connected", () => {
    /* Not "no wallet" — a wallet is connected and cannot sign this. The panel
       has to offer a second connection, not a chain switch. */
    expect(funderForChain({ evm: EVM_WALLET, svm: null }, SOLANA_CHAIN_ID)).toBeNull();
  });

  it("has nothing for an EVM token when only a Solana wallet is connected", () => {
    expect(funderForChain({ evm: null, svm: SOL_WALLET }, BASE)).toBeNull();
  });

  it("offers the EVM wallet on an EVM chain it is not currently on", () => {
    /* This one is a switch, not a connection: same namespace, different chain,
       and the deposit brings the wallet across. */
    const chosen = funderForChain({ evm: EVM_WALLET, svm: null }, ETHEREUM);

    expect(chosen).toBe(EVM_WALLET);
    expect(chosen?.chainId).not.toBe(ETHEREUM);
  });

  it("has nothing when nothing is connected", () => {
    expect(funderForChain({ evm: null, svm: null }, BASE)).toBeNull();
    expect(funderForChain({ evm: null, svm: null }, SOLANA_CHAIN_ID)).toBeNull();
  });

  it("never hands back a wallet from the other namespace", () => {
    /* The invariant under all of the above: whatever comes back can sign. */
    for (const funders of [
      { evm: EVM_WALLET, svm: SOL_WALLET },
      { evm: EVM_WALLET, svm: null },
      { evm: null, svm: SOL_WALLET },
    ]) {
      for (const chainId of [ETHEREUM, BASE, 42161, SOLANA_CHAIN_ID]) {
        const chosen = funderForChain(funders, chainId);
        if (chosen !== null) expect(chosen.vmType).toBe(vmOfChain(chainId));
      }
    }
  });
});

describe("vmOfChain and namespaceOf", () => {
  it("knows Solana by its Relay id and calls everything else EVM", () => {
    expect(vmOfChain(SOLANA_CHAIN_ID)).toBe("svm");
    for (const chainId of [1, 8453, 42161, 10, 137, 56, 43114, 130]) {
      expect(vmOfChain(chainId)).toBe("evm");
    }
  });

  it("maps each VM to the namespace AppKit names it by", () => {
    /* The one place the two vocabularies meet. Getting this pair wrong is how
       a Solana account gets asked for over the eip155 connection. */
    expect(namespaceOf("svm")).toBe("solana");
    expect(namespaceOf("evm")).toBe("eip155");
  });
});
