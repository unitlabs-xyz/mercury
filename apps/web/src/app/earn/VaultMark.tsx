import type { EarnVault } from "../../api/earn";

/**
 * A vault's mark: its curator's logo where the curator is known, the USDC
 * mark otherwise. The logos ship with the app under /earn; Kamino publishes none.
 */
export const VaultMark = ({
  vault,
  size = 40,
}: {
  vault: Pick<EarnVault, "logo" | "name">;
  size?: number;
}) => (
  <img
    // No curator we recognise: the token it holds, which is what every vault here is.
    src={`/earn/${vault.logo ?? "usdc"}.png`}
    alt=""
    width={size}
    height={size}
    className="shrink-0 rounded-[10px] bg-white outline-1 -outline-offset-1 outline-black/5"
    style={{ width: size, height: size }}
  />
);

/** Rates as the page prints them: 4.08%, or a dash where Kamino has none. */
export const rate = (r: number | null) => (r === null ? "—" : `${(r * 100).toFixed(2)}%`);

/** What the money is lent against, in the words a depositor would use. */
export const KIND_LABEL: Record<NonNullable<EarnVault["kind"]>, string> = {
  crypto: "Crypto loans",
  mixed: "Mixed",
  "real-world": "Real-world credit",
};
