import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { EASE } from "../motion/config";
import { ChevronRight } from "./icons";

export type Option = { value: string; label: string };

/**
 * A listbox, not a styled <select>. Arrow keys move, Enter or Space commits,
 * Escape and Tab close, and focus returns to the trigger.
 */
export const Select = ({
  label,
  value,
  options,
  onChange,
  widthClass = "w-[150px]",
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  widthClass?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return undefined;
    setCursor(Math.max(0, options.findIndex((o) => o.value === value)));
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, options, value]);

  const commit = (next: string) => {
    onChange(next);
    setOpen(false);
    trigger.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
      if (e.key === "Escape") trigger.current?.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(options.length - 1, c + 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    }
    if (e.key === "Home") {
      e.preventDefault();
      setCursor(0);
    }
    if (e.key === "End") {
      e.preventDefault();
      setCursor(options.length - 1);
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = options[cursor];
      if (opt) commit(opt.value);
    }
  };

  return (
    <div ref={root} className={`relative ${widthClass}`} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label`}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-[9px] border border-cardline bg-white px-3.5 py-2.5 text-left max-sm:min-h-11 text-[13px] transition-colors hover:border-faint"
      >
        <span className="min-w-0 truncate">
          <span id={`${id}-label`} className="text-faint">
            {label}:{" "}
          </span>
          <span className="font-medium text-ink">{selected?.label}</span>
        </span>
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="inline-flex shrink-0 text-faint"
        >
          <ChevronRight className="size-4" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label={label}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="absolute z-50 mt-1.5 max-h-[280px] w-full overflow-y-auto rounded-xl border border-cardline bg-white p-1.5 shadow-[0_12px_32px_rgba(27,26,23,0.14)]"
          >
            {options.map((o, i) => {
              const isSelected = o.value === value;
              return (
                <li key={o.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => commit(o.value)}
                    onMouseEnter={() => setCursor(i)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                      i === cursor ? "bg-shell" : ""
                    } ${isSelected ? "font-semibold text-ink" : "text-ink-soft"}`}
                  >
                    {o.label}
                    {isSelected && <span className="text-brand">✓</span>}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};
