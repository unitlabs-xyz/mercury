import type { ReactNode } from "react";
import { Section } from "../ui/Section";
import { ArrowUp } from "../ui/icons";

const SPLIT = [
  { label: "Stocks", value: "$5,795.49" },
  { label: "Baskets", value: "$2,150.40" },
  { label: "Cash · 4.1%", value: "$4,534.73" },
];

/** The same company held through both issuers, added up correctly. */
const WRAPPERS = [
  { token: "NVDAx", issuer: "Backed", multiplier: "×1.001701", value: "$400.00", share: "75%" },
  { token: "NVDAon", issuer: "Ondo", multiplier: "×1.001715", value: "$133.28", share: "25%" },
];

const Row = ({ name, children }: { name: ReactNode; children: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 py-[9px]">
    <span className="text-[14px] text-ink-soft">{name}</span>
    <span className="flex shrink-0 items-baseline gap-5">{children}</span>
  </div>
);

const Figure = ({ children, w, strong }: { children: ReactNode; w?: string; strong?: boolean }) => (
  <span
    className={`text-right font-mono text-[13px] tabular-nums ${
      strong ? "font-semibold text-ink" : "text-muted"
    } ${w ?? ""}`}
  >
    {children}
  </span>
);

export const Portfolio = () => (
  <Section
    tone="white"
    inner="grid items-center gap-12 py-[76px] lg:grid-cols-[0.95fr_1.05fr] lg:gap-16"
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
        up by each token's own multiplier rather than by counting tokens. No broker has this
        problem, so no broker has this screen.
      </p>
    </div>

    <div className="grid gap-4">
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
            <Row key={item.label} name={item.label}>
              <Figure strong>{item.value}</Figure>
            </Row>
          ))}
        </div>
      </article>

      <article className="rounded-[18px] border border-cardline bg-shell px-6 py-6 sm:px-[26px]">
        <div className="flex items-baseline justify-between gap-4 border-b border-cardline pb-3.5">
          <span className="text-[15px] font-semibold">Nvidia</span>
          <span className="flex items-baseline gap-5">
            <Figure strong>$533.28</Figure>
            <Figure>2.398 shares</Figure>
          </span>
        </div>

        <div className="divide-y divide-cardline">
          {WRAPPERS.map((w) => (
            <Row
              key={w.token}
              name={
                <span className="flex items-baseline gap-3">
                  <span className="font-mono text-[13px] font-medium text-ink">{w.token}</span>
                  <span className="text-[13px] text-muted">{w.issuer}</span>
                </span>
              }
            >
              <Figure>{w.multiplier}</Figure>
              <Figure strong w="w-16">
                {w.value}
              </Figure>
              <Figure w="w-9">{w.share}</Figure>
            </Row>
          ))}
        </div>

        <p className="mt-4 border-t border-cardline pt-3.5 text-[13px] leading-[1.5] text-faint">
          Two different Nvidia tokens, one share count. Harbor warns you when a single issuer holds
          too much of a position.
        </p>
      </article>
    </div>
  </Section>
);
