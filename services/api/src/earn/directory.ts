import { address, type Address } from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { D, ZERO, type Decimal } from "@mercury/core";
import { createLendingRpc } from "../lending/rpc.js";
import { EARN_VAULTS, HIDDEN_VAULTS, curatorOf, type VaultListing } from "./catalog.js";
import type { KaminoApi, ListedVault } from "./kamino-api.js";
import type { EarnSource } from "./ports.js";

/** A vault Mercury offers, as the list shows it. Everything here comes from Kamino's API; nothing reads the chain. */
export interface EarnListing {
  readonly address: string;
  readonly name: string;
  /** Mercury's pick, with our own words beside it; the rest are offered as Kamino lists them. */
  readonly picked: VaultListing | null;
  /** Who runs it: ours for a pick, read off the name otherwise, null when the name says nothing. */
  readonly curator: string | null;
  /** A mark the web app ships under /earn. */
  readonly logo: string | null;
  /** Rate right now, after fees, and its averages, 0–1. */
  readonly apy: Decimal;
  readonly apy7d: Decimal | null;
  readonly apy30d: Decimal | null;
  readonly apy365d: Decimal | null;
  readonly tvlUsd: Decimal;
  readonly holders: number;
  readonly performanceFee: Decimal;
  readonly managementFee: Decimal;
  readonly minDepositUsdc: Decimal;
  /** At its deposit cap: it takes nothing more. */
  readonly full: boolean;
  readonly sharesMint: string;
  readonly sharesDecimals: number;
  /** USDC one share withdraws as, at Kamino's last reading. */
  readonly tokensPerShare: Decimal;
  /**
   * On the list today. False for a vault this wallet still holds after it
   * dropped off: Kamino's API could not be read for it, or it shrank under the
   * bar. It can be withdrawn from, never deposited into.
   */
  readonly offered: boolean;
}

export interface EarnHolding {
  readonly listing: EarnListing;
  readonly shares: Decimal;
  readonly usdc: Decimal;
}

export interface EarnDirectory {
  /** Mercury's picks in their order, then every other eligible vault, largest first. */
  list(): Promise<readonly EarnListing[]>;
  find(vault: string): Promise<EarnListing | undefined>;
  /** The adapter that reads a vault on the chain and builds its transactions. */
  source(vault: string): EarnSource;
  /**
   * Every vault this wallet holds shares in: the listed ones at the list's
   * price, and any Kamino USDC vault no longer listed read off the chain, so
   * money never drops off the screen because a vault dropped off the list.
   */
  holdings(wallet: string): Promise<readonly EarnHolding[]>;
  /** Any Kamino USDC vault, offered or not: what can be withdrawn from and confirmed. */
  known(vault: string): Promise<boolean>;
  readonly defaultVault: string;
  /** Kamino's API, shared, so its caches are too. */
  readonly api: KaminoApi;
}

/**
 * The bar a vault clears to be offered at all. Kamino runs about a hundred
 * USDC vaults, and many are a curator's test with a few dollars in it.
 */
const MIN_TVL_USD = 50_000;
const MIN_HOLDERS = 5;

/** How many Kamino metric requests run at once while the list is built. */
const CONCURRENCY = 8;

const pool = async <T, R>(items: readonly T[], n: number, f: (t: T) => Promise<R>): Promise<R[]> => {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await f(items[i]!);
      }
    }),
  );
  return out;
};

export const earnDirectory = (opts: {
  api: KaminoApi;
  usdcMint: string;
  rpcUrl: string;
  make: (vault: string) => EarnSource;
  defaultVault?: string;
  /** How long a built list is reused. */
  ttlMs?: number;
  /** This wallet's raw balance of every token it holds, by mint. Read from the node when left out. */
  shareBalances?: (wallet: string) => Promise<ReadonlyMap<string, Decimal>>;
  now?: () => number;
}): EarnDirectory => {
  const rpc = createLendingRpc(opts.rpcUrl);
  const ttlMs = opts.ttlMs ?? 10 * 60_000;
  const now = opts.now ?? Date.now;
  const picks = new Map(EARN_VAULTS.map((v, i) => [v.address, { listing: v, rank: i }]));
  const sources = new Map<string, EarnSource>();

  const build = async (): Promise<readonly EarnListing[]> => {
    const all = (await opts.api.vaults()).filter(
      (v) => v.tokenMint === opts.usdcMint && !HIDDEN_VAULTS.has(v.address),
    );
    const rows = await pool(all, CONCURRENCY, async (v) => {
      const m = await opts.api.metrics(v.address);
      if (m === null || m.apy === null || m.tvlUsd === null || m.tokensPerShare === null) return null;
      const pick = picks.get(v.address) ?? null;
      // Mercury's picks are offered whatever their size today; everything else has to clear the bar.
      if (pick === null && (m.tvlUsd.lt(MIN_TVL_USD) || (m.holders ?? 0) < MIN_HOLDERS)) return null;
      const factor = D(10).pow(v.tokenDecimals);
      const cap = D(v.depositCap.toString()).div(factor);
      const listing: EarnListing = {
        address: v.address,
        name: v.name || "Kamino vault",
        picked: pick?.listing ?? null,
        curator: pick?.listing.curator ?? curatorOf(v.name)?.curator ?? null,
        logo: pick?.listing.logo ?? curatorOf(v.name)?.logo ?? null,
        apy: m.apy,
        apy7d: m.apy7d,
        apy30d: m.apy30d,
        apy365d: m.apy365d,
        tvlUsd: m.tvlUsd,
        holders: m.holders ?? 0,
        performanceFee: D(v.performanceFeeBps).div(10_000),
        managementFee: D(v.managementFeeBps).div(10_000),
        minDepositUsdc: D(v.minDeposit.toString()).div(factor),
        full: cap.gt(0) && m.tvlUsd.gte(cap.sub(1)),
        sharesMint: v.sharesMint,
        sharesDecimals: v.sharesDecimals,
        tokensPerShare: m.tokensPerShare,
        offered: true,
      };
      return listing;
    });
    const rank = (l: EarnListing) => picks.get(l.address)?.rank ?? Number.POSITIVE_INFINITY;
    return rows
      .filter((r): r is EarnListing => r !== null)
      .sort((a, b) => rank(a) - rank(b) || b.tvlUsd.comparedTo(a.tvlUsd));
  };

  /*
   * Built once, then rebuilt in the background when its time is up: the last
   * good list answers meanwhile, so nobody waits on a hundred calls to Kamino.
   * Only the very first build is waited for, there being nothing to answer
   * with yet. A failed rebuild keeps the old list and tries again in 30s.
   */
  let good: { at: number; list: readonly EarnListing[] } | null = null;
  let building: Promise<readonly EarnListing[]> | null = null;

  const rebuild = () => {
    if (building !== null) return building;
    const fresh = build();
    building = fresh;
    fresh.then(
      (list) => {
        good = { at: now(), list };
      },
      () => {
        if (good !== null) good = { ...good, at: now() - ttlMs + 30_000 };
      },
    );
    void fresh.finally(() => (building = null)).catch(() => undefined);
    return fresh;
  };

  const list = async (): Promise<readonly EarnListing[]> => {
    if (good === null) return rebuild();
    if (now() - good.at >= ttlMs) void rebuild().catch(() => undefined);
    return good.list;
  };

  const source = (vault: string) => {
    let s = sources.get(vault);
    if (s === undefined) {
      s = opts.make(vault);
      sources.set(vault, s);
    }
    return s;
  };

  /** Every USDC vault Kamino runs, offered or not, hidden ones included: shares in any of them are cash. */
  const usdcVaults = async () => (await opts.api.vaults()).filter((v) => v.tokenMint === opts.usdcMint);

  const shareBalances =
    opts.shareBalances ??
    (async (wallet: string) => {
      const accounts = await rpc
        .getTokenAccountsByOwner(
          address(wallet),
          { programId: TOKEN_PROGRAM_ADDRESS as Address },
          { encoding: "jsonParsed" },
        )
        .send();
      const held = new Map<string, Decimal>();
      for (const a of accounts.value) {
        const info = (
          a.account.data as { parsed?: { info?: { mint?: string; tokenAmount?: { amount?: string } } } }
        ).parsed?.info;
        if (info?.mint === undefined || info.tokenAmount?.amount === undefined) continue;
        held.set(info.mint, (held.get(info.mint) ?? ZERO).add(D(info.tokenAmount.amount)));
      }
      return held;
    });

  /**
   * A vault this wallet holds that the list does not carry, read off the chain:
   * its share price and rate now, without Kamino's API. Its size, depositors
   * and averages are not known here, and nothing reads them for a vault that
   * is only there to be withdrawn from.
   */
  const unlisted = async (v: ListedVault, raw: Decimal): Promise<EarnHolding> => {
    const chain = await source(v.address).vault();
    const pick = picks.get(v.address)?.listing ?? null;
    const named = curatorOf(v.name);
    const shares = raw.div(D(10).pow(v.sharesDecimals));
    return {
      listing: {
        address: v.address,
        name: v.name || chain.name,
        picked: pick,
        curator: pick?.curator ?? named?.curator ?? null,
        logo: pick?.logo ?? named?.logo ?? null,
        apy: chain.apy,
        apy7d: null,
        apy30d: null,
        apy365d: null,
        tvlUsd: ZERO,
        holders: 0,
        performanceFee: chain.performanceFee,
        managementFee: chain.managementFee,
        minDepositUsdc: chain.minDepositUsdc,
        full: false,
        sharesMint: v.sharesMint,
        sharesDecimals: v.sharesDecimals,
        tokensPerShare: chain.sharePrice,
        offered: false,
      },
      shares,
      usdc: shares.mul(chain.sharePrice),
    };
  };

  return {
    list,
    api: opts.api,
    defaultVault: opts.defaultVault ?? EARN_VAULTS[0]!.address,
    find: async (vault) => (await list()).find((l) => l.address === vault),
    source,
    known: async (vault) =>
      (await list().catch(() => [])).some((l) => l.address === vault) ||
      (await usdcVaults()).some((v) => v.address === vault),
    holdings: async (wallet) => {
      const [listings, every, held] = await Promise.all([
        list(),
        // Unreadable, the list is all there is to go on, as before.
        usdcVaults().catch(() => null),
        shareBalances(wallet),
      ]);
      const has = (mint: string) => (held.get(mint) ?? ZERO).gt(0);
      const listed = await Promise.all(
        listings
          .filter((l) => has(l.sharesMint))
          .map(async (l) => {
            const shares = held.get(l.sharesMint)!.div(D(10).pow(l.sharesDecimals));
            // The chain's price now. The list's is Kamino's API, up to twenty
            // minutes old, and is only the fallback when the chain can't be read.
            const price = await source(l.address)
              .vault()
              .then(
                (v) => v.sharePrice,
                () => l.tokensPerShare,
              );
            return { listing: l, shares, usdc: shares.mul(price) };
          }),
      );
      const onList = new Set(listings.map((l) => l.sharesMint));
      const off = (every ?? []).filter((v) => !onList.has(v.sharesMint) && has(v.sharesMint));
      return [...listed, ...(await Promise.all(off.map((v) => unlisted(v, held.get(v.sharesMint)!))))];
    },
  };
};

/** Everything this wallet holds in Earn, in USDC. Throws when it cannot be read, as a snapshot needs. */
export const earnBalance = async (directory: EarnDirectory, wallet: string) =>
  (await directory.holdings(wallet)).reduce((s, h) => s.add(h.usdc), ZERO);

/** The whole Earn balance and the rate it earns now, weighted by what is in each vault. */
export const earnSummary = async (directory: EarnDirectory, wallet: string) => {
  const holdings = await directory.holdings(wallet);
  const balance = holdings.reduce((s, h) => s.add(h.usdc), ZERO);
  const apy = balance.isZero()
    ? null
    : holdings.reduce((s, h) => s.add(h.listing.apy.mul(h.usdc)), ZERO).div(balance);
  return { balance, apy };
};
