import { iso, line, slab } from "./iso";

/* Face shading: the top catches light, the two side faces step down. */
const Box = ({
  f,
  top,
  right,
  left,
}: {
  f: ReturnType<typeof slab>;
  top: string;
  right: string;
  left: string;
}) => (
  <>
    <polygon points={f.left} fill={left} />
    <polygon points={f.right} fill={right} />
    <polygon points={f.top} fill={top} />
  </>
);

const T = {
  brandTop: "#2E8F9B",
  brandRight: "#0F7480",
  brandLeft: "#0B5C66",
  soft: "#8FC0C6",
  softRight: "#6BA8B0",
  softLeft: "#548A92",
  paleTop: "#FFFFFF",
  paleRight: "#EDEAE2",
  paleLeft: "#DFDBD2",
  inkTop: "#4A4740",
  inkRight: "#33302A",
  inkLeft: "#26241F",
};

/** Stablecoins in a wallet become shares. Reads left to right, low to high. */
export const FlowIllustration = () => {
  const base = slab(-2.6, -2.6, 5.2, 5.2, 0.35);
  const wallet = slab(-1.9, -1.2, 3.2, 2.4, 0.95, 0.35);
  const TW = 2.4;
  const TD = 1.7;
  const TH = 0.22;
  /* Stepping x and y by the same amount cancels in isometric and stacks the
     tiles on one point; they have to diverge in (x - y) and in z. */
  const tiles = [0, 1, 2].map((i) => ({
    x: -0.4 + i * 1.0,
    y: -2.3 - i * 0.1,
    z: 2.1 + i * 1.3,
    label: ["NVDA", "SPY", "QQQ"][i] as string,
  }));
  const rise = line([-0.3, 0, 1.35], [0.8, -1.9, 2.5]);

  return (
    <svg
      viewBox="-59 -70 132 107"
      className="h-full w-full"
      role="img"
      aria-label="Stablecoins held in a wallet becoming shares of Nvidia, the S&P 500 and the Nasdaq 100"
    >
      <Box f={base} top="#F1EEE6" right={T.paleRight} left={T.paleLeft} />
      <Box f={wallet} top={T.brandTop} right={T.brandRight} left={T.brandLeft} />

      {/* the stablecoin resting in the wallet */}
      <ellipse
        cx={iso(-0.3, 0, 1.3)[0]}
        cy={iso(-0.3, 0, 1.3)[1]}
        rx="13"
        ry="7.5"
        fill="#E8F4F5"
        stroke="#0B5C66"
        strokeWidth="1.1"
      />
      <text
        x={iso(-0.3, 0, 1.3)[0]}
        y={iso(-0.3, 0, 1.3)[1] + 2.6}
        textAnchor="middle"
        fill="#0B5C66"
        fontSize="7"
        fontWeight="700"
        fontFamily="Instrument Sans, sans-serif"
      >
        USDC
      </text>

      <line
        {...rise}
        stroke="#0F7480"
        strokeWidth="1.2"
        strokeDasharray="3 3.5"
        strokeLinecap="round"
        opacity="0.55"
      />

      {tiles.map((t) => {
        const f = slab(t.x, t.y, TW, TD, TH, t.z);
        const c = iso(t.x + TW / 2, t.y + TD / 2, t.z + TH);
        return (
          <g key={t.label}>
            <polygon points={f.left} fill={T.paleLeft} />
            <polygon points={f.right} fill={T.paleRight} />
            <polygon points={f.top} fill="#FFFFFF" stroke="#D5D0C6" strokeWidth="0.7" />
            <text
              x={c[0]}
              y={c[1] + 2.5}
              textAnchor="middle"
              fill="#3A372F"
              fontSize="7.5"
              fontWeight="600"
              fontFamily="Instrument Sans, sans-serif"
            >
              {t.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

/** One share at a custodian, one token on chain, one holding in your wallet. */
export const CustodyIllustration = () => {
  const layers = [
    { z: 0, top: T.paleTop, right: T.paleRight, left: T.paleLeft, label: "Share at a custodian" },
    { z: 1.75, top: T.brandTop, right: T.brandRight, left: T.brandLeft, label: "Token on Solana" },
    { z: 3.5, top: T.inkTop, right: T.inkRight, left: T.inkLeft, label: "Your wallet" },
  ];

  return (
    <svg
      viewBox="-48 -78 190 108"
      className="h-full w-full"
      role="img"
      aria-label="One share held at a custodian backs one token on Solana, held in your own wallet"
    >
      {[...layers].reverse().map((l) => {
        const f = slab(-2, -2, 4, 4, 0.5, l.z);
        const anchor = iso(2, -2, l.z + 0.5);
        return (
          <g key={l.label}>
            <Box f={f} top={l.top} right={l.right} left={l.left} />
            <line
              x1={anchor[0]}
              y1={anchor[1]}
              x2={anchor[0] + 14}
              y2={anchor[1]}
              stroke="#CFCBC2"
              strokeWidth="0.9"
            />
            <text
              x={anchor[0] + 19}
              y={anchor[1] + 3.2}
              fill="#3A372F"
              fontSize="8"
              fontWeight="600"
              fontFamily="Instrument Sans, sans-serif"
            >
              {l.label}
            </text>
          </g>
        );
      })}

      {/* the 1:1 spine running through every layer */}
      <line
        {...line([-2, -2, 0.5], [-2, -2, 3.5])}
        stroke="#0F7480"
        strokeWidth="1.3"
        strokeDasharray="3 3"
        opacity="0.6"
      />
      <text
        x={iso(-2, -2, 2.1)[0] - 8}
        y={iso(-2, -2, 2.1)[1]}
        textAnchor="end"
        fill="#0F7480"
        fontSize="8"
        fontWeight="600"
        fontFamily="Instrument Sans, sans-serif"
      >
        1 : 1
      </text>
    </svg>
  );
};
