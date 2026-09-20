import { Alert, Refresh } from "../ui/icons";

/**
 * Says where the number came from and how old it is. A price with no provenance
 * is a claim; this makes it a reading.
 */
export const LiveDot = ({ fetching, at }: { fetching: boolean; at: number | undefined }) => {
  const age = at ? Math.round((Date.now() - at) / 1000) : null;
  return (
    <span className="flex items-center gap-2 rounded-full border border-cardline bg-white px-3 py-1.5 text-[12px] text-muted">
      <span className="relative flex size-2">
        {fetching && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-60" />
        )}
        <span className="relative inline-flex size-2 rounded-full bg-up" />
      </span>
      {fetching ? "Updating" : age === null ? "Live" : age < 30 ? "Live" : `${age}s ago`}
    </span>
  );
};

export const PriceError = ({
  message,
  onRetry,
  className = "",
}: {
  message: string;
  onRetry: () => void;
  className?: string;
}) => (
  <div
    className={`flex flex-wrap items-center gap-3 rounded-2xl border border-down-line bg-down-tint px-4 py-3.5 ${className}`}
  >
    <Alert className="size-4 shrink-0 text-down-deep" />
    <p className="min-w-0 flex-1 text-[13px] leading-[1.5] text-down-deep">{message}</p>
    <button
      type="button"
      onClick={onRetry}
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-down-line px-3 text-[13px] font-medium text-down-deep transition-colors hover:bg-white"
    >
      <Refresh className="size-3.5" />
      Retry
    </button>
  </div>
);
