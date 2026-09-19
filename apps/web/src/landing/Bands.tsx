import { Section } from "../ui/Section";

/** Official marks, painted through a mask so the strip takes one ink from the palette. */
const ISSUERS = [
  { name: "Backed", src: "/logos/backed.svg", w: 76, h: 17 },
  { name: "Ondo", src: "/logos/ondo.svg", w: 65, h: 19 },
  { name: "xStocks", src: "/logos/xstocks.svg", w: 94, h: 22 },
  { name: "Solana", src: "/logos/solana.svg", w: 15, h: 15 },
  { name: "Privy", src: "/logos/privy.svg", w: 76, h: 17 },
];

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
      {ISSUERS.map((issuer) => (
        <span
          key={issuer.name}
          role="img"
          aria-label={issuer.name}
          className="block bg-ink-soft opacity-70 transition-opacity duration-200 hover:opacity-100"
          style={{
            width: issuer.w,
            height: issuer.h,
            maskImage: `url(${issuer.src})`,
            WebkitMaskImage: `url(${issuer.src})`,
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskSize: "contain",
            WebkitMaskSize: "contain",
            maskPosition: "center",
            WebkitMaskPosition: "center",
          }}
        />
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
