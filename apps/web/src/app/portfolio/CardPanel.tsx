import type { ReactNode } from "react";
import type { CardAccount } from "../../api/dashboard";
import { CardArt } from "../../cards/CardArt";
import { Button } from "../../ui/Button";
import { RailCard, RailFigure, RailHead, StatusChip } from "../../ui/ds";
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
      // Coming soon: the rail's header over a grey panel, like Rebalancing and About.
      <section aria-label="Card" className="min-w-0 rounded-xl bg-white p-1">
        <div className="px-5 pt-4">
          <RailHead
            title="Card"
            meta={
              <StatusChip tone="neutral" size="md">
                Coming soon
              </StatusChip>
            }
          />
        </div>
        <div className="mt-[11px] flex items-center gap-4 rounded-lg bg-ds-panel px-5 py-4">
          <div className="w-[72px] shrink-0 [&>div]:rounded-lg">
            <CardArt finish="gold" bare />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] leading-tight font-medium text-ds-ink">Spend without selling</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ds-muted">
              A card backed by your shares, so you can spend against them and keep them invested.
            </p>
          </div>
        </div>
      </section>
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
