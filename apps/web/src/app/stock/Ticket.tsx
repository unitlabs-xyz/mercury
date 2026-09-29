import type { Decision } from "@mercury/core";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../ui/Button";
import { RailHead } from "../../ui/ds";
import { Alert, Clock } from "../../ui/icons";
import { REFUSE_COPY } from "../BuySheet";
import { usd } from "../format";
import { RailLine } from "./Panels";

const PRESETS = [50, 100, 250, 500];

const num = (d: { toString(): string } | null | undefined) => (d ? Number(d.toString()) : null);

/** A note under the figures: warn or down tint, 12px, the icon beside the copy. */
export const Note = ({
  tone,
  icon,
  children,
}: {
  tone: "warn" | "down";
  icon: ReactNode;
  children: ReactNode;
}) => (
  <p
    className={`mx-5 mt-4 flex gap-2 rounded-lg px-3 py-2.5 text-[12px] leading-[1.45] ${
      tone === "warn" ? "bg-ds-warn-chip text-ds-chip-warn" : "bg-ds-down-chip text-ds-chip-down"
    } [&_svg]:mt-px [&_svg]:size-3.5 [&_svg]:shrink-0`}
  >
    {icon}
    <span>{children}</span>
  </p>
);

/**
 * The amount, in a white well on the grey panel 4px in from the card's edge,
 * with the presets under it. The stock ticket and the basket ticket share it.
 */
export const AmountWell = ({ raw, onRaw }: { raw: string; onRaw: (v: string) => void }) => {
  const amount = Number(raw) || 0;
  return (
    <div className="mt-[11px] rounded-lg bg-ds-panel p-1">
      <label className="flex h-15 items-center gap-1 rounded-md bg-white px-4 outline-offset-0 focus-within:outline-1 focus-within:outline-black/10">
        <span className="text-[28px] leading-none font-medium text-ds-muted">$</span>
        <input
          value={raw}
          onChange={(e) => onRaw(e.target.value.replace(/[^0-9.]/g, ""))}
          inputMode="decimal"
          aria-label="Amount in dollars"
          className="w-full bg-transparent text-[28px] leading-none font-medium text-ds-ink outline-none"
        />
        <span className="shrink-0 text-[12px] text-ds-muted">USD</span>
      </label>
      <div className="mt-1 grid grid-cols-4 gap-1" role="group" aria-label="Amount presets">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onRaw(String(p))}
            aria-pressed={amount === p}
            className={`h-8 rounded-md border text-[14px] leading-none text-ds-ink transition-colors max-sm:h-10 ${
              amount === p
                ? "border-black/10 bg-linear-to-b from-white to-[#eeeeee]"
                : "border-transparent hover:bg-white/70"
            }`}
          >
            ${p}
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * The order, on the page rather than behind a button, as a rail card: the
 * amount in a white well on the grey panel with the presets under it, the one
 * thing that follows from it, then the one primary action. Review opens the
 * confirmation with the same figure.
 *
 * It used to carry the winning issuer and the price impact as well, which are
 * the table's two comparison columns restated — and on a wide screen the two
 * cards are level, so those numbers were on screen twice at once. The table
 * compares the issuers; the ticket answers what this amount buys.
 *
 * The price per share stays, even though the table shows it too. The ticket is
 * sticky and the table is not, so for most of the page this is the only place
 * the price of the order appears — and the figure in the header is the real
 * share price, which is a different number from what this order pays.
 */
export const Ticket = ({
  name,
  raw,
  onRaw,
  settled,
  cash,
  decision,
  quoting,
  fair,
  onReview,
}: {
  name: string;
  raw: string;
  onRaw: (v: string) => void;
  /** The amount once typing pauses: the quote, and every figure read from it, follow this. */
  settled: number;
  cash: number | null;
  decision: Decision | null;
  quoting: boolean;
  fair: number | null;
  onReview: () => void;
}) => {
  const amount = Number(raw) || 0;
  const best = decision && decision.kind !== "refuse" ? decision.best : null;
  const price = num(best?.pricePerShare) ?? fair;
  const over = cash !== null && amount > cash;

  return (
    <section aria-label={`Buy ${name}`} className="min-w-0 rounded-xl bg-white p-1">
      <div className="px-5 pt-4">
        <RailHead title={`Buy ${name}`} meta={cash === null ? undefined : `${usd(cash)} cash`} />
      </div>

      <AmountWell raw={raw} onRaw={onRaw} />

      <dl className="flex flex-col gap-3 px-5 pt-5">
        <RailLine k="Price per share">{price === null ? "—" : usd(price)}</RailLine>
        <RailLine k="You get">
          {quoting ? "Quoting…" : price && settled > 0 ? `${(settled / price).toFixed(4)} shares` : "—"}
        </RailLine>
      </dl>

      {/* Not "we can wait and place it when the price comes back": that is a
          trigger order, which is not built. Saying it here and then opening a
          dialog whose only button is dead spends a click to say no. */}
      {decision?.kind === "offer_queue" && (
        <Note tone="warn" icon={<Clock />}>
          Trading above the real share price, and the US market is shut. The gap usually closes once it opens.
        </Note>
      )}
      {decision?.kind === "refuse" && (
        <Note tone="down" icon={<Alert />}>
          <span className="font-medium">{REFUSE_COPY[decision.reason].title}.</span>{" "}
          {REFUSE_COPY[decision.reason].body}
        </Note>
      )}
      {over && (
        <Note tone="down" icon={<Alert />}>
          More than your cash.{" "}
          <Link to="/money" className="font-medium underline underline-offset-2">
            Add cash
          </Link>
        </Note>
      )}

      <div className="px-5 pt-5 pb-5">
        <Button
          variant="primary"
          size="lg"
          onClick={onReview}
          disabled={
            amount <= 0 ||
            over ||
            fair === null ||
            decision?.kind === "refuse" ||
            decision?.kind === "offer_queue"
          }
          className="w-full"
        >
          Review order
        </Button>
      </div>
    </section>
  );
};
