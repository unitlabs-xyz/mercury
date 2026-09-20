import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { EASE } from "../motion/config";
import { AnchorMark } from "./Logo";

/**
 * Modal shell: escape and backdrop close it, Tab stays inside, the page stops
 * scrolling behind it, and focus returns to whatever opened it.
 */
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
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    opener.current = document.activeElement;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
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
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-100 grid place-items-center overflow-y-auto bg-ink/45 p-4 backdrop-blur-[2px] sm:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => {
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
            className={`w-full overflow-hidden rounded-[20px] bg-white shadow-[0_24px_60px_rgba(27,26,23,0.28)] ${className}`}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/**
 * The sheet the form is about to be written onto: ruled ledger paper with a
 * margin rule down the left, and the anchor set into the stock as a watermark
 * that the rules print straight over. Decorative, desktop only.
 */
export const RuledSheet = () => (
  <div
    aria-hidden
    className="relative hidden overflow-hidden border-l border-hair bg-shell lg:block"
  >
    {/* Centred in the ruled field rather than the panel, so the margin does not push it off. */}
    <AnchorMark className="absolute top-1/2 left-[calc(50%+18px)] size-[148px] -translate-x-1/2 -translate-y-1/2 text-ink/[0.05]" />
    <div className="absolute inset-0 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_27px,var(--color-rule)_27px,var(--color-rule)_28px)]" />
    <div className="absolute inset-y-0 left-[36px] w-px bg-brand-soft/55" />
  </div>
);
