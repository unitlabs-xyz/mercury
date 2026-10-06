import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { EASE } from "../motion/config";
import { MercuryMark } from "./Logo";

/**
 * What every overlay does while open: Escape closes it, Tab stays inside it,
 * the page stops scrolling behind it, and focus returns to whatever opened it.
 */
const useOverlay = (open: boolean, onClose: () => void) => {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const close = useRef(onClose);

  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    opener.current = document.activeElement;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close.current();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  return panel;
};

/** Modal shell, centred over the page. */
export const Dialog = ({
  open,
  onClose,
  labelledBy,
  children,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  className?: string;
}) => {
  const panel = useOverlay(open, onClose);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-100 grid place-items-center overflow-y-auto bg-ink/45 p-4 backdrop-blur-[2px] sm:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          // Typed explicitly: motion's props cannot infer it now that React
          // types are no longer hoisted. See .npmrc.
          onMouseDown={(e: MouseEvent<HTMLDivElement>) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: 0.32, ease: EASE }}
            className={`w-full overflow-hidden rounded-[20px] bg-white ${className}`}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/**
 * A panel that slides in from the right edge, the full height of the window:
 * for a task that needs the page beside it (borrowing, with the loan's figures
 * still in view). The page dims a little behind it; a click there, Escape or
 * the close button put it away. Full width on a phone.
 */
export const SidePanel = ({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}) => {
  const panel = useOverlay(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-100 flex justify-end bg-black/20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e: MouseEvent<HTMLDivElement>) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.34, ease: EASE }}
            className="flex h-full w-full max-w-[460px] flex-col overflow-y-auto bg-white sm:m-2 sm:h-[calc(100%-16px)] sm:rounded-xl"
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/** A side panel's title row: the title at 20, one line of context under it, and the close button. */
export const PanelHeader = ({
  id,
  title,
  sub,
  onClose,
}: {
  id: string;
  title: ReactNode;
  sub?: ReactNode;
  onClose: () => void;
}) => (
  <header className="flex items-start justify-between gap-3 px-6 pt-6">
    <div className="min-w-0">
      <h2 id={id} className="text-[20px] leading-none font-medium text-ds-ink">
        {title}
      </h2>
      {sub && <p className="mt-3 text-[14px] leading-[1.45] text-ds-muted">{sub}</p>}
    </div>
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="-mt-1 -mr-2 grid size-8 shrink-0 place-items-center rounded-lg text-ds-muted transition-colors hover:bg-black/[0.06] hover:text-ds-ink"
    >
      <svg viewBox="0 0 12 12" width={12} height={12} fill="none" aria-hidden>
        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
      </svg>
    </button>
  </header>
);

/**
 * The sheet the form is about to be written onto: ruled ledger paper with a
 * margin rule down the left, and the mark set into the stock as a watermark
 * that the rules print straight over. Decorative, desktop only.
 */
export const RuledSheet = () => (
  <div aria-hidden className="relative hidden overflow-hidden border-l border-hair bg-shell lg:block">
    {/* Centred in the ruled field rather than the panel, so the margin does not push it off. */}
    <MercuryMark className="absolute top-1/2 left-[calc(50%+18px)] size-[148px] -translate-x-1/2 -translate-y-1/2 text-ink/[0.05]" />
    <div className="absolute inset-0 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_27px,var(--color-rule)_27px,var(--color-rule)_28px)]" />
    <div className="absolute inset-y-0 left-[36px] w-px bg-brand-soft/55" />
  </div>
);
