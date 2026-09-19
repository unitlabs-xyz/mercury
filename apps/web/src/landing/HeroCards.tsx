import { ArrowUp, Refresh } from "../ui/icons";

const SPLIT = [
  { label: "Stocks", value: "$5,795.49" },
  { label: "Baskets", value: "$2,150.40" },
  { label: "Cash · 4.1%", value: "$4,534.73" },
];

const CURVE =
  "M0,100 C26,92 44,108 70,88 C96,68 114,82 140,72 C166,62 184,78 210,58 C236,38 254,56 280,46 C306,36 324,48 350,28 C376,8 396,24 420,16 L460,10";

export const PortfolioCard = () => (
  <article className="rounded-[18px] border border-cardline bg-white px-[26px] py-6 shadow-[0_8px_28px_rgba(27,26,23,.08)]">
    <div className="flex items-center justify-between">
      <span className="text-[13px] font-medium text-muted">Portfolio value</span>
      <span className="flex items-center gap-[5px] font-mono text-[11px] tracking-[0.06em] text-faint">
        <span className="size-1.5 rounded-full bg-up" />
        LIVE
      </span>
    </div>

    <p className="mt-1.5 text-[38px] leading-[1.1] font-semibold tracking-[-0.035em]">
      $12,480.62
    </p>

    <div className="mt-2 flex items-center gap-2">
      <span className="flex items-center gap-1 rounded-md bg-up-tint py-[3px] pr-2 pl-1.5 text-[13px] font-semibold text-up">
        <ArrowUp className="size-3" />
        10.68%
      </span>
      <span className="text-[13px] text-muted">+$1,204.18 all time</span>
    </div>

    <svg
      viewBox="0 0 460 120"
      preserveAspectRatio="none"
      className="mt-3.5 block h-[96px] w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id="hbHeroArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1A7F4B" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#1A7F4B" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={`${CURVE} L460,120 L0,120 Z`} fill="url(#hbHeroArea)" />
      <path
        d={CURVE}
        fill="none"
        stroke="#1A7F4B"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>

    <div className="flex gap-[22px] border-t border-hair pt-3.5">
      {SPLIT.map((item) => (
        <div key={item.label} className="flex-1">
          <p className="text-[12px] text-faint">{item.label}</p>
          <p className="mt-0.5 text-[14px] font-semibold">{item.value}</p>
        </div>
      ))}
    </div>
  </article>
);

export const IssuerCard = () => (
  <article className="rounded-2xl border border-cardline bg-white px-[18px] py-4 shadow-[0_12px_32px_rgba(27,26,23,.12)]">
    <div className="mb-3 flex items-center justify-between">
      <span className="stamp text-[10px]">WE CHECKED BOTH ISSUERS</span>
      <span className="rounded-full bg-chip px-2 py-[3px] font-mono text-[10px] text-ink-soft">
        $1,000
      </span>
    </div>

    <div className="flex items-center gap-2.5 border-b border-hairline py-[9px]">
      <span className="flex-1 font-mono text-[12px] font-medium">NVDAx</span>
      <span className="text-[13px] font-semibold">$222.33</span>
      <span className="rounded bg-up px-[7px] py-0.5 text-[11px] font-semibold text-white">
        BEST
      </span>
    </div>

    <div className="flex items-center gap-2.5 pt-[9px]">
      <span className="flex-1 font-mono text-[12px] text-faint">NVDAon</span>
      <span className="text-[13px] font-semibold text-faint">$1,523.66</span>
      <span className="rounded border border-down-line px-[7px] py-0.5 text-[11px] font-semibold text-down">
        85.27%
      </span>
    </div>
  </article>
);

export const DividendChip = () => (
  <article className="flex items-center gap-2.5 rounded-xl border border-cardline bg-white px-3.5 py-2.5 shadow-[0_10px_26px_rgba(27,26,23,.10)]">
    <span className="grid size-[26px] shrink-0 place-items-center rounded-lg bg-brand-tint text-brand">
      <Refresh className="size-3.5" />
    </span>
    <div>
      <p className="text-[12px] font-semibold">Dividend reinvested</p>
      <p className="mt-px text-[11px] text-faint">2.398 → 2.401 shares</p>
    </div>
  </article>
);
