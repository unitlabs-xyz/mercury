import type { ReactNode } from "react";

export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(" ");

export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("min-h-dvh pb-28", className)}>{children}</div>;
}

export function Bar({ title, left, right }: { title?: string; left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 bg-black/80 px-4 backdrop-blur-xl">
      {left}
      {title !== undefined && <h1 className="m-0 flex-1 truncate text-[17px] font-semibold">{title}</h1>}
      {right}
    </header>
  );
}

/** Phantom's pattern: content sits in filled rounded cards, not on dividers. */
export function Card({ children, className, tone = "surface", onClick }: {
  children: ReactNode; className?: string; onClick?: () => void;
  tone?: "surface" | "outline" | "up" | "down" | "warn";
}) {
  const tones = {
    surface: "bg-[var(--color-surface)]",
    outline: "border border-[var(--color-hairline)]",
    up: "bg-[var(--color-up-wash)] border border-[var(--color-up)]/30",
    down: "bg-[var(--color-down-wash)] border border-[var(--color-down)]/25",
    warn: "bg-[var(--color-warn-wash)] border border-[var(--color-warn)]/25",
  } as const;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick}
      className={cx("w-full rounded-[var(--radius-card)] p-4 text-left", tones[tone], onClick && "active:brightness-125", className)}>
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between px-4 pb-2.5 pt-1">
      <h2 className="m-0 text-[17px] font-semibold">{children}</h2>
      {right}
    </div>
  );
}

export function Pill({ children, active, onClick, tone = "neutral" }: {
  children: ReactNode; active?: boolean; onClick?: () => void; tone?: "neutral" | "up" | "down" | "warn" | "muted";
}) {
  const tones = {
    neutral: active ? "bg-white text-black" : "bg-[var(--color-surface)] text-[var(--color-muted)]",
    up: "bg-[var(--color-up)] text-black",
    down: "bg-[var(--color-down)]/15 text-[var(--color-down)]",
    warn: "bg-[var(--color-warn)]/15 text-[var(--color-warn)]",
    muted: "bg-[var(--color-surface-2)] text-[var(--color-muted)]",
  } as const;
  return (
    <button onClick={onClick}
      className={cx("rounded-[var(--radius-pill)] px-3.5 py-1.5 text-[13px] font-semibold transition-colors", tones[tone])}>
      {children}
    </button>
  );
}

export function Button({ children, onClick, variant = "primary", disabled, className }: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "ghost" | "quiet"; disabled?: boolean; className?: string;
}) {
  const variants = {
    primary: "bg-[var(--color-up)] text-black font-semibold active:brightness-90",
    ghost: "bg-[var(--color-surface)] text-white font-semibold active:bg-[var(--color-surface-2)]",
    quiet: "text-[var(--color-muted)] font-medium active:text-white",
  } as const;
  return (
    <button onClick={onClick} disabled={disabled}
      className={cx("w-full rounded-[var(--radius-pill)] px-5 py-4 text-[16px] transition-all disabled:opacity-30", variants[variant], className)}>
      {children}
    </button>
  );
}

const ICON_TINTS = ["#3b82f6", "#f59e0b", "#a78bfa", "#ec4899", "#14b8a6", "#f97316"];

export function Glyph({ text, tint }: { text: string; tint?: string | undefined }) {
  const hue = tint ?? ICON_TINTS[text.charCodeAt(0) % ICON_TINTS.length]!;
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-full text-[13px] font-bold"
      style={{ background: `${hue}22`, color: hue }}>
      {text.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** A holding row. Phantom sets these as separate filled cards with a circular icon. */
export function AssetRow({ icon, title, sub, value, foot, onClick, tone, badge }: {
  icon?: ReactNode; title: ReactNode; sub?: ReactNode; value?: ReactNode; foot?: ReactNode;
  onClick?: () => void; tone?: "up" | "down"; badge?: ReactNode | undefined;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick}
      className={cx("flex w-full items-center gap-3 rounded-[var(--radius-card)] bg-[var(--color-surface)] px-3.5 py-3 text-left",
        onClick && "active:bg-[var(--color-surface-2)]")}>
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate text-[15px] font-semibold">{title}{badge}</div>
        {sub !== undefined && <div className="truncate text-[13px] text-[var(--color-muted)]">{sub}</div>}
      </div>
      {(value !== undefined || foot !== undefined) && (
        <div className="shrink-0 text-right">
          {value !== undefined && <div className="num text-[15px] font-semibold">{value}</div>}
          {foot !== undefined && (
            <div className={cx("num text-[13px]",
              tone === "up" ? "text-[var(--color-up)]" : tone === "down" ? "text-[var(--color-down)]" : "text-[var(--color-muted)]")}>
              {foot}
            </div>
          )}
        </div>
      )}
    </Tag>
  );
}

export function Divider() {
  return <div className="h-px bg-[var(--color-hairline)]" />;
}

export function Sheet({ open, onClose, children, title }: {
  open: boolean; onClose: () => void; children: ReactNode; title?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <button aria-label="Close" onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm" style={{ animation: "wash .2s ease" }} />
      <div className="relative w-full max-w-[480px] rounded-t-[var(--radius-sheet)] bg-[#0d0d0f] pb-8"
        style={{ animation: "sheet-up .3s cubic-bezier(.2,.8,.2,1)" }}>
        <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-[var(--color-surface-2)]" />
        {title !== undefined && <h2 className="m-0 px-4 pb-1 pt-4 text-[20px] font-bold tracking-[-0.02em]">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Stat({ k, v, tone }: { k: string; v: ReactNode; tone?: "up" | "down" | "warn" | undefined }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-[14px] text-[var(--color-muted)]">{k}</span>
      <span className={cx("num text-[15px] font-semibold",
        tone === "up" ? "text-[var(--color-up)]" : tone === "down" ? "text-[var(--color-down)]"
        : tone === "warn" ? "text-[var(--color-warn)]" : "")}>{v}</span>
    </div>
  );
}

export function StatGroup({ children }: { children: ReactNode }) {
  return <div className="rounded-[var(--radius-card)] bg-[var(--color-surface)] px-4 py-0.5 [&>*+*]:border-t [&>*+*]:border-[var(--color-hairline)]">{children}</div>;
}
