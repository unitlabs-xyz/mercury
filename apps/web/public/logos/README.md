# Third-party marks

These are the official marks of the services Harbor builds on, used to identify
them factually in the "shares custodied and tokenised by" strip. They are the
trademarks of their respective owners and are not Harbor's.

| File                  | Source                                                                                                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backed.svg`          | backed.fi, official site asset                                                                                                                                                                                                   |
| `ondo.svg`            | ondo.finance, site header mark                                                                                                                                                                                                   |
| `xstocks.svg`         | xstocks.com, site header mark                                                                                                                                                                                                    |
| `solana.svg`          | Simple Icons (CC0)                                                                                                                                                                                                               |
| `privy.svg`           | privy.io, site header mark, cropped to the Privy mark from the "a Stripe company" lockup                                                                                                                                         |
| `solana-wordmark.svg` | solana.com, site header mark. The full lockup, for the card page's partner row; `solana.svg` stays the square icon the landing strip uses. Its full-bleed background rect was dropped, since as a mask that paints a solid block |
| `helius.svg`          | helius.dev, inline header mark, gradients stripped to flat shapes                                                                                                                                                                |
| `kamino.svg`          | kamino.com, official site asset                                                                                                                                                                                                  |
| `moonpay.svg`         | moonpay.com, inline header mark                                                                                                                                                                                                  |
| `visa.svg`            | Simple Icons (CC0), viewBox cropped from the padded 24x24 square to the wordmark's ink, so `mask-size: contain` scales the mark rather than the padding                                                                          |

FYEO sets its name as spaced capitals rather than a drawn mark, so the partner
row typesets it instead of masking a file.

Each has been reduced to a single colour so the strip can be painted from the
palette: the page applies them as a CSS mask over `bg-ink-soft`, so changing the
token changes every logo. Do not re-add per-brand colours without checking each
brand's usage guidelines first.

## Not currently used

`Standalone_Icon_Red.png` is Backpack's official standalone mark, kept for the planned "fund from
a connected wallet" step. The wallet buttons it was fetched for were removed from the connect
modal; see [ADR 0003](../../../../docs/adr/0003-custody.md).
