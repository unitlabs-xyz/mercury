import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

const LENGTH = 6;

/** Idle takes input; checking is sealed while the code is read; done accepted it. */
export type CodeStatus = "idle" | "checking" | "done";

/** Six boxes that behave like one field: type to advance, backspace to retreat, paste to fill. */
export const CodeInput = ({
  value,
  onChange,
  status = "idle",
}: {
  value: string;
  onChange: (next: string) => void;
  status?: CodeStatus;
}) => {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const locked = status !== "idle";

  useEffect(() => {
    if (locked) return;
    boxes.current[Math.min(value.length, LENGTH - 1)]?.focus();
  }, [value.length, locked]);

  const setAt = (i: number, digit: string) => {
    const next = (value.slice(0, i) + digit + value.slice(i + 1)).slice(0, LENGTH);
    onChange(next.replace(/\D/g, ""));
  };

  /* iOS's "From Mail" suggestion and keyboard pastes arrive as a change, not a
     paste, carrying the whole code in one box. Take every digit, not the last. */
  const onInput = (i: number, raw: string) => {
    const old = value[i];
    const incoming =
      old && raw.length > 1
        ? raw.startsWith(old)
          ? raw.slice(1)
          : raw.endsWith(old)
            ? raw.slice(0, -1)
            : raw
        : raw;
    const digits = incoming.replace(/\D/g, "");
    if (digits.length <= 1) return setAt(i, digits);
    onChange((digits.length >= LENGTH ? digits : value.slice(0, i) + digits).slice(0, LENGTH));
  };

  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[i]) {
      e.preventDefault();
      onChange(value.slice(0, Math.max(0, i - 1)));
    }
    if (e.key === "ArrowLeft") boxes.current[i - 1]?.focus();
    if (e.key === "ArrowRight") boxes.current[i + 1]?.focus();
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    onChange(e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH));
  };

  return (
    <div className="grid grid-cols-6 gap-1.5 sm:gap-2.5">
      {Array.from({ length: LENGTH }, (_, i) => {
        const filled = Boolean(value[i]);
        const active = i === value.length;
        return (
          <input
            key={i}
            ref={(el) => {
              boxes.current[i] = el;
            }}
            value={value[i] ?? ""}
            onChange={(e) => onInput(i, e.target.value)}
            onKeyDown={onKeyDown(i)}
            onPaste={onPaste}
            /* Read-only rather than disabled: the field seals without throwing
               a keyboard user's focus back to the top of the page. */
            readOnly={locked}
            inputMode="numeric"
            /* On every box: the suggestion offers itself to whichever one has focus. */
            autoComplete="one-time-code"
            aria-label={`Digit ${i + 1} of ${LENGTH}`}
            className={`h-[54px] w-full min-w-0 rounded-lg border text-center text-[24px] font-medium text-ds-ink caret-ds-ink transition-colors duration-200 outline-none sm:h-[60px] ${
              status === "done"
                ? "border-transparent bg-ds-up-chip text-ds-up"
                : status === "checking"
                  ? "border-transparent bg-ds-panel text-ds-muted"
                  : active
                    ? "border-black/15 bg-white"
                    : filled
                      ? "border-black/10 bg-white"
                      : "border-transparent bg-ds-panel"
            }`}
          />
        );
      })}
    </div>
  );
};
