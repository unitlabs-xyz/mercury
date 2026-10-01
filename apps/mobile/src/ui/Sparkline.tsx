import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { color } from "../theme";

/**
 * A price line, small enough to sit inside a list row.
 *
 * No axis and no scale, because at this size neither can be read: the shape is
 * the whole message. It is drawn to the series' own high and low rather than to
 * a shared one, so each row answers "what did this do", not "how does it
 * compare" — the comparison is the move chip beside it.
 */
export const Sparkline = ({
  values,
  up,
  width = 52,
  height = 24,
}: {
  values: readonly number[];
  up: boolean;
  width?: number;
  height?: number;
}) => {
  // Two points is the fewest that makes a line. Fewer draws nothing rather than
  // a flat line, which would claim the price held steady all day.
  if (values.length < 2) return <View style={{ width, height }} />;

  const hi = Math.max(...values);
  const lo = Math.min(...values);
  // A dead-flat series would divide by zero; it draws down the middle instead.
  const span = hi - lo || 1;
  const pad = 2;
  const usable = height - pad * 2;

  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = pad + (1 - (v - lo) / span) * usable;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <Svg width={width} height={height} style={s.svg}>
      <Path
        d={d}
        stroke={up ? color.up : color.fall}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
};

const s = StyleSheet.create({ svg: { overflow: "visible" } });
