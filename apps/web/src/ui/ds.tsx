import { AnimatePresence, motion } from "motion/react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Close, Glass } from "./icons";
import { Link } from "react-router-dom";

/**
 * Design-system pieces shared by the portfolio's right rail and anything built
 * to the same designs. Measurements are from the design SVGs; the written
 * guide is docs/design/design-system.md.
 */

/** The link chevron: a 3 × 6 stroke, as drawn in card.svg and borrowing.svg. */
export const Chevron = () => (
  <svg viewBox="0 0 5 8" width={5} height={8} fill="none" aria-hidden className="shrink-0">
    <path
      d="M1 1C1 1 4 3.21 4 4C4 4.79 1 7 1 7"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** A white 12px-radius sheet with 20px above and below and 24px sides: every rail card. */
export const RailCard = ({ label, children }: { label: string; children: ReactNode }) => (
  <section aria-label={label} className="rounded-xl bg-white px-4 py-5 sm:px-6">
    {children}
  </section>
);

/**
 * The rail card's title row: the title at 14px medium, then a meta 10px after
 * it (grey text, or a StatusChip), and a teal link with its chevron on the right.
 */
export const RailHead = ({
  title,
  meta,
  to,
  linkLabel,
}: {
  title: string;
  meta?: ReactNode;
  to?: string;
  linkLabel?: string;
}) => (
  <header className="flex items-center justify-between gap-3 text-[14px] leading-none">
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="font-medium text-ds-ink">{title}</span>
      {typeof meta === "string" ? <span className="truncate font-normal text-ds-muted">{meta}</span> : meta}
    </div>
    {to && linkLabel && (
      <Link
        to={to}
        className="flex shrink-0 items-center gap-[5px] font-medium text-ds-link hover:opacity-80"
      >
        {linkLabel}
        <Chevron />
      </Link>
    )}
  </header>
);

/**
 * The app's search box, as the Invest screener draws it: a 32px panel-grey
 * field with the glass, and a clear once there is something to clear. Every
 * list that searches uses this, so the control is the same wherever it appears.
 */
export const SearchField = ({
  value,
  onChange,
  placeholder,
  label,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) => (
  <label
    className={`flex h-8 w-full items-center gap-2 rounded-lg bg-ds-panel px-3 text-ds-muted sm:w-[237px] ${className}`}
  >
    <Glass />
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={label}
      /* A placeholder longer than the field is trimmed, never cut mid-letter. */
      className="min-w-0 flex-1 overflow-hidden bg-transparent text-[14px] text-ellipsis text-ds-ink outline-none placeholder:text-ds-muted"
    />
    {value !== "" && (
      <button
        type="button"
        onClick={() => onChange("")}
        aria-label="Clear search"
        className="shrink-0 text-ds-muted transition-colors hover:text-ds-ink"
      >
        <Close className="size-3.5" />
      </button>
    )}
  </label>
);

/**
 * The screener's filter row: 26px pills, the chosen one raised on the same
 * white-to-grey key the range switch uses. Keeps one line and scrolls sideways
 * rather than wrapping, so a long set never goes ragged.
 */
export const FilterPills = <T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
}: {
  options: readonly { key: T; label: ReactNode }[];
  value: T;
  onChange: (key: T) => void;
  label: string;
  className?: string;
}) => (
  <div
    role="group"
    aria-label={label}
    className={`flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
  >
    {options.map((option) => (
      <button
        key={option.key}
        type="button"
        onClick={() => onChange(option.key)}
        aria-pressed={value === option.key}
        className={`h-[26px] shrink-0 rounded-full border px-[17px] text-[14px] leading-none text-ds-ink transition-colors ${
          value === option.key
            ? "border-black/10 bg-linear-to-b from-white to-[#eeeeee]"
            : "border-black/5 hover:border-black/10"
        }`}
      >
        {option.label}
      </button>
    ))}
  </div>
);

export type Tone = "up" | "warn" | "down" | "pending" | "neutral" | "owned";

const CHIP: Record<Tone, string> = {
  up: "bg-ds-up-chip text-ds-chip-up",
  warn: "bg-ds-warn-chip text-ds-chip-warn",
  down: "bg-ds-down-chip text-ds-chip-down",
  pending: "bg-ds-pending-chip text-ds-chip-pending",
  neutral: "bg-ds-tag text-ds-muted",
  owned: "bg-ds-act-buy-bg text-ds-act-buy",
};

/**
 * A 17px status chip, 4px radius, 10px text: "Healthy" in borrowing.svg.
 * `size="md"` is 22px with 12px text, for beside a page title where 17px is lost.
 *
 * The ink is full strength. It was drawn at 80%, but opacity on text multiplies
 * against whatever is behind it, and over these tints that left every tone
 * under the 4.5:1 it needs to be read — the green worst at 2.9:1.
 */
export const StatusChip = ({
  tone,
  size = "sm",
  children,
}: {
  tone: Tone;
  size?: "sm" | "md";
  children: ReactNode;
}) => (
  <span
    className={`inline-flex items-center leading-none ${
      size === "md" ? "h-[22px] rounded-md px-2 text-[12px]" : "h-[17px] rounded px-1.5 text-[10px]"
    } ${CHIP[tone]}`}
  >
    {children}
  </span>
);

/** The value 28px medium, and one 14px grey line under it: the rail card's figure. */
export const RailFigure = ({
  value,
  sub,
  tone,
}: {
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone | undefined;
}) => (
  <div className="min-w-0">
    <p
      className={`text-[28px] leading-none font-medium ${
        tone === "down" ? "text-ds-down" : tone === "warn" ? "text-warn" : "text-ds-ink"
      }`}
    >
      {value}
    </p>
    {sub && <p className="mt-2 text-[14px] leading-tight text-ds-muted">{sub}</p>}
  </div>
);

/** The zones of a segmented meter, in order along it. Each ends at `to`, 0–1 of the bar. */
/** `color` is the zone at 25% where unused; `used` is the solid colour of bars the value covers. */
export type Zone = { to: number; color: string; used: string };

const PITCH = 6; // 4px bar, 2px gap
const BAR = 4;

/**
 * The segmented meter from borrowing.svg: 4 × 16 bars, 2px apart, a pixel more
 * between zones. Bars up to `value` are solid in their zone's colour; the rest
 * show the zone at 25%. The count follows the width, so it fills any card.
 */
export const SegmentMeter = ({
  value,
  zones,
  label,
  preview,
  tip,
}: {
  value: number;
  zones: readonly Zone[];
  label: string;
  /** Where a change being typed would take it: bars between `value` and this show at three-quarter strength. */
  preview?: number | undefined;
  /** What a point along the meter means, for a tooltip that follows the pointer. 0–1 of the bar. */
  tip?: ((at: number) => ReactNode) | undefined;
}) => {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(368);
  const [hover, setHover] = useState<number | null>(null);
  // Measured before the first paint, so the bar count never jumps once shown; and
  // colours only animate after that, so opening a page does not fade the bars in.
  const [settled, setSettled] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const fit = () => setWidth(el.getBoundingClientRect().width || 368);
    fit();
    const id = requestAnimationFrame(() => setSettled(true));
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(id);
    };
  }, []);

  // The extra pixel at each zone change comes out of the width first.
  const count = Math.max(10, Math.floor((width - (zones.length - 1) + (PITCH - BAR)) / PITCH));
  const zoneOf = (f: number) => zones.findIndex((z) => f <= z.to + 1e-9);
  const lo = Math.min(value, preview ?? value);
  const hi = Math.max(value, preview ?? value);
  const bars = Array.from({ length: count }, (_, i) => {
    const mid = (i + 0.5) / count;
    const z = Math.max(0, zoneOf(mid));
    const zone = zones[z] ?? zones[zones.length - 1]!;
    // Solid up to where both now and the preview agree; half strength over the change.
    const on = mid <= lo;
    const change = !on && mid <= hi;
    return { z, on, change, color: on || change ? zone.used : zone.color };
  });

  return (
    <div
      className="relative"
      onPointerMove={(e) => {
        if (!tip) return;
        const r = e.currentTarget.getBoundingClientRect();
        setHover(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
      }}
      onPointerLeave={() => setHover(null)}
    >
      <div
        ref={box}
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(value * 100)}
        className={`flex h-4 ${tip ? "cursor-default" : ""}`}
      >
        {bars.map((b, i) => (
          <span
            key={i}
            className={`h-4 shrink-0 rounded-[2px] ${settled ? "transition-[background-color,opacity] duration-200" : ""}`}
            style={{
              width: BAR,
              // 2px between bars, one more where a zone changes.
              marginLeft: i === 0 ? 0 : b.z !== bars[i - 1]!.z ? 3 : 2,
              background: b.color,
              opacity: b.on ? 1 : b.change ? 0.75 : 0.25,
            }}
          />
        ))}
      </div>
      <AnimatePresence>
        {tip && hover !== null && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute bottom-full z-50 mb-2 w-max max-w-[260px] -translate-x-1/2 rounded-lg bg-ds-ink px-3 py-2 text-[12px] leading-[1.45] text-white"
            style={{ left: `${Math.min(88, Math.max(12, hover * 100))}%` }}
          >
            {tip(hover)}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
};

/**
 * The range switch from performance.svg and investmarket.svg: a tray 32px tall,
 * 8px radius, 40px per option, with the chosen one raised on a white-to-grey key
 * with a hairline edge.
 */
export const RangeSwitch = <T extends string>({
  options,
  value,
  onChange,
  label = "Range",
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) => (
  <div
    role="group"
    aria-label={label}
    className="grid h-8 shrink-0 rounded-lg bg-ds-tray p-px"
    style={{ width: options.length * 40, gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
  >
    {options.map((r) => (
      <button
        key={r}
        type="button"
        onClick={() => onChange(r)}
        aria-pressed={value === r}
        className={`rounded-lg text-[14px] leading-none text-ds-ink transition-colors ${
          value === r
            ? "border border-black/10 bg-linear-to-b from-white to-[#eeeeee]"
            : "border border-transparent hover:bg-white/50"
        }`}
      >
        {r}
      </button>
    ))}
  </div>
);

/**
 * The live chip from investmarket.svg, at the medium chip size so it reads: 22px,
 * 12px text, a 6px dot before the word. The dot pings while a refresh is in flight.
 */
export const LiveChip = ({ label, pulsing }: { label: string; pulsing?: boolean }) => (
  // A status, not a value: it says "Updating" on every fetch, so it does not flash.
  <span
    data-no-flash
    className="inline-flex h-[22px] items-center gap-1.5 rounded-md bg-ds-up-chip pr-2 pl-[7px] text-[12px] leading-none text-ds-chip-up"
  >
    <span className="relative flex size-1.5 shrink-0">
      {pulsing && (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-ds-live opacity-70" />
      )}
      <span className="relative inline-flex size-1.5 rounded-full bg-ds-live" />
    </span>
    {label}
  </span>
);

/**
 * The move chip from holdings.svg and top3.svg: 56 × 20, 6px radius, a 7 × 8
 * arrow and the move at 12px medium, green up, red down. `soft` sets the figure
 * at 80%, as the market cards draw it.
 */
export const MoveChip = ({
  value,
  soft = false,
  light = false,
}: {
  value: number | null;
  soft?: boolean;
  /** The lighter red of waitlist.svg's list rows, #DC5043, for a fall. */
  light?: boolean;
}) => {
  if (value === null || Number.isNaN(value)) return <span className="text-[14px] text-ds-muted">—</span>;
  // A move that rounds to 0.00% reads as flat, not as a red fall.
  const up = value > -0.005;
  const ink = up ? "var(--color-ds-up)" : light ? "var(--color-ds-fall-light)" : "var(--color-ds-fall)";
  return (
    <span
      className={`inline-flex h-5 min-w-14 items-center justify-center gap-1 rounded-md px-1.5 text-[12px] leading-none font-medium ${
        up
          ? "bg-ds-up-chip text-ds-up"
          : light
            ? "bg-ds-fall-chip text-ds-fall-light"
            : "bg-ds-fall-chip text-ds-fall"
      }`}
    >
      <svg viewBox="0 0 8 10" width={8} height={10} fill="none" aria-hidden className="shrink-0">
        <g stroke={ink} strokeLinecap="round" strokeLinejoin="round">
          {up ? (
            <>
              <path d="M4.429 1.286V9" />
              <path d="M7.857 4.429C7.857 4.429 5.332 1 4.429 1C3.525 1 1 4.429 1 4.429" />
            </>
          ) : (
            <>
              <path d="M4.429 8.714L4.429 1" />
              <path d="M1 5.571C1 5.571 3.525 9 4.428 9C5.332 9 7.857 5.571 7.857 5.571" />
            </>
          )}
        </g>
      </svg>
      <span className={soft ? "opacity-80" : undefined}>{Math.abs(value).toFixed(2)}%</span>
    </span>
  );
};

/** The hover sheet's glide between rows, and its fade in and out. */
const GLIDE = { duration: 0.26, ease: [0.22, 1, 0.36, 1] } as const;
const FADE = { duration: 0.15, ease: "easeOut" } as const;

/**
 * A list on the grey panel whose hover is one white sheet that glides to the
 * row under the pointer (or focus), as holdings.svg and allstocks.svg draw it,
 * rather than each row lighting up on its own. It appears in place on first
 * hover, then slides; it fades when the pointer leaves. Mark each row with
 * `data-row`; the sheet takes the row's height. Rows sit 4px apart unless `gap` says otherwise.
 */
export const GlideRows = ({
  children,
  as: Tag = "div",
  gap = "gap-1",
  sheet = "bg-white",
}: {
  children: ReactNode;
  as?: "div" | "ul";
  /** Space between rows; the default is the tables' 4px. */
  gap?: string;
  /** The sheet's fill: white on the grey panel, panel grey on a white card. */
  sheet?: string;
}) => {
  const [at, setAt] = useState({ top: 0, height: 60, shown: false, glide: false });
  const enter = (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-row]");
    if (!row || !e.currentTarget.contains(row)) return;
    const top = row.offsetTop;
    const height = row.offsetHeight;
    setAt((p) => (p.shown && p.top === top ? p : { top, height, shown: true, glide: p.shown }));
  };
  return (
    <Tag
      className={`relative flex flex-col ${gap}`}
      onMouseOver={enter}
      onFocus={enter}
      onMouseLeave={() => setAt((p) => ({ ...p, shown: false, glide: false }))}
      onBlur={(e: FocusEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAt((p) => ({ ...p, shown: false }));
      }}
    >
      <motion.div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 top-0 rounded-md ${sheet}`}
        initial={false}
        animate={{ y: at.top, height: at.height, opacity: at.shown ? 1 : 0 }}
        // Motion carries the sheet from wherever it is, so a quick sweep across
        // the rows turns round mid-glide instead of finishing each hop first.
        transition={
          at.glide
            ? { y: GLIDE, height: GLIDE, opacity: FADE }
            : { y: { duration: 0 }, height: { duration: 0 }, opacity: FADE }
        }
      />
      {children}
    </Tag>
  );
};

/** Column labels and gliding rows shared by the Invest and Baskets lists. */
export const GlideTable = ({
  columns,
  headings,
  children,
  footer,
  minWidth = "min-w-[900px]",
  sheet = "bg-white",
}: {
  columns: string;
  headings: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  minWidth?: string;
  /** Passed through to the rows: panel grey when the table itself sits on white. */
  sheet?: string;
}) => (
  <div className={minWidth}>
    <div className={`grid ${columns} px-4 pt-[10px] pb-[5px] text-[12px] leading-none text-ds-muted`}>
      {headings}
    </div>
    <GlideRows as="ul" sheet={sheet}>
      {children}
    </GlideRows>
    {footer}
  </div>
);

/** A 6 × 12 chevron at 1.8, pagination's Prev and Next in allstocks.svg. */
const PageChevron = ({ back }: { back?: boolean }) => (
  <svg viewBox="0 0 8 14" width={8} height={14} fill="none" aria-hidden className="shrink-0">
    <path
      d={back ? "M7 13L1 7L7 1" : "M1 13L7 7L1 1"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** 1 … 4 5 6 … 10: the first and last pages, the current one and its neighbours. */
const pageList = (page: number, count: number): (number | "gap")[] => {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  const keep = new Set([0, 1, count - 2, count - 1, page - 1, page, page + 1]);
  const out: (number | "gap")[] = [];
  for (let i = 0; i < count; i++) {
    if (keep.has(i)) out.push(i);
    else if (out[out.length - 1] !== "gap") out.push("gap");
  }
  return out;
};

/**
 * The pager from allstocks.svg: Prev and Next in #1C1C1C (half strength when
 * there is nowhere to go), pages 30px square on a 48px pitch, the current one
 * raised on the white-to-grey key with a hairline edge. Pages are 0-based.
 */
export const Pagination = ({
  page,
  count,
  onPage,
}: {
  page: number;
  count: number;
  onPage: (p: number) => void;
}) => (
  <nav
    aria-label="Pages"
    className="flex items-center justify-center gap-[18px] text-[14px] leading-none text-[#1c1c1c]"
  >
    <button
      type="button"
      onClick={() => onPage(page - 1)}
      disabled={page === 0}
      className="flex h-[30px] items-center gap-[9px] px-1 hover:opacity-70 disabled:opacity-50 disabled:hover:opacity-50"
    >
      <PageChevron back />
      Prev
    </button>
    {pageList(page, count).map((p, i) =>
      p === "gap" ? (
        <span key={`gap${i}`} aria-hidden className="grid size-[30px] place-items-center">
          …
        </span>
      ) : (
        <button
          key={p}
          type="button"
          onClick={() => onPage(p)}
          aria-current={p === page ? "page" : undefined}
          className={`grid size-[30px] place-items-center rounded-[10px] border ${
            p === page
              ? "border-black/10 bg-linear-to-b from-white to-[#eeeeee]"
              : "border-transparent hover:bg-white/60"
          }`}
        >
          {p + 1}
        </button>
      ),
    )}
    <button
      type="button"
      onClick={() => onPage(page + 1)}
      disabled={page >= count - 1}
      className="flex h-[30px] items-center gap-[9px] px-1 hover:opacity-70 disabled:opacity-50 disabled:hover:opacity-50"
    >
      Next
      <PageChevron />
    </button>
  </nav>
);

/** The bookmark from allstocks.svg: an outline in the button's colour, or filled grey-to-black once saved. */
export const BookmarkMark = ({ filled }: { filled: boolean }) => {
  const id = useId();
  return (
    <svg viewBox="957 156 12 14" width={12} height={14} fill="none" aria-hidden className="shrink-0">
      {filled && (
        <defs>
          <linearGradient id={id} x1="958.5" y1="157" x2="968" y2="169.5" gradientUnits="userSpaceOnUse">
            <stop stopColor="#838383" />
            <stop offset="1" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M958 166.589V161.625C958 159.444 958 158.354 958.732 157.677C959.464 157 960.643 157 963 157C965.357 157 966.536 157 967.268 157.677C968 158.354 968 159.444 968 161.625V166.589C968 167.972 968 168.664 967.517 168.911C966.582 169.391 964.827 167.791 963.994 167.309C963.51 167.03 963.269 166.89 963 166.89C962.731 166.89 962.49 167.03 962.006 167.309C961.173 167.791 959.418 169.391 958.483 168.911C958 168.664 958 167.972 958 166.589Z"
        fill={filled ? `url(#${id})` : "none"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

/**
 * A circled "i" that explains a figure without putting text outside the cards:
 * hover it, or tab to it, and the note shows in a dark tooltip above it (dark
 * so it reads on the white cards; no shadow, as everywhere). `align` keeps a
 * tooltip near a card's edge inside it.
 */
export const InfoTip = ({
  label,
  children,
  align = "center",
}: {
  /** What the icon is about, for screen readers: "About these prices". */
  label: string;
  children: ReactNode;
  align?: "center" | "start" | "end";
}) => {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);

  /*
   * Drawn in a portal at a fixed position, so no card or modal with its own
   * overflow can clip it. Placed above the icon by `align`, then pushed back
   * inside the viewport with an 8px margin, and below the icon when there is
   * no room above.
   */
  useLayoutEffect(() => {
    if (!open || !anchor.current || !tip.current) return;
    const a = anchor.current.getBoundingClientRect();
    const t = tip.current.getBoundingClientRect();
    const margin = 8;
    const want =
      align === "start" ? a.left : align === "end" ? a.right - t.width : a.left + a.width / 2 - t.width / 2;
    const left = Math.min(Math.max(want, margin), window.innerWidth - t.width - margin);
    const above = a.top - t.height - margin;
    setAt({ left, top: above >= margin ? above : a.bottom + margin });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const hide = () => setOpen(false);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [open]);

  return (
    <span
      ref={anchor}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        setOpen(false);
        setAt(null);
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setAt(null);
        }}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="grid size-4 place-items-center rounded-full text-ds-muted"
      >
        {/* Drawn like the design's other line icons (the search glass): a thin
            0.9 ring, a short round-capped stem and a small dot, in #656565. */}
        <svg viewBox="0 0 12 12" width={13} height={13} fill="none" aria-hidden>
          <circle cx="6" cy="6" r="5.3" stroke="currentColor" strokeWidth={0.9} />
          <path d="M6 5.3V8.7" stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" />
          <circle cx="6" cy="3.55" r="0.62" fill="currentColor" />
        </svg>
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.span
              ref={tip}
              id={id}
              role="tooltip"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: at ? 1 : 0, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              style={{ left: at?.left ?? 0, top: at?.top ?? 0 }}
              className="pointer-events-none fixed z-[1000] w-max max-w-[min(300px,calc(100vw-16px))] rounded-lg bg-ds-ink px-3 py-2 text-left text-[12px] leading-[1.45] font-normal whitespace-normal text-white"
            >
              {children}
            </motion.span>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </span>
  );
};
