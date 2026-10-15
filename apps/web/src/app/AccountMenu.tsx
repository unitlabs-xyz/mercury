import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useMoney, usePortfolio, useSignedIn } from "../api/hooks";
import { useAuthModal } from "../auth/AuthContext";
import { Check, ChevronDown, Copy, Help, Message, Pulse, SignOut } from "../ui/icons";
import { Button } from "../ui/Button";
import { useUsdcAck } from "./usdcAck";
import { openFeedback } from "./Feedback";
import { usd } from "@mercury/view";
import { Skeleton } from "./portfolio/ui";
import { useAdminAccess } from "./admin/useAdmin";

const short = (a: string) => (a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

/**
 * The account. The bar carries who you are and nothing else, so the header
 * stays quiet; opening it gives the email, the wallet address, the cash you
 * can spend, and the two things that are not a place to go.
 *
 * It used to list Portfolio, Money and Activity. All three sit in the nav to
 * the left at every width, so the menu was a second copy of a nav the reader
 * could already see — fuller, but no more use. Signed out, the same spot is
 * the way in.
 */
export const AccountMenu = () => {
  const signedIn = useSignedIn();
  const { user, logout } = usePrivy();
  const auth = useAuthModal();
  const money = useMoney();
  const portfolio = usePortfolio();
  /* A hook and a `<Link>`, never an import of the page — importing anything
     from `admin/Admin` or `admin/panels` here would pull the whole surface
     into the eager chunk. bundle.test.ts asserts that too. */
  const admin = useAdminAccess();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [acked, ack] = useUsdcAck();
  // The USDC-only note, opened from the address before it can be copied.
  const [asking, setAsking] = useState(false);
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
  /* Still waiting, as opposed to asked and failed — the em-dash is the right
     answer to the second, and a pulse that never stops is the wrong one. */
  const waiting = !money.isError && !portfolio.isError;

  const copy = () => {
    void navigator.clipboard?.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const initial = email.slice(0, 1).toUpperCase();
  /* One row's worth of styling, shared so the two actions sit on the same rhythm.
     The icon stays muted in both rows: it marks the row, the word names it. */
  const row =
    "flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-left text-[14px] leading-none transition-colors hover:bg-white";

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setAsking(false);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Account"
        className={`flex h-9 items-center gap-2 rounded-full bg-white py-1 pr-2.5 pl-1 outline-1 transition-colors max-sm:h-10 ${
          open ? "outline-black/10" : "outline-transparent hover:outline-black/10"
        }`}
      >
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-ds-avatar text-[12px] font-medium text-ds-ink"
        >
          {initial}
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
            {/* Who is signed in, the wallet address to copy, and — since the bar
                no longer carries it — what there is to spend. Two lines a side,
                so the block reads as one row rather than three stacked facts. */}
            <div className="flex items-start gap-3 px-3 py-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ds-avatar text-[13px] font-medium text-ds-ink">
                {initial}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] leading-none font-medium text-ds-ink">{email}</p>
                {/* Half the address, always. Copying it waits for a yes to the
                    USDC-only rule, the same one Add cash asks: until then the
                    icon is an "i" that opens the rule, not a copy. */}
                {address ? (
                  <button
                    type="button"
                    onClick={acked ? copy : () => setAsking((a) => !a)}
                    className="mt-1.5 flex items-center gap-1.5 font-mono text-[12px] leading-none text-ds-muted transition-colors hover:text-ds-ink"
                    aria-label={acked ? "Copy wallet address" : "About this address"}
                    aria-expanded={acked ? undefined : asking}
                  >
                    {short(address)}
                    {!acked ? (
                      <Help className="size-3" />
                    ) : copied ? (
                      <Check className="size-3 text-ds-up" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </button>
                ) : waiting ? (
                  <Skeleton className="mt-1.5 h-3 w-28" />
                ) : null}
              </div>
              <span className="shrink-0 text-right">
                <span className="block text-[14px] leading-none font-medium text-ds-ink">
                  {cash !== undefined ? usd(cash) : waiting ? <Skeleton className="h-[14px] w-14" /> : "—"}
                </span>
                <span className="mt-1.5 block text-[11px] leading-none text-ds-muted">cash to invest</span>
              </span>
            </div>

            <AnimatePresence initial={false}>
              {asking && !acked && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="mb-1 rounded-lg bg-ds-warn-chip p-3">
                    <p className="text-[12px] leading-[1.45] text-ds-chip-warn">
                      This address takes USDC on Solana only. Any other token, or any other network, will not
                      reach your balance.
                    </p>
                    <Button
                      variant="primary"
                      onClick={() => {
                        ack();
                        setAsking(false);
                        copy();
                      }}
                      className="mt-2.5 w-full"
                    >
                      I understand, copy address
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* What is left once the destinations go: the two things that are not
                a place to go. Sign out stays muted, so the pair does not read as
                two equal offers. */}
            <div className="flex flex-col gap-px rounded-lg bg-ds-panel p-1">
              {/* Only when the API answered 200 to the cheapest admin route —
                  never a client-side flag. Everybody else never sees it, and
                  typing the path gets the same 404 the API gives. */}
              {admin.granted && (
                <Link to="/admin" onClick={() => setOpen(false)} className={`${row} text-ds-ink`}>
                  <Pulse className="size-4 shrink-0 text-ds-muted [stroke-width:1.5]" />
                  Admin
                </Link>
              )}
              {/* Opens the feedback panel: a message and screenshots, straight to the team. */}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  openFeedback();
                }}
                className={`${row} text-ds-ink`}
              >
                <Message className="size-4 shrink-0 text-ds-muted [stroke-width:1.5]" />
                Support
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  void logout();
                }}
                className={`${row} text-ds-muted hover:text-ds-ink`}
              >
                <SignOut className="size-4 shrink-0" />
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
