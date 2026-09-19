const ISSUERS = ["Backed", "Ondo", "xStocks", "Solana", "Privy"];

const STATS = [
  { value: "590", label: "US stocks and funds" },
  { value: "24 / 7", label: "Buy any hour of the week" },
  { value: "$3", label: "Minimum to start" },
  { value: "4.1%", label: "Earned on idle cash" },
];

export const CustodyStrip = () => (
  <section className="gutter flex flex-col gap-4 border-y border-rule bg-white py-[22px] lg:flex-row lg:items-center lg:gap-[34px]">
    <span className="stamp whitespace-nowrap">SHARES CUSTODIED AND TOKENISED BY</span>
    <div className="flex flex-1 flex-wrap items-center justify-between gap-x-8 gap-y-3">
      {ISSUERS.map((name) => (
        <span key={name} className="text-[17px] font-semibold tracking-[-0.01em] text-ink-soft">
          {name}
        </span>
      ))}
    </div>
  </section>
);

export const StatsBand = () => (
  <section className="grid grid-cols-2 border-b border-rule lg:grid-cols-4">
    {STATS.map((stat, i) => (
      <div
        key={stat.label}
        className={`px-5 py-[34px] sm:px-10 ${
          i % 2 === 0 ? "border-r border-rule" : ""
        } ${i < 2 ? "border-b border-rule lg:border-b-0" : ""} ${
          i === 3 ? "lg:border-r-0" : "lg:border-r"
        }`}
      >
        <p className="text-[28px] font-semibold tracking-[-0.03em] sm:text-[34px]">{stat.value}</p>
        <p className="mt-[5px] text-[13px] text-muted">{stat.label}</p>
      </div>
    ))}
  </section>
);
