import { MercuryMark } from "../ui/Logo";

/** The Visa wordmark, drawn rather than fetched so it renders offline. */
const Visa = ({ className = "" }: { className?: string }) => (
  <span
    className={`font-semibold tracking-[-0.03em] italic ${className}`}
    style={{ fontFamily: "Instrument Sans, sans-serif" }}
  >
    VISA
  </span>
);

const FINISHES = {
  platinum:
    "linear-gradient(118deg,#f4f3f0 0%,#d8d5cd 18%,#fbfaf8 34%,#c9c5bb 52%,#eeece7 68%,#d2cec4 84%,#f6f5f2 100%)",
  gold: "linear-gradient(118deg,#f3e6c4 0%,#d9bd77 20%,#fbf4dd 36%,#c9a84f 54%,#eeddb0 70%,#cfae58 86%,#f7efd8 100%)",
  silver:
    "linear-gradient(118deg,#eeedea 0%,#cfccc4 20%,#f8f7f4 36%,#bfbbb2 54%,#e7e5e0 70%,#c8c4ba 86%,#f2f1ee 100%)",
  basic: "linear-gradient(118deg,#1b5f86 0%,#2f8fc0 22%,#7fc6e8 40%,#2a7ba8 58%,#5aa9d4 74%,#1f6b93 100%)",
} as const;

export type Finish = keyof typeof FINISHES;

/**
 * The product itself, so the page leads with the object rather than a
 * photograph of one. Built from a swept gradient because a metal card is a
 * highlight travelling across a surface, not a flat fill.
 */
export const CardArt = ({
  finish = "platinum",
  tier,
  bare = false,
  className = "",
}: {
  finish?: Finish;
  tier?: string;
  /** Just the finish, for a thumbnail too small to carry the wordmarks. */
  bare?: boolean;
  className?: string;
}) => (
  <div
    className={`relative aspect-[1.586/1] w-full overflow-hidden rounded-[18px] ${className}`}
    style={{
      background: FINISHES[finish],
      boxShadow: bare
        ? "inset 0 0 0 1px rgba(27,26,23,0.08), inset 0 1px 0 rgba(255,255,255,0.65)"
        : "0 24px 60px rgba(27,26,23,0.28), inset 0 1px 0 rgba(255,255,255,0.65)",
    }}
  >
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "linear-gradient(196deg,rgba(255,255,255,0.5) 0%,transparent 42%,rgba(27,26,23,0.12) 100%)",
      }}
    />
    {!bare && (
      <div className="absolute inset-0 flex flex-col justify-between p-[7%]">
        {/* Sized in em against the wordmark, so the mark scales with the card
          instead of resolving a percentage against an inline SVG. */}
        <span
          className={`flex items-center gap-[0.45em] text-[clamp(0.75rem,3.4cqw,1.05rem)] ${
            finish === "basic" ? "text-white" : "text-ink"
          }`}
        >
          <MercuryMark className="h-[1.25em] w-[1.25em] shrink-0" />
          <span className="font-semibold tracking-[-0.02em]">Mercury</span>
        </span>
        <span className={`flex items-end justify-end ${finish === "basic" ? "text-white" : "text-ink"}`}>
          <span className="text-right leading-none">
            <Visa className="block text-[clamp(1.1rem,6cqw,2rem)]" />
            {tier && (
              <span className="mt-[2px] block text-[clamp(0.45rem,2cqw,0.6rem)] tracking-[0.14em] uppercase opacity-70">
                {tier}
              </span>
            )}
          </span>
        </span>
      </div>
    )}
  </div>
);
