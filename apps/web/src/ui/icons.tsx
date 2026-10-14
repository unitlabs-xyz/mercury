import type { SVGProps } from "react";

/** Icon geometry is copied verbatim from the design handoff. */
type Icon = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export const Wallet = (p: Icon) => (
  <svg {...base} {...p}>
    <rect x="3" y="6" width="18" height="13" rx="2.5" />
    <path d="M16 12.5h2" />
  </svg>
);

export const Globe = (p: Icon) => (
  <svg {...base} strokeWidth={1.8} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
  </svg>
);

/** The search glass, drawn to the screener design: an 11px mark at 0.833 stroke. */
export const Glass = () => (
  <svg viewBox="742.5 30.5 11 11" width={11} height={11} fill="none" aria-hidden className="shrink-0">
    <g stroke="currentColor" strokeWidth={0.833} strokeLinecap="round" strokeLinejoin="round">
      <path d="M750.778 38.7778L753 41.0001" />
      <path d="M751.889 35.4444C751.889 32.9898 749.899 31 747.444 31C744.99 31 743 32.9898 743 35.4444C743 37.899 744.99 39.8889 747.444 39.8889C749.899 39.8889 751.889 37.899 751.889 35.4444Z" />
    </g>
  </svg>
);

/** Two arrows, up and down: flip between two ways of reading the same figure. */
export const Flip = (p: Icon) => (
  <svg {...base} {...p}>
    <path d="M8 4v16" />
    <path d="M4 8l4-4 4 4" />
    <path d="M16 20V4" />
    <path d="M20 16l-4 4-4-4" />
  </svg>
);

export const ArrowRight = (p: Icon) => (
  <svg {...base} {...p}>
    <path d="M5 12h14" />
    <path d="M13 6l6 6-6 6" />
  </svg>
);

export const ArrowUp = (p: Icon) => (
  <svg {...base} strokeWidth={2.6} {...p}>
    <path d="M12 19V5" />
    <path d="M6 11l6-6 6 6" />
  </svg>
);

export const Lock = (p: Icon) => (
  <svg {...base} strokeWidth={1.8} {...p}>
    <rect x="4" y="10" width="16" height="10" rx="2.5" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);

export const Trend = (p: Icon) => (
  <svg {...base} strokeWidth={1.9} {...p}>
    <path d="M3 17l6-6 4 4 7-7" />
    <path d="M14 8h6v6" />
  </svg>
);

export const Mail = (p: Icon) => (
  <svg {...base} strokeWidth={1.8} {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M3.5 7l8.5 6 8.5-6" />
  </svg>
);

export const Check = (p: Icon) => (
  <svg {...base} strokeWidth={2.4} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const Copy = (p: Icon) => (
  <svg {...base} {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h8" />
  </svg>
);

export const Alert = (p: Icon) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5" />
    <path d="M12 16h.01" />
  </svg>
);

export const Close = (p: Icon) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const PieChart = (p: Icon) => (
  <svg {...base} strokeWidth={1.8} {...p}>
    <path d="M21.2 15.9A10 10 0 1 1 8.1 2.8" />
    <path d="M22 12A10 10 0 0 0 12 2v10z" />
  </svg>
);

export const Card = (p: Icon) => (
  <svg {...base} strokeWidth={1.8} {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M16 12h3" />
  </svg>
);

export const List = (p: Icon) => (
  <svg {...base} strokeWidth={1.8} {...p}>
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h10" />
  </svg>
);

export const Bell = (p: Icon) => (
  <svg {...base} strokeWidth={1.8} {...p}>
    <path d="M18 8.6a6 6 0 1 0-12 0c0 5.4-2 6.9-2 6.9h16s-2-1.5-2-6.9Z" />
    <path d="M13.7 19.4a2 2 0 0 1-3.4 0" />
  </svg>
);

export const Cog = (p: Icon) => (
  <svg {...base} strokeWidth={1.8} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.5 15H3a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 4.3 8.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.9 4.3V4a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.2 1.2z" />
  </svg>
);

export const Help = (p: Icon) => (
  <svg {...base} strokeWidth={1.8} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
);

/* Not in the handoff: the set had no way out of the account. Door on the
   left, arrow leaving it — the shape every app uses for this, so it needs
   no learning. */
export const SignOut = (p: Icon) => (
  <svg {...base} strokeWidth={1.8} {...p}>
    <path d="M9.5 20H5.5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4h4" />
    <path d="M16 8l4 4-4 4" />
    <path d="M20 12H10" />
  </svg>
);

export const ArrowDown = (p: Icon) => (
  <svg {...base} strokeWidth={2.6} {...p}>
    <path d="M12 5v14" />
    <path d="M6 13l6 6 6-6" />
  </svg>
);

export const ChevronRight = (p: Icon) => (
  <svg {...base} {...p}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const Sort = (p: Icon) => (
  <svg {...base} strokeWidth={1.8} {...p}>
    <path d="M7 4v16" />
    <path d="M4 17l3 3 3-3" />
    <path d="M17 20V4" />
    <path d="M14 7l3-3 3 3" />
  </svg>
);

export const Blocks = (p: Icon) => (
  <svg {...base} strokeWidth={1.9} {...p}>
    <rect x="3" y="3" width="8" height="8" rx="2" />
    <path d="M11 7h4a2 2 0 0 1 2 2v4" />
    <rect x="13" y="13" width="8" height="8" rx="2" />
  </svg>
);

export const Sliders = (p: Icon) => (
  <svg {...base} strokeWidth={1.9} {...p}>
    <path d="M4 7h4M14 7h6" />
    <circle cx="11" cy="7" r="2.6" />
    <path d="M4 17h6M16 17h4" />
    <circle cx="13" cy="17" r="2.6" />
  </svg>
);

export const Key = (p: Icon) => (
  <svg {...base} strokeWidth={1.9} {...p}>
    <circle cx="7.5" cy="14.5" r="3.5" />
    <path d="M10 12L20 4" />
    <path d="M17.5 6.5l2 2" />
  </svg>
);

export const Search = (p: Icon) => (
  <svg {...base} strokeWidth={1.8} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M16.5 16.5L21 21" />
  </svg>
);

export const Download = (p: Icon) => (
  <svg {...base} strokeWidth={1.8} {...p}>
    <path d="M12 4v11" />
    <path d="M8 11l4 4 4-4" />
    <path d="M5 19h14" />
  </svg>
);

export const Grid = (p: Icon) => (
  <svg {...base} {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

export const Refresh = (p: Icon) => (
  <svg {...base} {...p}>
    <path d="M20 7v5a8 8 0 0 1-14.9 4" />
    <path d="M4 17v-5a8 8 0 0 1 14.9-4" />
    <path d="M20 3v4h-4" />
    <path d="M4 21v-4h4" />
  </svg>
);

export const Shield = (p: Icon) => (
  <svg {...base} strokeWidth={1.8} {...p}>
    <path d="M12 22s8-4.5 8-11V5l-8-3-8 3v6c0 6.5 8 11 8 11z" />
  </svg>
);

export const Layers = (p: Icon) => (
  <svg {...base} strokeWidth={1.8} {...p}>
    <path d="M12 3v18" />
    <path d="M4 8h16" />
    <path d="M4 16h16" />
  </svg>
);

export const Clock = (p: Icon) => (
  <svg {...base} strokeWidth={1.8} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const ChevronDown = (p: Icon) => (
  <svg {...base} strokeLinejoin={undefined} {...p}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const Plus = (p: Icon) => (
  <svg {...base} strokeLinejoin={undefined} {...p}>
    <path d="M12 6v12" />
    <path d="M6 12h12" />
  </svg>
);

export const Bookmark = ({ filled = false, ...p }: Icon & { filled?: boolean }) => (
  <svg {...base} fill={filled ? "currentColor" : "none"} {...p}>
    <path d="M6 4.5h12a1 1 0 0 1 1 1v14l-7-4-7 4v-14a1 1 0 0 1 1-1Z" />
  </svg>
);

export const Users = (p: Icon) => (
  <svg {...base} strokeWidth={1.8} {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6" />
    <path d="M17.5 14.4a5.5 5.5 0 0 1 3 5.1" />
  </svg>
);

export const Pulse = (p: Icon) => (
  <svg {...base} strokeWidth={1.9} {...p}>
    <path d="M3 12h3.5L9 5.5 13 18l2.5-6H21" />
  </svg>
);

export const Droplet = (p: Icon) => (
  <svg {...base} strokeWidth={1.8} {...p}>
    <path d="M12 3.5c3.2 3.4 5.5 6.2 5.5 9a5.5 5.5 0 0 1-11 0c0-2.8 2.3-5.6 5.5-9Z" />
  </svg>
);

export const Message = (p: Icon) => (
  <svg {...base} {...p}>
    <path d="M21 12a8 8 0 0 1-11.6 7.14L4 20l.9-4.6A8 8 0 1 1 21 12Z" />
  </svg>
);

export const ImageIcon = (p: Icon) => (
  <svg {...base} {...p}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="9" cy="9" r="1.5" />
    <path d="m21 15-4.5-4.5L6 21" />
  </svg>
);
