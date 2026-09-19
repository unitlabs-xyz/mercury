import { Section } from "../ui/Section";
import { Search } from "../ui/icons";

const ROWS = [
  { name: "Nvidia", ticker: "NVDA", backed: "$222.33", ondo: "$1,523.66", save: "85.27%" },
  { name: "Tesla", ticker: "TSLA", backed: "$426.07", ondo: "$2,178.43", save: "97.41%" },
  { name: "Apple", ticker: "AAPL", backed: "$245.50", ondo: "$281.14", save: "13.18%" },
  { name: "S&P 500", ticker: "SPY", backed: "$664.21", ondo: "$664.88", save: "0.10%" },
];

const COLS = "grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-3";

export const IssuerComparison = () => (
  <Section
    tone="white"
    inner="grid items-center gap-12 py-[76px] lg:grid-cols-[0.9fr_1.1fr] lg:gap-16"
  >
    <div>
      <p className="eyebrow mb-4">THE PART NOBODY ELSE DOES</p>
      <h2 className="text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[40px]">
        Same share. Two wrappers. Wildly different cost.
      </h2>
      <p className="mt-[18px] text-[16px] leading-[1.6] text-muted text-pretty">
        Two issuers tokenise US stocks, and at any given size one of them is cheaper — sometimes
        by a lot. Harbor quotes both before every order and routes to the better one. The answer
        changes with the amount, so we work it out again each time you move the number.
      </p>
      <p className="mt-[22px] flex items-center gap-[9px] text-[14px] text-muted">
        <Search className="size-4 shrink-0 text-faint" />
        Measured on real quotes, 19 September 2026.
      </p>
    </div>

    <div className="overflow-hidden rounded-2xl border border-cardline">
      <div
        className={`${COLS} border-b border-cardline bg-shell px-4 py-3.5 text-[12px] font-medium text-faint sm:px-[22px]`}
      >
        <span>Stock</span>
        <span className="text-right">Backed</span>
        <span className="text-right">Ondo</span>
        <span className="text-right">You save</span>
      </div>

      {ROWS.map((row, i) => (
        <div
          key={row.ticker}
          className={`${COLS} items-center px-4 py-[15px] sm:px-[22px] ${
            i < ROWS.length - 1 ? "border-b border-hairline" : ""
          }`}
        >
          <div>
            <p className="text-[14px] font-semibold">{row.name}</p>
            <p className="mt-0.5 font-mono text-[11px] text-faint">{row.ticker}</p>
          </div>
          <span className="text-right text-[14px] font-semibold text-up">{row.backed}</span>
          <span className="text-right text-[14px] text-faint">{row.ondo}</span>
          <span className="text-right text-[14px] font-semibold">{row.save}</span>
        </div>
      ))}

      <p className="border-t border-cardline bg-shell px-4 py-[13px] text-[12px] leading-[1.5] text-faint sm:px-[22px]">
        <span className="block max-w-[74ch]">
        Price per share on a $1,000 order, including the cost of size. Where no route exists at
        your amount, Harbor refuses the order rather than filling it badly.
        </span>
      </p>
    </div>
  </Section>
);
