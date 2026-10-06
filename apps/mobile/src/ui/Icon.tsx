import type { ColorValue } from "react-native";
import Svg, { Circle, Path, Rect, type SvgProps } from "react-native-svg";
import { color as palette } from "../theme";

/**
 * The web's icon set, drawn by a phone.
 *
 * The geometry is `apps/web/src/ui/icons.tsx` verbatim — same 24-unit box, same
 * path data, same per-icon stroke weights. Only the elements change, because
 * `react-native-svg` is the renderer rather than the DOM. Copying the numbers
 * rather than inventing a second set is the whole point: an icon that is nearly
 * the web's is the thing somebody notices and cannot name.
 */
export type IconName = keyof typeof PATHS;

const STROKE = 2;

/**
 * Each entry is its stroke weight and its parts. A part is a path string, or a
 * circle/rect given as the attributes the web's element carries.
 */
type Part =
  | string
  | { readonly circle: readonly [number, number, number] }
  | { readonly rect: readonly [number, number, number, number, number] };

const PATHS = {
  wallet: { w: STROKE, parts: [{ rect: [3, 6, 18, 13, 2.5] }, "M16 12.5h2"] },
  globe: {
    w: 1.8,
    parts: [{ circle: [12, 12, 9] }, "M3 12h18", "M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"],
  },
  arrowRight: { w: STROKE, parts: ["M5 12h14", "M13 6l6 6-6 6"] },
  arrowUp: { w: 2.6, parts: ["M12 19V5", "M6 11l6-6 6 6"] },
  arrowDown: { w: 2.6, parts: ["M12 5v14", "M6 13l6 6 6-6"] },
  lock: { w: 1.8, parts: [{ rect: [4, 10, 16, 10, 2.5] }, "M8 10V7a4 4 0 0 1 8 0v3"] },
  trend: { w: 1.9, parts: ["M3 17l6-6 4 4 7-7", "M14 8h6v6"] },
  mail: { w: 1.8, parts: [{ rect: [3, 5, 18, 14, 2.5] }, "M3.5 7l8.5 6 8.5-6"] },
  check: { w: 2.4, parts: ["M5 12.5l4.5 4.5L19 7.5"] },
  copy: { w: STROKE, parts: [{ rect: [9, 9, 11, 11, 2] }, "M5 15V6a2 2 0 0 1 2-2h8"] },
  alert: { w: STROKE, parts: [{ circle: [12, 12, 9] }, "M12 8v5", "M12 16h.01"] },
  close: { w: STROKE, parts: ["M6 6l12 12M18 6L6 18"] },
  pieChart: { w: 1.8, parts: ["M21.2 15.9A10 10 0 1 1 8.1 2.8", "M22 12A10 10 0 0 0 12 2v10z"] },
  card: {
    w: 1.8,
    parts: ["M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M16 12h3"],
  },
  list: { w: 1.8, parts: ["M4 7h16", "M4 12h16", "M4 17h10"] },
  bell: {
    w: 1.8,
    parts: ["M18 8.6a6 6 0 1 0-12 0c0 5.4-2 6.9-2 6.9h16s-2-1.5-2-6.9Z", "M13.7 19.4a2 2 0 0 1-3.4 0"],
  },
  help: { w: 1.8, parts: [{ circle: [12, 12, 9] }, "M12 16v-4", "M12 8h.01"] },
  signOut: {
    w: 1.8,
    parts: ["M9.5 20H5.5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4h4", "M16 8l4 4-4 4", "M20 12H10"],
  },
  chevronRight: { w: STROKE, parts: ["M9 6l6 6-6 6"] },
  chevronDown: { w: STROKE, parts: ["M6 9l6 6 6-6"] },
  sort: { w: 1.8, parts: ["M7 4v16", "M4 17l3 3 3-3", "M17 20V4", "M14 7l3-3 3 3"] },
  blocks: {
    w: 1.9,
    parts: [{ rect: [3, 3, 8, 8, 2] }, "M11 7h4a2 2 0 0 1 2 2v4", { rect: [13, 13, 8, 8, 2] }],
  },
  sliders: {
    w: 1.9,
    parts: ["M4 7h4M14 7h6", { circle: [11, 7, 2.6] }, "M4 17h6M16 17h4", { circle: [13, 17, 2.6] }],
  },
  key: { w: 1.9, parts: [{ circle: [7.5, 14.5, 3.5] }, "M10 12L20 4", "M17.5 6.5l2 2"] },
  search: { w: 1.8, parts: [{ circle: [11, 11, 7] }, "M16.5 16.5L21 21"] },
  download: { w: 1.8, parts: ["M12 4v11", "M8 11l4 4 4-4", "M5 19h14"] },
  grid: {
    w: STROKE,
    parts: [
      { rect: [3, 3, 7, 7, 1.5] },
      { rect: [14, 3, 7, 7, 1.5] },
      { rect: [3, 14, 7, 7, 1.5] },
      { rect: [14, 14, 7, 7, 1.5] },
    ],
  },
  refresh: {
    w: STROKE,
    parts: ["M20 7v5a8 8 0 0 1-14.9 4", "M4 17v-5a8 8 0 0 1 14.9-4", "M20 3v4h-4", "M4 21v-4h4"],
  },
  shield: { w: 1.8, parts: ["M12 22s8-4.5 8-11V5l-8-3-8 3v6c0 6.5 8 11 8 11z"] },
  layers: { w: 1.8, parts: ["M12 3v18", "M4 8h16", "M4 16h16"] },
  clock: { w: 1.8, parts: [{ circle: [12, 12, 9] }, "M12 7v5l3 2"] },
  bookmark: { w: 1.8, parts: ["M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"] },
  plus: { w: STROKE, parts: ["M12 6v12", "M6 12h12"] },
  /* Four corners and a line across: point a camera at a code. */
  scan: {
    w: 1.8,
    parts: [
      "M4 8V5a1 1 0 0 1 1-1h3",
      "M16 4h3a1 1 0 0 1 1 1v3",
      "M20 16v3a1 1 0 0 1-1 1h-3",
      "M8 20H5a1 1 0 0 1-1-1v-3",
      "M7 12h10",
    ],
  },
  cog: {
    w: 1.8,
    parts: [
      { circle: [12, 12, 3] },
      "M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.5 15H3a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 4.3 8.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.9 4.3V4a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.2 1.2z",
    ],
  },
  users: {
    w: 1.8,
    parts: [
      { circle: [9, 8, 3.2] },
      "M3.5 19.5a5.5 5.5 0 0 1 11 0",
      "M16 5.2a3.2 3.2 0 0 1 0 5.6",
      "M17.5 14.4a5.5 5.5 0 0 1 3 5.1",
    ],
  },
  pulse: { w: 1.9, parts: ["M3 12h3.5L9 5.5 13 18l2.5-6H21"] },
  droplet: { w: 1.8, parts: ["M12 3.5c3.2 3.4 5.5 6.2 5.5 9a5.5 5.5 0 0 1-11 0c0-2.8 2.3-5.6 5.5-9Z"] },
  eye: {
    w: 1.8,
    parts: ["M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z", { circle: [12, 12, 3.2] }],
  },
  eyeOff: {
    w: 1.8,
    parts: [
      "M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 4",
      "M6.4 7.6A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 3.9-.8",
      "M4 4l16 16",
    ],
  },
} as const;

export interface IconProps extends Omit<SvgProps, "color"> {
  name: IconName;
  size?: number;
  color?: ColorValue;
  /** Overrides the icon's own weight. The tab bar runs a little lighter. */
  strokeWidth?: number;
}

export const Icon = ({ name, size = 20, color = palette.ink, strokeWidth, ...rest }: IconProps) => {
  const icon = PATHS[name];
  const w = strokeWidth ?? icon.w;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...rest}>
      {(icon.parts as readonly Part[]).map((part, i) => {
        if (typeof part === "string") {
          return (
            <Path
              key={i}
              d={part}
              stroke={color}
              strokeWidth={w}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }
        if ("circle" in part) {
          const [cx, cy, r] = part.circle;
          return <Circle key={i} cx={cx} cy={cy} r={r} stroke={color} strokeWidth={w} />;
        }
        const [x, y, width, height, rx] = part.rect;
        return (
          <Rect key={i} x={x} y={y} width={width} height={height} rx={rx} stroke={color} strokeWidth={w} />
        );
      })}
    </Svg>
  );
};

/**
 * The Mercury mark, from `apps/web/public/favicon.svg`.
 *
 * Solid rather than stroked, so it never sits in the `Icon` set — it is the
 * brand, not a glyph, and it takes a fill where everything above takes a
 * stroke.
 */
export const Mark = ({ size = 20, color = palette.ink }: { size?: number; color?: ColorValue }) => (
  <Svg width={size} height={size} viewBox="-4 -4 76 76">
    <Path
      fill={color}
      d="M43.1562 32.6214C47.1456 32.7117 50.7052 34.69 53.4032 37.5804C56.7289 41.1437 59.6535 47.5874 59.4843 52.5404C59.4115 54.6817 58.7694 56.7682 57.1796 58.2572C55.7541 59.5929 53.7312 60.1279 51.8202 60.0394C45.5982 59.7506 35.4581 51.8572 30.9237 47.6468C29.005 45.8652 27.2475 43.9224 25.495 41.9789C23.9632 42.968 22.3898 44.0051 20.9081 45.0687C21.2463 45.5065 21.7423 45.9682 22.1327 46.3685C26.4988 50.8495 31.5928 55.2922 37.0136 58.3978C41.3128 60.8498 46.575 63.119 51.5712 63.1332C50.019 64.0758 48.1362 65.0018 46.0253 65.8441C42.829 67.1195 38.7223 67.8414 36.0097 67.933C27.5399 68.469 19.2668 65.7301 12.5917 60.4242C11.1629 59.2074 9.55369 57.4834 9.38468 55.4779C9.28792 54.1796 10.0343 52.6602 10.8778 51.6976C14.7234 47.3102 19.8328 44.0479 24.6239 40.806C26.2351 39.7158 27.862 38.4976 29.4501 37.4906C33.1996 35.113 37.4597 32.9979 41.9237 32.6468C42.313 32.5884 42.7599 32.6125 43.1562 32.6214ZM16.9657 7.22495C17.4554 7.16233 18.8482 7.26142 19.413 7.35874C26.877 8.64584 34.4582 13.999 39.079 19.9417C40.3515 21.5786 41.5538 23.8413 41.2382 25.9193C41.0259 27.3199 40.1892 28.5323 39.1327 29.4359C36.9266 31.323 34.0822 32.5242 31.5868 33.9759C30.5426 34.5835 29.4804 35.1614 28.4491 35.7806C27.8793 36.1167 27.3178 36.58 26.7275 36.8714C22.3598 39.0243 18.0064 41.3032 13.9345 43.9916C11.0008 45.9287 6.23457 49.014 5.68742 52.7796C5.11688 51.8668 4.37972 50.6682 3.97648 49.8695C1.96027 45.8758 1.06615 43.1373 0.249918 38.0697C0.205743 37.7414 0.167822 37.4121 0.13566 37.0824C-0.63722 29.1565 1.92191 19.9418 7.05656 13.4095C7.00049 13.7313 6.97504 14.0659 6.95597 14.3919C6.4051 23.8044 10.8056 33.4704 16.914 40.4437C18.6044 39.4415 20.32 38.4828 22.0595 37.5697C19.3611 33.8936 16.8151 30.3882 14.7489 26.2894C12.9853 22.7907 10.6741 18.8582 10.3456 14.8773C9.98208 10.4699 12.6842 7.56185 16.9657 7.22495ZM62.7792 15.8294C63.0448 16.1457 63.7027 17.4188 63.914 17.7914C65.9952 21.4556 67.2468 25.4885 67.8222 29.6712C68.4468 36.8044 67.7054 41.9967 64.9208 48.2152C64.2831 49.4019 63.7314 50.8663 62.9257 51.9417C62.909 51.4618 62.8715 51.1429 62.7987 50.6683C62.3801 47.1119 60.1367 41.9342 58.7392 38.6546C57.2183 35.0849 55.4759 31.4507 55.8622 27.4212C56.3272 22.5768 59.2242 18.8471 62.7792 15.8294ZM33.873 0.00229641C35.6889 -0.0289629 38.0313 0.266898 39.1786 0.403664C41.5749 0.689294 45.6269 1.83359 48.7646 3.36851C52.5206 5.27042 56.8227 8.02181 58.3759 12.1322C59.7507 15.7696 57.0677 19.5083 53.6337 20.5834C50.7876 21.4743 48.1101 20.9139 45.5048 19.5843C41.3172 17.3299 38.8532 14.0951 35.4101 10.9789C31.0867 7.06571 25.0277 3.17515 19.039 3.53941C23.9934 1.05086 28.8522 0.088724 33.873 0.00229641Z"
    />
  </Svg>
);
