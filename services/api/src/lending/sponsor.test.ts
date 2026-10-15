import { describe, expect, it } from "vitest";
import type { Address, Instruction } from "@solana/kit";
import {
  ASSOCIATED_TOKEN_PROGRAM,
  SYSTEM_PROGRAM,
  TOKEN_PROGRAM,
  rentForMissing,
  sponsorRents,
  tokenAccountsCreatedBy,
  topUp,
  transferSol,
} from "./sponsor.js";

const A = (s: string) => s as Address;
const TOKEN_2022 = A("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

/** An associated-token create, with the new account second and the token program sixth. */
const createAta = (account: string, tokenProgram: Address, kind = 1): Instruction => ({
  programAddress: ASSOCIATED_TOKEN_PROGRAM,
  accounts: [A("payer"), A(account), A("owner"), A("mint"), SYSTEM_PROGRAM, tokenProgram].map((address) => ({
    address,
    role: 0 as const,
  })),
  data: new Uint8Array([kind]),
});

/* What mainnet answered on 15 October 2026 for a wallet, a USDC account and a stock's. */
const RENTS = { wallet: 650_240n, token: 1_488_440n, token2022: 1_559_560n };

describe("topUp", () => {
  it("creates an empty wallet: covers what is spent and leaves it rent exempt", () => {
    expect(topUp(0n, 30_000_000n, RENTS.wallet)).toBe(30_000_000n + RENTS.wallet);
  });

  it("sends only the shortfall to a wallet that has some SOL", () => {
    expect(topUp(10_000_000n, 30_000_000n, RENTS.wallet)).toBe(20_000_000n + RENTS.wallet);
  });

  it("sends nothing to a wallet that can already pay and stay rent exempt", () => {
    expect(topUp(40_000_000n, 30_000_000n, RENTS.wallet)).toBe(0n);
  });

  it("sends nothing when the transaction spends nothing, even to an empty wallet", () => {
    expect(topUp(0n, 0n, RENTS.wallet)).toBe(0n);
    expect(topUp(0n, -5_000n, RENTS.wallet)).toBe(0n);
  });

  /* The minimum is the node's to say. A wallet left at less is one the runtime refuses. */
  it("leaves the wallet holding exactly the minimum it is given", () => {
    expect(topUp(0n, 30_000_000n, 890_880n)).toBe(30_000_000n + 890_880n);
  });
});

describe("transferSol", () => {
  it("is a system transfer: instruction 2, then the lamports little-endian", () => {
    const ix = transferSol(A("relayer"), A("user"), 1_000n);
    expect(ix.programAddress).toBe(SYSTEM_PROGRAM);
    expect(ix.accounts).toEqual([
      { address: "relayer", role: 3 },
      { address: "user", role: 1 },
    ]);
    expect([...ix.data!]).toEqual([2, 0, 0, 0, 0xe8, 0x03, 0, 0, 0, 0, 0, 0]);
  });
});

describe("token accounts an action creates", () => {
  it("finds Create and CreateIdempotent, and ignores everything else", () => {
    const other: Instruction = { programAddress: A("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD") };
    const found = tokenAccountsCreatedBy([
      createAta("usdcAta", TOKEN_PROGRAM, 1),
      other,
      createAta("stockAta", TOKEN_2022, 0),
    ]);
    expect(found.map((f) => f.account)).toEqual(["usdcAta", "stockAta"]);
  });

  it("charges rent only for accounts that do not exist yet, once each, by token program", () => {
    const created = tokenAccountsCreatedBy([
      createAta("usdcAta", TOKEN_PROGRAM),
      createAta("usdcAta", TOKEN_PROGRAM),
      createAta("stockAta", TOKEN_2022),
      createAta("existing", TOKEN_PROGRAM),
    ]);
    expect(rentForMissing(created, new Set(["existing"]), RENTS)).toBe(RENTS.token + RENTS.token2022);
  });
});

describe("sponsorRents", () => {
  it("asks for a wallet, a USDC account and a stock's account", async () => {
    const asked: number[] = [];
    const rents = await sponsorRents({
      rentExemption: async (bytes) => {
        asked.push(bytes);
        return BigInt(bytes);
      },
    });
    expect(asked.sort((a, b) => a - b)).toEqual([0, 165, 179]);
    expect(rents).toEqual({ wallet: 0n, token: 165n, token2022: 179n });
  });

  it("falls back to the rate measured on mainnet when nothing can be asked", async () => {
    expect(await sponsorRents({})).toEqual(RENTS);
  });
});
