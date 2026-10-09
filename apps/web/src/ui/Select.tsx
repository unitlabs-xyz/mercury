import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { EASE } from "../motion/config";
import { ChevronDown, ChevronRight } from "./icons";

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
  placement = "bottom",
  field = false,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  widthClass?: string;
  /** "top" for a trigger near the foot of a dialog, which clips its own overflow. */
  placement?: "bottom" | "top";
  /** Set among form inputs, where it should look like one rather than a filter. */
  field?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return undefined;
    setCursor(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
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
        {...(field ? { "aria-label": label } : { "aria-labelledby": `${id}-label` })}
        onClick={() => setOpen((v) => !v)}
        className={
          field
            ? "flex h-11 w-full items-center justify-between gap-2 rounded-md bg-white px-3 text-left text-[14px] leading-none outline-1 outline-transparent transition-colors hover:outline-black/10 focus-visible:outline-black/20"
            : "flex h-8 w-full items-center justify-between gap-2 rounded-lg bg-ds-panel px-3 text-left text-[14px] leading-none transition-colors hover:bg-ds-tag max-sm:h-10"
        }
      >
        <span className="min-w-0 truncate">
          {/* As a field, the name of the thing belongs to the field, not to the
              value: "Country: Angola" sat above two inputs reads as a heading. */}
          {field ? (
            <span className={value ? "text-ds-ink" : "text-ds-muted/70"}>{selected?.label}</span>
          ) : (
            <>
              <span id={`${id}-label`} className="text-ds-muted">
                {label}:{" "}
              </span>
              <span className="text-ds-ink">{selected?.label}</span>
            </>
          )}
        </span>
        <motion.span
          animate={{ rotate: open ? (field ? 180 : 90) : 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="inline-flex shrink-0 text-ds-chevron"
        >
          {field ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label={label}
            initial={{ opacity: 0, y: placement === "top" ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: placement === "top" ? 4 : -4 }}
            transition={{ duration: 0.16, ease: EASE }}
            className={`absolute z-50 max-h-[280px] w-full overflow-y-auto rounded-lg bg-white p-1 outline-1 outline-black/10 ${
              placement === "top" ? "bottom-full mb-1" : "mt-1"
            }`}
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
                    className={`flex h-8 w-full items-center justify-between gap-2 rounded-md px-3 text-left text-[14px] leading-none transition-colors ${
                      i === cursor ? "bg-ds-panel" : ""
                    } ${isSelected ? "font-medium text-ds-ink" : "text-ds-ink"}`}
                  >
                    {o.label}
                    {isSelected && <span className="text-ds-link">✓</span>}
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
