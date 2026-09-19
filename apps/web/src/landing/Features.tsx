import type { ReactNode } from "react";
import { Section } from "../ui/Section";
import { Clock, Grid, Repeat } from "../ui/icons";

const WEIGHTS = [
  { name: "Nvidia", pct: "30%" },
  { name: "Broadcom", pct: "22%" },
  { name: "AMD", pct: "18%" },
  { name: "TSMC", pct: "14%" },
  { name: "ASML", pct: "10%" },
  { name: "Micron", pct: "6%" },
];

const PLAN = [
  { name: "Semiconductors basket", usd: "$120", pct: "60%" },
  { name: "S&P 500", usd: "$80", pct: "40%" },
];

const RUNS = [
  { date: "1 Oct", note: "next run" },
  { date: "1 Nov", note: "then" },
  { date: "1 Dec", note: "then" },
];

const PLAIN = [
  {
    title: "Stocks",
    body: "590 US stocks and funds, from a few dollars. Every order is checked against both issuers first.",
  },
  {
    title: "Cash",
    body: "Stablecoins waiting to be invested earn 4.1% where they sit, including while a queued order waits for its price.",
  },
];

/** Name left, figures right, on one tabular column so every card lines up. */
const Line = ({ name, children }: { name: string; children: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 py-[7px]">
    <span className="text-[14px] text-ink-soft">{name}</span>
    <span className="flex shrink-0 items-baseline gap-5">{children}</span>
  </div>
);

const Figure = ({ children, w }: { children: ReactNode; w?: string }) => (
  <span className={`text-right font-mono text-[13px] text-muted tabular-nums ${w ?? ""}`}>
    {children}
  </span>
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
  <Section id="baskets" inner="py-[76px]">
    <h2 className="text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[40px]">
      Four ways to put money in.
    </h2>
    <p className="mt-[18px] max-w-[52ch] text-[16px] leading-[1.6] text-muted text-pretty">
      Buy a single company, buy a whole basket in one action, set an amount to go in every month,
      or leave it as cash and earn while you decide. Any combination, from the same balance.
    </p>

    <dl className="mt-10 grid gap-x-10 gap-y-6 border-t border-cardline pt-8 sm:grid-cols-2">
      {PLAIN.map((item) => (
        <div key={item.title}>
          <dt className="text-[18px] font-semibold tracking-[-0.01em]">{item.title}</dt>
          <dd className="mt-2 max-w-[46ch] text-[15px] leading-[1.6] text-muted text-pretty">
            {item.body}
          </dd>
        </div>
      ))}
    </dl>

    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <Panel
        icon={<Grid className="size-[17px]" />}
        title="Baskets"
        blurb="A named set of stocks at fixed weights, bought in one action and held afterwards as one position."
      >
        <div className="flex flex-1 flex-col border-t border-cardline pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[16px] font-semibold">Semiconductors</span>
            <span className="text-[14px] font-semibold text-up-deep">+18.4% past 12 months</span>
          </div>

          <div className="mt-3 divide-y divide-hair">
            {WEIGHTS.map((w) => (
              <Line key={w.name} name={w.name}>
                <Figure>{w.pct}</Figure>
              </Line>
            ))}
          </div>

          <p className="mt-auto border-t border-cardline pt-4 text-[13px] text-faint">
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
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[24px] font-semibold tracking-[-0.025em]">$200 monthly</span>
            <span className="text-[13px] text-faint">next on 1 October</span>
          </div>

          <div className="mt-3 divide-y divide-hair">
            {PLAN.map((leg) => (
              <Line key={leg.name} name={leg.name}>
                <Figure w="w-12">{leg.usd}</Figure>
                <Figure w="w-9">{leg.pct}</Figure>
              </Line>
            ))}
          </div>

          <dl className="mt-6 grid grid-cols-3 gap-x-4 border-t border-hair pt-4">
            {RUNS.map((run) => (
              <div key={run.date}>
                <dt className="text-[13px] font-semibold">{run.date}</dt>
                <dd className="mt-0.5 text-[12px] text-faint">{run.note}</dd>
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
    </div>
  </Section>
);
