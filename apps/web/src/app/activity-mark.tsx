import type { Event } from "@mercury/view";
import { EVENT_ICON } from "./portfolio/icons";

/** Native SOL has no mint of its own; the feed records it under wrapped SOL. */
const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/*
 * The two mints that are money rather than a holding, so they never resolve to
 * an instrument and cannot come from the API's logo column.
 *
 * Solana's mark is vendored (Simple Icons, CC0, already in public/logos).
 * USDC's is the Solana token list's own asset — the file every wallet on this
 * chain already shows for this mint, rather than a mark of ours that would
 * only half-match what people recognise.
 */
const MONEY: Record<string, { src: string; bare: boolean }> = {
  /* A bare vector mark, drawn to its own ink with no margin. Dropped straight
     into a 36px circle it touches every edge and reads as a blot rather than a
     coin, so it is inset on the panel grey instead. */
  [SOL_MINT]: { src: "/logos/solana.svg", bare: true },
  [USDC_MINT]: {
    src: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
    bare: false,
  },
};

/** The same Solana USDC coin in activity and balance lists. */
export const UsdcMark = ({ size = 36, src = MONEY[USDC_MINT]!.src }: { size?: 32 | 36; src?: string }) => (
  <span className="relative shrink-0">
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className={`${size === 32 ? "size-8" : "size-9"} rounded-full bg-page object-cover`}
    />
    <img
      src="/logos/solana.svg"
      alt=""
      width={16}
      height={16}
      loading="lazy"
      className="absolute -right-px -bottom-px size-4 rounded-full bg-white p-[3px] ring-2 ring-white"
    />
  </span>
);

/**
 * What a row is about, at a glance: the stock's own mark for a trade, the
 * token's for cash and SOL, and the kind icon for anything with no asset
 * behind it — a queued order, an interest payment.
 *
 * Everything in a list is one size in the same circle, because the mark is the
 * leftmost column and a row that sizes differently breaks the line the eye
 * follows down the page. 36px on the Activity page; 32px in the portfolio's
 * Recent activity, where the rows are a summary.
 */
export const ActivityMark = ({ event, size = 36 }: { event: Event; size?: 32 | 36 }) => {
  const money = event.mint === undefined ? undefined : MONEY[event.mint];
  /* A stock's own art wins: it is already a full-bleed circle of the right
     shape, which is why only the bare marks need insetting. */
  const src = event.logo ?? money?.src;
  const box = size === 32 ? "size-8" : "size-9";

  if (src === undefined)
    return (
      <span className={`shrink-0 ${size === 32 ? "[&>svg]:size-8" : "[&>svg]:size-9"}`}>
        {EVENT_ICON[event.kind]}
      </span>
    );

  const mark = (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      /* page grey, not panel grey: the row is already panel, so a panel circle
         is no circle at all, and the row turns white under the pointer. One
         step down reads as a coin against both. It also gives a remote mark
         somewhere to be while it loads. */
      className={`${box} rounded-full bg-page ${money?.bare === true ? "p-2" : "object-cover"}`}
    />
  );

  /*
   * USDC gets Solana notched into its corner, because "added cash" is the one
   * row where the chain is the point: the same ticker on the wrong network is
   * the mistake this product has to keep people from making. The notch is a
   * ring in the row's own background, so the badge reads as cut out of the
   * coin rather than stuck on top of it — and the ring is why it survives the
   * row turning white on hover.
   */
  if (event.mint === USDC_MINT) {
    return <UsdcMark src={src} size={size} />;
  }

  return <span className="shrink-0">{mark}</span>;
};
