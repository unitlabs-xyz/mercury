import type { ActivityItem } from "./activity-map.js";
import { interestText } from "./borrow.js";
import { pct, usd } from "./format.js";

/**
 * `GET /v1/activity/:id`'s detail, as both clients receive it: what the record
 * behind a feed row says about it. Mirrors `services/api/src/portfolio/receipt.ts`,
 * where each field is explained. Null fields are figures the record does not
 * hold, and their lines are left out rather than guessed.
 */
export type ReceiptDetail =
  | {
      readonly type: "trade";
      readonly side: "buy" | "sell";
      readonly ticker: string | null;
      readonly shares: string | null;
      readonly pricePerShare: string | null;
      readonly referencePricePerShare: string | null;
      readonly sharesUsd: string | null;
      readonly mercuryFeeUsd: string | null;
      readonly networkFeeUsd: string | null;
      readonly realisedPnlUsd: string | null;
      readonly issuer: "backed" | "ondo" | null;
      readonly route: readonly string[];
    }
  | {
      readonly type: "loan";
      readonly legs: readonly {
        readonly kind: "borrow" | "repay" | "pledge" | "unpledge";
        readonly usdAmount: string | null;
        readonly ticker: string | null;
        readonly tokens: string | null;
      }[];
      readonly borrowApy: string | null;
      readonly debtAfterUsd: string;
      readonly collateralAfterUsd: string;
      readonly openedAccount: boolean;
      readonly interestPaidUsd: string | null;
    }
  | {
      readonly type: "deposit";
      readonly fromChain: string;
      readonly fromToken: string;
      readonly mercuryFeeUsd: string | null;
      readonly sourceTx: string | null;
    }
  | {
      readonly type: "transfer";
      readonly counterparty: string | null;
      readonly accountSetupUsd: string | null;
    };

export interface ActivityReceipt {
  readonly item: ActivityItem;
  readonly detail: ReceiptDetail | null;
}

/** One row of a receipt: the label on the left, the figure on the right. */
export interface ReceiptLine {
  readonly label: string;
  readonly value: string;
  readonly tip?: string;
  readonly tone?: "up" | "down";
  /** The full text behind a shortened value, for copying: an address. */
  readonly copy?: string;
}

/** One side of a swap, as the order review draws it: a label, the figure, its unit. */
export interface ReceiptWell {
  readonly label: string;
  readonly value: string;
  readonly unit: string;
}

/** Somewhere a receipt can take you next. Each client maps these to its own routes. */
export type ReceiptAction =
  | { readonly kind: "stock"; readonly ticker: string; readonly label: string }
  | { readonly kind: "borrow"; readonly tab: "borrow" | "repay" | "pledge"; readonly label: string };

/**
 * A feed row, opened: everything a receipt screen draws, in the order it draws
 * it. What was swapped first, then the facts, then the parts of the money with
 * their total under a rule — rows that add up, so nobody has to do the sum to
 * trust it — then what the event left behind.
 */
export interface Receipt {
  readonly swap: { readonly from: ReceiptWell; readonly to: ReceiptWell } | null;
  readonly facts: readonly ReceiptLine[];
  readonly parts: readonly ReceiptLine[];
  readonly total: ReceiptLine | null;
  readonly after: readonly ReceiptLine[];
  /** Who issued the token that traded, and the venues it went through. */
  readonly route: { readonly issuer: "backed" | "ondo"; readonly venues: readonly string[] } | null;
  /** The row's own words, when nothing above already says them. */
  readonly note: string | null;
  /** Each transaction behind the event, on its own chain's explorer. */
  readonly links: readonly { readonly label: string; readonly text: string; readonly href: string }[];
  readonly actions: readonly ReceiptAction[];
}

const n = (v: string | null | undefined): number | null => {
  const x = v === null || v === undefined ? NaN : Number(v);
  return Number.isFinite(x) ? x : null;
};

/** "0.044619", never "4.4619e-2" and never more than six places. */
const qty = (v: string | number): string => {
  const x = Number(v);
  return Number.isFinite(x) ? String(Number(x.toFixed(6))) : String(v);
};

/** "FMVH…2C5W": enough of an address to recognise, with the whole of it a copy away. */
export const shortAddress = (a: string): string => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

const minus = (v: number) => `−${usd(v)}`;

/** "15 Oct 2026, 14:32", in the reader's own time zone unless one is named. */
export const whenText = (iso: string, timeZone?: string): string =>
  new Date(iso)
    .toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      ...(timeZone === undefined ? {} : { timeZone }),
    })
    .replace(" at ", ", ");

const premiumTip = (price: number | null, reference: number | null): string | undefined => {
  if (price === null || reference === null || reference <= 0) return undefined;
  const premium = (price / reference - 1) * 100;
  return Math.abs(premium) < 0.01
    ? "In line with the real share price."
    : `${Math.abs(premium).toFixed(2)}% ${premium > 0 ? "above" : "below"} the real share price.`;
};

const empty: Omit<Receipt, "links" | "note"> = {
  swap: null,
  facts: [],
  parts: [],
  total: null,
  after: [],
  route: null,
  actions: [],
};

type Body = Partial<Omit<Receipt, "links">>;

const trade = (i: ActivityItem, d: Extract<ReceiptDetail, { type: "trade" }>): Body => {
  const selling = d.side === "sell";
  const cash = n(i.amountUsd);
  const shares = d.shares === null ? null : qty(d.shares);
  const mercury = n(d.mercuryFeeUsd) ?? 0;
  const network = n(d.networkFeeUsd) ?? 0;

  const parts: ReceiptLine[] = [];
  const sharesUsd = n(d.sharesUsd);
  if (sharesUsd !== null && mercury + network > 0) {
    parts.push({ label: "Subtotal", value: usd(sharesUsd) });
    if (mercury > 0)
      parts.push({
        label: "Mercury fee",
        value: selling ? minus(mercury) : usd(mercury),
        tip: selling
          ? "Mercury's fee on the sale, taken from what it made."
          : "Mercury's fee on the trade, taken from the amount.",
      });
    if (network > 0)
      parts.push({
        label: "Network fee",
        value: selling ? minus(network) : usd(network),
        tip: selling
          ? "Covers sending the dollars to your wallet."
          : "Covers sending the trade, and opening your account for this stock the first time you buy it.",
      });
  }

  const pnl = n(d.realisedPnlUsd);
  const tip = premiumTip(n(d.pricePerShare), n(d.referencePricePerShare));
  return {
    swap:
      cash === null || shares === null
        ? null
        : selling
          ? {
              from: { label: "You sold", value: shares, unit: "shares" },
              to: { label: "You received", value: usd(cash), unit: "USD" },
            }
          : {
              from: { label: "You paid", value: usd(cash), unit: "USD" },
              to: { label: "You received", value: shares, unit: "shares" },
            },
    facts:
      d.pricePerShare === null
        ? []
        : [{ label: "Price per share", value: usd(d.pricePerShare), ...(tip === undefined ? {} : { tip }) }],
    parts,
    total:
      parts.length === 0 || cash === null
        ? null
        : { label: selling ? "Total received" : "Total", value: usd(cash) },
    after:
      pnl === null
        ? []
        : [
            {
              label: pnl < 0 ? "Realised loss" : "Realised gain",
              value: usd(Math.abs(pnl)),
              tone: pnl < 0 ? "down" : "up",
            },
          ],
    route: d.issuer === null ? null : { issuer: d.issuer, venues: d.route },
    actions: d.ticker === null ? [] : [{ kind: "stock", ticker: d.ticker, label: `View ${d.ticker}` }],
    // The subtitle was these same figures in a line; the rows say them now.
    note: null,
  };
};

const loan = (d: Extract<ReceiptDetail, { type: "loan" }>): Body => {
  const leg = (kind: string) => d.legs.find((l) => l.kind === kind);
  const pledge = leg("pledge");
  const borrow = leg("borrow");
  const repay = leg("repay");
  const unpledge = leg("unpledge");
  const debt = n(d.debtAfterUsd) ?? 0;
  const collateral = n(d.collateralAfterUsd) ?? 0;

  const facts: ReceiptLine[] = [];
  if (pledge && !borrow)
    facts.push({ label: "Collateral added", value: `${pledge.tokens ?? "—"} ${pledge.ticker ?? ""}`.trim() });
  if (unpledge)
    facts.push({
      label: "Collateral withdrawn",
      value:
        unpledge.tokens === null
          ? `All ${unpledge.ticker ?? "stock"}`
          : `${unpledge.tokens} ${unpledge.ticker ?? ""}`.trim(),
    });
  const apy = n(d.borrowApy);
  if (borrow && apy !== null)
    facts.push({
      label: "Interest rate",
      value: `${pct(apy * 100, 1)} a year`,
      tip: "Kamino's rate when this landed. It moves with demand, so today's can differ.",
    });
  if (d.openedAccount)
    facts.push({
      label: "Account setup",
      value: "Covered by Mercury",
      tone: "up",
      tip: "Opening your borrowing account takes a one-time network deposit. Mercury paid it.",
    });

  // Closing a loan is when its interest is paid, so that is where it is shown.
  const repaid = n(repay?.usdAmount);
  const interest = n(d.interestPaidUsd);
  const parts: ReceiptLine[] =
    repaid !== null && interest !== null && interest > 0
      ? [
          { label: "Principal", value: usd(repaid - interest) },
          {
            label: "Interest",
            value: interestText(interest),
            tip: "What the loan cost, paid when it closed.",
          },
        ]
      : [];

  const after: ReceiptLine[] = [
    {
      label: "Loan balance",
      value: debt <= 0 ? "Nothing owed" : usd(debt),
      tip: "Straight after this transaction.",
    },
    {
      label: "Collateral value",
      value: usd(collateral),
      tip: "Straight after this transaction, at Kamino's prices.",
    },
  ];
  if (debt > 0 && collateral > 0)
    after.push({
      label: "Loan-to-value",
      value: pct((debt / collateral) * 100, 0),
      tip: "What you owe, over what your collateral is worth.",
    });

  const borrowed = n(borrow?.usdAmount);
  return {
    swap:
      pledge && borrowed !== null
        ? {
            from: { label: "Collateral", value: pledge.tokens ?? "—", unit: pledge.ticker ?? "" },
            to: { label: "Borrowed", value: usd(borrowed), unit: "USDC" },
          }
        : null,
    facts,
    parts,
    total: parts.length === 0 || repaid === null ? null : { label: "Total repaid", value: usd(repaid) },
    after,
    actions: [{ kind: "borrow", tab: "borrow", label: "Manage loan" }],
    note: null,
  };
};

const deposit = (d: Extract<ReceiptDetail, { type: "deposit" }>): Body => {
  const fee = n(d.mercuryFeeUsd);
  return {
    note: null,
    facts: [
      { label: "From", value: `${d.fromToken} on ${d.fromChain}` },
      ...(fee === null || fee <= 0
        ? []
        : [
            {
              label: "Deposit fee",
              value: usd(fee),
              tip: "Mercury's fee on cash from another chain. It came out before the cash arrived.",
            },
          ]),
    ],
  };
};

const transfer = (i: ActivityItem, d: Extract<ReceiptDetail, { type: "transfer" }>): Body => {
  const out = i.kind === "transfer_out";
  const sent = n(i.amountUsd);
  const setup = n(d.accountSetupUsd);
  const parts: ReceiptLine[] =
    out && sent !== null && setup !== null && setup > 0
      ? [
          { label: "Sent", value: usd(sent) },
          {
            label: "Recipient account setup",
            value: usd(setup),
            tip: "Their wallet had no USDC account yet. Opening one is a one-time network deposit, and the sender pays it.",
          },
        ]
      : [];
  return {
    facts:
      d.counterparty === null
        ? []
        : [{ label: out ? "To" : "From", value: shortAddress(d.counterparty), copy: d.counterparty }],
    parts,
    total:
      parts.length === 0 || sent === null || setup === null
        ? null
        : { label: "Total", value: usd(sent + setup) },
    // The subtitle was this same charge in words; the sum says it now.
    ...(parts.length > 0 ? { note: null } : {}),
  };
};

/** A warning with nothing behind it but the way out. */
const alert = (): Body => ({
  actions: [
    { kind: "borrow", tab: "repay", label: "Repay" },
    { kind: "borrow", tab: "pledge", label: "Add collateral" },
  ],
});

/**
 * A feed row and its record, as a receipt.
 *
 * `detail` is null before the receipt arrives, and for a row with nothing
 * behind it — a dividend, a loan warning. Then the row's own words are the
 * receipt, which is what the expanded row used to show.
 */
export const receiptOf = (item: ActivityItem, detail: ReceiptDetail | null): Receipt => {
  const body: Body =
    detail?.type === "trade"
      ? trade(item, detail)
      : detail?.type === "loan"
        ? loan(detail)
        : detail?.type === "deposit"
          ? deposit(detail)
          : detail?.type === "transfer"
            ? transfer(item, detail)
            : item.kind === "loan_alert"
              ? alert()
              : {};

  const links: Receipt["links"][number][] = [];
  if (item.txSignature)
    links.push({
      label: "Solana",
      text: item.txSignature,
      href: `https://solscan.io/tx/${item.txSignature}`,
    });
  if (detail?.type === "deposit" && detail.sourceTx)
    links.push({
      label: detail.fromChain,
      text: detail.sourceTx,
      href: `https://relay.link/transaction/${encodeURIComponent(detail.sourceTx)}`,
    });

  return {
    ...empty,
    note: item.subtitle && item.subtitle.length > 0 ? item.subtitle : null,
    ...body,
    links,
  };
};
