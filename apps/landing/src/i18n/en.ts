/**
 * Every word on the page, in English. The other locales are this same shape
 * (`Dict`), so a missing or extra key is a type error rather than a blank.
 *
 * Placeholders in braces, like {n}, are filled in by the component; keep them
 * as they are in every translation. Figures, tickers and brand names stay out
 * of here: they are the same in every language.
 */
export const en = {
  meta: {
    tagline: "The financial account built for the onchain world.",
    description:
      "Own real global stocks from $5, invest in whole themes with baskets, and borrow against your shares instead of selling them, all from a wallet that is yours.",
    ogAlt: "Mercury, the financial account built for the onchain world.",
  },

  ui: {
    skip: "Skip to content",
    home: "Mercury home",
    mainNav: "Main",
    menuNav: "Menu",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    language: "Language",
    cta: "Try beta",
  },

  nav: {
    howItWorks: "How it works",
    baskets: "Baskets",
    card: "Card",
    faqs: "FAQs",
  },

  footer: {
    explore: "Explore",
    company: "Company",
    follow: "Follow",
    legal: "Legal",
    about: "About",
    contact: "Contact",
    terms: "Terms",
    privacy: "Privacy",
    rights: "Global · All rights reserved.",
  },

  hero: {
    heading: ["The financial account built", "for the onchain world."],
    lead: "Own real global stocks from $5, invest in whole themes with baskets, and borrow against your shares instead of selling them. All from a wallet that is yours, opened with just an email.",
    imageLabel: "Hero image",
  },

  trust: {
    caption: "Shares custodied and tokenised by",
  },

  everything: {
    heading: ["Everything your money does,", "in one account."],
    lead: "No brokerage account, no identity check, no fiat rails. If you can hold a stablecoin, you can hold Nvidia.",
    hold: {
      stamp: "HOLD",
      title: "Your money stays in your wallet.",
      body: "Sign in with an email and Mercury creates a wallet that is yours alone. No seed phrase, no extension.",
      points: [
        "USDC on Solana, in and out, with no bank in the middle.",
        "Send and receive at any hour, including weekends",
        "Leaving takes one transaction and nobody’s permission",
      ],
      alt: "Adding cash: a Solana deposit address with a QR code.",
    },
    invest: {
      stamp: "INVEST",
      title: "Turn stablecoins into real shares.",
      body: "Over 450 global stocks and ETFs. On every order we compare prices across multiple providers and choose the best one for you.",
      points: [
        "From $5, in fractions of a share",
        "The best price across providers, every time",
        "Orders far from the real share price wait or are refused",
      ],
      alt: "Buying Nvidia: two issuers quoted, with the cost broken down.",
    },
  },

  addCash: {
    title: "Add cash",
    lede: "Send USDC to this address. It lands as cash, ready to invest.",
    addressLabel: "Your Solana address",
    qrAlt: "Solana deposit address {address} as a QR code",
    copy: "Copy the address",
    copied: "Address copied",
  },

  buyQuote: {
    youPay: "You pay",
    pricePerShare: "Price per share",
    shares: "Shares",
    route: "Route",
  },

  pillars: {
    grow: {
      stamp: "Grow",
      title: "Dividends become shares.",
      body: "Dividends arrive as more of the share. Mercury counts the real shares behind every token, so your number stays right.",
      alt: "A share count that rose after a dividend.",
      label: "Nvidia, true position",
      value: "{n} shares",
      pill: "+{n}",
      note: "added by dividends",
    },
    borrow: {
      stamp: "Borrow",
      title: "Cash without selling.",
      body: "Need dollars? Borrow against your stocks instead of selling them. The cash lands in your balance, and the shares stay yours.",
      alt: "Borrowing power against the shares held.",
      label: "Borrowing power",
      note: "Against {amount} held",
    },
    spend: {
      stamp: "Spend · Next",
      title: "A card for your balance.",
      body: "The Mercury Card is next: your cash balance, spent at any shop in the world, so your investments stay invested.",
      alt: "The Mercury Card, coming soon.",
      label: "Mercury Card",
      note: "Coming soon",
    },
  },

  baskets: {
    heading: ["A whole theme,", "in one basket."],
    lead: "Pick a theme like the Magnificent Seven, AI or nuclear energy and fund it with one payment. It lives in your own account, is rebalanced daily, and comes back to you whenever you leave.",
    alt: "The Magnificent Seven basket, and how a basket works",
    kind: "Basket · Technology",
    name: "Magnificent Seven",
    holdings: "{n} holdings",
    note: "Rebalanced daily",
    weights: "Target weights",
    howTitle: "How a basket works",
    how: [
      { label: "Where it lives", value: "Your own account" },
      { label: "Pooled with others", value: "Never" },
    ],
    leave: { label: "Leaving", value: "In kind or as cash" },
    howNote: "{n} baskets live, from AI to gold, plus strategies inspired by well-known investors.",
  },

  custody: {
    heading: ["Held by custodians.", "Controlled by you."],
    lead: "Every token you hold is backed one for one by a real share at a regulated custodian. We never hold your keys, and no part of this product can move your money without you.",
    alt: "A share at a custodian, mirrored as a token on Solana, held in your wallet",
    pins: ["Your wallet", "Token on Solana", "Share at a custodian"],
    columns: [
      {
        title: "Backed one for one",
        body: "Every token maps to a real share held at a named custodian, and we show which provider you are getting before you buy.",
      },
      {
        title: "Every number has its source",
        body: "Prices say where they were read and when. A figure with no provenance is a figure we would not show you.",
      },
      {
        title: "Refused, not filled badly",
        body: "When the token costs more than the share is worth, the order waits or is refused. A bad fill is worse than no fill.",
      },
    ],
  },

  faqs: {
    title: "FAQs",
    items: [
      {
        q: "Do I actually own the shares?",
        a: "Each token is backed one for one by a real share held by a regulated custodian. You hold the token in your own wallet, and you can move it out whenever you like.",
      },
      {
        q: "What happens when the stock market is closed?",
        a: "Tokens keep trading when the exchange does not, so the price can drift from the real share. We compare the two and wait rather than buy you a share at the panic price.",
      },
      {
        q: "Do I need to verify my identity?",
        a: "No. You sign in with an email and a wallet is made for you. No documents, no forms.",
      },
      {
        q: "What does Mercury charge?",
        a: "No account fee and no Mercury fee on trades. You pay the token\u2019s market price, and any premium or network cost is shown before you confirm.",
      },
      {
        q: "What is a basket?",
        a: "A ready-made portfolio around one theme, like the Magnificent Seven. One payment buys every holding at its target weight, in an account only you own, and it is rebalanced daily.",
      },
      {
        q: "Can I move my shares somewhere else?",
        a: "Yes. They are tokens in your wallet, not an entry in our ledger. Send them anywhere that accepts them, and nothing here has to approve it.",
      },
    ],
  },

  cta: {
    heading: ["Mercury is open.", "Try the beta today."],
    note: "Sign in with an email and own your first share in minutes.",
    label: "Try the Mercury beta",
  },
};

type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? Widen<U>[]
    : { [K in keyof T]: Widen<T[K]> };

export type Dict = Widen<typeof en>;
