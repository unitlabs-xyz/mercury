import { Section } from "../ui/Section";
import { useCreditMarket } from "../market/hooks";
import { Check } from "../ui/icons";

const ASSURANCES = ["No credit check", "No paperwork", "Nothing sold"];

export const CreditHero = () => {
  const market = useCreditMarket();
  const apy = market.data?.borrowApy;

  return (
    <Section inner="py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-[760px] text-center">
        <p className="text-[13px] font-semibold tracking-[0.08em] text-brand uppercase">
          Coming in version two
        </p>
        <h1 className="mt-4 text-[clamp(2.1rem,5.2vw,3.4rem)] leading-[1.06] font-semibold tracking-[-0.03em] text-balance">
          Borrow against your stocks
        </h1>
        <p className="mx-auto mt-5 max-w-[54ch] text-[clamp(1rem,1.5vw,1.125rem)] leading-[1.55] text-muted text-pretty">
          Cash without selling. Your shares stay yours, stay invested, and keep whatever they were
          going to do next.
        </p>

        <div className="mt-8 flex flex-col items-center gap-4">
          <span className="inline-flex items-baseline gap-2.5 rounded-2xl border border-cardline bg-white px-5 py-3.5">
            <span className="text-[14px] text-muted">Borrowing costs</span>
            <span className="text-[26px] font-semibold tracking-[-0.02em] text-up-deep tabular-nums">
              {apy == null ? "—" : `${(apy * 100).toFixed(2)}%`}
            </span>
            <span className="text-[14px] text-muted">a year, right now</span>
          </span>
          <p className="text-[13px] text-faint">
            Read live from Kamino's xStocks market. It floats with demand, so it will not be this
            when you read it.
          </p>
        </div>

        <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5">
          {ASSURANCES.map((a) => (
            <li key={a} className="flex items-center gap-2 text-[14px] text-ink-soft">
              <Check className="size-4 text-brand" />
              {a}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
};
