import { Section } from "../ui/Section";
import { Layers, Lock, Refresh, Shield } from "../ui/icons";

const REASONS = [
  {
    icon: <Layers className="size-[18px]" />,
    title: "Stay invested",
    body: "Selling ends the position. Borrowing does not — the shares keep whatever they were going to do, up or down.",
  },
  {
    icon: <Refresh className="size-[18px]" />,
    title: "Interest only on what you draw",
    body: "A line, not a lump. Take $500 of a $4,000 limit and you pay for $500.",
  },
  {
    icon: <Lock className="size-[18px]" />,
    title: "Repay whenever",
    body: "No schedule, no instalments, no early repayment fee. Interest accrues by the second and stops when you clear it.",
  },
  {
    icon: <Shield className="size-[18px]" />,
    title: "Nobody underwrites you",
    body: "The collateral does the work, so there is no application, no income check and no credit file to mark.",
  },
];

export const Explainer = () => (
  <Section inner="py-16 sm:py-20">
    <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
      <div>
        <h2 className="text-[clamp(1.5rem,3vw,2rem)] leading-[1.15] font-semibold tracking-[-0.02em] text-balance">
          What borrowing against stocks actually is
        </h2>
        <div className="mt-5 space-y-4 text-[15px] leading-[1.65] text-ink-soft">
          <p>
            Your tokenised shares sit as collateral in a lending market, and you draw dollars
            against them. The shares are not sold and not lent out. When you repay, the claim on
            them lifts.
          </p>
          <p>
            This is a Lombard loan — borrowing against assets you own — and it is deliberately not
            margin.{" "}
            <strong className="font-semibold text-ink">
              Money you borrow cannot buy stocks inside Harbor.
            </strong>{" "}
            That rule is enforced in code, not policy, because a credit line that funds more of the
            same position is a way to lose twice as fast.
          </p>
          <p>
            Harbor is not the lender. The market is{" "}
            <a
              href="https://app.kamino.finance"
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-brand underline decoration-brand/30 underline-offset-[3px] transition-colors hover:decoration-brand"
            >
              Kamino
            </a>
            , the largest lender on Solana, and the rates and collateral limits on this page are
            read from it rather than set by us.
          </p>
        </div>
      </div>

      <ul className="space-y-7">
        {REASONS.map((r) => (
          <li key={r.title} className="flex gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand-deep">
              {r.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-[16px] font-semibold">{r.title}</span>
              <span className="mt-1.5 block text-[14px] leading-[1.6] text-muted text-pretty">
                {r.body}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  </Section>
);
