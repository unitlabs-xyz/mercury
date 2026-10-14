import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useEffect, useId, useState, type ReactNode } from "react";
import { EASE } from "../motion/config";
import { STEP_SLIDE, STEP_TRANSITION } from "../motion/step";
import { PanelHeader, SidePanel } from "../ui/Dialog";
import { StatusChip } from "../ui/ds";
import { ChevronDown } from "../ui/icons";
import { DepositAddress } from "./Receive";
import { FundFromChainSkeleton } from "./money/FundSkeleton";

/*
 * AppKit, its two adapters and a WalletConnect client, behind the one route
 * that needs them. Eager, they were 1,250 kB of first load for every visitor
 * — see money/FundFromChainWithWallet.tsx for the measurement.
 */
const FundFromChainWithWallet = lazy(() => import("./money/FundFromChainWithWallet"));

type Method = {
  key: string;
  title: string;
  sub: string;
  /** Right-hand figure: how fast or how much it costs. */
  figure: string;
  note: string;
  icon: ReactNode;
  /** Not live yet: shown so people know it is coming, but cannot be picked. */
  soon?: boolean;
};

/**
 * Name, description and right-hand figure. The same row whether it can be
 * picked or not.
 *
 * A row in the list is one line tall and truncates, because it is one of
 * several being scanned. A row behind the fold wraps instead: it is read
 * rather than scanned, and "ACH or wire fro…" is not worth opening a fold for.
 */
const Row = ({ method, dim }: { method: Method; dim?: boolean }) => (
  <>
    <span className={dim ? "opacity-60" : undefined}>{method.icon}</span>
    <span className={`min-w-0 flex-1 ${dim ? "opacity-60" : ""}`}>
      <span className={`block text-[14px] leading-[18px] font-medium text-ds-ink ${dim ? "" : "truncate"}`}>
        {method.title}
      </span>
      <span className={`mt-0.5 block text-[12px] leading-4 text-ds-muted ${dim ? "" : "truncate"}`}>
        {method.sub}
      </span>
    </span>
    <span className="shrink-0 text-right">
      {method.soon ? (
        // The method's own note. "Soon" was a second, shorter way of saying
        // the same thing, in a chip beside the one that already said it.
        <StatusChip tone="neutral" size="md">
          {method.note}
        </StatusChip>
      ) : (
        <>
          <span className="block text-[14px] leading-[18px] font-medium text-ds-ink">{method.figure}</span>
          <span className="mt-0.5 block text-[12px] leading-4 text-ds-muted">{method.note}</span>
        </>
      )}
    </span>
  </>
);

/**
 * The methods that are not built yet, behind one line.
 *
 * They were laid out beside the only one that works, three greyed rows taking
 * four fifths of the list — so the panel read as a choice between four things
 * when it is a choice between one. Folded away they are still an answer to
 * "can I use my bank", which is why they are here at all, and no longer the
 * first thing the eye lands on.
 */
const OtherMethods = ({ methods }: { methods: readonly Method[] }) => {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (methods.length === 0) return null;
  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`other-methods-${id}`}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-[14px] leading-none font-medium text-ds-muted transition-colors hover:bg-white/60 hover:text-ds-ink"
      >
        Other methods
        <ChevronDown
          className={`size-3.5 text-ds-chevron transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            id={`other-methods-${id}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { duration: 0.3, ease: EASE }, opacity: { duration: 0.2 } }}
            className="overflow-hidden"
          >
            {methods.map((m) => (
              // Not buttons and not radios: there is nothing to choose here
              // until they exist, and a disabled control invites the click
              // that does nothing.
              <li key={m.key} className="flex min-h-15 items-center gap-3 px-3 py-2.5">
                <Row method={m} dim />
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};

/** The method's mark: a 32px circle with a line icon, as the list rows' logos sit. */
const Glyph = ({ children }: { children: ReactNode }) => (
  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-ds-ink outline-1 outline-black/5">
    <svg viewBox="0 0 16 16" width={16} height={16} fill="none" aria-hidden>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  </span>
);

/** A 32px white circle for a filled mark, as the list rows' logos sit. */
const FilledGlyph = ({ children }: { children: ReactNode }) => (
  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-ds-ink outline-1 outline-black/5">
    {children}
  </span>
);

/**
 * Solana's mark, filled in ink.
 *
 * Its own gradient washed out on white at this size — the purple and green
 * are light enough to all but disappear — so it is drawn solid, the way the
 * wallet beside it is, and reads at a glance.
 */
const SolanaGlyph = () => (
  <FilledGlyph>
    <svg viewBox="0 0 24 24" width={15} height={15} aria-hidden>
      <path
        fill="currentColor"
        d="m23.8764 18.0313-3.962 4.1393a.9201.9201 0 0 1-.306.2106.9407.9407 0 0 1-.367.0742H.4599a.4689.4689 0 0 1-.2522-.0733.4513.4513 0 0 1-.1696-.1962.4375.4375 0 0 1-.0314-.2545.4438.4438 0 0 1 .117-.2298l3.9649-4.1393a.92.92 0 0 1 .3052-.2102.9407.9407 0 0 1 .3658-.0746H23.54a.4692.4692 0 0 1 .2523.0734.4531.4531 0 0 1 .1697.196.438.438 0 0 1 .0313.2547.4442.4442 0 0 1-.1169.2297zm-3.962-8.3355a.9202.9202 0 0 0-.306-.2106.941.941 0 0 0-.367-.0742H.4599a.4687.4687 0 0 0-.2522.0734.4513.4513 0 0 0-.1696.1961.4376.4376 0 0 0-.0314.2546.444.444 0 0 0 .117.2297l3.9649 4.1394a.9204.9204 0 0 0 .3052.2102c.1154.049.24.0744.3658.0746H23.54a.469.469 0 0 0 .2523-.0734.453.453 0 0 0 .1697-.1961.4382.4382 0 0 0 .0313-.2546.4444.4444 0 0 0-.1169-.2297zM.46 6.7225h18.7815a.9411.9411 0 0 0 .367-.0742.9202.9202 0 0 0 .306-.2106l3.962-4.1394a.4442.4442 0 0 0 .117-.2297.4378.4378 0 0 0-.0314-.2546.453.453 0 0 0-.1697-.196.469.469 0 0 0-.2523-.0734H4.7596a.941.941 0 0 0-.3658.0745.9203.9203 0 0 0-.3052.2102L.1246 5.9687a.4438.4438 0 0 0-.1169.2295.4375.4375 0 0 0 .0312.2544.4512.4512 0 0 0 .1692.196.4689.4689 0 0 0 .2518.0739z"
      />
    </svg>
  </FilledGlyph>
);

/** A wallet, filled: the body and its flap in ink, the clasp cut out in white. */
const WalletGlyph = () => (
  <FilledGlyph>
    <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden>
      <path fill="currentColor" d="M2.6 4.4 10.7 2.3a1.1 1.1 0 0 1 1.4 1.06V4.2H3.4c-.3 0-.58.07-.8.2Z" />
      <rect x="1.75" y="4.2" width="12.5" height="9.3" rx="2" fill="currentColor" />
      <rect x="9.6" y="7.35" width="4.65" height="3" rx="1.5" fill="white" />
      <circle cx="11.15" cy="8.85" r="0.75" fill="currentColor" />
    </svg>
  </FilledGlyph>
);

const METHODS: readonly Method[] = [
  {
    key: "solana",
    title: "USDC on Solana",
    sub: "From any wallet or exchange",
    figure: "Instant",
    note: "No fee",
    icon: <SolanaGlyph />,
  },
  {
    key: "bank",
    title: "Bank transfer",
    sub: "ACH or wire from a US bank, through Bridge",
    figure: "1–2 days",
    note: "Coming soon",
    soon: true,
    icon: (
      <Glyph>
        <path d="M2.5 6 8 3l5.5 3M3.5 6.5v5M6.5 6.5v5M9.5 6.5v5M12.5 6.5v5M2.5 13h11" />
      </Glyph>
    ),
  },
  {
    key: "card",
    title: "Debit card",
    sub: "Visa or Mastercard, through Bridge",
    figure: "Instant",
    note: "Coming soon",
    soon: true,
    icon: (
      <Glyph>
        <rect x="2" y="4" width="12" height="8.5" rx="1.5" />
        <path d="M2 7h12M4.5 10h2" />
      </Glyph>
    ),
  },
  {
    key: "networks",
    title: "From your wallet",
    sub: "Any token, any chain — swapped to USDC for you",
    figure: "Minutes",
    note: "Network fee",
    icon: <WalletGlyph />,
  },
];

/** What you can actually use today, and what is only announced. */
const LIVE = METHODS.filter((m) => !m.soon);
const SOON = METHODS.filter((m) => m.soon);

type View = "methods" | "solana" | "networks";

/** Each step's title and line of context, in the panel header. */
const HEADS: Record<View, { title: string; sub: string }> = {
  methods: { title: "Add cash", sub: "It starts earning the moment it arrives." },
  solana: { title: "USDC on Solana", sub: "From any wallet or exchange. It arrives instantly, with no fee." },
  networks: { title: "From your wallet", sub: "Any token, any chain. We swap it to USDC for you." },
};

/**
 * Adding cash, as a side panel that goes one level in.
 *
 * The front page is the list of ways to add cash and nothing else. Choosing
 * one replaces the list with that way's own screen — the address for Solana,
 * the token picker for a wallet — and the close button becomes a way back, so
 * the choice reads as a step taken rather than a section unfolding under the
 * list it came from. The two fade through a blur, the way pages change in the
 * app.
 */
export const AddCash = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  /* The step, and which way it was reached, so the slide knows its direction. */
  const [[view, dir], setStep] = useState<[View, number]>(["methods", 1]);
  const setView = (next: View) => setStep([next, next === "methods" ? -1 : 1]);

  /* Every opening starts on the front page, whichever step the last one ended on. */
  useEffect(() => {
    if (!open) setStep(["methods", 1]);
  }, [open]);

  const head = HEADS[view];
  const back = view === "methods" ? undefined : () => setView("methods");

  return (
    <SidePanel open={open} onClose={onClose} labelledBy="add-cash-heading">
      {/* Clipped across, not down: the slide must not open a sideways
          scrollbar in a panel that scrolls vertically. */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-x-clip">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div
            key={view}
            custom={dir}
            variants={STEP_SLIDE}
            initial="enter"
            animate="center"
            exit="exit"
            transition={STEP_TRANSITION}
            className="flex min-h-0 flex-1 flex-col"
          >
            <PanelHeader
              id="add-cash-heading"
              title={head.title}
              sub={head.sub}
              onClose={onClose}
              {...(back === undefined ? {} : { onBack: back })}
            />

            {view === "methods" && (
              <div className="px-6 pt-5 pb-6">
                <div className="flex flex-col gap-1 rounded-lg bg-ds-panel p-1">
                  {LIVE.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setView(m.key as View)}
                      className="flex h-15 items-center gap-3 rounded-md px-3 text-left transition-colors hover:bg-white"
                    >
                      <Row method={m} />
                    </button>
                  ))}

                  <OtherMethods methods={SOON} />
                </div>
              </div>
            )}

            {view === "solana" && (
              <div className="px-6 pt-5 pb-6">
                <DepositAddress />
              </div>
            )}

            {view === "networks" && (
              /* Fills what is left of the panel, so the token list can run to
               its bottom edge instead of stopping at a fixed height. */
              <div className="flex min-h-0 flex-1 flex-col px-6 pt-5 pb-6">
                <Suspense fallback={<FundFromChainSkeleton />}>
                  <FundFromChainWithWallet />
                </Suspense>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </SidePanel>
  );
};
