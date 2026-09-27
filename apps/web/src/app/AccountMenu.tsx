import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Link } from "react-router-dom";
import { useMoney, usePortfolio, useSignedIn } from "../api/hooks";
import { useAuthModal } from "../auth/AuthContext";
import { Check, ChevronDown, Copy } from "../ui/icons";
import { usd } from "./format";

const short = (a: string) => (a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

/**
 * The account, always in reach: the cash you can spend sits in the bar itself,
 * so deciding what to buy never needs a trip to Portfolio. The panel adds who
 * is signed in, the wallet address, and the few verbs that change the balance.
 * Signed out, the same spot is the way in.
 */
export const AccountMenu = () => {
  const signedIn = useSignedIn();
  const { user, logout } = usePrivy();
  const auth = useAuthModal();
  const money = useMoney();
  const portfolio = usePortfolio();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  if (!signedIn) {
    return (
      <button
        type="button"
        onClick={auth.open}
        className="h-9 rounded-full bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep max-sm:h-11"
      >
        Sign in
      </button>
    );
  }

  const email = user?.email?.address ?? "Signed in";
  const address = money.data?.depositAddress ?? "";
  const cash = portfolio.data?.cashUsd ?? money.data?.balanceUsd;

  const copy = () => {
    void navigator.clipboard?.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const initial = email.slice(0, 1).toUpperCase();

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Account, ${usd(cash)} cash to invest`}
        className={`flex h-9 items-center gap-2 rounded-full bg-white py-1 pr-3 pl-1 outline-1 transition-colors max-sm:h-10 ${
          open ? "outline-black/10" : "outline-transparent hover:outline-black/10"
        }`}
      >
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-ds-avatar text-[12px] font-medium text-ds-ink"
        >
          {initial}
        </span>
        <span className="hidden text-left leading-none sm:block">
          <span className="block text-[13px] font-medium text-ds-ink">
            {cash === undefined ? "—" : usd(cash)}
          </span>
          <span className="mt-[3px] block text-[11px] text-ds-muted">cash to invest</span>
        </span>
        <ChevronDown
          className={`size-3.5 text-ds-chevron transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Account"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            // No shadow: a firmer outline, and the grey panel inside, set it off
            // from the white cards it opens over.
            className="absolute top-[calc(100%+8px)] right-0 z-40 w-[280px] rounded-xl bg-white p-1 outline-1 outline-black/15"
          >
            {/* Who is signed in, and the wallet address to copy. */}
            <div className="flex items-center gap-3 px-3 py-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ds-avatar text-[13px] font-medium text-ds-ink">
                {initial}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] leading-none font-medium text-ds-ink">{email}</p>
                {address && (
                  <button
                    type="button"
                    onClick={copy}
                    className="mt-1.5 flex items-center gap-1.5 font-mono text-[12px] leading-none text-ds-muted transition-colors hover:text-ds-ink"
                    aria-label="Copy wallet address"
                  >
                    {short(address)}
                    {copied ? <Check className="size-3 text-ds-up" /> : <Copy className="size-3" />}
                  </button>
                )}
              </div>
            </div>

            {/* Where to go, and nothing else: the figures live on the pages. */}
            <nav
              aria-label="Account"
              className="flex flex-col gap-px rounded-lg bg-ds-panel p-1"
              onClick={() => setOpen(false)}
            >
              {[
                { to: "/portfolio", label: "Portfolio" },
                { to: "/money", label: "Money", meta: cash === undefined ? undefined : usd(cash) },
                { to: "/activity", label: "Activity" },
              ].map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="flex h-9 items-center justify-between rounded-md px-3 text-[14px] leading-none text-ds-ink transition-colors hover:bg-white"
                >
                  {l.label}
                  {l.meta && <span className="text-[12px] text-ds-muted">{l.meta}</span>}
                </Link>
              ))}
            </nav>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void logout();
              }}
              className="mt-1 flex h-9 w-full items-center rounded-md px-4 text-left text-[14px] leading-none text-ds-muted transition-colors hover:bg-ds-panel hover:text-ds-ink"
            >
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
