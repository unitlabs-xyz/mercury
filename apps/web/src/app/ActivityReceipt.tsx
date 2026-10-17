import { useState } from "react";
import {
  receiptOf,
  toEvent,
  whenText,
  type Event,
  type Receipt,
  type ReceiptAction,
  type ReceiptLine,
} from "@mercury/view";
import { useActivityReceipt } from "../api/hooks";
import { Button, ButtonLink } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { StatusChip } from "../ui/ds";
import { ArrowUpRight, Check, Copy } from "../ui/icons";
import { ActivityMark } from "./activity-mark";
import { usePanels } from "./Panels";
import { Skeleton } from "./portfolio/ui";
import { RouteLine, SwapPanel, TipLine, Well } from "./review";
import { TOKEN_NAME } from "./stock/heldAs";
import { useEvents } from "./useEvents";

/** "+$12.42", "−$200.00": one true sign, as the row it opened from. */
const signed = (e: Event) =>
  e.amount === null ? null : `${e.flow === "in" ? "+" : e.flow === "out" ? "−" : ""}${e.amount}`;

/** An address, shortened, with the whole of it a tap away. */
const Copyable = ({ shown, full }: { shown: string; full: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono">{shown}</span>
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy address"}
        onClick={() => {
          void navigator.clipboard?.writeText(full).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="grid size-6 place-items-center rounded-md text-ds-muted transition-colors hover:bg-white hover:text-ds-ink [&_svg]:size-3.5"
      >
        {copied ? <Check /> : <Copy />}
      </button>
    </span>
  );
};

const Line = ({ line }: { line: ReceiptLine }) => (
  <TipLine k={line.label} tip={line.tip}>
    <span className={line.tone === "up" ? "text-ds-up" : line.tone === "down" ? "text-ds-down" : undefined}>
      {line.copy ? <Copyable shown={line.value} full={line.copy} /> : line.value}
    </span>
  </TipLine>
);

/**
 * The rows, in the receipt's order: the facts, then the parts of the money
 * with their total under a rule, then what the event left behind. The same
 * rows on the swap panel's grey or on a panel of their own.
 */
const Rows = ({ r }: { r: Receipt }) => (
  <>
    {r.facts.length > 0 && (
      <dl className="flex flex-col gap-3">
        {r.facts.map((l) => (
          <Line key={l.label} line={l} />
        ))}
      </dl>
    )}
    {r.parts.length > 0 && (
      <dl
        className={`flex flex-col gap-3 ${r.facts.length > 0 ? "mt-3 border-t border-ds-divider pt-3" : ""}`}
      >
        {r.parts.map((l) => (
          <Line key={l.label} line={l} />
        ))}
      </dl>
    )}
    {r.total && (
      <dl className="mt-3 border-t border-ds-divider pt-3">
        <TipLine k={r.total.label}>{r.total.value}</TipLine>
      </dl>
    )}
    {(r.after.length > 0 || r.route) && (
      <dl
        className={`flex flex-col gap-3 ${r.facts.length + r.parts.length > 0 || r.total ? "mt-3 border-t border-ds-divider pt-3" : ""}`}
      >
        {r.after.map((l) => (
          <Line key={l.label} line={l} />
        ))}
        {r.route && <RouteLine issuer={TOKEN_NAME[r.route.issuer]} venues={r.route.venues} />}
      </dl>
    )}
    {r.note && (
      <p
        className={`text-[14px] leading-[1.45] text-ds-muted ${r.facts.length + r.parts.length + r.after.length > 0 ? "mt-3" : ""}`}
      >
        {r.note}
      </p>
    )}
  </>
);

const hasRows = (r: Receipt) =>
  r.facts.length + r.parts.length + r.after.length > 0 ||
  r.total !== null ||
  r.route !== null ||
  r.note !== null;

/** Each transaction behind the event, its explorer one tap away on the arrow. */
const Links = ({ links }: { links: Receipt["links"] }) => (
  <div className="box rounded-lg bg-ds-panel px-4 py-1">
    {links.map((l) => (
      <div key={l.href} className="flex h-10 items-center gap-3 text-[12px] leading-none">
        <span className="w-12 shrink-0 text-ds-muted">{l.label}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-ds-muted">{l.text}</span>
        <a
          href={l.href}
          target="_blank"
          rel="noreferrer"
          aria-label={`View the ${l.label} transaction`}
          title={`View on ${l.label === "Solana" ? "Solscan" : "Relay"}`}
          className="-mr-1.5 grid size-7 shrink-0 place-items-center rounded-md text-ds-link transition-colors hover:bg-white [&_svg]:size-4"
        >
          <ArrowUpRight />
        </a>
      </div>
    ))}
  </div>
);

const Action = ({ a }: { a: ReceiptAction }) => {
  const panels = usePanels();
  return a.kind === "stock" ? (
    <ButtonLink to={`/invest/${a.ticker}`} size="lg" className="flex-1">
      {a.label}
    </ButtonLink>
  ) : (
    <Button size="lg" className="flex-1" onClick={() => panels.borrow(a.tab)}>
      {a.label}
    </Button>
  );
};

/**
 * One feed row, opened: what it was, what it was made of, and the transaction
 * behind it.
 *
 * It opens on what the feed already knows — the mark, the title, the amount —
 * and fills in as the receipt arrives, so a tap never waits on a blank sheet.
 * Laid out as the order review is: a swap shows its two sides in wells, then
 * the facts as rows on the grey, then rows that add up to their total.
 */
export const ActivityReceipt = ({
  id,
  open,
  onClose,
}: {
  id: string | null;
  open: boolean;
  onClose: () => void;
}) => {
  const { events } = useEvents();
  const fetched = useActivityReceipt(id);
  const item = fetched.data?.item;
  const event = item ? toEvent(item) : events.find((e) => e.id === id);
  const receipt = fetched.data ? receiptOf(fetched.data.item, fetched.data.detail) : null;
  const loading = !receipt && !fetched.isError;
  const amount = event ? signed(event) : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="receipt-title"
      className="flex max-h-[min(86vh,780px)] max-w-[440px] flex-col rounded-xl! p-1"
    >
      <div className="min-h-0 flex-1 overflow-y-auto pt-5 pb-4">
        <div className="flex items-center gap-3 px-5">
          {event ? <ActivityMark event={event} size={40} /> : <Skeleton className="size-10 rounded-full" />}
          <div className="min-w-0 flex-1">
            <h2 id="receipt-title" className="truncate text-[18px] leading-none font-medium text-ds-ink">
              {event?.title ?? <Skeleton className="h-[18px] w-40" />}
            </h2>
            <p className="mt-2 flex items-center gap-1.5 text-[14px] leading-none text-ds-muted">
              {item ? whenText(item.occurredAt) : <Skeleton className="h-3.5 w-28" />}
              {event?.pending && <StatusChip tone="pending">Pending</StatusChip>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-2 grid size-8 shrink-0 place-items-center self-start rounded-lg text-ds-muted transition-colors hover:bg-black/[0.06] hover:text-ds-ink"
          >
            <svg viewBox="0 0 12 12" width={12} height={12} fill="none" aria-hidden>
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* A swap says its amounts in the wells; anything else says it here, as the row did. */}
        {!receipt?.swap && amount && (
          <p
            className={`mt-5 px-5 text-[36px] leading-none font-medium ${event?.flow === "in" ? "text-ds-up" : "text-ds-ink"}`}
          >
            {amount}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-1 [&>.box]:mx-4 max-sm:[&>.box]:mx-1">
          {loading ? (
            <div className="box flex flex-col gap-3 rounded-lg bg-ds-panel px-4 py-4" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span key={i} className="flex items-center justify-between">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3.5 w-16" />
                </span>
              ))}
            </div>
          ) : receipt === null ? (
            <p className="box rounded-lg bg-ds-panel px-4 py-4 text-[14px] leading-[1.45] text-ds-muted">
              {event?.sub ||
                "We could not load the rest of this event. The row in your activity is still right."}
            </p>
          ) : receipt.swap ? (
            <div className="box">
              <SwapPanel
                from={
                  <Well
                    label={receipt.swap.from.label}
                    value={receipt.swap.from.value}
                    unit={receipt.swap.from.unit}
                  />
                }
                to={
                  <Well
                    label={receipt.swap.to.label}
                    value={receipt.swap.to.value}
                    unit={receipt.swap.to.unit}
                  />
                }
              >
                {hasRows(receipt) && <Rows r={receipt} />}
              </SwapPanel>
            </div>
          ) : (
            hasRows(receipt) && (
              <div className="box rounded-lg bg-ds-panel px-4 pt-4 pb-3">
                <Rows r={receipt} />
              </div>
            )
          )}

          {receipt && receipt.links.length > 0 && <Links links={receipt.links} />}
          {receipt && receipt.links.length === 0 && event?.kind === "queued" && (
            <p className="box rounded-lg bg-ds-panel px-4 py-3 text-[12px] leading-[1.45] text-ds-muted">
              Nothing on chain yet. The order rests until its price is met.
            </p>
          )}
        </div>
      </div>

      {receipt && receipt.actions.length > 0 && (
        <div className="flex shrink-0 gap-2.5 bg-white px-5 pt-1 pb-4">
          {receipt.actions.map((a) => (
            <Action key={a.label} a={a} />
          ))}
        </div>
      )}
    </Dialog>
  );
};
