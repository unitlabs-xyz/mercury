export type EventKind =
  | "buy"
  | "sell"
  | "basket"
  | "recurring"
  | "dividend"
  | "receive"
  | "send"
  | "interest"
  | "queued";

export type Detail = { label: string; value: string; tone?: "up" | "down" | "muted" };

export type Event = {
  /** ISO date, so month and year can be filtered on. */
  date: string;
  kind: EventKind;
  title: string;
  sub: string;
  amount: string | null;
  /** Which way money moved, for the sign and colour. Null for no cash movement. */
  flow: "in" | "out" | null;
  pending?: boolean;
  details: Detail[];
  signature?: string;
};

export type Day = { date: string; events: Event[] };

/** Coarse groups, because nine individual kinds is more chips than anyone reads. */
export type Group = "all" | "trades" | "transfers" | "income" | "pending";

export const GROUPS: { key: Group; label: string; kinds: EventKind[] }[] = [
  { key: "all", label: "Everything", kinds: [] },
  { key: "trades", label: "Trades", kinds: ["buy", "sell", "basket", "recurring"] },
  { key: "transfers", label: "Transfers", kinds: ["receive", "send"] },
  { key: "income", label: "Income", kinds: ["dividend", "interest"] },
  { key: "pending", label: "Pending", kinds: ["queued"] },
];

export const KIND_LABEL: Record<EventKind, string> = {
  buy: "Buy",
  sell: "Sell",
  basket: "Basket",
  recurring: "Recurring",
  dividend: "Dividend",
  receive: "Receive",
  send: "Send",
  interest: "Interest",
  queued: "Queued",
};

/** Reverse chronological, most recent first. */
export const ACTIVITY: Event[] = [
  {
    "date": "2026-09-19",
    "kind": "dividend",
    "title": "Dividend reinvested \u00b7 Nvidia",
    "sub": "2.398 \u2192 2.401 shares. No cash moved.",
    "amount": "+0.003 shares",
    "flow": null,
    "details": [
      {
        label: "Multiplier before",
        value: "\u00d71.001275"
      },
      {
        label: "Multiplier after",
        value: "\u00d71.001701"
      },
      {
        label: "Shares gained",
        value: "0.003",
        tone: "up"
      },
      {
        label: "Cash received",
        value: "None \u2014 the token itself is worth more"
      },
      {
        label: "Gross dividend",
        value: "$0.010 per share"
      },
      {
        label: "US withholding",
        value: "30%",
        tone: "muted"
      }
    ],
    "signature": "h7tP9sipurNSocJ4y5U6b2Mek2R13kjYwgFb2JucbBm9MX7s76x1"
  },
  {
    "date": "2026-09-19",
    "kind": "queued",
    "title": "Order queued \u00b7 Apple",
    "sub": "Waiting for $246.20 or better. Fills on chain without Harbor open.",
    "amount": "$100.00",
    "flow": "out",
    "details": [
      {
        label: "Reference price",
        value: "$245.50"
      },
      {
        label: "Best quote now",
        value: "$251.80"
      },
      {
        label: "Premium",
        value: "+2.57%",
        tone: "down"
      },
      {
        label: "Your trigger",
        value: "$246.20 or better"
      },
      {
        label: "Why it waited",
        value: "Premium above the 1% tolerance while the market is shut"
      }
    ],
    "pending": true
  },
  {
    "date": "2026-09-18",
    "kind": "buy",
    "title": "Bought Nvidia",
    "sub": "2.249 shares at $222.33 \u00b7 Backed",
    "amount": "$500.00",
    "flow": "out",
    "details": [
      {
        label: "Issuer chosen",
        value: "Backed \u00b7 NVDAx"
      },
      {
        label: "Price per share",
        value: "$222.33"
      },
      {
        label: "Price impact",
        value: "0.02%",
        tone: "up"
      },
      {
        label: "Ondo would have cost",
        value: "$1,523.66 per share \u00b7 85.27% impact",
        tone: "down"
      },
      {
        label: "Premium to reference",
        value: "+0.08%"
      },
      {
        label: "Fee",
        value: "$1.25"
      }
    ],
    "signature": "1zEvHAu6oYQH1pUkhUzdZqmF75g6wrFC3VpxrFkCcdoXTwCcxq4y"
  },
  {
    "date": "2026-09-18",
    "kind": "interest",
    "title": "Interest paid",
    "sub": "On your stablecoin balance",
    "amount": "$12.43",
    "flow": "in",
    "details": [
      {
        label: "Rate",
        value: "4.1% a year"
      },
      {
        label: "Average balance",
        value: "$3,640.12"
      },
      {
        label: "Period",
        value: "1 \u2013 18 September"
      }
    ],
    "signature": "bdxLCtCV3foD86sjrdfQbrb6Q5CTALocuSqYDD6cvN7viDLaLmFk"
  },
  {
    "date": "2026-09-17",
    "kind": "recurring",
    "title": "Recurring run \u00b7 $200 monthly",
    "sub": "Semiconductors $120 \u00b7 S&P 500 $80",
    "amount": "$200.00",
    "flow": "out",
    "details": [
      {
        label: "Semiconductors basket",
        value: "$120.00 \u00b7 60%"
      },
      {
        label: "S&P 500",
        value: "$80.00 \u00b7 40%"
      },
      {
        label: "Every leg routed",
        value: "Yes \u2014 nothing was skipped"
      },
      {
        label: "Next run",
        value: "1 October"
      }
    ],
    "signature": "DKsjmwRSWH6Rmc2fVs12ohbTNM3o5vmQRGFr4RCRtGjbjAiHn2vM"
  },
  {
    "date": "2026-09-15",
    "kind": "receive",
    "title": "Received USDC",
    "sub": "From an external wallet",
    "amount": "$2,000.00",
    "flow": "in",
    "details": [
      {
        label: "Token",
        value: "USDC on Solana"
      },
      {
        label: "From",
        value: "9mK\u20264fB2"
      },
      {
        label: "Started earning",
        value: "Immediately, at 4.1%"
      }
    ],
    "signature": "bR8rBtmELaDLCCY5G8dwgSG77cP3ett3BDn3F67h5ea51TYuSC6M"
  },
  {
    "date": "2026-09-12",
    "kind": "basket",
    "title": "Bought Semiconductors",
    "sub": "Six positions in one action",
    "amount": "$1,000.00",
    "flow": "out",
    "details": [
      {
        label: "Nvidia 30%",
        value: "$300.00 \u00b7 Backed"
      },
      {
        label: "Broadcom 22%",
        value: "$220.00 \u00b7 Backed"
      },
      {
        label: "AMD 18%",
        value: "$180.00 \u00b7 Backed"
      },
      {
        label: "TSMC 14%",
        value: "$140.00 \u00b7 Backed"
      },
      {
        label: "ASML 10%",
        value: "$100.00 \u00b7 Ondo"
      },
      {
        label: "Micron 6%",
        value: "$60.00 \u00b7 Backed"
      },
      {
        label: "Held as",
        value: "One basket token"
      },
      {
        label: "Fee",
        value: "0.5% a year on the position"
      }
    ],
    "signature": "LppCeXYzpYed9mbaH32S38gH1uQKwsMmGh7MwZJhL6PpUw66Pbga"
  },
  {
    "date": "2026-09-12",
    "kind": "sell",
    "title": "Sold Tesla",
    "sub": "0.704 shares at $426.07 \u00b7 Backed",
    "amount": "$300.00",
    "flow": "in",
    "details": [
      {
        label: "Issuer used",
        value: "Backed \u00b7 TSLAx"
      },
      {
        label: "Price per share",
        value: "$426.07"
      },
      {
        label: "Price impact",
        value: "0.02%",
        tone: "up"
      },
      {
        label: "Cost basis",
        value: "Estimated \u2014 this lot was transferred in",
        tone: "muted"
      },
      {
        label: "Fee",
        value: "$0.75"
      }
    ],
    "signature": "6DfnVoCGz7VPWNPpDouiX8Pb29VYPWNaV6XbtvHW3yeDibuvJk8w"
  },
  {
    "date": "2026-09-01",
    "kind": "receive",
    "title": "Received USDC",
    "sub": "Monthly top-up",
    "amount": "$5,000.00",
    "flow": "in",
    "details": [
      {
        label: "Token",
        value: "USDC on Solana"
      },
      {
        label: "From",
        value: "9mK\u20264fB2"
      },
      {
        label: "Started earning",
        value: "Immediately, at 4.1%"
      }
    ],
    "signature": "Fi1gw6qXcjDnqVrCB46VL2RFC9R4oneRC95Ev36BTFPtfpqY9yCF"
  },
  {
    "date": "2026-08-17",
    "kind": "recurring",
    "title": "Recurring run \u00b7 $200 monthly",
    "sub": "Semiconductors $120 \u00b7 S&P 500 $80",
    "amount": "$200.00",
    "flow": "out",
    "details": [
      {
        label: "Semiconductors basket",
        value: "$120.00 \u00b7 60%"
      },
      {
        label: "S&P 500",
        value: "$80.00 \u00b7 40%"
      },
      {
        label: "Every leg routed",
        value: "Yes"
      }
    ],
    "signature": "v5uJSvPmZgw1EddgfWvAHViofoGpkbUAZemakacRs2s99j9N8Wa5"
  },
  {
    "date": "2026-08-08",
    "kind": "buy",
    "title": "Bought S&P 500",
    "sub": "1.505 shares at $664.21 \u00b7 Backed",
    "amount": "$1,000.00",
    "flow": "out",
    "details": [
      {
        label: "Issuer chosen",
        value: "Backed \u00b7 SPYx"
      },
      {
        label: "Price per share",
        value: "$664.21"
      },
      {
        label: "Price impact",
        value: "0.00%",
        tone: "up"
      },
      {
        label: "Ondo would have cost",
        value: "$664.88 per share \u00b7 0.10% impact"
      },
      {
        label: "Fee",
        value: "$2.50"
      }
    ],
    "signature": "Yz3T7uFXq42pYPVXdFfUK9LzFLWiQ9UMYmxL7Lss3mo7mQbov5Di"
  },
  {
    "date": "2026-08-01",
    "kind": "interest",
    "title": "Interest paid",
    "sub": "On your stablecoin balance",
    "amount": "$9.60",
    "flow": "in",
    "details": [
      {
        label: "Rate",
        value: "4.1% a year"
      },
      {
        label: "Period",
        value: "August"
      }
    ],
    "signature": "FxbJwjdGfJYPvUstMcx7ND78es1cKHSwDTxToj7oKg4HF1WBEGEx"
  },
  {
    "date": "2026-07-22",
    "kind": "dividend",
    "title": "Dividend reinvested \u00b7 S&P 500",
    "sub": "Multiplier rose. No cash moved.",
    "amount": "+0.008 shares",
    "flow": null,
    "details": [
      {
        label: "Multiplier before",
        value: "\u00d71.005301"
      },
      {
        label: "Multiplier after",
        value: "\u00d71.005715"
      },
      {
        label: "Shares gained",
        value: "0.008",
        tone: "up"
      },
      {
        label: "US withholding",
        value: "30%",
        tone: "muted"
      }
    ],
    "signature": "s7FDWqpbFmUyZWN9kknVoJcE2uyaKMz19EicqAzFp9MESAZKAzbW"
  },
  {
    "date": "2026-07-17",
    "kind": "recurring",
    "title": "Recurring run \u00b7 $200 monthly",
    "sub": "Semiconductors $120 \u00b7 S&P 500 $80",
    "amount": "$200.00",
    "flow": "out",
    "details": [
      {
        label: "Semiconductors basket",
        value: "$120.00 \u00b7 60%"
      },
      {
        label: "S&P 500",
        value: "$80.00 \u00b7 40%"
      },
      {
        label: "Every leg routed",
        value: "Yes"
      }
    ],
    "signature": "mCnahvokh8yUxYryzXqdmdfvYpXqWbGLYKDmvdLAj3kWgFFM9tPc"
  },
  {
    "date": "2026-07-01",
    "kind": "interest",
    "title": "Interest paid",
    "sub": "On your stablecoin balance",
    "amount": "$10.61",
    "flow": "in",
    "details": [
      {
        label: "Rate",
        value: "4.1% a year"
      },
      {
        label: "Period",
        value: "July"
      }
    ],
    "signature": "Dpz9w9KcS1xekYGQQ5wzU2W3yTpM69kZyLM9XA258rasg3Jvotv6"
  },
  {
    "date": "2026-06-17",
    "kind": "recurring",
    "title": "Recurring run \u00b7 $200 monthly",
    "sub": "Semiconductors $120 \u00b7 S&P 500 $80",
    "amount": "$200.00",
    "flow": "out",
    "details": [
      {
        label: "Semiconductors basket",
        value: "$120.00 \u00b7 60%"
      },
      {
        label: "S&P 500",
        value: "$80.00 \u00b7 40%"
      },
      {
        label: "Every leg routed",
        value: "Yes"
      }
    ],
    "signature": "NXVLRmdMxFGQaVGUfp3DrxichMaDRQwgsznbPEe49T3akuTMWWV1"
  },
  {
    "date": "2026-06-01",
    "kind": "interest",
    "title": "Interest paid",
    "sub": "On your stablecoin balance",
    "amount": "$11.62",
    "flow": "in",
    "details": [
      {
        label: "Rate",
        value: "4.1% a year"
      },
      {
        label: "Period",
        value: "June"
      }
    ],
    "signature": "BAG7rPj2jB4ENanDFKtDsxPMFCuAYsD6efwxgitjKHESeXh4JbUV"
  },
  {
    "date": "2026-05-17",
    "kind": "recurring",
    "title": "Recurring run \u00b7 $200 monthly",
    "sub": "Semiconductors $120 \u00b7 S&P 500 $80",
    "amount": "$200.00",
    "flow": "out",
    "details": [
      {
        label: "Semiconductors basket",
        value: "$120.00 \u00b7 60%"
      },
      {
        label: "S&P 500",
        value: "$80.00 \u00b7 40%"
      },
      {
        label: "Every leg routed",
        value: "Yes"
      }
    ],
    "signature": "XKKP1N2PQKmNhQLnHVc3GvcRUMbUuE8FuicSSPrnJ3PeNMKNQbeQ"
  },
  {
    "date": "2026-05-08",
    "kind": "buy",
    "title": "Bought S&P 500",
    "sub": "1.505 shares at $664.21 \u00b7 Backed",
    "amount": "$1,000.00",
    "flow": "out",
    "details": [
      {
        label: "Issuer chosen",
        value: "Backed \u00b7 SPYx"
      },
      {
        label: "Price per share",
        value: "$664.21"
      },
      {
        label: "Price impact",
        value: "0.00%",
        tone: "up"
      },
      {
        label: "Ondo would have cost",
        value: "$664.88 per share \u00b7 0.10% impact"
      },
      {
        label: "Fee",
        value: "$2.50"
      }
    ],
    "signature": "v3CT7dNPzwkwke8EhTDdei3NvMLX8tZs8ryngiG8mU1qYVCESQ4f"
  },
  {
    "date": "2026-05-01",
    "kind": "interest",
    "title": "Interest paid",
    "sub": "On your stablecoin balance",
    "amount": "$12.63",
    "flow": "in",
    "details": [
      {
        label: "Rate",
        value: "4.1% a year"
      },
      {
        label: "Period",
        value: "May"
      }
    ],
    "signature": "b6HhnJLDHWxtSraKMvpWTunnAv3LgRnnfmUW4p8TRGD14gA1Bcg2"
  },
  {
    "date": "2026-04-17",
    "kind": "recurring",
    "title": "Recurring run \u00b7 $200 monthly",
    "sub": "Semiconductors $120 \u00b7 S&P 500 $80",
    "amount": "$200.00",
    "flow": "out",
    "details": [
      {
        label: "Semiconductors basket",
        value: "$120.00 \u00b7 60%"
      },
      {
        label: "S&P 500",
        value: "$80.00 \u00b7 40%"
      },
      {
        label: "Every leg routed",
        value: "Yes"
      }
    ],
    "signature": "98PJiEayPToUSyEuQviFDnB7w6HFdcThBy2NC44Acq598Cgu7ntd"
  },
  {
    "date": "2026-04-01",
    "kind": "interest",
    "title": "Interest paid",
    "sub": "On your stablecoin balance",
    "amount": "$13.64",
    "flow": "in",
    "details": [
      {
        label: "Rate",
        value: "4.1% a year"
      },
      {
        label: "Period",
        value: "April"
      }
    ],
    "signature": "Eu1NNZwgX2CpELUMRE2xhzrfxKL9KRkx19b5F1otWxZrFRMnXw9A"
  },
  {
    "date": "2026-03-22",
    "kind": "dividend",
    "title": "Dividend reinvested \u00b7 S&P 500",
    "sub": "Multiplier rose. No cash moved.",
    "amount": "+0.008 shares",
    "flow": null,
    "details": [
      {
        label: "Multiplier before",
        value: "\u00d71.005301"
      },
      {
        label: "Multiplier after",
        value: "\u00d71.005715"
      },
      {
        label: "Shares gained",
        value: "0.008",
        tone: "up"
      },
      {
        label: "US withholding",
        value: "30%",
        tone: "muted"
      }
    ],
    "signature": "adWdH25uA5YbJzdCti5GvcRMTeSxiPh6j7knRRJ9frrjUXH8Zcsw"
  },
  {
    "date": "2026-03-17",
    "kind": "recurring",
    "title": "Recurring run \u00b7 $200 monthly",
    "sub": "Semiconductors $120 \u00b7 S&P 500 $80",
    "amount": "$200.00",
    "flow": "out",
    "details": [
      {
        label: "Semiconductors basket",
        value: "$120.00 \u00b7 60%"
      },
      {
        label: "S&P 500",
        value: "$80.00 \u00b7 40%"
      },
      {
        label: "Every leg routed",
        value: "Yes"
      }
    ],
    "signature": "yX591xSkvb1Wr9pz62UspANuBGqSWZU2A3yiv7VwdHRYrr6ZSGuX"
  },
  {
    "date": "2026-03-01",
    "kind": "interest",
    "title": "Interest paid",
    "sub": "On your stablecoin balance",
    "amount": "$9.65",
    "flow": "in",
    "details": [
      {
        label: "Rate",
        value: "4.1% a year"
      },
      {
        label: "Period",
        value: "March"
      }
    ],
    "signature": "eKx4P3ioY4J8CpzCUF2aGXjMuFSGQaXo49ACSNQbkfNfs2ZP97Na"
  },
  {
    "date": "2026-02-17",
    "kind": "recurring",
    "title": "Recurring run \u00b7 $200 monthly",
    "sub": "Semiconductors $120 \u00b7 S&P 500 $80",
    "amount": "$200.00",
    "flow": "out",
    "details": [
      {
        label: "Semiconductors basket",
        value: "$120.00 \u00b7 60%"
      },
      {
        label: "S&P 500",
        value: "$80.00 \u00b7 40%"
      },
      {
        label: "Every leg routed",
        value: "Yes"
      }
    ],
    "signature": "9eaPjaFCBZ1tmbzNhfupfcab7N4UytZpZbqP2WVWM6xEjDim6cgn"
  },
  {
    "date": "2026-02-08",
    "kind": "buy",
    "title": "Bought S&P 500",
    "sub": "1.505 shares at $664.21 \u00b7 Backed",
    "amount": "$1,000.00",
    "flow": "out",
    "details": [
      {
        label: "Issuer chosen",
        value: "Backed \u00b7 SPYx"
      },
      {
        label: "Price per share",
        value: "$664.21"
      },
      {
        label: "Price impact",
        value: "0.00%",
        tone: "up"
      },
      {
        label: "Ondo would have cost",
        value: "$664.88 per share \u00b7 0.10% impact"
      },
      {
        label: "Fee",
        value: "$2.50"
      }
    ],
    "signature": "gn9C2cXW3RN2BMA63nbuvTk3TpvRNZoGUqhzMC716etCnUBnNb7o"
  },
  {
    "date": "2026-02-01",
    "kind": "interest",
    "title": "Interest paid",
    "sub": "On your stablecoin balance",
    "amount": "$10.66",
    "flow": "in",
    "details": [
      {
        label: "Rate",
        value: "4.1% a year"
      },
      {
        label: "Period",
        value: "February"
      }
    ],
    "signature": "tcu9dmZdtYysgaYRzGCLsGR3aG1apnvBXfJJERKjjTLcudrmuJoo"
  },
  {
    "date": "2026-01-17",
    "kind": "recurring",
    "title": "Recurring run \u00b7 $200 monthly",
    "sub": "Semiconductors $120 \u00b7 S&P 500 $80",
    "amount": "$200.00",
    "flow": "out",
    "details": [
      {
        label: "Semiconductors basket",
        value: "$120.00 \u00b7 60%"
      },
      {
        label: "S&P 500",
        value: "$80.00 \u00b7 40%"
      },
      {
        label: "Every leg routed",
        value: "Yes"
      }
    ],
    "signature": "R9RaQFvtR6dZGyDcu2U9YBLbBRgzPSR2JhxBxu7Pig8bAyKmwC2n"
  },
  {
    "date": "2026-01-01",
    "kind": "interest",
    "title": "Interest paid",
    "sub": "On your stablecoin balance",
    "amount": "$11.67",
    "flow": "in",
    "details": [
      {
        label: "Rate",
        value: "4.1% a year"
      },
      {
        label: "Period",
        value: "January"
      }
    ],
    "signature": "9jduANfG42YGBipQmnyRJuKvkBbibQtC57wHAV1wbikqkhza1m9K"
  },
  {
    "date": "2025-12-17",
    "kind": "recurring",
    "title": "Recurring run \u00b7 $200 monthly",
    "sub": "Semiconductors $120 \u00b7 S&P 500 $80",
    "amount": "$200.00",
    "flow": "out",
    "details": [
      {
        label: "Semiconductors basket",
        value: "$120.00 \u00b7 60%"
      },
      {
        label: "S&P 500",
        value: "$80.00 \u00b7 40%"
      },
      {
        label: "Every leg routed",
        value: "Yes"
      }
    ],
    "signature": "vX6ZsKyCHC9R3zfAZwBUJfkdoPhnVM1vu1fRM4KncRBFZuTMnCyB"
  },
  {
    "date": "2025-12-01",
    "kind": "interest",
    "title": "Interest paid",
    "sub": "On your stablecoin balance",
    "amount": "$12.68",
    "flow": "in",
    "details": [
      {
        label: "Rate",
        value: "4.1% a year"
      },
      {
        label: "Period",
        value: "December"
      }
    ],
    "signature": "vPEEzbMEEp57CFG6SsSnaGDVhsqTsHfAP3ZpvsSHZ3zkj1KoTKy6"
  },
  {
    "date": "2025-11-22",
    "kind": "dividend",
    "title": "Dividend reinvested \u00b7 S&P 500",
    "sub": "Multiplier rose. No cash moved.",
    "amount": "+0.008 shares",
    "flow": null,
    "details": [
      {
        label: "Multiplier before",
        value: "\u00d71.005301"
      },
      {
        label: "Multiplier after",
        value: "\u00d71.005715"
      },
      {
        label: "Shares gained",
        value: "0.008",
        tone: "up"
      },
      {
        label: "US withholding",
        value: "30%",
        tone: "muted"
      }
    ],
    "signature": "Zu1z1x7AkqTNFX77Rg6zKyYGNXDonDjzU7HPiv2huTQN2KjHarRk"
  },
  {
    "date": "2025-11-17",
    "kind": "recurring",
    "title": "Recurring run \u00b7 $200 monthly",
    "sub": "Semiconductors $120 \u00b7 S&P 500 $80",
    "amount": "$200.00",
    "flow": "out",
    "details": [
      {
        label: "Semiconductors basket",
        value: "$120.00 \u00b7 60%"
      },
      {
        label: "S&P 500",
        value: "$80.00 \u00b7 40%"
      },
      {
        label: "Every leg routed",
        value: "Yes"
      }
    ],
    "signature": "B7xZ4RH43uKDAHwexJbCnRpKuC4Bh7DQcPxVZj3zKjHM7a4CKVBh"
  },
  {
    "date": "2025-11-08",
    "kind": "buy",
    "title": "Bought S&P 500",
    "sub": "1.505 shares at $664.21 \u00b7 Backed",
    "amount": "$1,000.00",
    "flow": "out",
    "details": [
      {
        label: "Issuer chosen",
        value: "Backed \u00b7 SPYx"
      },
      {
        label: "Price per share",
        value: "$664.21"
      },
      {
        label: "Price impact",
        value: "0.00%",
        tone: "up"
      },
      {
        label: "Ondo would have cost",
        value: "$664.88 per share \u00b7 0.10% impact"
      },
      {
        label: "Fee",
        value: "$2.50"
      }
    ],
    "signature": "e9uW7SkfAmUCKGns7NqDVkGYjTFtQUCrKTrcQPcKzs2UpHaoJZ3J"
  },
  {
    "date": "2025-11-01",
    "kind": "interest",
    "title": "Interest paid",
    "sub": "On your stablecoin balance",
    "amount": "$13.69",
    "flow": "in",
    "details": [
      {
        label: "Rate",
        value: "4.1% a year"
      },
      {
        label: "Period",
        value: "November"
      }
    ],
    "signature": "f7dyiJEPyESjchXUnEtVgLjem7zwDRWHxv33SMAyhPLJHeNNufjQ"
  },
  {
    "date": "2025-10-17",
    "kind": "recurring",
    "title": "Recurring run \u00b7 $200 monthly",
    "sub": "Semiconductors $120 \u00b7 S&P 500 $80",
    "amount": "$200.00",
    "flow": "out",
    "details": [
      {
        label: "Semiconductors basket",
        value: "$120.00 \u00b7 60%"
      },
      {
        label: "S&P 500",
        value: "$80.00 \u00b7 40%"
      },
      {
        label: "Every leg routed",
        value: "Yes"
      }
    ],
    "signature": "j89jp4J4JfVa1UEtiBaq4KXd4th3GHDirFBSPrG8CfbcCYUDyZjU"
  },
  {
    "date": "2025-10-01",
    "kind": "interest",
    "title": "Interest paid",
    "sub": "On your stablecoin balance",
    "amount": "$9.70",
    "flow": "in",
    "details": [
      {
        label: "Rate",
        value: "4.1% a year"
      },
      {
        label: "Period",
        value: "October"
      }
    ],
    "signature": "udozTW6BxW48irx7TGF2k4fM2TNLNaPcDt6ncYfnKNo6yMzfC2FR"
  }
];
