import type { SVGProps } from "react";

type Icon = SVGProps<SVGSVGElement>;

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export const Anchor = (p: Icon) => (
  <svg viewBox="0 0 24 24" strokeWidth={1.9} {...stroke} {...p}>
    <circle cx="12" cy="5.1" r="2.1" />
    <path d="M12 7.2v13.3" />
    <path d="M7.9 10.6h8.2" />
    <path d="M4.2 14.9A8.2 8.2 0 0 0 12 20.6a8.2 8.2 0 0 0 7.8-5.7" />
  </svg>
);

export const Wallet = (p: Icon) => (
  <svg viewBox="0 0 24 24" strokeWidth={1.7} {...stroke} {...p}>
    <rect x="2.8" y="5.6" width="18.4" height="12.8" rx="3.2" />
    <path d="M16.4 12h2.6" />
  </svg>
);

export const Globe = (p: Icon) => (
  <svg viewBox="0 0 24 24" strokeWidth={1.5} {...stroke} {...p}>
    <circle cx="12" cy="12" r="8.4" />
    <path d="M3.6 12h16.8" />
    <path d="M12 3.6c2.1 2.3 3.2 5.2 3.2 8.4s-1.1 6.1-3.2 8.4c-2.1-2.3-3.2-5.2-3.2-8.4S9.9 5.9 12 3.6Z" />
  </svg>
);

export const ArrowRight = (p: Icon) => (
  <svg viewBox="0 0 24 24" strokeWidth={1.9} {...stroke} {...p}>
    <path d="M4.8 12h14" />
    <path d="m13 6.4 5.6 5.6-5.6 5.6" />
  </svg>
);

export const Lock = (p: Icon) => (
  <svg viewBox="0 0 24 24" strokeWidth={1.7} {...stroke} {...p}>
    <rect x="4.6" y="10.4" width="14.8" height="9.8" rx="3" />
    <path d="M8.4 10.4V7.8a3.6 3.6 0 0 1 7.2 0v2.6" />
  </svg>
);

export const Grid = (p: Icon) => (
  <svg viewBox="0 0 24 24" strokeWidth={1.8} {...stroke} {...p}>
    <rect x="3.6" y="3.6" width="7" height="7" rx="2.2" />
    <rect x="13.4" y="3.6" width="7" height="7" rx="2.2" />
    <rect x="3.6" y="13.4" width="7" height="7" rx="2.2" />
    <rect x="13.4" y="13.4" width="7" height="7" rx="2.2" />
  </svg>
);
