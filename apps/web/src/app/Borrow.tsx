import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "./AppShell";
import { LiveDot, PriceError } from "./LiveStatus";
import { HOLDINGS } from "./data";
import { useCreditMarket } from "../market/hooks";
import { Alert, ArrowRight, Clock, Lock } from "../ui/icons";

const usd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const num = (s: string) => Number(s.replace(/[^0-9.]/g, "")) || 0;

export const Borrow = () => {
  const market = useCreditMarket();
  const [share, setShare] = useState(50);

  const lines = useMemo(() => {
    const ltv = new Map((market.data?.collateral ?? []).map((c) => [c.ticker, c.maxLtv]));
    return HOLDINGS.map((h) => {
      const value = num(h.value);
      const factor = h.ticker ? (ltv.get(h.ticker) ?? 0) : 0;
      return {
        holding: h,
        value,
        factor,
        power: value * factor,
        reason: h.ticker
          ? factor > 0
            ? null
            : "Not accepted as collateral"
          : h.name === "Cash"
            ? "Cash is what you borrow, not what you pledge"
            : "Baskets cannot be pledged yet",
      };
    });
  }, [market.data]);

  const total = lines.reduce((n, l) => n + l.power, 0);
  const eligible = lines.reduce((n, l) => n + (l.factor > 0 ? l.value : 0), 0);
  const drawn = (total * share) / 100;
  // Hitting the borrow limit is not liquidation — liquidation sits further out —
  // so this is the conservative number, which is the right way to be wrong.
  const fallRoom = total > 0 ? 100 - share : 0;
  const apy = market.data?.borrowApy;

  return (
    <AppShell
      current="borrow"
      title="Borrow"
      aside={
        <span className="rounded-md bg-warn-tint px-2 py-1 text-[12px] font-medium text-warn">
          Switched off
        </span>
      }
      actions={<LiveDot fetching={market.isFetching} at={market.dataUpdatedAt} />}
    >
      {market.isError ? (
        <PriceError
          className="mt-6"
          message="Could not reach Kamino to read collateral limits."
          onRetry={() => void market.refetch()}
        />
      ) : (
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="space-y-5">
            <section className="rounded-2xl border border-cardline bg-white px-5 py-5 sm:px-6">
              <p className="text-[13px] text-muted">What you could borrow today</p>
              <p className="mt-2 text-[40px] leading-[1.05] font-semibold tracking-[-0.03em] tabular-nums">
                {market.isLoading ? (
                  <span className="inline-block h-10 w-48 animate-pulse rounded bg-chip align-middle" />
                ) : (
                  usd(total)
                )}
              </p>
              <p className="mt-2 text-[14px] leading-[1.55] text-muted">
                Against {usd(eligible)} of eligible holdings, at the collateral factors Kamino is
                applying right now
                {apy != null && <> · costing {(apy * 100).toFixed(2)}% a year</>}.
              </p>

              <div className="mt-6 border-t border-hair pt-5">
                <label className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[14px] font-medium">If you drew {share}% of it</span>
                  <span className="text-[15px] font-semibold tabular-nums">{usd(drawn)}</span>
                </label>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={share}
                  onChange={(e) => setShare(Number(e.target.value))}
                  aria-label="Share of the limit drawn"
                  className="mt-3 w-full accent-[var(--color-brand)]"
                />
                <p className="mt-3 flex items-start gap-2 text-[13px] leading-[1.55] text-muted">
                  <Alert className="mt-px size-4 shrink-0 text-warn" />
                  Your holdings could fall{" "}
                  <strong className="font-semibold text-ink">{fallRoom}%</strong> before you hit the
                  borrow limit. Past that, part of the collateral gets sold to repay the loan.
                </p>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-cardline bg-white">
              <div className="border-b border-hair px-5 py-4 sm:px-6">
                <h2 className="text-[15px] font-semibold">What each holding is worth as security</h2>
              </div>
              {lines.map((l) => (
                <div
                  key={l.holding.name}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-hair px-5 py-3.5 last:border-b-0 sm:px-6"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{l.holding.name}</span>
                    <span className="mt-0.5 block text-[12px] text-faint">
                      {l.reason ?? `${Math.round(l.factor * 100)}% of ${l.holding.value}`}
                    </span>
                  </span>
                  <span
                    className={`text-right text-[15px] font-semibold tabular-nums ${
                      l.power > 0 ? "" : "text-faint"
                    }`}
                  >
                    {l.power > 0 ? usd(l.power) : "—"}
                  </span>
                </div>
              ))}
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6">
            <div className="rounded-2xl border border-cardline bg-white px-5 py-5">
              <span className="flex items-center gap-2 text-[14px] font-semibold">
                <Lock className="size-4 text-faint" />
                Not available yet
              </span>
              <p className="mt-2 text-[13px] leading-[1.55] text-muted">
                Borrowing arrives in version two. The figure above is real — it is what your
                holdings would support today — but nothing can be drawn against it.
              </p>
              <button
                type="button"
                disabled
                className="mt-4 h-11 w-full cursor-not-allowed rounded-[10px] bg-chip text-[15px] font-semibold text-faint"
              >
                Borrow
              </button>
              <Link
                to="/credit"
                className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-[10px] border border-cardline text-[14px] font-medium transition-colors hover:bg-shell"
              >
                How it works
                <ArrowRight className="size-4" />
              </Link>
            </div>

            <div className="rounded-2xl border border-warn-line bg-warn-tint px-5 py-4">
              <span className="flex items-center gap-2 text-[14px] font-semibold text-warn">
                <Clock className="size-4" />
                The weekend gap
              </span>
              <p className="mt-2 text-[13px] leading-[1.55] text-warn/90">
                The token trades all week; the exchange does not. A Saturday shock can open past the
                level your position would have closed at, with no chance to act.
              </p>
            </div>
          </aside>
        </div>
      )}
    </AppShell>
  );
};
