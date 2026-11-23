import { useEffect, useRef, useState } from "react";
import { actingLabel, ALL_WALLETS, useActingWallet, type WalletChoice } from "../api/acting-wallet";
import { shortAddress, walletName } from "../api/wallets";
import { ChevronDown } from "../ui/icons";

/**
 * Which wallet the app shows, in the header on every screen: "Mercury", each
 * linked wallet, and "All wallets". Not there until something is linked, so
 * nobody with one wallet is asked to choose between it and itself.
 */
export const WalletSwitcher = () => {
  const { acting, choose, linked } = useActingWallet();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  if (linked.length === 0) return null;

  const current: WalletChoice =
    acting.kind === "all" ? ALL_WALLETS : acting.kind === "linked" ? acting.wallet.id : null;
  const options: readonly { choice: WalletChoice; name: string; sub: string }[] = [
    { choice: null, name: "Mercury", sub: "Your Mercury wallet" },
    ...linked.map((w) => ({ choice: w.id, name: walletName(w), sub: shortAddress(w.address) })),
    { choice: ALL_WALLETS, name: "All wallets", sub: "Everything together, to look at" },
  ];

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Showing ${actingLabel(acting)}. Choose a wallet`}
        onClick={() => setOpen(!open)}
        className="flex h-9 max-w-[180px] items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-medium text-ds-ink max-sm:h-10"
      >
        <span className="truncate">{actingLabel(acting)}</span>
        <ChevronDown className="size-3.5 shrink-0 text-ds-muted" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Wallets"
          className="absolute top-[calc(100%+10px)] right-0 z-40 w-[260px] rounded-xl bg-white py-2 outline-1 outline-black/10 max-sm:fixed max-sm:inset-x-4 max-sm:top-[66px] max-sm:w-auto"
        >
          {options.map((o) => (
            <li key={o.choice ?? "mercury"} role="option" aria-selected={o.choice === current}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  choose(o.choice);
                }}
                className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-black/[0.03]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-ds-ink">{o.name}</span>
                  <span className="block truncate text-[12px] text-ds-muted">{o.sub}</span>
                </span>
                {o.choice === current && (
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-ds-ink" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
