import { Link } from "react-router-dom";
import { useBasketTemplates } from "../../api/baskets";
import { useInstruments } from "../../market/hooks";
import { GlideRows } from "../../ui/ds";
import { AssetIcon } from "../baskets/AssetIcon";
import { displayBasketName } from "../baskets/catalog";
import { RailList } from "../invest/Rail";

const weight = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.00$/, "")}%`;

/**
 * The baskets that hold this stock, heaviest weighting first: the basket's top
 * two marks, its name over the asset count, and this stock's target weight on
 * the right. Hidden when no basket holds it.
 */
export const InBaskets = ({ ticker }: { ticker: string }) => {
  const templates = useBasketTemplates();
  const holding = (templates.data ?? [])
    .filter((template) => template.status !== "disabled")
    .flatMap((template) => {
      const mine = template.allocations.find((a) => a.ticker.toUpperCase() === ticker.toUpperCase());
      return mine ? [{ template, weightBps: mine.weightBps }] : [];
    })
    .sort((a, b) => b.weightBps - a.weightBps)
    .slice(0, 4);
  const markTickers = [
    ...new Set(
      holding.flatMap(({ template }) =>
        [...template.allocations]
          .sort((a, b) => b.weightBps - a.weightBps)
          .slice(0, 2)
          .map((asset) => asset.ticker),
      ),
    ),
  ];
  const instruments = useInstruments(markTickers);
  const byTicker = new Map((instruments.data ?? []).map((instrument) => [instrument.ticker, instrument]));
  if (holding.length === 0) return null;

  return (
    <RailList label="In baskets" meta="Target weight" to="/baskets" linkLabel="All baskets">
      <GlideRows as="ul">
        {holding.map(({ template, weightBps }) => {
          const marks = [...template.allocations].sort((a, b) => b.weightBps - a.weightBps).slice(0, 2);
          return (
            <li key={template.slug}>
              <Link
                data-row
                to={`/baskets/${template.slug}`}
                className="relative grid h-[52px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-3"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex w-[44px] shrink-0 items-center -space-x-2" aria-hidden="true">
                    {marks.map((asset, index) => (
                      <span
                        key={asset.ticker}
                        className="relative shrink-0"
                        style={{ zIndex: marks.length - index }}
                      >
                        <AssetIcon
                          asset={asset}
                          source={byTicker.get(asset.ticker)}
                          className="size-7 rounded-full bg-white object-contain ring-2 ring-ds-panel"
                        />
                      </span>
                    ))}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] leading-[18px] font-medium text-ds-ink">
                      {displayBasketName(template.name)}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] leading-4 text-ds-muted">
                      {template.allocations.length} assets
                    </span>
                  </span>
                </span>
                <span className="text-[14px] leading-[18px] font-medium whitespace-nowrap text-ds-ink">
                  {weight(weightBps)}
                </span>
              </Link>
            </li>
          );
        })}
      </GlideRows>
    </RailList>
  );
};
