import { Section } from "../ui/Section";
import { ArrowUp } from "../ui/icons";

const SPLIT = [
  { label: "Stocks", value: "$5,795.49" },
  { label: "Baskets", value: "$2,150.40" },
  { label: "Cash · 4.1%", value: "$4,534.73" },
];

export const Portfolio = () => (
  <Section
    tone="white"
    inner="grid items-center gap-12 py-[76px] lg:grid-cols-[1fr_0.85fr] lg:gap-20"
  >
    <div>
      <h2 className="text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[40px]">
        One account. Your stocks and your crypto in the same number.
      </h2>
      <p className="mt-[18px] max-w-[46ch] text-[16px] leading-[1.6] text-muted text-pretty">
        Not a stocks app beside a wallet. One portfolio value, what it cost you, and what it has
        done — with everything you hold counted together.
      </p>
      <p className="mt-4 max-w-[46ch] text-[16px] leading-[1.6] text-muted text-pretty">
        And because the same company can be held through either issuer, Harbor adds your positions
        up by each token's own multiplier rather than by counting tokens.
      </p>
    </div>

    <article className="rounded-[18px] border border-cardline bg-white px-6 py-6 sm:px-[26px]">
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

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 rounded-md bg-up-tint py-[3px] pr-2 pl-1.5 text-[13px] font-semibold text-up-deep">
          <ArrowUp className="size-3" />
          10.68%
        </span>
        <span className="text-[13px] text-muted">+$1,204.18 all time</span>
      </div>

      <div className="mt-5 divide-y divide-hair border-t border-cardline">
        {SPLIT.map((item) => (
          <div key={item.label} className="flex items-baseline justify-between gap-4 py-[9px]">
            <span className="text-[14px] text-ink-soft">{item.label}</span>
            <span className="text-[13px] font-semibold tabular-nums">{item.value}</span>
          </div>
        ))}
      </div>
    </article>
  </Section>
);
