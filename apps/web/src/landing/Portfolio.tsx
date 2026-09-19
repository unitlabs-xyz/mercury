import { Section } from "../ui/Section";
import { PortfolioCard } from "./HeroCards";

/** The same company held through both issuers, added up correctly. */
const WRAPPERS = [
  { token: "NVDAx", issuer: "Backed", value: "$400.00", share: "75%", multiplier: "1.001701" },
  { token: "NVDAon", issuer: "Ondo", value: "$133.28", share: "25%", multiplier: "1.001715" },
];

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
      <PortfolioCard />

      <article className="rounded-[18px] border border-cardline bg-shell p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-4 border-b border-cardline pb-3.5">
          <span className="text-[15px] font-semibold">Nvidia</span>
          <span className="text-right">
            <span className="text-[15px] font-semibold">$533.28</span>
            <span className="ml-2.5 font-mono text-[13px] text-muted">2.398 shares</span>
          </span>
        </div>

        {WRAPPERS.map((w) => (
          <div key={w.token} className="flex items-center gap-3 pt-3.5">
            <span className="w-[68px] shrink-0 font-mono text-[13px] font-medium">{w.token}</span>
            <span className="flex-1 text-[13px] text-muted">{w.issuer}</span>
            <span className="font-mono text-[13px] text-muted">×{w.multiplier}</span>
            <span className="w-[68px] text-right text-[13px] font-semibold">{w.value}</span>
            <span className="w-9 text-right font-mono text-[13px] text-muted">{w.share}</span>
          </div>
        ))}

        <p className="mt-4 border-t border-cardline pt-3.5 text-[13px] leading-[1.5] text-faint">
          Two different Nvidia tokens, one share count. Harbor warns you when a single issuer holds
          too much of a position.
        </p>
      </article>
    </div>
  </Section>
);
