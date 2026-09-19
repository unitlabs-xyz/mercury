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

export const Grid = (p: Icon) => (
  <svg {...base} {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

export const Repeat = (p: Icon) => (
  <svg {...base} {...p}>
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
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

export const Search = (p: Icon) => (
  <svg {...base} strokeWidth={1.8} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M16.5 16.5L21 21" />
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
