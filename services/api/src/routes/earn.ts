import { Hono } from "hono";
import { z } from "zod";
import { D, Decimal, toWire, ZERO } from "@mercury/core";
import type { ChainHistory, ChainReader } from "@mercury/chain";
import { SponsorShort } from "../lending/ports.js";
import { EarnRefused } from "../earn/kamino-vault.js";
import type { EarnDirectory, EarnListing } from "../earn/directory.js";
import type { KaminoApi, VaultPoint } from "../earn/kamino-api.js";
import type { EarnLedger } from "../earn/store.js";
import { recordMove } from "../earn/record.js";
import { EARN_RISK_VERSION } from "../earn/risk.js";
import type { EarnSends } from "../earn/sends.js";
// Loads the ContextVariableMap declaration so `c.get("identity")` is typed.
import type {} from "../auth/middleware.js";
import type { SponsoredBuilds } from "../relay/builds.js";
import { logger } from "../log/index.js";

const log = logger("earn");

export interface EarnDeps {
  readonly directory: EarnDirectory;
  /** Kamino's API, for history and market names. */
  readonly api: KaminoApi;
  readonly chain: ChainReader;
  readonly history: ChainHistory;
  readonly usdcMint: string;
  readonly ledger: EarnLedger;
  /** The relayer, when sponsorship is on: it pays every fee, as it does for loans. */
  readonly relay?: { readonly relayer: string; readonly builds: SponsoredBuilds };
  /** Told about every move built, so the send path records it whether or not the app confirms. */
  readonly sends?: Pick<EarnSends, "remember">;
}

const fail = (code: string, message: string) => ({ error: { code, message } });

const Amount = z.string().regex(/^\d+(\.\d+)?$/, "expected a decimal string");

const Request = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("deposit"),
    usd: z.union([Amount, z.literal("all")]),
    vault: z.string().optional(),
  }),
  z.object({
    kind: z.literal("withdraw"),
    usd: z.union([Amount, z.literal("all")]),
    vault: z.string().optional(),
  }),
]);

const ConfirmRequest = z.object({ signature: z.string().min(1), action: Request });

const Settings = z.object({ vault: z.string() });

const RiskAccepted = z.object({ version: z.string() });

const RANGES = { "1M": 30, "3M": 90, "1Y": 365 } as const;

const usd = (d: Decimal) => toWire(d.toDecimalPlaces(2, Decimal.ROUND_DOWN));
const ratio = (d: Decimal | null) => (d === null ? null : toWire(d.toDecimalPlaces(6)));
const tiny = (d: Decimal) => toWire(d.toDecimalPlaces(6, Decimal.ROUND_DOWN));

/** A listed vault on the wire. Mercury's picks carry our own words; the rest carry nulls there. */
export const vaultJson = (l: EarnListing) => ({
  address: l.address,
  name: l.name,
  picked: l.picked !== null,
  curator: l.curator,
  kind: l.picked?.kind ?? null,
  logo: l.logo,
  blurb: l.picked?.blurb ?? null,
  apy: ratio(l.apy),
  apy7d: ratio(l.apy7d),
  apy30d: ratio(l.apy30d),
  apy365d: ratio(l.apy365d),
  tvlUsd: usd(l.tvlUsd),
  holders: l.holders,
  performanceFee: toWire(l.performanceFee),
  managementFee: toWire(l.managementFee),
  minDepositUsd: toWire(l.minDepositUsdc),
  full: l.full,
  offered: l.offered,
});

/**
 * One point a day: the day's average rate and its last size.
 *
 * Kamino answers hourly for a month or less, and an hour's rate swings with
 * one borrower — 4% to 9.7% inside a day, measured on Steakhouse USDC in
 * October 2026. Drawn hour by hour that is noise somebody would read as the
 * rate; a day's average is what a deposit actually earned that day.
 */
export const daily = (points: readonly VaultPoint[]): VaultPoint[] => {
  const days = new Map<string, VaultPoint[]>();
  for (const p of points) {
    const day = p.at.slice(0, 10);
    days.set(day, [...(days.get(day) ?? []), p]);
  }
  return [...days].map(([day, ps]) => ({
    at: `${day}T00:00:00.000Z`,
    apy: ps.reduce((s, p) => s.add(p.apy), ZERO).div(ps.length),
    tvlUsd: ps.at(-1)!.tvlUsd,
    sharePrice: ps.at(-1)!.sharePrice,
  }));
};

/**
 * What a vault has earned for this wallet: its value now, less what was put
 * in, plus what came back. Nothing recorded against it — shares bought outside
 * the app, or a confirm that never arrived — has no basis to measure from, and
 * reports nothing earned rather than its whole value.
 */
const earnedOn = (balance: Decimal, net: Decimal | undefined) =>
  net === undefined || balance.isZero() ? ZERO : Decimal.max(ZERO, balance.sub(net));

/**
 * Earn: idle USDC lent out through Kamino Earn vaults, put in and taken back
 * by the person, a vault at a time. Mercury's picks come first; every other
 * USDC vault that clears the bar is offered after them. Nothing moves on its
 * own. Writes return unsigned transactions for the wallet to sign, with the
 * relayer paying.
 */
export function earnRoutes(deps: EarnDeps): Hono {
  const app = new Hono();

  const walletUsdc = async (wallet: string) => {
    const balances = await deps.chain.tokenBalances(wallet);
    const b = balances.find((x) => x.mint === deps.usdcMint);
    return b === undefined ? ZERO : D(b.rawAmount.toString()).div(D(10).pow(b.decimals));
  };

  /**
   * Where new cash goes by default: the vault last moved into, else the
   * configured default, else the first on offer. Each only while it is on the
   * list, or a deposit nobody pointed at a vault would be refused.
   */
  const defaultFor = async (userId: string) => {
    const { vault } = await deps.ledger.settings(userId);
    for (const v of [vault, deps.directory.defaultVault]) {
      if (v !== null && (await deps.directory.find(v)) !== undefined) return v;
    }
    return (await deps.directory.list())[0]?.address ?? deps.directory.defaultVault;
  };

  /** What this account has in Earn, vault by vault. */
  app.get("/v1/earn", async (c) => {
    const identity = c.get("identity");
    const wallet = identity.walletAddress;
    const [selected, settings, net, cash, holdings] = await Promise.all([
      defaultFor(identity.userId),
      deps.ledger.settings(identity.userId),
      deps.ledger.netDeposited(identity.userId),
      wallet === null ? ZERO : walletUsdc(wallet),
      wallet === null ? [] : deps.directory.holdings(wallet),
    ]);
    const rows = holdings.map((h) => ({
      ...vaultJson(h.listing),
      balanceUsd: usd(h.usdc),
      earnedUsd: tiny(earnedOn(h.usdc, net.get(h.listing.address))),
    }));
    const total = holdings.reduce((s, h) => s.add(h.usdc), ZERO);
    const earned = holdings.reduce((s, h) => s.add(earnedOn(h.usdc, net.get(h.listing.address))), ZERO);
    return c.json({
      selected,
      holdings: rows,
      balanceUsd: usd(total),
      earnedUsd: tiny(earned),
      // The rate the whole balance earns now: each vault's, weighted by what is in it.
      apy: total.isZero()
        ? null
        : ratio(holdings.reduce((s, h) => s.add(h.listing.apy.mul(h.usdc)), ZERO).div(total)),
      walletUsd: usd(cash),
      // Whether the current wording of the risks is accepted: the first deposit asks until it is.
      riskAccepted: settings.riskAccepted === EARN_RISK_VERSION,
    });
  });

  /**
   * Accept Earn's risks, as worded at `version`. Only the current wording
   * counts: an app showing older words is told to show the new ones.
   */
  app.put("/v1/earn/risk", async (c) => {
    const parsed = RiskAccepted.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", parsed.error.message), 400);
    if (parsed.data.version !== EARN_RISK_VERSION) {
      return c.json(fail("risk_changed", "The wording has changed since. Read it again."), 409);
    }
    await deps.ledger.save(c.get("identity").userId, { riskAccepted: EARN_RISK_VERSION });
    return c.json({ accepted: EARN_RISK_VERSION });
  });

  /** Every vault on offer, Mercury's picks first. The page searches and pages through it. */
  app.get("/v1/earn/vaults", async (c) => {
    const list = await deps.directory.list();
    return c.json({ vaults: list.map(vaultJson) });
  });

  /** A vault's rate and size over time, and where its money is lent right now. */
  app.get("/v1/earn/vaults/:address", async (c) => {
    const address = c.req.param("address");
    // A vault somebody still holds keeps its page after it leaves the list.
    if (!(await deps.directory.known(address))) {
      return c.json(fail("not_found", "Mercury does not offer that vault."), 404);
    }
    const range = c.req.query("range") ?? "1M";
    // Own keys only: `RANGES["constructor"]` is a function, not a missing range.
    if (!Object.hasOwn(RANGES, range)) return c.json(fail("bad_range", "Ranges are 1M, 3M and 1Y."), 400);
    const days = RANGES[range as keyof typeof RANGES];

    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    const [points, allocation, names] = await Promise.all([
      deps.api.history(address, from, to),
      // `?lite=1` is a card's sparkline: the rate alone, without reading the vault's holdings off the chain.
      c.req.query("lite") === "1"
        ? []
        : deps.directory
            .source(address)
            .allocation()
            .catch(() => []),
      deps.api.marketNames(),
    ]);
    const lent = allocation.reduce((s, a) => s.add(a.usdc), ZERO);
    return c.json({
      range,
      points: daily(points ?? []).map((p) => ({ at: p.at, apy: ratio(p.apy), tvlUsd: usd(p.tvlUsd) })),
      allocation: allocation.map((a) => ({
        market: a.market,
        name: (names.get(a.market) ?? "Kamino market").replace(/ Market$/, ""),
        share: lent.isZero() ? "0" : toWire(a.usdc.div(lent).toDecimalPlaces(4)),
      })),
    });
  });

  /** The vault new cash goes to by default. Only the preference: no money moves. */
  app.put("/v1/earn/settings", async (c) => {
    const parsed = Settings.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", parsed.error.message), 400);
    if ((await deps.directory.find(parsed.data.vault)) === undefined) {
      return c.json(fail("not_found", "Mercury does not offer that vault."), 404);
    }
    await deps.ledger.save(c.get("identity").userId, { vault: parsed.data.vault });
    return c.json({ vault: parsed.data.vault });
  });

  app.post("/v1/earn/transactions", async (c) => {
    const identity = c.get("identity");
    const wallet = identity.walletAddress;
    if (wallet === null) return c.json(fail("unauthorized", "No wallet on this session."), 401);
    const parsed = Request.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", parsed.error.message), 400);
    const body = parsed.data;

    const vault = body.vault ?? (await defaultFor(identity.userId));
    const listing = await deps.directory.find(vault);
    const unknown = () => c.json(fail("not_found", "Mercury does not offer that vault."), 404);

    /*
     * Money goes in only to a vault on the list. It comes out of any Kamino
     * USDC vault: one that left the list still holds somebody's cash, and
     * refusing it would strand them.
     */
    let intent;
    if (body.kind === "deposit") {
      if (listing === undefined) return unknown();
      // Withdrawals never wait on this: it is about putting money at risk, not taking it back.
      if ((await deps.ledger.settings(identity.userId)).riskAccepted !== EARN_RISK_VERSION) {
        return c.json(fail("risk_not_accepted", "Read and accept how Earn works first."), 409);
      }
      if (listing.full) return c.json(fail("vault_full", "This vault is full. Pick another."), 409);
      const cash = await walletUsdc(wallet);
      const amount = body.usd === "all" ? cash : D(body.usd);
      if (amount.lte(0)) return c.json(fail("insufficient_cash", "No cash to move."), 409);
      if (amount.lt(listing.minDepositUsdc)) {
        return c.json(
          fail("below_minimum", `The least you can move is $${listing.minDepositUsdc.toFixed(2)}.`),
          409,
        );
      }
      if (amount.gt(cash)) return c.json(fail("insufficient_cash", "Not enough cash."), 409);
      intent = { kind: "deposit", usdc: amount } as const;
    } else {
      if (listing === undefined && !(await deps.directory.known(vault))) return unknown();
      // Read off the chain, not the list: what is withdrawn has to be exact.
      const position = await deps.directory.source(vault).position(wallet);
      if (position === null) return c.json(fail("nothing_to_withdraw", "Nothing in this vault."), 409);
      if (body.usd !== "all" && D(body.usd).lte(0)) {
        return c.json(fail("validation_failed", "Withdraw more than nothing."), 400);
      }
      // Asking for all of it, or near enough, takes every share, so no dust is left behind.
      const all = body.usd === "all" || D(body.usd).gte(position.usdc.sub(D("0.01")));
      intent = { kind: "withdraw", usdc: all ? "all" : D(body.usd) } as const;
    }

    let built;
    try {
      built = await deps.directory.source(vault).build(wallet, intent, deps.relay?.relayer);
    } catch (error: unknown) {
      if (error instanceof SponsorShort) {
        log.error(
          {
            relayer: error.relayer,
            heldLamports: String(error.heldLamports),
            neededLamports: String(error.neededLamports),
          },
          "the relayer is short of SOL to sponsor an Earn move",
        );
        return c.json(fail("upstream_unavailable", "Earn is unavailable right now. Try again shortly."), 503);
      }
      if (error instanceof EarnRefused) {
        log.warn({ vault, detail: error.detail, logs: error.logs.slice(-8) }, "the vault would refuse this");
        /*
         * Going in, the vault is full or closed, and another vault will take it.
         * Coming out, it has lent out nearly all its cash, and only time or a
         * smaller amount helps: no other vault holds this person's shares.
         */
        const message =
          body.kind === "deposit"
            ? "This vault can't take that right now. Try another."
            : "This vault can't pay that out right now: it has lent out nearly all its cash. Try a smaller amount, or again shortly.";
        return c.json(fail("vault_refused", message), 409);
      }
      throw error;
    }
    for (const m of built.messages) {
      deps.relay?.builds.remember(m);
      deps.sends?.remember(m, { userId: identity.userId, wallet, kind: body.kind, vault });
    }
    return c.json({ transactions: built.transactions, vault, expiresAt: built.expiresAt.toISOString() });
  });

  /**
   * Record what a signed Earn transaction moved (see `recordMove`). The send
   * path records it too, so this is the fast path rather than the only one.
   */
  app.post("/v1/earn/confirm", async (c) => {
    const identity = c.get("identity");
    const wallet = identity.walletAddress;
    if (wallet === null) return c.json(fail("unauthorized", "No wallet on this session."), 401);
    const parsed = ConfirmRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", parsed.error.message), 400);
    const { signature, action } = parsed.data;

    const result = await recordMove(deps, {
      userId: identity.userId,
      wallet,
      kind: action.kind,
      vault: action.vault ?? (await defaultFor(identity.userId)),
      signature,
    });
    if (result.kind === "pending") {
      return c.json(fail("transaction_pending", "Transaction is not settled yet. Try again shortly."), 409);
    }
    if (result.kind === "refused") return c.json(fail(result.code, result.message), 422);
    return c.json({ recorded: result.written, usd: usd(result.usdc) });
  });

  return app;
}
