/** Card plans, exactly as specified for this page. */
export type Plan = {
  readonly name: string;
  readonly finish: "basic" | "silver" | "gold" | "platinum";
  readonly fee: string;
  readonly monthlyLimit: string;
  readonly cashback: string;
  readonly concierge: string;
  readonly lounges: string;
  readonly fastTrack: string;
};

export const PLANS: Plan[] = [
  {
    name: "Basic",
    finish: "basic",
    fee: "Free",
    monthlyLimit: "$2,000",
    cashback: "0.5%",
    concierge: "—",
    lounges: "—",
    fastTrack: "—",
  },
  {
    name: "Silver",
    finish: "silver",
    fee: "$99/y",
    monthlyLimit: "$20,000",
    cashback: "1%",
    concierge: "Standard",
    lounges: "1 free visit/year",
    fastTrack: "Standard",
  },
  {
    name: "Gold",
    finish: "gold",
    fee: "$249/y",
    monthlyLimit: "$200,000",
    cashback: "1.5%",
    concierge: "Personal",
    lounges: "4 free visits/year",
    fastTrack: "Priority",
  },
  {
    name: "Platinum",
    finish: "platinum",
    fee: "$999/y",
    monthlyLimit: "$750,000",
    cashback: "2%",
    concierge: "VIP Priority",
    lounges: "Unlimited",
    fastTrack: "VIP",
  },
];

export const PLAN_ROWS = [
  { label: "Annual fee", key: "fee" },
  { label: "Monthly limit", key: "monthlyLimit" },
  { label: "Credit mode cashback", key: "cashback" },
  { label: "Concierge", key: "concierge" },
  { label: "Airport lounges", key: "lounges" },
  { label: "Fast track", key: "fastTrack" },
] as const;

/** What selling costs you, against what borrowing costs you. */
export const PLAYBOOK = [
  { label: "Tax", sell: "Capital gains event", borrow: "No disposal, no gain" },
  { label: "Your shares", sell: "Gone", borrow: "Still yours" },
  { label: "Future upside", sell: "Forfeited", borrow: "Still yours" },
  { label: "Dividends", sell: "Stop arriving", borrow: "Keep arriving" },
  { label: "Custody", sell: "Handed to a broker", borrow: "Never leaves your wallet" },
];

export const STEPS = [
  {
    n: "01",
    title: "Sign up in the app",
    body: "Download, register, verify in minutes. Your virtual card activates instantly.",
  },
  {
    n: "02",
    title: "Build a portfolio",
    body: "Buy shares of real companies and funds. They stay yours and stay invested.",
  },
  {
    n: "03",
    title: "Tap on your terms",
    body: "Choose cash or credit at the point of sale. Switch whenever you like.",
  },
];

export const CASH_MODE = [
  "Spend the cash sitting in your account",
  "No hidden spread, no FX games",
  "Settles instantly from your balance",
];

export const CREDIT_MODE = [
  "Borrow against your Nvidia, Apple or S&P 500 at the moment you tap",
  "Your shares stay invested",
  "Your position stays whole",
];

/**
 * Third-party marks, painted from the palette with a CSS mask so the row reads
 * as one family. FYEO sets its name as spaced capitals rather than a drawn
 * mark, so it is typeset rather than masked.
 */
export type Partner = {
  readonly name: string;
  readonly src?: string;
  readonly w: number;
  readonly h: number;
};

export const PARTNERS: Partner[] = [
  { name: "Solana", src: "/logos/solana-wordmark.svg", w: 108, h: 16 },
  { name: "Helius", src: "/logos/helius.svg", w: 90, h: 19 },
  { name: "Kamino", src: "/logos/kamino.svg", w: 85, h: 20 },
  { name: "FYEO", w: 62, h: 20 },
  { name: "MoonPay", src: "/logos/moonpay.svg", w: 93, h: 19 },
  { name: "Visa", src: "/logos/visa.svg", w: 59, h: 19 },
];
