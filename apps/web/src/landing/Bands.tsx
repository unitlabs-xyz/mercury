import { Section } from "../ui/Section";

const ISSUERS = ["Backed", "Ondo", "xStocks", "Solana", "Privy"];

const STATS = [
  { value: "590", label: "US stocks and funds" },
  { value: "24 / 7", label: "Buy any hour of the week" },
  { value: "$3", label: "Minimum to start" },
  { value: "4.1%", label: "Earned on idle cash" },
];

export const CustodyStrip = () => (
  <Section
    tone="white"
    inner="flex flex-col gap-4 py-[22px] lg:flex-row lg:items-center lg:gap-[34px]"
  >
    <span className="stamp whitespace-nowrap">SHARES CUSTODIED AND TOKENISED BY</span>
    <div className="flex flex-1 flex-wrap items-center justify-between gap-x-10 gap-y-3">
      {ISSUERS.map((name) => (
        <span key={name} className="text-[17px] font-semibold tracking-[-0.01em] text-ink-soft">
          {name}
        </span>
      ))}
    </div>
  </Section>
);

export const StatsBand = () => (
  <div className="border-b border-rule">
    <div className="mx-auto grid w-full max-w-[1440px] grid-cols-2 lg:grid-cols-4">
      {STATS.map((stat, i) => (
        <div
          key={stat.label}
          className={[
            "px-5 py-[34px] sm:px-10",
            // two-up below lg, four-up above; the last cell in each row loses its rule
            i % 2 === 0 ? "border-r border-rule" : "lg:border-r lg:border-rule",
            i < 2 ? "border-b border-rule lg:border-b-0" : "",
            i === 3 ? "lg:border-r-0" : "",
            i === 1 ? "border-r-0 lg:border-r" : "",
          ].join(" ")}
        >
          <p className="text-[28px] font-semibold tracking-[-0.03em] sm:text-[34px]">
            {stat.value}
          </p>
          <p className="mt-[5px] text-[13px] text-muted">{stat.label}</p>
        </div>
      ))}
    </div>
  </div>
);
