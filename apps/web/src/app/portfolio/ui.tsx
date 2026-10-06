import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ChevronRight } from "../../ui/icons";
import { pct } from "@mercury/view";

/** The dashboard's one container: a titled sheet with an optional link out. */
export const Panel = ({
  title,
  meta,
  to,
  linkLabel = "View all",
  className = "",
  children,
}: {
  title: string;
  meta?: ReactNode;
  to?: string;
  linkLabel?: string;
  className?: string;
  children: ReactNode;
}) => (
  <section
    aria-label={title}
    className={`flex min-w-0 flex-col rounded-2xl border border-cardline bg-white ${className}`}
  >
    <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em]">{title}</h2>
        {meta && <span className="truncate text-[12px] text-faint">{meta}</span>}
      </div>
      {to && (
        <Link
          to={to}
          className="flex shrink-0 items-center gap-0.5 text-[12px] font-medium text-brand hover:text-brand-deep"
        >
          {linkLabel}
          <ChevronRight className="size-3.5" />
        </Link>
      )}
    </header>
    {children}
  </section>
);

/** An up/down chip. `value` is a percentage string or number, sign carried by the arrow. */
export const Delta = ({
  value,
  size = "sm",
}: {
  value: string | number | null | undefined;
  size?: "sm" | "md";
}) => {
  if (value === null || value === undefined || value === "") return <span className="text-faint">—</span>;
  const up = Number(value) >= 0;
  return (
    <span
      className={`inline-flex items-center gap-[3px] rounded-md font-semibold ${
        size === "md" ? "px-2 py-[3px] text-[13px]" : "px-1.5 py-0.5 text-[11px]"
      } ${up ? "bg-up-tint text-up-deep" : "bg-down-tint text-down-deep"}`}
    >
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {pct(value)}
    </span>
  );
};

/** A horizontal fill. Tones follow the palette; the track is always the hairline. */
export const Meter = ({
  value,
  tone = "brand",
  marks = [],
  className = "",
}: {
  /** 0–1. */
  value: number;
  tone?: "brand" | "up" | "down" | "warn" | "ink";
  /** Ticks drawn over the track, 0–1, e.g. the max and liquidation LTVs. */
  marks?: readonly { at: number; label: string }[];
  className?: string;
}) => {
  const fill = { brand: "bg-brand", up: "bg-up", down: "bg-down", warn: "bg-warn", ink: "bg-ink" }[tone];
  return (
    <div className={`relative h-2 rounded-full bg-hair ${className}`}>
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${fill}`}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
      {marks.map((m) => (
        <span
          key={m.label}
          title={m.label}
          className="absolute -top-1 h-4 w-0.5 rounded-full bg-ink/50"
          style={{ left: `${Math.min(1, m.at) * 100}%` }}
        />
      ))}
    </div>
  );
};

/** A label over a figure, the unit every panel is made of. */
export const Figure = ({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "up" | "down" | "warn" | undefined;
}) => (
  <div className="min-w-0">
    <p className="truncate text-[12px] text-muted">{label}</p>
    <p
      className={`mt-0.5 truncate text-[15px] font-semibold ${
        tone === "up"
          ? "text-up-deep"
          : tone === "down"
            ? "text-down-deep"
            : tone === "warn"
              ? "text-warn"
              : ""
      }`}
    >
      {value}
    </p>
    {sub && <p className="mt-0.5 truncate text-[11px] text-faint">{sub}</p>}
  </div>
);

/** A loading block, filled with the page grey (#f3f3f3) rather than the old warm chip. */
export const Skeleton = ({ className = "" }: { className?: string }) => (
  <span className={`block animate-pulse rounded bg-page ${className}`} />
);

/** "in 4 days", "tomorrow", "3 days ago" — how a due date is actually read. */
export const relDay = (isoDate: string) => {
  const today = Date.parse(new Date().toISOString().slice(0, 10));
  const d = Math.round((Date.parse(isoDate) - today) / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
};

export const shortDate = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
