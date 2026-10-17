import { USDC_MINT } from "@mercury/chain";
import type { Db } from "../db/client.js";
import { activities, instruments, orders, users, waitlist } from "../db/schema.js";

/** Rows for the referral tests. Only what each table requires, so a test says what it is about. */
export const seedUser = async (
  db: Db,
  n: number,
  over: { email?: string; createdAt?: Date; referralCode?: string } = {},
) =>
  (
    await db
      .insert(users)
      .values({ privyUserId: `did:privy:${n}`, ...over })
      .returning()
  )[0]!;

export const seedWaitlist = async (db: Db, row: { email: string; slug: string; position: number }) =>
  db.insert(waitlist).values({ ...row, country: "GB" });

export const seedInstrument = async (db: Db, ticker = "NVDA") =>
  (await db.insert(instruments).values({ ticker, name: ticker, sector: "Technology" }).returning())[0]!;

export const seedOrder = async (
  db: Db,
  o: {
    userId: string;
    instrumentId: string;
    side: "buy" | "sell";
    status: "filled" | "executing";
    filledAt?: Date;
    mercuryFeeUsd?: string;
  },
) =>
  (
    await db
      .insert(orders)
      .values({ usdAmount: "100", decision: { kind: "execute" }, ...o })
      .returning()
  )[0]!;

/** USDC arriving in a wallet, as `wallet-events` writes it. */
export const seedUsdcIn = async (
  db: Db,
  a: {
    userId: string;
    usd: string;
    signature: string;
    kind?: "transfer_in" | "transfer_out";
    refTable?: string;
  },
) =>
  db.insert(activities).values({
    userId: a.userId,
    kind: a.kind ?? "transfer_in",
    title: "Added cash",
    amountUsd: a.usd,
    mint: USDC_MINT,
    txSignature: a.signature,
    ...(a.refTable === undefined ? {} : { refTable: a.refTable }),
  });
