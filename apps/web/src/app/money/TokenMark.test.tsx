import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TokenMark } from "./TokenMark";

type Props = Parameters<typeof TokenMark>[0];

const props: Props = {
  symbol: "USDC",
  logoUrl: "https://coin-images.coingecko.com/usdc.png",
  chainName: "Base",
  chainIconUrl: "https://assets.relay.link/icons/8453/light.png",
};

const html = (over: Partial<Props> = {}) =>
  renderToStaticMarkup(createElement(TokenMark, { ...props, ...over }));

describe("TokenMark", () => {
  it("shows the token and its chain together", () => {
    const out = html();

    expect(out).toContain(props.logoUrl);
    expect(out).toContain(props.chainIconUrl);
  });

  it("falls back to a letter when there is no logo", () => {
    /* Common enough to design for: Relay has no artwork for every token, and
       a missing one must not leave a hole in the row. */
    const out = html({ logoUrl: null, chainIconUrl: null });

    expect(out).not.toContain("<img");
    expect(out).toContain(">U<");
    expect(out).toContain(">B<");
  });

  it("falls back for one mark without affecting the other", () => {
    const out = html({ logoUrl: null });

    expect(out).toContain(props.chainIconUrl);
    expect(out).toContain(">U<");
  });

  it("keeps the marks out of the accessibility tree", () => {
    /* Decorative: the symbol and name are beside them as text, and a screen
       reader announcing "USDC" three times per row would be reading artwork. */
    const out = html();

    expect(out).not.toMatch(/alt="[^"]+"/);
    expect(out).toContain('alt=""');
  });

  it("loads logos lazily, since a search renders fifty rows at once", () => {
    expect(html()).toContain('loading="lazy"');
  });
});
