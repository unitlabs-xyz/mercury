/**
 * Isometric line-art in the style of the reference: dark hairline outlines,
 * white bodies, one accent hue, loose geometric confetti. Stablecoins drop in
 * through the lid; shares settle at the bottom.
 */
const INK = "#1B1A17";
const TEAL = "#0F7480";
const TEAL_MID = "#2E8F9B";
const TEAL_PALE = "#BFDDE1";

const S = { stroke: INK, strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** An isometric disc: elliptical top, a rim of `t` below it. */
const Disc = ({
  cx,
  cy,
  r,
  t = 9,
  face = "#FFFFFF",
  rim = TEAL,
  children,
}: {
  cx: number;
  cy: number;
  r: number;
  t?: number;
  face?: string;
  rim?: string;
  children?: React.ReactNode;
}) => {
  const ry = r * 0.5;
  return (
    <g>
      <path
        d={`M${cx - r},${cy} v${t} a${r},${ry} 0 0 0 ${r * 2},0 v-${t}`}
        fill={rim}
        {...S}
      />
      <ellipse cx={cx} cy={cy} rx={r} ry={ry} fill={face} {...S} />
      {children}
    </g>
  );
};

/** A small isometric cube of confetti. */
const Cube = ({ x, y, s, fill = TEAL_PALE }: { x: number; y: number; s: number; fill?: string }) => {
  const h = s * 0.5;
  return (
    <g strokeWidth={1.8} stroke={INK} strokeLinejoin="round">
      <path d={`M${x},${y} l${s},${h} l0,${s} l-${s},${-h} z`} fill={fill} />
      <path d={`M${x + s * 2},${y} l-${s},${h} l0,${s} l${s},${-h} z`} fill="#FFFFFF" />
      <path d={`M${x},${y} l${s},${-h} l${s},${h} l-${s},${h} z`} fill="#FFFFFF" />
    </g>
  );
};

export const VaultIllustration = () => (
  <svg
    viewBox="0 0 420 430"
    className="h-full w-full"
    role="img"
    aria-label="A glass vault: stablecoins drop in through the lid and settle as shares of Nvidia, the S and P 500 and the Nasdaq 100"
  >
    <defs>
      <linearGradient id="vaultGround" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0%" stopColor="#F7F6F2" />
        <stop offset="55%" stopColor="#DCEFF1" />
        <stop offset="100%" stopColor="#9FD2D8" />
      </linearGradient>
      <clipPath id="vaultBody">
        <path d="M112,175 v112 a98,49 0 0 0 196,0 v-112 z" />
      </clipPath>
    </defs>

    <rect x="0" y="0" width="420" height="430" rx="28" fill="url(#vaultGround)" />

    {/* confetti behind */}
    <Cube x={44} y={214} s={13} fill={TEAL_PALE} />
    <ellipse cx={356} cy={150} rx={7} ry={3.5} fill="none" stroke={INK} strokeWidth={1.8} />
    <path d="M60,128 l7,-7 l7,7 l-7,7 z" fill="#FFFFFF" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />

    {/* the back half of the rim, so the jar reads as open */}
    <path d="M112,175 a98,49 0 0 1 196,0" fill="none" {...S} />

    {/* shares already settled inside, plus one coin still on its way down */}
    <g clipPath="url(#vaultBody)">
      <g transform="rotate(-16 204 214)">
        <path d="M166,208 v12 a38,19 0 0 0 76,0 v-12" fill={TEAL_MID} {...S} />
        <ellipse cx={204} cy={208} rx={38} ry={19} fill="#FFFFFF" {...S} />
        <text
          x={204}
          y={213}
          textAnchor="middle"
          fill={INK}
          fontSize="13"
          fontWeight="700"
          fontFamily="Instrument Sans, sans-serif"
        >
          USDC
        </text>
      </g>
      <Disc cx={176} cy={300} r={44} t={11} face="#FFFFFF" rim={TEAL_MID}>
        <text
          x={176}
          y={304}
          textAnchor="middle"
          fill={INK}
          fontSize="15"
          fontWeight="700"
          fontFamily="Instrument Sans, sans-serif"
        >
          SPY
        </text>
      </Disc>
      <Disc cx={246} cy={286} r={44} t={11} face="#FFFFFF" rim={TEAL}>
        <text
          x={246}
          y={290}
          textAnchor="middle"
          fill={INK}
          fontSize="14"
          fontWeight="700"
          fontFamily="Instrument Sans, sans-serif"
        >
          NVDA
        </text>
      </Disc>
      <Disc cx={206} cy={253} r={40} t={10} face="#FFFFFF" rim={TEAL_MID}>
        <text
          x={206}
          y={257}
          textAnchor="middle"
          fill={INK}
          fontSize="14"
          fontWeight="700"
          fontFamily="Instrument Sans, sans-serif"
        >
          QQQ
        </text>
      </Disc>
    </g>

    {/* the glass itself, drawn over its contents */}
    <path d="M112,175 v112 a98,49 0 0 0 196,0 v-112" fill="#FFFFFF" fillOpacity="0.16" {...S} />
    <path d="M132,196 v86" fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" opacity="0.85" />

    {/* the lid, lifted clear */}
    <g>
      <path d="M96,104 v22 a114,57 0 0 0 228,0 v-22" fill="#FFFFFF" {...S} />
      <ellipse cx={210} cy={104} rx={114} ry={57} fill="#FFFFFF" {...S} />
      <ellipse cx={210} cy={104} rx={62} ry={31} fill="url(#vaultGround)" {...S} />
    </g>

    {/* a stablecoin going in through the slot */}
    <g transform="rotate(-24 210 104)">
      <path d={`M176,96 v11 a34,17 0 0 0 68,0 v-11`} fill={TEAL} {...S} />
      <ellipse cx={210} cy={96} rx={34} ry={17} fill="#FFFFFF" {...S} />
      <text
        x={210}
        y={101}
        textAnchor="middle"
        fill={INK}
        fontSize="13"
        fontWeight="700"
        fontFamily="Instrument Sans, sans-serif"
      >
        USDC
      </text>
    </g>

    {/* confetti in front */}
    <Cube x={318} y={244} s={15} fill={TEAL} />
    <path d="M78,330 h18 M87,321 v18" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
    <ellipse cx={66} cy={176} rx={6} ry={3} fill="none" stroke={INK} strokeWidth={1.8} />
  </svg>
);
