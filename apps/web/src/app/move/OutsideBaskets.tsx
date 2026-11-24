import { usd } from "@mercury/view";
import { useOutsideBaskets, type OutsideBasket } from "../../api/move";
import { Button } from "../../ui/Button";
import { usePanels } from "../Panels";

/** Glider's own app, where a basket made there is withdrawn. */
export const GLIDER_APP_URL = "https://glider.fi";

/** "1.5 TSLAx · 20 USDC", the largest first, and how many more past three. */
export const holdingsLine = (b: Pick<OutsideBasket, "holdings">): string => {
  const shown = b.holdings
    .slice(0, 3)
    .map((h) => `${Number(h.amount).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${h.symbol}`);
  const more = b.holdings.length - shown.length;
  return more > 0 ? `${shown.join(" · ")} · ${more} more` : shown.join(" · ");
};

/**
 * Baskets a linked wallet runs on Glider outside Mercury. Mercury can see
 * them on the chain but can't move them: a basket belongs to the app that
 * made it, and only that app's Glider account can ask for a withdrawal. So
 * the card says what they hold, and walks the person through bringing them
 * in: withdraw on Glider to this wallet, then move the shares here in one
 * click. Their cost there is an estimate, the price when they arrived, since
 * Mercury never saw what the basket cost.
 */
export const OutsideBaskets = ({ name }: { name: string }) => {
  const baskets = useOutsideBaskets();
  const panels = usePanels();
  const list = baskets.data ?? [];
  if (list.length === 0) return null;
  const total = list.reduce((s, b) => s + Number(b.valueUsd), 0);

  return (
    <section
      aria-label="Baskets on Glider"
      className="flex flex-col gap-4 rounded-xl bg-white px-4 py-4 sm:px-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-medium text-ds-ink">
          {list.length === 1 ? "A basket on Glider" : `${list.length} baskets on Glider`}
        </h2>
        <p className="text-[16px] font-medium text-ds-ink">{usd(total)}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {list.map((b) => (
          <li
            key={b.address}
            className="flex justify-between gap-3 rounded-lg bg-ds-panel px-4 py-3 text-[13px]"
          >
            <span className="min-w-0 truncate text-ds-muted">{holdingsLine(b)}</span>
            <span className="shrink-0 font-medium text-ds-ink">{usd(Number(b.valueUsd))}</span>
          </li>
        ))}
      </ul>
      <p className="text-[13px] leading-[1.45] text-ds-muted">
        Made in Glider's own app, so Mercury can see {list.length === 1 ? "it" : "them"} but can't move{" "}
        {list.length === 1 ? "it" : "them"} for you. Three steps bring the shares here:
      </p>
      <ol className="flex flex-col gap-2 text-[13px] leading-[1.45] text-ds-ink">
        <li>
          <span className="font-medium">1.</span> Open Glider and withdraw the basket.
        </li>
        <li>
          <span className="font-medium">2.</span> Choose to receive the shares themselves, in {name}. Nothing
          is sold.
        </li>
        <li>
          <span className="font-medium">3.</span> Move them to your Mercury wallet here, in one approval.
        </li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <a
          href={GLIDER_APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center rounded-full bg-ds-panel px-4 text-[13px] font-semibold text-ds-ink hover:bg-black/5"
        >
          Open Glider ↗
        </a>
        <Button variant="primary" onClick={panels.move}>
          Move shares to Mercury
        </Button>
      </div>
    </section>
  );
};
