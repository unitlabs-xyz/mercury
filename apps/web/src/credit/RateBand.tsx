import { Section } from "../ui/Section";
import { useCreditMarket } from "../market/hooks";

/**
 * Indicative US ranges for context, not quotes, and not sourced from a feed —
 * so they are labelled as typical rather than stated as fact. The only precise
 * number in this band is the one we actually read.
 */
const ALTERNATIVES = [
  { label: "Credit card", range: "21–28%" },
  { label: "Personal loan", range: "11–20%" },
  { label: "Margin at a broker", range: "6–13%" },
];

export const RateBand = () => {
  const market = useCreditMarket();
  const apy = market.data?.borrowApy;

  return (
    <Section tone="white" inner="py-8 sm:py-9">
      <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
        <dl className="flex flex-wrap gap-x-10 gap-y-5">
          {ALTERNATIVES.map((a) => (
            <div key={a.label}>
              <dt className="text-[13px] text-muted">{a.label}</dt>
              <dd className="mt-1 text-[17px] font-semibold tabular-nums">{a.range}</dd>
            </div>
          ))}
        </dl>

        <div className="flex items-center gap-5 lg:shrink-0">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold">Borrowing here</p>
            <p className="mt-1 text-[13px] leading-[1.5] text-muted">
              Because the collateral is already on chain and nobody underwrites you
            </p>
          </div>
          <span className="shrink-0 border-b-2 border-up pb-1 text-[30px] font-semibold tracking-[-0.02em] text-up-deep tabular-nums">
            {apy == null ? "—" : `${(apy * 100).toFixed(2)}%`}
          </span>
        </div>
      </div>
      <p className="mt-6 text-[12px] leading-[1.5] text-faint">
        Alternatives are typical published ranges for context, not offers. Ours is the live USDC
        borrow rate in Kamino's xStocks market and changes with utilisation.
      </p>
    </Section>
  );
};
