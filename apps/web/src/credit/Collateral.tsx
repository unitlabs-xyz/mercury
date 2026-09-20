import { Section } from "../ui/Section";
import { useCreditMarket } from "../market/hooks";
import { XSTOCKS_MARKET } from "../market/kamino";
import { DISPLAY_NAME } from "../market/meta";

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** $10,000 held, at this collateral factor, is this much borrowable. */
const EXAMPLE = 10_000;

export const Collateral = () => {
  const market = useCreditMarket();
  const rows = market.data?.collateral ?? [];

  return (
    <Section tone="white" inner="py-16 sm:py-20">
      <div className="max-w-[640px]">
        <h2 className="text-[clamp(1.5rem,3vw,2rem)] leading-[1.15] font-semibold tracking-[-0.02em] text-balance">
          What counts as collateral, and for how much
        </h2>
        <p className="mt-4 text-[15px] leading-[1.6] text-muted text-pretty">
          Not every holding is worth the same as security. A broad index is steadier than one
          company, so more of it can be borrowed against. These are the live limits — Kamino sets
          them and moves them when risk changes.
        </p>
      </div>

      {market.isError ? (
        <p className="mt-8 rounded-2xl border border-down-line bg-down-tint px-5 py-4 text-[14px] text-down-deep">
          Could not reach Kamino to read the current limits.
        </p>
      ) : (
        <div className="mt-8 overflow-hidden rounded-2xl border border-cardline bg-white">
          <div className="hidden items-center gap-4 border-b border-hair bg-shell px-5 py-3 text-[12px] tracking-[0.04em] text-faint uppercase sm:flex sm:px-6">
            <span className="flex-1">Holding</span>
            <span className="w-[120px] text-right">Borrow up to</span>
            <span className="w-[150px] text-right">On $10,000 held</span>
          </div>

          {market.isLoading
            ? [0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4 border-b border-hair px-5 py-3.5 last:border-b-0 sm:px-6">
                  <span className="h-4 w-40 rounded bg-chip" />
                  <span className="ml-auto h-4 w-16 rounded bg-chip" />
                </div>
              ))
            : rows.map((c) => (
                <div
                  key={c.symbol}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-hair px-5 py-3.5 last:border-b-0 sm:px-6"
                >
                  <span className="flex min-w-0 flex-1 items-baseline gap-2.5">
                    <span className="truncate text-[15px] font-medium">
                      {DISPLAY_NAME[c.ticker] ?? c.ticker}
                    </span>
                    <span className="font-mono text-[12px] text-faint">{c.symbol}</span>
                  </span>
                  <span className="w-[120px] text-right text-[15px] font-semibold tabular-nums">
                    {pct(c.maxLtv)}
                  </span>
                  <span className="w-[150px] text-right text-[15px] tabular-nums text-muted">
                    ${(EXAMPLE * c.maxLtv).toLocaleString("en-US")}
                  </span>
                </div>
              ))}
        </div>
      )}

      <p className="mt-4 text-[12px] leading-[1.5] text-faint">
        Read live from Kamino's xStocks market{" "}
        <span className="font-mono">{XSTOCKS_MARKET.slice(0, 4)}…{XSTOCKS_MARKET.slice(-4)}</span>.
        A holding that is not listed here cannot be borrowed against at all.
      </p>
    </Section>
  );
};
