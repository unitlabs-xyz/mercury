import type { Decimal } from "@mercury/core";
import type { KaminoApi } from "./kamino-api.js";

const DAY_MS = 86_400_000;

/**
 * What one share of a vault was worth on a day, in dollars: the last of
 * Kamino's daily readings at or before the moment, else the first after it
 * within a day (a transfer earlier in the day than that day's reading), else
 * the vault's share price now. Null only when Kamino says nothing at all: the
 * caller waits rather than guess.
 *
 * Daily, so a transfer is valued up to a day's interest off, a few hundredths
 * of a percent; the ledger marks it as estimated for that reason.
 */
export async function sharePriceOn(
  api: Pick<KaminoApi, "history"> & Partial<Pick<KaminoApi, "metrics">>,
  vault: string,
  at: Date,
): Promise<Decimal | null> {
  const points = await api.history(
    vault,
    new Date(at.getTime() - 3 * DAY_MS),
    new Date(at.getTime() + DAY_MS),
  );
  if (points === null || points.length === 0) return latest(api, vault);
  const dated = points
    .map((p) => ({ at: new Date(p.at).getTime(), price: p.sharePrice }))
    .filter((p) => !Number.isNaN(p.at) && p.price.gt(0))
    .sort((a, b) => a.at - b.at);
  const before = dated.filter((p) => p.at <= at.getTime()).at(-1);
  if (before !== undefined) return before.price;
  const after = dated.find((p) => p.at - at.getTime() <= DAY_MS);
  return after?.price ?? (await latest(api, vault));
}

/**
 * The vault's share price now, for a day Kamino's history has nothing near.
 * A vault's share price only creeps up, by its yield, so today's is a fair
 * estimate of a recent day's (and the entry is marked estimated anyway).
 * Waiting instead held the wallet's whole costing up for good.
 */
const latest = async (api: Partial<Pick<KaminoApi, "metrics">>, vault: string): Promise<Decimal | null> => {
  if (api.metrics === undefined) return null;
  const now = await api.metrics(vault).catch(() => null);
  return now?.tokensPerShare != null && now.tokensPerShare.gt(0) ? now.tokensPerShare : null;
};
