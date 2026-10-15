import { describe, expect, it } from "vitest";
import { address, createNoopSigner, none, type Instruction } from "@solana/kit";
import { KaminoAction, PROGRAM_ID } from "@kamino-finance/klend-sdk";
import { USER_SETUP } from "./kamino.js";

const OWNER = createNoopSigner(address("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"));

/**
 * A market Kamino has never seen this wallet in: no user metadata yet.
 *
 * Only these two are read by the setup step. Creating a lookup table asks the
 * chain for a recent slot, so the stub answers that rather than letting a
 * table it should not make fail for an unrelated reason.
 */
const market = {
  programId: PROGRAM_ID,
  getUserMetadata: async () => [OWNER.address, null] as const,
  getRpc: () => ({ getSlot: () => ({ send: async () => 1n }) }),
};

/*
 * The SDK's own first-time user setup, the step every builder `build` calls
 * goes through for a new wallet. It is private in the SDK's types; reaching it
 * through a builder would mean loading a whole market from the chain.
 */
type SetupStep = (props: {
  kaminoMarket: typeof market;
  owner: typeof OWNER;
  payer: typeof OWNER;
  referrer: ReturnType<typeof none>;
  initUserMetadata: typeof USER_SETUP;
}) => Promise<{ ixs: Instruction[]; labels: string[] }>;

const firstTimeSetup = () =>
  (KaminoAction as unknown as { buildUserMetadataSetupIxs: SetupStep }).buildUserMetadataSetupIxs({
    kaminoMarket: market,
    owner: OWNER,
    payer: OWNER,
    referrer: none(),
    initUserMetadata: USER_SETUP,
  });

describe("a first-time borrower's user setup", () => {
  it("creates no lookup table", async () => {
    const { labels } = await firstTimeSetup();
    expect(labels.filter((l) => l.startsWith("createUserLutIx"))).toEqual([]);
  });

  it("still creates the user metadata, naming no lookup table in it", async () => {
    const { ixs, labels } = await firstTimeSetup();
    const i = labels.findIndex((l) => l.startsWith("initUserMetadata"));
    expect(i).toBeGreaterThanOrEqual(0);
    // After the 8-byte discriminator, the table's address: the default key, all zeroes.
    expect([...(ixs[i]!.data ?? []).slice(8, 40)]).toEqual(new Array(32).fill(0));
  });
});
