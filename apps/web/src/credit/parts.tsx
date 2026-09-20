import type { CreditMarket } from "../market/kamino";
import { XSTOCKS_MARKET } from "../market/kamino";
import { DISPLAY_NAME } from "../market/meta";

/**
 * The rate band and the collateral table, with no band or page wrapper, so
 * the card page supplies its own shell.
 */

const pctOf = (n: number) => `${Math.round(n * 100)}%`;
const EXAMPLE = 10_000;

/* ── rates ──────────────────────────────────────────────────────────── */

const ALTERNATIVES = [
  { label: "Credit card", range: "21–28%" },
  { label: "Personal loan", range: "11–20%" },
  { label: "Margin at a broker", range: "6–13%" },
];

export const RateCompare = ({ apy }: { apy: number | null | undefined }) => (
  <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
    <dl className="flex flex-wrap gap-x-10 gap-y-5">
      {ALTERNATIVES.map((a) => (
        <div key={a.label}>
          <dt className="text-[13px] text-muted">{a.label}</dt>
          <dd className="mt-1 text-[18px] font-semibold tabular-nums">{a.range}</dd>
        </div>
      ))}
    </dl>
    <div className="flex items-center gap-5 lg:shrink-0">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold">Borrowing here</p>
        <p className="mt-1 text-[13px] leading-[1.5] text-muted">
          Because the collateral is already on chain and nobody underwrites you
        </p>
      </div>
      <span className="shrink-0 border-b-2 border-up pb-1 text-[30px] font-semibold tracking-[-0.02em] text-up-deep tabular-nums">
        {apy == null ? "—" : `${(apy * 100).toFixed(2)}%`}
      </span>
    </div>
  </div>
);

/* ── collateral ─────────────────────────────────────────────────────── */

export const CollateralTable = ({
  market,
  loading,
  limit,
}: {
  market: CreditMarket | undefined;
  loading: boolean;
  /** Show only the top few, for a surface where the full list would overrun. */
  limit?: number;
}) => {
  const all = market?.collateral ?? [];
  const rows = limit ? all.slice(0, limit) : all;
  const hidden = all.length - rows.length;
  return (
  <>
    <div className="overflow-hidden rounded-2xl border border-cardline bg-white">
      <div className="hidden items-center gap-4 border-b border-hair bg-shell px-5 py-3 text-[12px] tracking-[0.04em] text-faint uppercase sm:flex sm:px-6">
        <span className="flex-1">Holding</span>
        <span className="w-[120px] text-right">Borrow up to</span>
        <span className="w-[150px] text-right">On $10,000 held</span>
      </div>
      {loading
        ? Array.from({ length: limit ?? 5 }, (_, i) => i).map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-hair px-5 py-3.5 last:border-b-0 sm:px-6"
            >
              <span className="size-7 shrink-0 rounded-full bg-chip" />
              <span className="h-4 w-36 rounded bg-chip" />
              <span className="ml-auto h-4 w-16 rounded bg-chip" />
            </div>
          ))
        : rows.map((c) => (
            <div
              key={c.symbol}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-hair px-5 py-3.5 last:border-b-0 sm:px-6"
            >
              <span className="flex min-w-0 flex-1 items-center gap-3">
                {/* Backed publishes a mark per wrapper; a row carrying one reads
                    as a holding rather than a line in a rate sheet. */}
                <img
                  src={`/tokens/${c.symbol}.png`}
                  alt=""
                  width={28}
                  height={28}
                  loading="lazy"
                  className="size-7 shrink-0 rounded-full"
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                />
                <span className="flex min-w-0 items-baseline gap-2.5">
                  <span className="truncate text-[15px] font-medium">
                    {DISPLAY_NAME[c.ticker] ?? c.ticker}
                  </span>
                  <span className="font-mono text-[12px] text-faint">{c.symbol}</span>
                </span>
              </span>
              <span className="w-[120px] text-right text-[15px] font-semibold tabular-nums">
                {pctOf(c.maxLtv)}
              </span>
              <span className="w-[150px] text-right text-[15px] tabular-nums text-muted">
                ${(EXAMPLE * c.maxLtv).toLocaleString("en-US")}
              </span>
            </div>
          ))}
    </div>
    <p className="mt-4 text-[12px] leading-[1.55] text-muted">
      Read live from Kamino's xStocks market{" "}
      <span className="font-mono">
        {XSTOCKS_MARKET.slice(0, 4)}…{XSTOCKS_MARKET.slice(-4)}
      </span>
      .{" "}
      {hidden > 0
        ? `The ${rows.length} that lend the most, of ${all.length} accepted.`
        : "A holding that is not listed here cannot be borrowed against at all."}
    </p>
  </>
  );
};
