import { useState } from "react";
import { Image, StyleSheet, Text as RNText, View } from "react-native";
import { color, font } from "../theme";

/**
 * A stock's logo, as the web's `Mark` and `Holdings`' `Logo` draw it: a round
 * image, falling back to the ticker's initial on the avatar grey.
 *
 * The art is xStocks' own token metadata, which is where the API's `logoUrl`
 * points for a Backed wrapper. Built from the ticker rather than passed in so
 * a screen with no instrument data still shows the real mark; once the holdings
 * come from `GET /v1/portfolio`, `uri` takes that `logoUrl` and this becomes
 * the fallback for an instrument the CDN has no art for.
 *
 * `onError` is what makes the fallback real. A 404 from the CDN otherwise
 * renders as a blank circle, which looks like a logo that has not loaded yet
 * and never will.
 */
export const StockLogo = ({ ticker, size = 36, uri }: { ticker: string; size?: number; uri?: string }) => {
  const [failed, setFailed] = useState(false);
  const src = uri ?? `https://xstocks-metadata.backed.fi/logos/tokens/${ticker.toUpperCase()}x.png`;
  const round = { width: size, height: size, borderRadius: size / 2 };

  if (failed) {
    return (
      <View style={[s.fallback, round]}>
        <RNText style={[s.initial, { fontSize: Math.round(size * 0.39) }]}>{ticker.slice(0, 1)}</RNText>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: src }}
      style={[s.image, round]}
      onError={() => setFailed(true)}
      accessibilityIgnoresInvertColors
    />
  );
};

const s = StyleSheet.create({
  // A ground behind the art: most of these logos are transparent PNGs whose
  // mark is dark, and a dark mark on a grey tile loses its edge.
  image: { backgroundColor: color.surface },
  fallback: { backgroundColor: color.avatar, alignItems: "center", justifyContent: "center" },
  initial: { fontFamily: font.medium, color: color.ink },
});
