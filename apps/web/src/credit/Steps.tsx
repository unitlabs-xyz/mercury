import { Section } from "../ui/Section";

const STEPS = [
  {
    title: "See your limit",
    body: "Worked out from what you already hold. Nothing is pledged and nothing is checked.",
  },
  {
    title: "Choose an amount",
    body: "Anything up to the limit. Take less than the maximum and the buffer before trouble is larger.",
  },
  {
    title: "Pledge the holding",
    body: "One signature from your own wallet. The shares stay in your account with a claim on them.",
  },
  {
    title: "Dollars arrive",
    body: "USDC lands in your cash balance, usually inside a minute. Spend, send or hold it.",
  },
];

export const Steps = () => (
  <Section inner="py-16 sm:py-20">
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
      <div>
        <h2 className="text-[clamp(1.5rem,3vw,2rem)] leading-[1.15] font-semibold tracking-[-0.02em] text-balance">
          Cash against your stocks in four steps
        </h2>
        <p className="mt-4 max-w-[46ch] text-[15px] leading-[1.6] text-muted text-pretty">
          No forms, because there is nothing to assess. The collateral is already on chain and so
          is the lending market.
        </p>
      </div>

      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            className="flex gap-4 rounded-2xl border border-cardline bg-white px-5 py-4"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-tint text-[13px] font-semibold text-brand-deep tabular-nums">
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[15.5px] font-semibold">{s.title}</span>
              <span className="mt-1 block text-[14px] leading-[1.55] text-muted text-pretty">
                {s.body}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  </Section>
);
