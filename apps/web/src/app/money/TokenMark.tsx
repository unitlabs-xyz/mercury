import { useEffect, useState } from "react";

/**
 * A token's mark, with its chain's mark on the corner.
 *
 * The pairing is what lets the list drop its right-hand chain column: USDC on
 * Base and USDC on Arbitrum are two rows that read identically until something
 * distinguishes them, and a badge does it in less space than a word while
 * leaving the symbol as the thing being scanned.
 */

/**
 * The letter that stands in when there is no artwork.
 *
 * Needed more often than it looks: Relay's logos are CoinGecko URLs, which
 * rot, and a broken <img> renders as the browser's alt-text box — the single
 * ugliest thing a list like this can show. A circle with a letter in it is
 * indistinguishable from an intentional design.
 */
const Initial = ({ symbol, className }: { symbol: string; className: string }) => (
  <span
    aria-hidden
    className={`flex items-center justify-center rounded-full bg-ds-avatar text-ds-muted ${className}`}
  >
    <span className="text-[11px] leading-none font-medium">{symbol.slice(0, 1).toUpperCase()}</span>
  </span>
);

const Mark = ({
  src,
  alt,
  symbol,
  className,
}: {
  src: string | null;
  alt: string;
  symbol: string;
  className: string;
}) => {
  const [broken, setBroken] = useState(false);

  /* A new row can reuse this element, and a url that failed for the last token
     says nothing about this one. Without this, one broken logo poisons the
     position it sat in for every search after it. */
  useEffect(() => setBroken(false), [src]);

  if (src === null || broken) return <Initial symbol={symbol} className={className} />;

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setBroken(true)}
      className={`rounded-full bg-white object-contain ${className}`}
    />
  );
};

export const TokenMark = ({
  symbol,
  logoUrl,
  chainName,
  chainIconUrl,
}: {
  symbol: string;
  logoUrl: string | null;
  chainName: string;
  chainIconUrl: string | null;
}) => (
  <span className="relative inline-flex size-7 shrink-0">
    <Mark src={logoUrl} alt="" symbol={symbol} className="size-7" />
    {/* Ringed in the panel's own colour so the badge reads as sitting on top
        of the token rather than overlapping it. */}
    <Mark
      src={chainIconUrl}
      alt=""
      symbol={chainName}
      className="absolute -right-0.5 -bottom-0.5 size-3.5 ring-2 ring-ds-panel"
    />
  </span>
);
