import { D, ONE, type Decimal, type Issuer } from "@mercury/core";
import type { CatalogueInstrument } from "@mercury/chain";
import type { TokenPrice } from "@mercury/market";
import { INSTRUMENT_META } from "../db/seed/instruments.js";

export interface StoredTokenRow {
  readonly mint: string;
  readonly multiplier: string;
}

export interface CatalogueInput {
  readonly live: readonly CatalogueInstrument[];
  readonly prices: ReadonlyMap<string, TokenPrice>;
  readonly stored: readonly StoredTokenRow[];
  readonly now: Date;
}

export interface InstrumentRow {
  readonly ticker: string;
  readonly name: string;
  readonly sector: string;
  readonly description: string;
  readonly logoUrl: string | null;
  readonly isTradable: boolean;
}

export interface TokenRow {
  /** The instrument's id is resolved by the shell after the instrument is upserted. */
  readonly ticker: string;
  readonly mint: string;
  readonly issuer: Issuer;
  readonly symbol: string;
  readonly decimals: number;
  readonly multiplier: string;
  readonly isRoutable: boolean;
}

export interface MultiplierEventRow {
  readonly mint: string;
  readonly oldMultiplier: string;
  readonly newMultiplier: string;
  readonly kind: "dividend" | "split" | "unknown";
  readonly observedAt: Date;
}

export interface CataloguePlan {
  readonly instruments: readonly InstrumentRow[];
  readonly tokens: readonly TokenRow[];
  readonly events: readonly MultiplierEventRow[];
}

/** Below this a pool cannot fill a normal order, so the wrapper is not offered. */
const MIN_ROUTABLE_LIQUIDITY_USD = D(1_000);

/** "NVIDIA xStock" -> "NVIDIA". "Apple (Ondo Tokenized)" -> "Apple". */
const strip = (name: string): string =>
  name
    .replace(/\s*xStock$/i, "")
    .replace(/\s*\(Ondo Tokenized\)$/i, "")
    .replace(/\s*Ondo Tokenized$/i, "")
    .trim();

/**
 * The label is editorial; the arithmetic does not depend on it. A rise is how
 * these tokens pay a dividend. A rise that more than doubles is not a dividend
 * any issuer has ever paid, so it is called a split. A fall is something no
 * upstream explains to us, and guessing would be worse than saying so.
 */
const kindOf = (from: Decimal, to: Decimal): MultiplierEventRow["kind"] => {
  if (to.lt(from)) return "unknown";
  return to.gt(from.mul(2)) ? "split" : "dividend";
};

/**
 * The live universe plus what we already stored, turned into rows. Pure: no
 * database, no clock, no network. Everything that decides what gets written
 * lives here, so all of it is testable in milliseconds.
 */
export function planCatalogue(input: CatalogueInput): CataloguePlan {
  const storedByMint = new Map(input.stored.map((t) => [t.mint, t]));

  const instruments: InstrumentRow[] = [];
  const tokens: TokenRow[] = [];
  const events: MultiplierEventRow[] = [];

  for (const instrument of input.live) {
    const backed = instrument.wrappers.find((w) => w.issuer === "backed");
    const lead = backed ?? instrument.wrappers[0];
    if (lead === undefined) continue;

    const meta = INSTRUMENT_META[instrument.ticker];
    instruments.push({
      ticker: instrument.ticker,
      name: meta?.name ?? strip(lead.name),
      sector: meta?.sector ?? "Other",
      description: meta?.about ?? "",
      logoUrl: lead.icon,
      // The registry has already dropped instruments no wrapper can fill, so
      // anything that reaches here is tradable.
      isTradable: true,
    });

    for (const wrapper of instrument.wrappers) {
      const price = input.prices.get(wrapper.mint);
      const stored = storedByMint.get(wrapper.mint);

      // Live first, then what we last stored, then one. Falling back to the
      // stored value rather than to one matters: defaulting a token that has
      // paid dividends back to 1 would silently shrink every holder's shares.
      const multiplier = price?.multiplier ?? (stored === undefined ? ONE : D(stored.multiplier));

      if (stored !== undefined) {
        const previous = D(stored.multiplier);
        if (!previous.eq(multiplier)) {
          events.push({
            mint: wrapper.mint,
            oldMultiplier: previous.toFixed(),
            newMultiplier: multiplier.toFixed(),
            kind: kindOf(previous, multiplier),
            observedAt: input.now,
          });
        }
      }

      tokens.push({
        ticker: instrument.ticker,
        mint: wrapper.mint,
        issuer: wrapper.issuer,
        symbol: wrapper.symbol,
        decimals: wrapper.decimals,
        multiplier: multiplier.toFixed(),
        isRoutable: (price?.liquidityUsd ?? wrapper.liquidityUsd).gte(MIN_ROUTABLE_LIQUIDITY_USD),
      });
    }
  }

  return { instruments, tokens, events };
}
