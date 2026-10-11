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
      "Hold stablecoins, buy tokenized US shares, spend with a card, and borrow against what you own, all from a wallet you control.",
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
    cta: "Try the beta",
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
    eyebrow: "Invest. Borrow. Spend.",
    heading: ["The financial account built", "for the onchain world."],
    lead: "Hold your money, invest in stocks and ETFs, build diversified portfolios, spend with your card, and access your wealth, all from a single wallet.",
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
      body: "Bring a wallet you already use, or make one with an email address. Mercury is an interface, not a custodian. It can neither move nor freeze what you hold.",
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
      body: "590 US stocks and funds, or a whole basket bought in one action and held afterwards as a single position.",
      points: [
        "From $5, in fractions of a share",
        "A basket is one token you can hold and send",
        "Set an amount to go in every week or month",
      ],
      alt: "Buying Nvidia: two issuers quoted, with the cost broken down.",
    },
  },

  addCash: {
    title: "Add cash",
    lede: "Send USDC to this address. It starts earning the moment it arrives.",
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
      title: "Money works while it waits.",
      body: "Cash sitting between decisions still earns, and the shares you own quietly become more shares.",
      alt: "The cash balance, earning while it sits.",
      label: "Available to invest",
      pill: "Earning {rate}",
      note: "paid into this balance",
    },
    spend: {
      stamp: "Spend",
      title: "Spend without selling.",
      body: "The Mercury Visa pays from a line held against your portfolio, so buying lunch never means closing a position.",
      alt: "A Visa card drawing on the same balance.",
      label: "Mercury Visa · Platinum",
      note: "Spends from cash, never from shares",
    },
    borrow: {
      stamp: "Borrow",
      title: "Borrow against your shares.",
      body: "Borrow against what you already own. The position stays yours, and so does everything it earns while the loan is open.",
      alt: "Borrowing power against the shares held.",
      label: "Borrowing power",
      note: "Against {amount} held",
    },
  },

  oneNumber: {
    heading: ["One number for", "everything you hold."],
    lead: "The same company can be held through either issuer, and each token is worth a different sliver of a share. Mercury counts the shares behind them, not the tokens.",
    alt: "The portfolio total, and one company counted across both issuers",
    totalLabel: "Portfolio value",
    totalNote: "{amount} all time",
    stocks: "Stocks",
    baskets: "Baskets",
    cash: "Cash · {rate}",
    issuerTitle: "Nvidia, across issuers",
    tokens: "{n} tokens",
    truePosition: "True position",
    shares: "{n} shares",
    issuerNote: "Counting tokens would have said 58. Each one carries its own multiplier.",
  },

  custody: {
    heading: ["Held by custodians.", "Controlled by you."],
    lead: "Every token you hold is backed one for one by a real share at a regulated custodian. We never hold your keys, and no part of this product can move your money without you.",
    alt: "A share at a custodian, mirrored as a token on Solana, held in your wallet",
    pins: ["Your wallet", "Token on Solana", "Share at a custodian"],
    columns: [
      {
        title: "Backed one for one",
        body: "Every token maps to a share held at a named custodian. Backed and Ondo issue them; we say which one you are getting before you buy.",
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
        q: "What happens when the US market is shut?",
        a: "Tokens keep trading when the exchange does not, so the price can drift from the real share. We compare the two and wait rather than buy you a share at the panic price.",
      },
      {
        q: "Do I need to verify my identity?",
        a: "For most of what you can do here, no. Where the issuer or the card network requires it, we say so before you start rather than after.",
      },
      {
        q: "What does Mercury charge?",
        a: "One spread on the trade, stated before you confirm it. No account fee, no inactivity fee, and nothing taken out of a dividend.",
      },
      {
        q: "Can I move my shares somewhere else?",
        a: "Yes. They are tokens in your wallet, not an entry in our ledger. Send them anywhere that accepts them, and nothing here has to approve it.",
      },
    ],
  },

  cta: {
    heading: ["Mercury is open.", "Try the beta today."],
    note: "Open your account in minutes and start holding, investing and spending from one wallet.",
    label: "Try the Mercury beta",
  },
};

type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? Widen<U>[]
    : { [K in keyof T]: Widen<T[K]> };

export type Dict = Widen<typeof en>;
