import { useMemo, useState } from "react";
import { AppShell } from "./AppShell";
import { LiveDot, PriceError } from "./LiveStatus";
import { HOLDINGS } from "./data";
import {
  Benefits,
  CollateralTable,
  Heading,
  RateCompare,
  RiskCards,
  RiskNote,
  StepList,
  WhatItIs,
} from "../credit/parts";
import { useCreditMarket } from "../market/hooks";
import { Alert, Check, Lock } from "../ui/icons";

const usd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const num = (s: string) => Number(s.replace(/[^0-9.]/g, "")) || 0;

const ASSURANCES = ["No credit check", "No paperwork", "Nothing sold"];

/** Vertical rhythm between explainer blocks, so the page reads rather than stacks. */
const Block = ({ children }: { children: React.ReactNode }) => (
  <section className="mt-14 first:mt-8">{children}</section>
);

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
  // Reaching the borrow limit is not liquidation — that sits further out — so
  // this is deliberately the conservative number.
  const fallRoom = 100 - share;
  const apy = market.data?.borrowApy;

  return (
    <AppShell
      current="borrow"
      title="Borrow"
      aside={
        <span className="rounded-md bg-warn-tint px-2 py-1 text-[12px] font-medium text-warn">
          Coming in version two
        </span>
      }
      actions={<LiveDot fetching={market.isFetching} at={market.dataUpdatedAt} />}
    >
      {market.isError ? (
        <PriceError
          className="mt-6"
          message="Could not reach Kamino to read the current rate and collateral limits."
          onRetry={() => void market.refetch()}
        />
      ) : (
        <>
          {/* Where the reference puts an illustration, we can put the reader's
              own number, which is the one thing a picture cannot do. */}
          <Block>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start">
              <div className="rounded-2xl border border-cardline bg-white px-6 py-6">
                <h2 className="text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance">
                  Cash without selling your stocks
                </h2>
                <p className="mt-3 max-w-[52ch] text-[15px] leading-[1.6] text-muted text-pretty">
                  Pledge what you already hold and draw dollars against it. The shares stay yours
                  and stay invested.
                </p>

                <div className="mt-6 border-t border-hair pt-5">
                  <p className="text-[13px] text-muted">What you could borrow today</p>
                  <p className="mt-1.5 text-[40px] leading-[1.05] font-semibold tracking-[-0.03em] tabular-nums">
                    {market.isLoading ? (
                      <span className="inline-block h-10 w-48 animate-pulse rounded bg-chip align-middle" />
                    ) : (
                      usd(total)
                    )}
                  </p>
                  <p className="mt-2 text-[14px] leading-[1.55] text-muted">
                    Against {usd(eligible)} of eligible holdings
                    {apy != null && <> · {(apy * 100).toFixed(2)}% a year</>}
                  </p>
                </div>

                <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
                  {ASSURANCES.map((a) => (
                    <li key={a} className="flex items-center gap-2 text-[14px] text-ink-soft">
                      <Check className="size-4 text-brand" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-cardline bg-white px-5 py-5">
                  <label className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[14px] font-medium">If you drew {share}% of it</span>
                    <span className="text-[16px] font-semibold tabular-nums">{usd(drawn)}</span>
                  </label>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={share}
                    onChange={(e) => setShare(Number(e.target.value))}
                    aria-label="Share of the limit drawn"
                    className="mt-3 h-11 w-full cursor-pointer touch-pan-y accent-[var(--color-brand)]"
                  />
                  <p className="mt-3 flex items-start gap-2 text-[13px] leading-[1.55] text-muted">
                    <Alert className="mt-px size-4 shrink-0 text-warn" />
                    <span>
                      Your holdings could fall{" "}
                      <strong className="font-semibold text-ink">{fallRoom}%</strong> before you hit
                      the borrow limit.
                    </span>
                  </p>
                </div>

                <div className="rounded-2xl border border-cardline bg-white px-5 py-5">
                  <span className="flex items-center gap-2 text-[14px] font-semibold">
                    <Lock className="size-4 text-faint" />
                    Not available yet
                  </span>
                  <p className="mt-2 text-[13px] leading-[1.55] text-muted">
                    The figure above is real — it is what your holdings would support today — but
                    nothing can be drawn against it until version two.
                  </p>
                  <button
                    type="button"
                    disabled
                    className="mt-4 h-11 w-full cursor-not-allowed rounded-[10px] bg-chip text-[15px] font-semibold text-faint"
                  >
                    Borrow
                  </button>
                </div>
              </div>
            </div>
          </Block>

          <Block>
            <div className="rounded-2xl border border-cardline bg-white px-5 py-5 sm:px-6">
              <RateCompare apy={apy} />
            </div>
          </Block>

          <Block>
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
              <div>
                <Heading title="What borrowing against stocks actually is" />
                <div className="mt-5">
                  <WhatItIs />
                </div>
              </div>
              <Benefits />
            </div>
          </Block>

          <Block>
            <Heading
              title="What each holding is worth as security"
              body="Not every holding counts the same. A broad index is steadier than one company, so more of it can be borrowed against. These are your holdings against the live limits."
            />
            <div className="mt-6 overflow-hidden rounded-2xl border border-cardline bg-white">
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
            </div>
          </Block>

          <Block>
            <Heading
              title="Everything Kamino accepts"
              body="Beyond what you hold today, these are the limits across the whole market."
            />
            <div className="mt-6">
              <CollateralTable market={market.data} loading={market.isLoading} />
            </div>
          </Block>

          <Block>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
              <Heading
                title="Cash against your stocks in four steps"
                body="No forms, because there is nothing to assess. The collateral is already on chain and so is the lending market."
              />
              <StepList />
            </div>
          </Block>

          <Block>
            <Heading
              title="What can go wrong"
              body="Borrowing against an investment makes a good outcome better and a bad one worse. Two things are worth understanding first."
            />
            <div className="mt-6 space-y-5 pb-4">
              <RiskCards />
              <RiskNote />
            </div>
          </Block>
        </>
      )}
    </AppShell>
  );
};
