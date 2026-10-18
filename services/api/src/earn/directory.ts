import { address, type Address } from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { D, ZERO, type Decimal } from "@mercury/core";
import { createLendingRpc } from "../lending/rpc.js";
import { EARN_VAULTS, HIDDEN_VAULTS, curatorOf, type VaultListing } from "./catalog.js";
import type { KaminoApi } from "./kamino-api.js";
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
  /** Every listed vault this wallet holds shares in: one RPC call, whatever the number of vaults. */
  holdings(wallet: string): Promise<readonly EarnHolding[]>;
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
}): EarnDirectory => {
  const rpc = createLendingRpc(opts.rpcUrl);
  const ttlMs = opts.ttlMs ?? 10 * 60_000;
  const picks = new Map(EARN_VAULTS.map((v, i) => [v.address, { listing: v, rank: i }]));
  let cached: { at: number; list: Promise<readonly EarnListing[]> } | null = null;
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
      };
      return listing;
    });
    const rank = (l: EarnListing) => picks.get(l.address)?.rank ?? Number.POSITIVE_INFINITY;
    return rows
      .filter((r): r is EarnListing => r !== null)
      .sort((a, b) => rank(a) - rank(b) || b.tvlUsd.comparedTo(a.tvlUsd));
  };

  const list = () => {
    const now = Date.now();
    if (cached !== null && now - cached.at < ttlMs) return cached.list;
    const fresh = build();
    // While a rebuild runs, the last good list keeps answering.
    const previous = cached?.list;
    fresh.catch(
      () => (cached = previous === undefined ? null : { at: now - ttlMs + 30_000, list: previous }),
    );
    cached = { at: now, list: previous === undefined ? fresh : fresh.catch(() => previous) };
    return cached.list;
  };

  return {
    list,
    api: opts.api,
    defaultVault: opts.defaultVault ?? EARN_VAULTS[0]!.address,
    find: async (vault) => (await list()).find((l) => l.address === vault),
    source: (vault) => {
      let s = sources.get(vault);
      if (s === undefined) {
        s = opts.make(vault);
        sources.set(vault, s);
      }
      return s;
    },
    holdings: async (wallet) => {
      const [listings, accounts] = await Promise.all([
        list(),
        rpc
          .getTokenAccountsByOwner(
            address(wallet),
            { programId: TOKEN_PROGRAM_ADDRESS as Address },
            { encoding: "jsonParsed" },
          )
          .send(),
      ]);
      const held = new Map<string, Decimal>();
      for (const a of accounts.value) {
        const info = (
          a.account.data as { parsed?: { info?: { mint?: string; tokenAmount?: { amount?: string } } } }
        ).parsed?.info;
        if (info?.mint === undefined || info.tokenAmount?.amount === undefined) continue;
        held.set(info.mint, (held.get(info.mint) ?? ZERO).add(D(info.tokenAmount.amount)));
      }
      return listings.flatMap((l) => {
        const raw = held.get(l.sharesMint);
        if (raw === undefined || raw.lte(0)) return [];
        const shares = raw.div(D(10).pow(l.sharesDecimals));
        return [{ listing: l, shares, usdc: shares.mul(l.tokensPerShare) }];
      });
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
