import { describe, expect, it } from "vitest";
import { address, createNoopSigner, none, type Instruction } from "@solana/kit";
import { KaminoAction, PROGRAM_ID } from "@kamino-finance/klend-sdk";
import { USER_SETUP, probeFor, refusalOf, toPosition } from "./kamino.js";
import { LendingRefused, SponsorShort } from "./ports.js";

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

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/* The two reserves a loan touches, as far as `toPosition` reads them. */
const reserves: Record<string, { getTokenSymbol: () => string; getMintDecimals: () => number }> = {
  NvdaReserve: { getTokenSymbol: () => "NVDAx", getMintDecimals: () => 8 },
  UsdcReserve: { getTokenSymbol: () => "USDC", getMintDecimals: () => 6 },
  CbbtcReserve: { getTokenSymbol: () => "cbBTC", getMintDecimals: () => 8 },
};
const stubMarket = { getReserveByAddress: (a: string) => reserves[a] };

/** A loan as the SDK gives it: amounts in base units, interest included, values at Kamino's oracle. */
const obligation = (
  borrows: { reserveAddress: string; mintAddress: string; amount: string; value: string }[],
) => ({
  obligationAddress: "Obligation",
  getDeposits: () => [
    {
      reserveAddress: "NvdaReserve",
      mintAddress: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
      amount: "2239976",
      marketValueRefreshed: "4.8055",
    },
  ],
  getBorrows: () => borrows.map((b) => ({ ...b, marketValueRefreshed: b.value })),
  refreshedStats: {
    userTotalBorrowBorrowFactorAdjusted: "2.10974",
    borrowLimit: "2.11",
    borrowLiquidationLimit: "3.12",
  },
});

describe("toPosition", () => {
  /*
   * $2.11 borrowed and a few minutes of interest: 2,110,008.4 micro-USDC. Kamino
   * values that at its own USDC price, $0.99988, so the debt in dollars is less
   * than the USDC it takes to repay — and the USDC is what a repay must send.
   */
  it("says what is owed in USDC, interest included, apart from what Kamino values it at", () => {
    const p = toPosition(
      stubMarket as never,
      obligation([
        { reserveAddress: "UsdcReserve", mintAddress: USDC_MINT, amount: "2110008.4", value: "2.10974" },
      ]) as never,
    );
    expect(p.owedUsdc.toString()).toBe("2.1100084");
    expect(p.debtUsd.toString()).toBe("2.10974");
  });

  /* Mercury only lends USDC. A borrow of anything else was made elsewhere, and is not repaid in USDC. */
  it("counts only what is owed in USDC", () => {
    const p = toPosition(
      stubMarket as never,
      obligation([
        { reserveAddress: "UsdcReserve", mintAddress: USDC_MINT, amount: "1000000", value: "0.99988" },
        { reserveAddress: "CbbtcReserve", mintAddress: "cbbtcMint", amount: "100", value: "0.08" },
      ]) as never,
    );
    expect(p.owedUsdc.toString()).toBe("1");
  });
});

const KLEND = String(PROGRAM_ID);
const FARMS = "FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr";

describe("refusalOf", () => {
  /* What a repay of $2.11 against $2.110008 owed came back with, on 17 October. */
  it("names a refusal of Kamino's own, by the code the simulation failed with", () => {
    const refused = refusalOf({ InstructionError: [5, { Custom: 6092n }] }, () => KLEND);
    expect(refused).toBeInstanceOf(LendingRefused);
    expect(refused?.code).toBe(6092);
    expect(refused?.reason).toBe("NetValueRemainingTooSmall");
  });

  it("reads the index and code however the node spelled them", () => {
    expect(refusalOf({ InstructionError: ["5", { Custom: "6092" }] }, () => KLEND)?.code).toBe(6092);
  });

  /* Below 6000 the code is the system or token program's — not enough SOL, or not enough tokens. */
  it("is not Kamino's when the code is not", () => {
    expect(refusalOf({ InstructionError: [4, { Custom: 1 }] }, () => KLEND)).toBeNull();
  });

  /* The farms program is Anchor too, and numbers its errors from 6000 as well. */
  it("is not Kamino's lending refusal when another program failed", () => {
    expect(refusalOf({ InstructionError: [5, { Custom: 6092 }] }, () => FARMS)).toBeNull();
  });

  it("is nothing for a failure that is not an instruction's", () => {
    expect(refusalOf("AccountNotFound", () => KLEND)).toBeNull();
    expect(refusalOf({ InstructionError: [2, "InvalidAccountData"] }, () => KLEND)).toBeNull();
  });
});

describe("probeFor", () => {
  /* What a first loan met on 17 October: 0.0144 SOL in the relayer against 0.0295 of setup and wallet. */
  it("refuses to sponsor what the relayer cannot cover, before anything is simulated", () => {
    const short = (() => {
      try {
        probeFor("ReLaYeR", 14_440_977n, 29_504_640n);
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(short).toBeInstanceOf(SponsorShort);
    expect((short as SponsorShort).heldLamports).toBe(14_440_977n);
    // What it needs, and the reserve the relayer keeps for its own signatures.
    expect((short as SponsorShort).neededLamports).toBe(30_504_640n);
  });

  it("probes with all but the relayer's reserve when it can cover what is needed", () => {
    expect(probeFor("ReLaYeR", 165_168_265n, 29_504_640n)).toBe(164_168_265n);
  });

  it("refuses when the relayer holds no more than its reserve, whatever is needed", () => {
    expect(() => probeFor("ReLaYeR", 1_000_000n, 0n)).toThrow(SponsorShort);
  });
});
