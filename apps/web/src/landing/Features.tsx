import type { ReactNode } from "react";
import { Section } from "../ui/Section";
import { Clock, Grid, Repeat } from "../ui/icons";

/* Part-to-whole, so one stacked bar rather than six near-empty tracks.
   One hue stepped dark to light by weight; the legend carries identity. */
const RAMP = [
  "var(--color-ramp-1)",
  "var(--color-ramp-2)",
  "var(--color-ramp-3)",
  "var(--color-ramp-4)",
  "var(--color-ramp-5)",
  "var(--color-ramp-6)",
];

const WEIGHTS = [
  { name: "Nvidia", pct: 30 },
  { name: "Broadcom", pct: 22 },
  { name: "AMD", pct: 18 },
  { name: "TSMC", pct: 14 },
  { name: "ASML", pct: 10 },
  { name: "Micron", pct: 6 },
];

const PLAN = [
  { name: "Semiconductors basket", pct: 60, usd: "$120", fill: "var(--color-ramp-3)" },
  { name: "S&P 500", pct: 40, usd: "$80", fill: "var(--color-ramp-5)" },
];

/** Stacked composition bar: 2px surface gaps, rounded outer ends. */
const StackedBar = ({
  parts,
}: {
  parts: { name: string; pct: number; fill: string }[];
}) => (
  <div className="flex h-2.5 gap-[2px]" role="img" aria-label={parts.map((p) => `${p.name} ${p.pct}%`).join(", ")}>
    {parts.map((p, i) => (
      <div
        key={p.name}
        style={{ width: `${p.pct}%`, background: p.fill }}
        className={`h-full ${i === 0 ? "rounded-l-[4px]" : ""} ${
          i === parts.length - 1 ? "rounded-r-[4px]" : ""
        }`}
      />
    ))}
  </div>
);

const Swatch = ({ fill }: { fill: string }) => (
  <span className="size-2 shrink-0 rounded-[2px]" style={{ background: fill }} />
);

const Panel = ({
  icon,
  title,
  blurb,
  children,
}: {
  icon: ReactNode;
  title: string;
  blurb: string;
  children: ReactNode;
}) => (
  <article className="flex flex-col rounded-2xl border border-cardline bg-white p-6 sm:p-[34px]">
    <div className="mb-[18px] flex items-center gap-[11px]">
      <span className="grid size-[34px] place-items-center rounded-[10px] bg-brand-tint text-brand">
        {icon}
      </span>
      <h3 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h3>
    </div>
    <p className="mb-7 text-[15px] leading-[1.6] text-muted text-pretty">{blurb}</p>
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
      <div className="border-t border-cardline pt-6">
        <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[16px] font-semibold">Semiconductors</span>
          <span className="text-[14px] font-semibold text-up">+18.4% past 12 months</span>
        </div>

        <StackedBar parts={WEIGHTS.map((w, i) => ({ ...w, fill: RAMP[i] as string }))} />

        <ul className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2.5">
          {WEIGHTS.map((w, i) => (
            <li key={w.name} className="flex items-center gap-2.5">
              <Swatch fill={RAMP[i] as string} />
              <span className="flex-1 text-[14px] text-ink-soft">{w.name}</span>
              <span className="font-mono text-[13px] text-muted">{w.pct}%</span>
            </li>
          ))}
        </ul>

        <p className="mt-6 border-t border-hair pt-4 text-[13px] text-faint">
          Fee 0.5% a year · minimum $25
        </p>
      </div>
    </Panel>

    <Panel
      icon={<Repeat className="size-[17px]" />}
      title="Recurring"
      blurb="A fixed amount weekly or monthly, split by percentage across stocks and baskets. It runs on chain whether or not you open Harbor."
    >
      <div className="flex flex-1 flex-col border-t border-cardline pt-6">
        <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[24px] font-semibold tracking-[-0.025em]">$200 monthly</span>
          <span className="text-[13px] text-faint">next on 1 October</span>
        </div>

        <StackedBar parts={PLAN} />

        <ul className="mt-5 grid gap-2.5">
          {PLAN.map((leg) => (
            <li key={leg.name} className="flex items-center gap-2.5">
              <Swatch fill={leg.fill} />
              <span className="flex-1 text-[14px] text-ink-soft">{leg.name}</span>
              <span className="font-mono text-[13px] text-muted">{leg.usd}</span>
              <span className="w-9 text-right font-mono text-[13px] font-medium">{leg.pct}%</span>
            </li>
          ))}
        </ul>

        <dl className="mt-6 grid grid-cols-3 gap-x-4 border-t border-hair pt-4">
          {[
            { d: "1 Oct", n: "next run" },
            { d: "1 Nov", n: "then" },
            { d: "1 Dec", n: "then" },
          ].map((run) => (
            <div key={run.d}>
              <dt className="text-[13px] font-semibold">{run.d}</dt>
              <dd className="mt-0.5 text-[12px] text-faint">{run.n}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-auto flex items-start gap-2.5 pt-6 text-[13px] leading-[1.5] text-muted">
          <Clock className="mt-0.5 size-4 shrink-0 text-faint" />
          If the market is shut when a run is due, the order queues and fills at your price when
          it reopens.
        </p>
      </div>
    </Panel>
  </Section>
);
