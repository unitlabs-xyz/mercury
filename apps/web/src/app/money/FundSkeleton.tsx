import { Skeleton } from "../portfolio/ui";

/**
 * Token rows while they load, drawn to the measure of `TokenRow`: the 28px
 * mark, the symbol over the name, and the chain on the right, with the same
 * hairline under each. Matching it is the point — the real rows land exactly
 * where these were, so the list fills in rather than jumping.
 */
export const TokenRowsSkeleton = ({ count = 7 }: { count?: number }) => (
  <div aria-hidden className="flex flex-col px-1">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="flex items-center gap-3 px-3">
        <Skeleton className="size-7 shrink-0 rounded-full" />
        <span className="flex min-w-0 flex-1 items-center justify-between gap-3 border-b border-ds-divider py-3.5">
          <span className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-3 w-24" />
          </span>
          <Skeleton className="h-3 w-14" />
        </span>
      </div>
    ))}
  </div>
);

/**
 * The whole wallet screen while its code and its chains load: the search
 * field, a row of chain chips, and the list under them, each where it will be.
 *
 * Its own file, with no wallet import, because `AddCash` shows it before the
 * wallet chunk has arrived — reaching it through `FundFromChain` would pull
 * AppKit into the first download, which is what the lazy boundary exists to
 * stop.
 */
export const FundFromChainSkeleton = () => (
  <div aria-hidden className="flex min-h-0 flex-1 flex-col">
    <Skeleton className="h-11 w-full rounded-lg" />
    <div className="mt-2 flex gap-1.5 overflow-hidden">
      {["w-24", "w-20", "w-16", "w-24", "w-20"].map((w, i) => (
        <Skeleton key={i} className={`h-8 shrink-0 rounded-full ${w}`} />
      ))}
    </div>
    <div className="mt-2 min-h-0 flex-1 overflow-hidden rounded-lg bg-ds-panel">
      <TokenRowsSkeleton />
    </div>
  </div>
);
