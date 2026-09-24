import type { ReactNode } from "react";
import { Section } from "../ui/Section";
import { Grid, Repeat, Trend, Wallet } from "../ui/icons";

const WAYS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <Trend className="size-[18px]" />,
    title: "Stocks",
    body: "590 US stocks and funds, from a few dollars. Every order is quoted against both issuers before it goes anywhere.",
  },
  {
    icon: <Grid className="size-[18px]" />,
    title: "Baskets",
    body: "A named set of stocks at fixed weights, bought in one action and held afterwards as a single position.",
  },
  {
    icon: <Repeat className="size-[18px]" />,
    title: "Recurring",
    body: "A fixed amount weekly or monthly, split across stocks and baskets. It runs on chain whether or not you open Harbor.",
  },
  {
    icon: <Wallet className="size-[18px]" />,
    title: "Cash",
    body: "Stablecoins waiting to be invested earn 4.1% where they sit, including while a queued order waits for its price.",
  },
];

export const Features = () => (
  <Section id="baskets" inner="grid items-center gap-12 py-[76px] lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
    <div>
      <h2 className="text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[40px]">
        Four ways to put money in.
      </h2>
      <p className="mt-[18px] max-w-[42ch] text-[16px] leading-[1.6] text-muted text-pretty">
        Buy a single company, buy a whole basket in one action, set an amount to go in every month, or leave
        it as cash and earn while you decide. Any combination, from the same balance.
      </p>
    </div>

    <div className="grid overflow-hidden rounded-2xl border border-cardline bg-white sm:grid-cols-2">
      {WAYS.map((way, i) => (
        <div
          key={way.title}
          className={`p-7 transition-colors duration-200 hover:bg-shell sm:p-8 ${
            i % 2 === 0 ? "sm:border-r sm:border-hair" : ""
          } ${i < 2 ? "border-b border-hair" : "max-sm:border-b max-sm:border-hair last:border-b-0"}`}
        >
          <span className="grid size-9 place-items-center rounded-[10px] border border-cardline text-brand">
            {way.icon}
          </span>
          <h3 className="mt-5 text-[18px] font-semibold tracking-[-0.01em]">{way.title}</h3>
          <p className="mt-2 text-[15px] leading-[1.6] text-muted text-pretty">{way.body}</p>
        </div>
      ))}
    </div>
  </Section>
);
