import { Section } from "../ui/Section";
import { Alert, Clock } from "../ui/icons";

/**
 * The reference page this was modelled on has no equivalent, because a pledge
 * through a regulated lender unwinds slowly and by letter. This one does not:
 * liquidation is automatic and the weekend gap is specific to holding a token
 * whose underlying market is shut. Leaving it off the page would be the single
 * most misleading thing we could do.
 */
const RISKS = [
  {
    icon: <Alert className="size-[18px]" />,
    title: "You can be sold out",
    body: "If your holdings fall far enough, the market sells part of your collateral to repay the loan. It happens automatically, at whatever the price is, and you do not get asked first. Borrowing less than the maximum is what buys you room.",
  },
  {
    icon: <Clock className="size-[18px]" />,
    title: "The weekend gap is real",
    body: "The token trades all week but the exchange does not. Bad news on a Saturday has nowhere to go until Monday's open, and the price can jump straight past the level where a position would have been closed. A buffer that looked comfortable on Friday can be gone before anyone can act.",
  },
];

export const Risk = () => (
  <Section tone="white" inner="py-16 sm:py-20">
    <div className="max-w-[640px]">
      <h2 className="text-[clamp(1.5rem,3vw,2rem)] leading-[1.15] font-semibold tracking-[-0.02em] text-balance">
        What can go wrong
      </h2>
      <p className="mt-4 text-[15px] leading-[1.6] text-muted text-pretty">
        Borrowing against an investment makes a good outcome better and a bad one worse. Two things
        are worth understanding before you use any of this.
      </p>
    </div>

    <div className="mt-8 grid gap-4 lg:grid-cols-2">
      {RISKS.map((r) => (
        <div key={r.title} className="rounded-2xl border border-warn-line bg-warn-tint px-5 py-5">
          <span className="flex items-center gap-2.5 text-warn">
            {r.icon}
            <span className="text-[16px] font-semibold">{r.title}</span>
          </span>
          <p className="mt-2.5 text-[14px] leading-[1.6] text-warn/90 text-pretty">{r.body}</p>
        </div>
      ))}
    </div>

    <p className="mt-6 max-w-[70ch] text-[13px] leading-[1.6] text-muted">
      When this ships, the borrowing screen will show both numbers before you confirm: how far your
      holdings can fall today, and how big a Monday gap the position would survive. If you would
      not be comfortable seeing part of it sold on a morning you were asleep, borrow less or do not
      borrow.
    </p>
  </Section>
);
