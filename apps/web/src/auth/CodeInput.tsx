import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

const LENGTH = 6;

/** Six boxes that behave like one field: type to advance, backspace to retreat, paste to fill. */
export const CodeInput = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) => {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    boxes.current[Math.min(value.length, LENGTH - 1)]?.focus();
  }, [value.length]);

  const setAt = (i: number, digit: string) => {
    const next = (value.slice(0, i) + digit + value.slice(i + 1)).slice(0, LENGTH);
    onChange(next.replace(/\D/g, ""));
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
    <div className="flex gap-2 sm:gap-3">
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
            onChange={(e) => setAt(i, e.target.value.slice(-1))}
            onKeyDown={onKeyDown(i)}
            onPaste={onPaste}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            aria-label={`Digit ${i + 1} of ${LENGTH}`}
            className={`h-[62px] w-[46px] rounded-xl border text-center font-mono text-[24px] font-medium caret-brand transition-colors duration-150 outline-none sm:h-[70px] sm:w-[54px] ${
              filled || active
                ? "border-[1.5px] border-brand bg-white"
                : "border-cardline bg-shell"
            }`}
          />
        );
      })}
    </div>
  );
};
