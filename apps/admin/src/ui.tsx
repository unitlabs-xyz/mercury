import type { ReactNode } from "react";

/**
 * The containers and figures this dashboard is built from.
 *
 * The same shapes as the product's `portfolio/ui.tsx`, cut down to what an
 * internal page needs — no `Delta`, no `Meter`, no link-out chevron. Copied
 * rather than imported from `apps/web`, because an app that reaches into
 * another app's components is not a separate app.
 */

/** The one container: a titled sheet. */
export const Panel = ({
  title,
  meta,
  className = "",
  children,
}: {
  title: string;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) => (
  <section
    aria-label={title}
    className={`flex min-w-0 flex-col rounded-2xl border border-cardline bg-white ${className}`}
  >
    <header className="flex items-center justify-between gap-3 px-3 pt-4 pb-3 sm:px-5">
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em]">{title}</h2>
        {meta && <span className="truncate text-[12px] text-faint">{meta}</span>}
      </div>
    </header>
    {children}
  </section>
);

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

export const Skeleton = ({ className = "" }: { className?: string }) => (
  <span className={`block animate-pulse rounded bg-page ${className}`} />
);

/** A day as "5 Sep". The product's `shortDate`, carried over with it. */
export const shortDate = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
