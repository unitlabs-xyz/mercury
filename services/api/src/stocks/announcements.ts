import { and, eq, sql } from "drizzle-orm";
import { D, type Decimal } from "@mercury/core";
import type { ChainReader, MintConfig } from "@mercury/chain";
import type { Db } from "../db/client.js";
import {
  activities,
  disposals,
  instruments,
  lots,
  multiplierAnnouncements,
  tokens,
  wallets,
} from "../db/schema.js";
import { notifyFor } from "../notify/inbox.js";
import { followed } from "../wallets/active.js";
import { kindOf } from "./plan.js";

export interface AnnouncementDeps {
  readonly chain: Pick<ChainReader, "mintConfig" | "mintConfigs">;
}

export interface AnnouncementSummary {
  /** Changes newly found on a mint, ahead of their date. */
  readonly announced: number;
  /** Holders told, a wallet each. */
  readonly told: number;
}

const day = (d: Date) =>
  d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const trimmed = (v: Decimal, dp: number) => {
  const s = v.toDecimalPlaces(dp).toFixed();
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};

/**
 * A dividend, told before it lands.
 *
 * xStocks pay a dividend by raising the mint's multiplier, so one token stands
 * for more shares. The issuer writes the next multiplier to the mint ahead of
 * time, with the moment it takes over (`MintConfig.scheduled`). Position-sync
 * sees a dividend only once it is in force, and says so then ("TSLA dividend,
 * paid as shares"). This reads every listed mint for a change still ahead, and
 * tells each wallet holding the token, once: in the feed and the inbox, with
 * the date and about how many shares it adds to theirs.
 *
 * A split (the multiplier more than doubling) is told as a split: more shares,
 * each worth less, nothing earned. A fall is not told: nothing here can say
 * what it is, and guessing would be worse.
 *
 * Holdings are Mercury's records of each followed wallet's tokens of that
 * mint, so a wallet is told about the token it holds, not just the stock.
 */
export async function watchMultiplierAnnouncements(
  db: Db,
  deps: AnnouncementDeps,
  now: Date,
): Promise<AnnouncementSummary> {
  const listed = await db
    .select({ id: tokens.id, mint: tokens.mint, ticker: instruments.ticker })
    .from(tokens)
    .innerJoin(instruments, eq(instruments.id, tokens.instrumentId));
  if (listed.length === 0) return { announced: 0, told: 0 };

  const configs: ReadonlyMap<string, MintConfig> =
    deps.chain.mintConfigs !== undefined
      ? await deps.chain.mintConfigs(listed.map((t) => t.mint))
      : new Map(
          (
            await Promise.all(listed.map(async (t) => [t.mint, await deps.chain.mintConfig(t.mint)] as const))
          ).flatMap(([mint, c]) => (c === null ? [] : [[mint, c] as const])),
        );

  let announced = 0;
  let told = 0;
  for (const token of listed) {
    const config = configs.get(token.mint);
    const next = config?.scheduled;
    if (config === undefined || next === undefined || next.effectiveAt.getTime() <= now.getTime()) continue;
    const kind = kindOf(config.multiplier, next.multiplier);
    if (kind === "unknown") continue;

    told += await db.transaction(async (tx) => {
      const [fresh] = await tx
        .insert(multiplierAnnouncements)
        .values({
          tokenId: token.id,
          oldMultiplier: config.multiplier.toFixed(),
          newMultiplier: next.multiplier.toFixed(),
          effectiveAt: next.effectiveAt,
          kind,
          announcedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: multiplierAnnouncements.id });
      if (fresh === undefined) return 0; // told already
      announced += 1;

      const holders = await holdersOf(tx, token.id);
      const ratio = next.multiplier.div(config.multiplier);
      let n = 0;
      for (const h of holders) {
        const shares = h.tokens.mul(config.multiplier);
        const title =
          kind === "split" ? `${token.ticker} stock split coming` : `${token.ticker} dividend coming`;
        const subtitle =
          kind === "split"
            ? `On ${day(next.effectiveAt)}, each share becomes ${trimmed(ratio, 4)}: your ${trimmed(shares, 6)} become about ${trimmed(shares.mul(ratio), 6)}`
            : `On ${day(next.effectiveAt)}, paid as shares: about ${trimmed(shares.mul(ratio.sub(1)), 6)} more on your ${trimmed(shares, 6)}`;
        const [row] = await tx
          .insert(activities)
          .values({
            userId: h.userId,
            walletId: h.walletId,
            kind: "dividend_notice",
            occurredAt: now,
            title,
            subtitle,
            amountUsd: null,
            refTable: "token",
            refId: token.id,
            mint: token.mint,
          })
          .returning({ id: activities.id });
        await notifyFor(tx, h.userId, [{ activityId: row!.id, kind: "dividend" }]);
        n += 1;
      }
      return n;
    });
  }
  return { announced, told };
}

/** Each followed wallet's tokens of one mint, as its records hold them: lots in, less what left. */
async function holdersOf(
  db: Parameters<Parameters<Db["transaction"]>[0]>[0],
  tokenId: string,
): Promise<readonly { readonly userId: string; readonly walletId: string; readonly tokens: Decimal }[]> {
  const [token] = await db.select({ decimals: tokens.decimals }).from(tokens).where(eq(tokens.id, tokenId));
  if (token === undefined) return [];
  const [ins, outs] = await Promise.all([
    db
      .select({ walletId: lots.walletId, userId: lots.userId, qty: sql<string>`sum(${lots.tokenQty})::text` })
      .from(lots)
      .innerJoin(wallets, eq(wallets.id, lots.walletId))
      .where(and(eq(lots.tokenId, tokenId), followed))
      .groupBy(lots.walletId, lots.userId),
    db
      .select({ walletId: disposals.walletId, qty: sql<string>`sum(${disposals.tokenQty})::text` })
      .from(disposals)
      .where(eq(disposals.tokenId, tokenId))
      .groupBy(disposals.walletId),
  ]);
  const out = new Map(outs.map((o) => [o.walletId, BigInt(o.qty)]));
  return ins.flatMap((r) => {
    const held = BigInt(r.qty) - (out.get(r.walletId) ?? 0n);
    return held > 0n
      ? [
          {
            userId: r.userId,
            walletId: r.walletId,
            tokens: D(held.toString()).div(D(10).pow(token.decimals)),
          },
        ]
      : [];
  });
}
