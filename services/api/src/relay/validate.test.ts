import { describe, expect, it } from "vitest";
import { validateSponsored, type SponsorPolicy, type SponsoredTransaction } from "./validate.js";

const RELAYER = "ReLay1111111111111111111111111111111111111";
const WALLET = "8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6";
const JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

const POLICY: SponsorPolicy = { relayer: RELAYER, allowedPrograms: [JUPITER, TOKEN] };

const tx = (over: Partial<SponsoredTransaction> = {}): SponsoredTransaction => ({
  feePayer: RELAYER,
  signers: [RELAYER, WALLET],
  signedBy: [WALLET],
  programs: [JUPITER, TOKEN],
  ...over,
});

describe("validateSponsored", () => {
  it("signs a swap the account holder has already signed", () => {
    expect(validateSponsored(tx(), WALLET, POLICY)).toEqual({ ok: true });
  });

  it("will not pay for a transaction that names someone else as fee payer", () => {
    const v = validateSponsored(tx({ feePayer: WALLET, signers: [WALLET] }), WALLET, POLICY);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.code).toBe("not_sponsored");
  });

  /*
   * The attack this stands against: a valid session, and a transaction built
   * for somebody else's wallet. The JWT proves who is calling; only this
   * proves the transaction is theirs.
   */
  it("refuses a transaction belonging to another wallet, however valid the session", () => {
    const someoneElse = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
    const v = validateSponsored(tx({ signers: [RELAYER, someoneElse] }), WALLET, POLICY);
    expect(v.ok === false && v.code).toBe("not_your_transaction");
  });

  it("refuses to sign first, so SOL is never spent on an unapproved message", () => {
    const v = validateSponsored(tx({ signedBy: [] }), WALLET, POLICY);
    expect(v.ok === false && v.code).toBe("not_signed");
  });

  /*
   * A third signer is either an authority we cannot supply — the fee is then
   * spent on a transaction that can never land — or an account being made to
   * authorise something under cover of a swap.
   */
  it("refuses a third required signature", () => {
    const other = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
    const v = validateSponsored(tx({ signers: [RELAYER, WALLET, other] }), WALLET, POLICY);
    expect(v.ok === false && v.code).toBe("extra_signer");
    expect(v.ok === false && v.message).toContain(other);
  });

  /*
   * The setting this ships with. Worth a test of its own, so that turning the
   * list on later is a change someone made rather than a default drifting.
   */
  it("sponsors any program when no allowlist is configured", () => {
    const open: SponsorPolicy = { relayer: RELAYER };
    const anything = "Dra1n1111111111111111111111111111111111111";
    expect(validateSponsored(tx({ programs: [anything] }), WALLET, open)).toEqual({ ok: true });
  });

  it("still refuses a wrong fee payer with no allowlist configured", () => {
    const open: SponsorPolicy = { relayer: RELAYER };
    const v = validateSponsored(tx({ feePayer: WALLET, signers: [WALLET] }), WALLET, open);
    expect(v.ok === false && v.code).toBe("not_sponsored");
  });

  it("refuses a program that is not on the allowlist", () => {
    const drainer = "Dra1n1111111111111111111111111111111111111";
    const v = validateSponsored(tx({ programs: [JUPITER, drainer] }), WALLET, POLICY);
    expect(v.ok === false && v.code).toBe("program_not_allowed");
    expect(v.ok === false && v.message).toContain(drainer);
  });

  /*
   * A lookup table can name a program too. This function is given resolved
   * addresses precisely so that one cannot slip past by not being static.
   */
  it("judges a program the same whether it came from a lookup table or not", () => {
    const hidden = "Hidden11111111111111111111111111111111111111";
    expect(validateSponsored(tx({ programs: [hidden] }), WALLET, POLICY).ok).toBe(false);
  });

  it("accepts a transaction the relayer has somehow already signed", () => {
    expect(validateSponsored(tx({ signedBy: [WALLET, RELAYER] }), WALLET, POLICY).ok).toBe(true);
  });
});
