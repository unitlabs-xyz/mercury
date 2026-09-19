import type { ReactNode } from "react";
import { Section } from "../ui/Section";
import { Clock, Grid, Repeat } from "../ui/icons";

const WEIGHTS = [
  { name: "Nvidia", pct: 30, fill: "bg-brand" },
  { name: "Broadcom", pct: 22, fill: "bg-brand" },
  { name: "AMD", pct: 18, fill: "bg-brand" },
  { name: "TSMC", pct: 14, fill: "bg-brand-soft" },
  { name: "ASML", pct: 10, fill: "bg-brand-soft" },
  { name: "Micron", pct: 6, fill: "bg-bar-neutral" },
];

const Panel = ({
  icon,
  title,
  blurb,
  children,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  blurb: string;
  children: ReactNode;
  className?: string;
}) => (
  <article
    className={`flex flex-col rounded-2xl border border-cardline bg-white p-6 sm:p-[34px] ${className}`}
  >
    <div className="mb-[18px] flex items-center gap-[11px]">
      <span className="grid size-[34px] place-items-center rounded-[10px] bg-brand-tint text-brand">
        {icon}
      </span>
      <h3 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h3>
    </div>
    <p className="mb-6 text-[15px] leading-[1.6] text-muted text-pretty">{blurb}</p>
    {children}
  </article>
);

export const Features = () => (
  <Section id="baskets" inner="grid gap-6 py-[76px] lg:grid-cols-2">
    <Panel
      icon={<Grid className="size-[17px]" />}
      title="Baskets"
      blurb="A named set of stocks at fixed weights, bought in one action and held afterwards as one position."
    >
      <div className="rounded-[14px] border border-cardline p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[16px] font-semibold">Semiconductors</span>
          <span className="text-[14px] font-semibold text-up">+18.4% past 12 months</span>
        </div>

        <div className="grid gap-[9px]">
          {WEIGHTS.map((w) => (
            <div key={w.name} className="flex items-center gap-3">
              <span className="w-[76px] shrink-0 text-[13px] text-ink-soft">{w.name}</span>
              <div className="h-1.5 flex-1 rounded-[3px] bg-track">
                <div
                  className={`h-full rounded-[3px] ${w.fill}`}
                  style={{ width: `${w.pct}%` }}
                />
              </div>
              <span className="w-[34px] text-right font-mono text-[12px] text-muted">
                {w.pct}%
              </span>
            </div>
          ))}
        </div>

        <p className="mt-4 border-t border-hair pt-3.5 text-[13px] text-faint">
          Fee 0.5% a year · minimum $25
        </p>
      </div>
    </Panel>

    <Panel
      icon={<Repeat className="size-[17px]" />}
      title="Recurring"
      blurb="A fixed amount weekly or monthly, split by percentage across stocks and baskets. It runs on chain whether or not you open Harbor."
    >
      <div className="rounded-[14px] border border-cardline p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[24px] font-semibold tracking-[-0.025em]">$200 monthly</span>
          <span className="text-[13px] text-faint">next on 1 October</span>
        </div>

        <div className="mt-[18px] flex h-2 overflow-hidden rounded-[4px] bg-track">
          <div className="w-[60%] bg-brand" />
          <div className="w-[40%] bg-brand-soft" />
        </div>

        <div className="mt-4 grid gap-[11px]">
          {[
            { swatch: "bg-brand", label: "Semiconductors basket", pct: "60%" },
            { swatch: "bg-brand-soft", label: "S&P 500", pct: "40%" },
          ].map((leg) => (
            <div key={leg.label} className="flex items-center gap-2.5">
              <span className={`size-2 rounded-[2px] ${leg.swatch}`} />
              <span className="flex-1 text-[14px]">{leg.label}</span>
              <span className="font-mono text-[13px] font-medium">{leg.pct}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-auto flex items-start gap-2.5 pt-[22px] text-[13px] leading-[1.5] text-muted">
        <Clock className="mt-0.5 size-4 shrink-0 text-faint" />
        If the market is shut when a run is due, the order queues and fills at your price when it
        reopens.
      </p>
    </Panel>
  </Section>
);
