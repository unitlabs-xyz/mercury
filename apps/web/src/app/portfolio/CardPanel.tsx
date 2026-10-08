import type { ReactNode } from "react";
import type { CardAccount } from "../../api/dashboard";
import { Button } from "../../ui/Button";
import { RailCard, RailFigure, RailHead } from "../../ui/ds";
import { usd } from "@mercury/view";
import type { Model } from "./model";
import { Skeleton, relDay, shortDate } from "./ui";

/* No link: the card has no page in the app yet. */
const Head = ({ meta }: { meta?: string }) => <RailHead title="Card" meta={meta} />;

const Sheet = ({ children }: { children: ReactNode }) => <RailCard label="Card">{children}</RailCard>;

/**
 * One question: what do I owe on the card, and when? Built to card.svg: the
 * balance and its due date with Pay beside them, then a rule and one line of
 * this month's spend. Everything else lives behind Manage.
 */
export const CardPanel = ({
  m,
  card,
  loading,
}: {
  m: Model | undefined;
  card: CardAccount | null | undefined;
  loading: boolean;
}) => {
  if (loading || !m) {
    return (
      <Sheet>
        <Head />
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
      </Sheet>
    );
  }

  if (!card) {
    return (
      // Coming soon, set like the locked Rebalancing card: what the panel will
      // show, blurred and inert, with one note over it saying why.
      <Sheet>
        <Head />
        <div className="relative mt-4">
          <div aria-hidden="true" inert className="pointer-events-none select-none opacity-60 blur-[3px]">
            <div className="flex items-center justify-between gap-3">
              <RailFigure value="$248.30" sub="Due 16 Nov, paid automatically" />
              <Button variant="primary" disabled>
                Pay
              </Button>
            </div>
            <p className="mt-[13px] border-t border-ds-divider pt-3 text-[14px] leading-tight text-ds-muted">
              <span className="font-medium text-ds-ink">$412.00</span> spent this month of $2,000 · Credit
              mode
            </p>
          </div>
          <div className="absolute inset-0 grid place-items-center px-4">
            <div className="max-w-[300px] rounded-lg bg-ds-panel px-5 py-4 text-center">
              <p className="text-[14px] font-medium text-ds-ink">Card coming soon</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-ds-muted">
                Spend against your shares and keep them invested.
              </p>
            </div>
          </div>
        </div>
      </Sheet>
    );
  }

  const owes = card.statementBalanceUsd > 0;
  const urgent = owes && !card.autopay && ["today", "tomorrow"].includes(relDay(card.statementDue));
  const limit =
    card.mode === "credit" ? Math.min(card.monthlyLimitUsd, m.available + card.spentThisMonthUsd) : m.cash;

  return (
    <Sheet>
      <Head meta={`${card.plan} - ${card.last4}`} />

      <div className="mt-4 flex items-center justify-between gap-3">
        <RailFigure
          value={usd(card.statementBalanceUsd)}
          sub={
            owes
              ? `Due ${shortDate(card.statementDue)}${card.autopay ? ", paid automatically" : ", autopay is off"}`
              : "Nothing due"
          }
          tone={urgent ? "warn" : undefined}
        />
        {owes && <Button variant="primary">Pay</Button>}
      </div>

      <p className="mt-[13px] border-t border-ds-divider pt-3 text-[14px] leading-tight text-ds-muted">
        <span className="font-medium text-ds-ink">{usd(card.spentThisMonthUsd)}</span> spent this month of{" "}
        {usd(limit, 0)} · <span className="capitalize">{card.mode}</span> mode
      </p>
    </Sheet>
  );
};
