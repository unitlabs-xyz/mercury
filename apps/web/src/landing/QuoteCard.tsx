import type { ReactNode } from "react";
import { Grid } from "../ui/icons";

type Row = {
  mark: ReactNode;
  name: string;
  meta: string;
  value: string;
  note: string;
  noteTone?: "muted" | "up";
};

const ROWS: Row[] = [
  {
    mark: (
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-nvidia text-[14px] font-semibold text-white">
        N
      </span>
    ),
    name: "Nvidia",
    meta: "NVDAx · Backed",
    value: "4.498 shares",
    note: "$222.33 each",
  },
  {
    mark: (
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-spy text-[9.5px] font-semibold tracking-tight text-white">
        S&P
      </span>
    ),
    name: "S&P 500",
    meta: "SPYx · Backed",
    value: "1.505 shares",
    note: "$664.21 each",
  },
  {
    mark: (
      <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-basket text-basket-ink">
        <Grid className="size-[17px]" />
      </span>
    ),
    name: "Semiconductors",
    meta: "Basket · 6 stocks",
    value: "6 positions",
    note: "+18.4% / 12 mo",
    noteTone: "up",
  },
];

export const QuoteCard = () => (
  <section className="rounded-[18px] border border-line bg-card px-6 py-7 shadow-[0_1px_2px_rgba(20,22,26,0.04)] sm:px-7">
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-[17px] font-bold tracking-[-0.02em]">What $1,000 buys today</h2>
      <span className="stamp shrink-0 text-faint">19 Sep 2026</span>
    </div>

    <div className="mt-3 divide-y divide-line-soft">
      {ROWS.map((row) => (
        <div key={row.name} className="flex items-center gap-3.5 py-[18px]">
          {row.mark}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">{row.name}</p>
            <p className="mt-0.5 truncate text-[13.5px] text-muted">{row.meta}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="num text-[15px] font-semibold tracking-[-0.01em]">{row.value}</p>
            <p
              className={`num mt-0.5 text-[13.5px] ${
                row.noteTone === "up" ? "text-up" : "text-muted"
              }`}
            >
              {row.note}
            </p>
          </div>
        </div>
      ))}
    </div>

    <p className="mt-1 border-t border-line-soft pt-5 text-[13.5px] leading-[1.55] text-muted">
      Prices are live quotes, not estimates. We check both issuers and route to whichever is
      cheaper at your size.
    </p>
  </section>
);
