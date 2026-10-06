import { useState } from "react";

type Asset = { ticker: string; mint: string };
type LogoSource = { logo?: string; wrappers: readonly { mint: string; icon?: string }[] };

/** The token held by a Glider strategy may have a different logo from its stock's default wrapper. */
export const assetLogo = (mint: string, source: LogoSource | undefined) =>
  source?.wrappers.find((wrapper) => wrapper.mint === mint)?.icon ?? source?.logo;

export const AssetIcon = ({
  asset,
  source,
  className,
}: {
  asset: Asset;
  source: LogoSource | undefined;
  className: string;
}) => {
  const logo = assetLogo(asset.mint, source);
  const [failed, setFailed] = useState<string | null>(null);

  return logo && failed !== logo ? (
    <img
      src={logo}
      alt=""
      title={asset.ticker}
      loading="lazy"
      onError={() => setFailed(logo)}
      className={className}
    />
  ) : (
    <span
      title={asset.ticker}
      className={`grid place-items-center text-[10px] font-medium text-ds-ink ${className}`}
    >
      {asset.ticker.slice(0, 3)}
    </span>
  );
};
