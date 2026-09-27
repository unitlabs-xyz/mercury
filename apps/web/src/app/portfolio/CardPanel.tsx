import type { ReactNode } from "react";
import type { CardAccount } from "../../api/dashboard";
import { CardArt } from "../../cards/CardArt";
import { Button } from "../../ui/Button";
import { RailCard, RailFigure, RailHead } from "../../ui/ds";
import { usd } from "../format";
import type { Model } from "./model";
import { Skeleton, relDay, shortDate } from "./ui";

const Head = ({ meta, label }: { meta?: string; label: string }) => (
  <RailHead title="Card" meta={meta} to="/cards" linkLabel={label} />
);

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
        <Head label="Manage" />
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
      </Sheet>
    );
  }

  if (!card) {
    return (
      <Sheet>
        <Head label="See plans" />
        <div className="mt-4 flex items-center gap-3">
          <div className="w-12 shrink-0">
            <CardArt finish="gold" bare className="rounded-[5px]" />
          </div>
          <p className="text-[14px] text-ds-muted">Spend against your shares without selling them.</p>
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
      <Head meta={`${card.plan} - ${card.last4}`} label="Manage" />

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
