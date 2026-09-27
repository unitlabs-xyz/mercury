import { useEffect, useRef, useState } from "react";
import { Bell, Cog } from "../ui/icons";

/**
 * Global chrome, the same on every app screen. Nothing sits behind either
 * panel yet and both say so: a control that does nothing at all when pressed
 * reads as broken rather than as unfinished.
 */
type Panel = "alerts" | "settings";

const PANELS: Record<Panel, { label: string; title: string; body: string }> = {
  alerts: {
    label: "Notifications",
    title: "Nothing yet",
    body: "Filled orders, orders still queued for the open, and dividends will arrive here.",
  },
  settings: {
    label: "Settings",
    title: "Not built yet",
    body: "Your profile, security, and exporting the wallet to somewhere else will live here.",
  },
};

export const HeaderChrome = () => {
  const [open, setOpen] = useState<Panel | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const panel = open ? PANELS[open] : null;

  return (
    <div ref={box} className="relative flex items-center gap-2">
      {(Object.keys(PANELS) as Panel[]).map((key) => {
        const Icon = key === "alerts" ? Bell : Cog;
        const active = open === key;
        return (
          <button
            key={key}
            type="button"
            aria-label={PANELS[key].label}
            aria-haspopup="dialog"
            aria-expanded={active}
            onClick={() => setOpen(active ? null : key)}
            className={`grid size-9 place-items-center rounded-lg bg-white transition-colors max-sm:size-10 ${
              active ? "text-ds-ink" : "text-ds-muted hover:text-ds-ink"
            }`}
          >
            <Icon className="size-4" />
          </button>
        );
      })}

      {panel && (
        <div
          role="dialog"
          aria-label={panel.label}
          className="absolute top-[calc(100%+10px)] right-0 z-40 w-[300px] rounded-xl bg-white px-5 py-4 outline-1 outline-black/10"
        >
          <p className="text-[14px] leading-none font-medium text-ds-ink">{panel.title}</p>
          <p className="mt-3 text-[14px] leading-[1.45] text-ds-muted text-pretty">{panel.body}</p>
        </div>
      )}
    </div>
  );
};
