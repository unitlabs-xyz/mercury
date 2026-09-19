import { Section } from "../ui/Section";

const STEPS = [
  {
    n: "01",
    title: "Connect a wallet",
    body: "Bring your own, or make one with an email address. Harbor never holds your keys and cannot move your funds.",
  },
  {
    n: "02",
    title: "Send stablecoins",
    body: "USDC on Solana. It earns 4.1% while it waits, and keeps earning while a queued order waits for its price.",
  },
  {
    n: "03",
    title: "Buy shares, or a basket",
    body: "Real shares held with regulated custodians and mirrored on chain. Sell whenever you like, including on a Sunday.",
  },
];

export const HowItWorks = () => (
  <Section
    id="how-it-works"
    inner="grid items-start gap-12 py-20 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16"
  >
    <div>
      <h2 className="text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[40px]">
        Three steps, and none of them is a bank.
      </h2>
      <p className="mt-[18px] text-[16px] leading-[1.6] text-muted text-pretty">
        No brokerage account, no identity check, no fiat rails. If you can hold a stablecoin, you
        can hold Nvidia.
      </p>
      <div className="mt-7 grid h-60 place-items-center rounded-[14px] border border-dashed border-dash bg-[repeating-linear-gradient(135deg,var(--color-hatch)_0_8px,var(--color-shell)_8px_16px)]">
        <span className="stamp px-4 text-center">
          ISOMETRIC ILLUSTRATION — WALLET → SHARES
        </span>
      </div>
    </div>

    <ol className="overflow-hidden rounded-2xl border border-cardline bg-white">
      {STEPS.map((step, i) => (
        <li
          key={step.n}
          className={`flex gap-5 px-6 py-7 sm:px-[30px] ${
            i < STEPS.length - 1 ? "border-b border-hair" : ""
          }`}
        >
          <span className="pt-[3px] text-[13px] font-semibold text-brand tabular-nums">{step.n}</span>
          <div>
            <h3 className="text-[18px] font-semibold tracking-[-0.01em]">{step.title}</h3>
            <p className="mt-[7px] text-[15px] leading-[1.55] text-muted text-pretty">
              {step.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  </Section>
);
