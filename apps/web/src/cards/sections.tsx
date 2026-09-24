import { useState } from "react";
import { useAuthModal } from "../auth/AuthContext";
import { useCreditMarket } from "../market/hooks";
import { Section } from "../ui/Section";
import { ArrowRight, Check } from "../ui/icons";
import { CollateralTable, RateCompare } from "../credit/parts";
import { CardArt } from "./CardArt";
import { CASH_MODE, CREDIT_MODE, PARTNERS, PLANS, PLAN_ROWS, STEPS } from "./data";

/* ── hero ───────────────────────────────────────────────────────────── */

const StoreMark = ({ kind }: { kind: "play" | "apple" }) => (
  <span className="grid size-11 shrink-0 place-items-center rounded-[10px] border border-cardline bg-white text-ink transition-colors hover:border-brand">
    {kind === "play" ? (
      <svg viewBox="0 0 24 24" className="size-[17px]" fill="currentColor">
        <path
          d="M4.2 2.6c-.3.3-.5.7-.5 1.3v16.2c0 .6.2 1 .5 1.3l.1.1 9.1-9.1v-.2L4.3 2.5l-.1.1Z"
          opacity=".75"
        />
        <path d="m16.5 15.5-3.1-3.1v-.2l3.1-3.1.1.1 3.7 2.1c1 .6 1 1.6 0 2.2l-3.7 2.1-.1-.1Z" />
        <path d="m16.6 15.4-3.2-3.2-9.2 9.2c.4.4.9.4 1.6 0l10.8-6Z" opacity=".9" />
        <path d="M16.6 8.6 5.8 2.6c-.7-.4-1.2-.4-1.6 0l9.2 9.2 3.2-3.2Z" opacity=".6" />
      </svg>
    ) : (
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor">
        <path d="M16.4 12.7c0-2.2 1.8-3.3 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-2.9-.8-1.5 0-2.9.9-3.6 2.2-1.6 2.7-.4 6.7 1.1 8.9.7 1.1 1.6 2.2 2.7 2.2 1.1 0 1.5-.7 2.8-.7s1.7.7 2.9.7c1.2 0 1.9-1.1 2.6-2.1.8-1.2 1.2-2.4 1.2-2.5 0 0-2.1-.8-2.1-3.7ZM14.2 6.3c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.6 1.3-.6.6-1.1 1.6-.9 2.6 1 .1 2-.5 2.6-1.2Z" />
      </svg>
    )}
  </span>
);

const GetCard = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="group flex h-14 items-center gap-4 rounded-[12px] border border-cardline bg-white pr-2 pl-5 text-[14px] font-semibold tracking-[0.06em] text-ink uppercase transition-colors hover:border-brand"
  >
    Get your card
    <span className="grid size-10 place-items-center rounded-[9px] bg-ink text-white transition-[background-color,transform] group-hover:bg-brand group-hover:translate-x-0.5">
      <ArrowRight className="size-4" />
    </span>
  </button>
);

export const CardHero = () => {
  const { open } = useAuthModal();
  return (
    <Section className="flex flex-1 flex-col justify-center" inner="py-12 lg:py-16">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center lg:gap-16">
        <div>
          <h1 className="max-w-[13ch] text-[40px] leading-[1.02] font-semibold tracking-[-0.035em] sm:text-[52px] lg:text-[62px]">
            Spend without selling
          </h1>
          <p className="mt-4 text-[17px] font-semibold text-muted">Build wealth like the 1%</p>
          <p className="mt-5 max-w-[40ch] text-[15px] leading-[1.6] text-ink-soft text-pretty">
            Borrow against the shares you already own. Spend via Visa without selling one.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <GetCard onClick={open} />
            <StoreMark kind="play" />
            <StoreMark kind="apple" />
          </div>
        </div>

        <div className="mx-auto w-full max-w-[440px] [container-type:inline-size]">
          <CardArt tier="Platinum" />
        </div>
      </div>
    </Section>
  );
};

/* ── how it works ───────────────────────────────────────────────────── */

export const Rates = () => {
  const market = useCreditMarket();
  return (
    <Section tone="white" inner="py-8 sm:py-9">
      <RateCompare apy={market.data?.borrowApy} />
    </Section>
  );
};

export const HowItWorks = () => (
  <Section inner="py-16 sm:py-20">
    <p className="stamp">How it works</p>
    <div className="mt-5 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
      <div>
        <h2 className="max-w-[12ch] text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[40px]">
          Three steps. No paperwork
        </h2>
        <p className="mt-5 max-w-[44ch] text-[15px] leading-[1.6] text-muted text-pretty">
          No applications. No manual borrowing. No origination fee. Physical metal card available on request.
        </p>
      </div>

      <ol className="space-y-4">
        {STEPS.map((s) => (
          <li key={s.n} className="flex gap-5">
            <span className="mt-1 font-mono text-[12px] text-faint tabular-nums">{s.n}</span>
            <span className="min-w-0 flex-1 rounded-2xl border border-cardline bg-white px-5 py-4">
              <span className="block text-[16px] font-semibold">{s.title}</span>
              <span className="mt-1.5 block text-[14px] leading-[1.6] text-muted text-pretty">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  </Section>
);

/* ── one card, two modes ────────────────────────────────────────────── */

export const TwoModes = () => {
  const [mode, setMode] = useState<"cash" | "credit">("cash");
  const list = mode === "cash" ? CASH_MODE : CREDIT_MODE;
  return (
    <Section tone="white" inner="py-16 sm:py-20">
      <h2 className="mx-auto max-w-[18ch] text-center text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[40px]">
        One card. Two modes. Switch any time
      </h2>

      <div className="mt-8 flex justify-center">
        <div
          role="tablist"
          aria-label="Card mode"
          className="flex gap-1 rounded-full border border-cardline bg-shell p-1"
        >
          {(["cash", "credit"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              type="button"
              onClick={() => setMode(m)}
              className={`h-11 rounded-full px-6 text-[13px] font-semibold tracking-[0.06em] uppercase transition-colors ${
                mode === m
                  ? "bg-white text-ink shadow-[0_1px_2px_rgba(27,26,23,0.07)]"
                  : "text-muted hover:text-ink"
              }`}
            >
              {m} mode
            </button>
          ))}
        </div>
      </div>

      <div className="mt-12 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
        <ul className="space-y-5 lg:text-right">
          {list.slice(0, 2).map((t) => (
            <li key={t} className="flex gap-3 text-[15px] leading-[1.55] text-ink-soft lg:flex-row-reverse">
              <Check className="mt-0.5 size-4 shrink-0 text-brand" />
              <span className="text-pretty">{t}</span>
            </li>
          ))}
        </ul>

        <div className="mx-auto w-full max-w-[400px] [container-type:inline-size]">
          <CardArt tier="Platinum" />
        </div>

        <ul className="space-y-5">
          {list.slice(2).map((t) => (
            <li key={t} className="flex gap-3 text-[15px] leading-[1.55] text-ink-soft">
              <Check className="mt-0.5 size-4 shrink-0 text-brand" />
              <span className="text-pretty">{t}</span>
            </li>
          ))}
          <li className="flex gap-3 text-[15px] leading-[1.55] text-muted">
            <Check className="mt-0.5 size-4 shrink-0 text-brand-soft" />
            <span className="text-pretty">
              {mode === "cash" ? "Nothing borrowed, nothing owed" : "Repay whenever you like"}
            </span>
          </li>
        </ul>
      </div>

      <p className="mt-12 text-center text-[13px] leading-[1.6] text-muted text-pretty">
        Visa cards are accepted in 160+ countries · Up to $750K/month · 0% FX on Platinum · Up to 4% cashback
        in USDC
      </p>
    </Section>
  );
};

/* ── earn while you spend ───────────────────────────────────────────── */

export const EarnWhileYouSpend = () => {
  const market = useCreditMarket();
  const supply = market.data?.supplyApy;
  const borrow = market.data?.borrowApy;
  return (
    <Section inner="py-16 sm:py-20">
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="max-w-[12ch] text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] sm:text-[40px]">
            Earn while you spend
          </h2>
          <p className="mt-6 max-w-[48ch] text-[15px] leading-[1.6] font-medium text-ink-soft text-pretty">
            Your shares sit as collateral in Kamino Finance and go on doing whatever they were going to do.
            The cash beside them earns
            {supply != null ? ` ${(supply * 100).toFixed(2)}%` : ""} while it waits to be spent.
          </p>
          <ul className="mt-7 space-y-3.5">
            {[
              "Dividends keep arriving as extra shares",
              "Nothing is locked up",
              "Repay whenever, or never, while the line holds",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3 text-[15px] font-medium">
                <Check className="size-4 shrink-0 text-brand" />
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-8 max-w-[62ch] text-[12px] leading-[1.6] text-muted">
            Rates are variable and not guaranteed. Withdrawals depend on protocol liquidity and may be
            temporarily limited during market stress. Past performance does not predict future results. Using
            shares as collateral exposes you to liquidation risk. You may lose them if the market moves
            against your position.{" "}
            <a
              href="https://app.kamino.finance"
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-brand underline decoration-brand/30 underline-offset-[3px] hover:decoration-brand"
            >
              Read full risk disclosure
            </a>
            .
          </p>
        </div>

        <div>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[16px] font-semibold">What backs the line, and for how much</h3>
            {borrow != null && (
              <span className="text-[13px] text-muted">
                borrowing at <strong className="font-semibold text-ink">{(borrow * 100).toFixed(2)}%</strong>
              </span>
            )}
          </div>
          <CollateralTable market={market.data} loading={market.isLoading} limit={6} />
        </div>
      </div>
    </Section>
  );
};

/* ── plans ──────────────────────────────────────────────────────────── */

export const Plans = () => (
  <Section tone="white" inner="py-16 sm:py-20">
    <p className="stamp text-center">Plans</p>
    <h2 className="mx-auto mt-5 max-w-[16ch] text-center text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[40px]">
      Pick how much you want to unlock
    </h2>
    <p className="mt-4 text-center text-[15px] font-medium text-muted">
      Free to start. Upgrade when your lifestyle catches up.
    </p>

    <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {PLANS.map((p) => (
        <article key={p.name} className="overflow-hidden rounded-2xl border border-cardline bg-shell">
          <div className="flex items-start justify-between gap-3 px-5 pt-5">
            <h3 className="text-[16px] font-semibold">{p.name}</h3>
            <span className="w-[42%] shrink-0 [container-type:inline-size]">
              <CardArt
                finish={p.finish}
                className="!rounded-[8px] !shadow-[0_4px_14px_rgba(27,26,23,0.18)]"
              />
            </span>
          </div>
          <dl className="mt-4">
            {PLAN_ROWS.map((row) => (
              <div key={row.key} className="border-t border-hair px-5 py-3">
                <dt className="stamp">{row.label}</dt>
                <dd className="mt-1 text-[15px] font-medium tabular-nums">{p[row.key]}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </div>
  </Section>
);

/* ── platinum ───────────────────────────────────────────────────────── */

export const Platinum = () => (
  <Section inner="py-16 sm:py-20">
    <div className="mx-auto max-w-[760px] text-center">
      <div className="mx-auto w-full max-w-[320px] [container-type:inline-size]">
        <CardArt tier="Platinum" />
      </div>
      <p className="stamp mt-8">Platinum</p>
      <h2 className="mt-5 text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[40px]">
        Bespoke services for people who already know what they want
      </h2>
      <p className="mt-5 text-[15px] font-semibold text-muted">Platinum isn't a tier — it's access</p>
    </div>
  </Section>
);

/* ── non-custodial ──────────────────────────────────────────────────── */

export const NonCustodial = () => (
  <Section tone="white" inner="py-16 sm:py-20">
    <p className="stamp">Your keys. Your control.</p>
    <div className="mt-5 grid gap-10 lg:grid-cols-2 lg:gap-16">
      <h2 className="max-w-[14ch] text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[40px]">
        Non-custodial by design. Audited where it matters
      </h2>
      <div className="space-y-4 text-[15px] leading-[1.65] text-ink-soft">
        <p>
          Harbor never holds your funds. Your main assets earn yield through Kamino Finance — a non-custodial
          DeFi protocol with $2.8B TVL, 18+ audits, and zero bad debt across its history. Card transactions
          settle through Visa. Smart contracts are audited by FYEO.
        </p>
        <p>Every link in the chain is either verifiable on-chain or named publicly.</p>
      </div>
    </div>

    <ul className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {PARTNERS.map((p) => (
        <li
          key={p.name}
          className="flex h-[72px] items-center justify-center rounded-2xl border border-cardline bg-shell px-3"
        >
          {p.src ? (
            <span
              role="img"
              aria-label={p.name}
              className="block bg-ink-soft opacity-75 transition-opacity duration-200 hover:opacity-100"
              style={{
                width: p.w,
                height: p.h,
                maskImage: `url(${p.src})`,
                WebkitMaskImage: `url(${p.src})`,
                maskRepeat: "no-repeat",
                WebkitMaskRepeat: "no-repeat",
                maskSize: "contain",
                WebkitMaskSize: "contain",
                maskPosition: "center",
                WebkitMaskPosition: "center",
              }}
            />
          ) : (
            <span className="text-[15px] font-semibold tracking-[0.22em] text-ink-soft opacity-75 transition-opacity duration-200 hover:opacity-100">
              {p.name}
            </span>
          )}
        </li>
      ))}
    </ul>
  </Section>
);

/* ── closing ────────────────────────────────────────────────────────── */

export const CardClosing = () => {
  const { open } = useAuthModal();
  return (
    <Section className="flex flex-1 flex-col justify-center" inner="py-12 lg:py-16">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-16">
        <div>
          <h2 className="max-w-[14ch] text-[30px] leading-[1.06] font-semibold tracking-[-0.035em] sm:text-[40px]">
            Build wealth. Not taxable events
          </h2>
          <p className="mt-5 text-[15px] font-medium text-muted">Join the members who figured it out.</p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <GetCard onClick={open} />
            <StoreMark kind="play" />
            <StoreMark kind="apple" />
          </div>
        </div>
        <div className="w-full max-w-[420px] justify-self-end [container-type:inline-size]">
          <CardArt tier="Platinum" />
        </div>
      </div>
    </Section>
  );
};
