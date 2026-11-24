import { describe, expect, it } from "vitest";
import type { Portfolio, PortfolioSummary } from "@mercury/types";
import {
  calculatingNote,
  linkedCount,
  linkedLine,
  walletName,
  type AccountWallet,
  sharePct,
  summaryLines,
  walletCards,
  walletSeries,
  walletStatus,
  liquidationLine,
  manageOnWebUrl,
  moveFromSearch,
  moveOnWebUrl,
  pledgedStocks,
  walletFromSearch,
  alsoHoldLine,
  heldElsewhere,
  linkOnWebUrl,
  estimateLine,
  estimateMark,
  updatedAgo,
  walletLoans,
  walletSlices,
  HEALTH,
  type WalletCard,
} from "./wallets.js";
import { shortAddress } from "./receipt.js";
import type { Borrow, BorrowRow } from "./borrow.js";

const PHANTOM = "7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs";

const wallet = (over: Partial<AccountWallet> = {}): AccountWallet => ({
  id: "w1",
  address: PHANTOM,
  kind: "external",
  isPrimary: false,
  label: null,
  linkedAt: "2026-11-21T10:00:00.000Z",
  ...over,
});

describe("shortAddress", () => {
  it("keeps the first and last four, as a wallet shows it", () => {
    expect(shortAddress(PHANTOM)).toBe("7EYn…awMs");
  });
  it("leaves a short string whole", () => expect(shortAddress("abc")).toBe("abc"));
});

describe("walletName", () => {
  it("calls the Mercury wallet Mercury, whatever else it holds", () => {
    expect(walletName(wallet({ isPrimary: true, label: "ignored" }))).toBe("Mercury");
  });
  it("uses a linked wallet's name, or its short address without one", () => {
    expect(walletName(wallet({ label: "Phantom main" }))).toBe("Phantom main");
    expect(walletName(wallet())).toBe("7EYn…awMs");
  });
});

describe("linkedCount and linkedLine", () => {
  const account = {
    wallets: [wallet({ isPrimary: true, kind: "privy_embedded" }), wallet(), wallet()],
    limit: 5,
  };
  it("counts linked wallets, not the Mercury wallet", () => expect(linkedCount(account.wallets)).toBe(2));
  it("says how many of how many", () => expect(linkedLine(account)).toBe("2 of 5 linked"));
  it("reads zero with only the Mercury wallet", () =>
    expect(linkedLine({ wallets: [wallet({ isPrimary: true })], limit: 5 })).toBe("0 of 5 linked"));
});

const summary = (over: Partial<PortfolioSummary> = {}): PortfolioSummary => ({
  wallets: [
    {
      id: "mercury",
      address: "Mercury1111111111111111111111111111111111",
      isPrimary: true,
      label: null,
      valueUsd: "500",
      asOf: "2026-11-23T09:00:00.000Z",
      debtUsd: "0",
      loanHealth: null,
      history: "ready",
    },
    {
      id: "phantom",
      address: "7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs",
      isPrimary: false,
      label: null,
      valueUsd: "750",
      asOf: "2026-11-23T09:00:00.000Z",
      debtUsd: "100",
      loanHealth: "margin_call",
      history: "calculating",
    },
  ],
  netWorthUsd: "1250",
  asOf: "2026-11-23T09:00:00.000Z",
  pnl: {
    totalUsd: "125",
    unrealisedUsd: "100",
    realisedUsd: "25",
    returnPct: "33.333",
    estimatedCostUsd: "0",
  },
  income: { totalUsd: "15.75", earnUsd: "12.5", dividendsUsd: "3.25" },
  loanInterestUsd: "3.5",
  calculating: 1,
  ...over,
});

describe("summaryLines", () => {
  it("says every line in dollars, signed where the direction is the point", () => {
    const l = summaryLines(summary());
    expect(l.netWorth).toBe("$1,250.00");
    expect(l.pnl).toBe("+$125.00 (+33.3%)");
    expect(l.pnlSub).toBeNull();
    expect(l.income).toBe("+$15.75");
    expect(l.incomeSub).toBe("Earn $12.50 · Dividends $3.25");
    expect(l.loanInterest).toBe("−$3.50");
    expect(l.calculating).toBe("1 wallet calculating");
  });

  it("marks P&L with `~` when any cost is estimated, and says how much", () => {
    const l = summaryLines(summary({ pnl: { ...summary().pnl, estimatedCostUsd: "9100" } }));
    expect(l.pnl.startsWith("~+$125.00")).toBe(true);
    expect(l.pnlSub).toBe("$9,100 of cost estimated");
  });

  it("shows a loss as one", () => {
    const l = summaryLines(summary({ pnl: { ...summary().pnl, totalUsd: "-40", returnPct: "-5" } }));
    expect(l.pnl).toBe("−$40.00 (−5.0%)");
  });

  it("says Calculating… rather than $0 while every wallet is still being read", () => {
    const l = summaryLines(summary({ calculating: 2 }));
    expect([l.pnl, l.income, l.loanInterest]).toEqual(["Calculating…", "Calculating…", "Calculating…"]);
    expect(l.calculating).toBe("2 wallets calculating");
  });

  it("says no interest plainly", () => {
    expect(summaryLines(summary({ loanInterestUsd: "0" })).loanInterest).toBe("$0.00");
  });
});

describe("calculatingNote", () => {
  it("says nothing when every wallet is read", () => expect(calculatingNote(0)).toBeNull());
});

describe("walletCards", () => {
  const live = {
    wallets: [{ walletId: "mercury", totalValueUsd: "512", debtUsd: "0", changeUsd: "12", changePct: "2.4" }],
  } as unknown as Portfolio;

  it("shows the live value where the live read has it, and the hourly reading, dated, where not", () => {
    const [mercury, phantom] = walletCards(summary(), live);
    expect(mercury).toMatchObject({
      name: "Mercury",
      valueUsd: "512",
      changePct: "2.4",
      isLive: true,
      asOf: null,
    });
    expect(phantom).toMatchObject({
      name: "7EYn…awMs",
      valueUsd: "750",
      changePct: null,
      isLive: false,
      asOf: "2026-11-23T09:00:00.000Z",
      calculating: true,
    });
  });

  it("badges a loan by how worried to be", () => {
    const [mercury, phantom] = walletCards(summary(), undefined);
    expect(mercury!.loan).toBeNull();
    expect(phantom!.loan).toEqual({ label: "Margin call", tone: "down" });
  });
});

describe("walletSeries", () => {
  it("gives the Mercury wallet the first series and linked wallets the next, in linked order", () => {
    expect(walletSeries({ isPrimary: true }, 0)).toBe(1);
    expect(walletSeries({ isPrimary: false }, 0)).toBe(2);
    expect(walletSeries({ isPrimary: false }, 3)).toBe(5);
  });

  it("gives no series past the fifth, drawn grey, never a made-up hue", () => {
    expect(walletSeries({ isPrimary: false }, 4)).toBe(null);
    expect(walletSeries({ isPrimary: false }, 9)).toBe(null);
  });
});

describe("walletSlices", () => {
  const card = (over: Partial<WalletCard>): WalletCard => ({
    id: "x",
    name: "x",
    isPrimary: false,
    valueUsd: "0",
    changePct: null,
    isLive: true,
    asOf: null,
    loan: null,
    debtUsd: "0",
    calculating: false,
    ...over,
  });

  it("gives each wallet its share of everything held", () => {
    const out = walletSlices([
      card({ id: "m", isPrimary: true, valueUsd: "750" }),
      card({ id: "a", valueUsd: "250" }),
    ]);
    expect(out.map((s) => [s.id, s.share, s.value, s.series])).toEqual([
      ["m", 0.75, 750, 1],
      ["a", 0.25, 250, 2],
    ]);
  });

  it("colours linked wallets by their own order, whatever the Mercury wallet's place", () => {
    const out = walletSlices([card({ id: "a" }), card({ id: "m", isPrimary: true }), card({ id: "b" })]);
    expect(out.map((s) => s.series)).toEqual([2, 1, 3]);
  });

  it("has no share for a wallet not read yet, and leaves it out of the whole", () => {
    const out = walletSlices([
      card({ id: "m", isPrimary: true, valueUsd: "100" }),
      card({ id: "new", valueUsd: null }),
    ]);
    expect(out.map((s) => s.share)).toEqual([1, null]);
    expect(out[1]?.value).toBe(0);
  });

  it("gives a wallet that owes more than it holds none of the ring", () => {
    const out = walletSlices([
      card({ id: "m", isPrimary: true, valueUsd: "100" }),
      card({ id: "a", valueUsd: "-40" }),
    ]);
    expect(out.map((s) => s.share)).toEqual([1, 0]);
  });

  it("shares nothing out when nothing is held", () => {
    expect(walletSlices([card({ isPrimary: true, valueUsd: "0" })])[0]?.share).toBe(0);
  });
});

describe("sharePct", () => {
  it("rounds to a whole percent", () => {
    expect(sharePct(0.3449)).toBe("34%");
    expect(sharePct(1)).toBe("100%");
    expect(sharePct(0)).toBe("0%");
  });

  it("says <1% for a sliver rather than a 0% that hides it", () => {
    expect(sharePct(0.004)).toBe("<1%");
  });

  it("says — before the wallet is read", () => {
    expect(sharePct(null)).toBe("—");
  });
});

describe("walletLoans", () => {
  const card = (over: Partial<WalletCard>): WalletCard => ({
    id: "x",
    name: "x",
    isPrimary: false,
    valueUsd: "100",
    changePct: null,
    isLive: true,
    asOf: null,
    loan: null,
    debtUsd: "0",
    calculating: false,
    ...over,
  });

  it("lists only the wallets that owe something", () => {
    const out = walletLoans([
      card({ id: "m", isPrimary: true, debtUsd: "2500", loan: HEALTH.healthy }),
      card({ id: "a", debtUsd: "0" }),
    ]);
    expect(out.map((c) => c.id)).toEqual(["m"]);
  });

  it("puts the worst loan first, then the larger, whatever the wallet order", () => {
    const out = walletLoans([
      card({ id: "m", isPrimary: true, debtUsd: "2500", loan: HEALTH.healthy }),
      card({ id: "small", debtUsd: "100", loan: HEALTH.healthy }),
      card({ id: "call", debtUsd: "1500", loan: HEALTH.margin_call }),
      card({ id: "over", debtUsd: "50", loan: HEALTH.over_limit }),
    ]);
    expect(out.map((c) => c.id)).toEqual(["call", "over", "m", "small"]);
  });

  it("keeps the wallets' order between equal loans", () => {
    const out = walletLoans([
      card({ id: "a", debtUsd: "10", loan: HEALTH.healthy }),
      card({ id: "b", debtUsd: "10", loan: HEALTH.healthy }),
    ]);
    expect(out.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("has none when no wallet owes anything", () => {
    expect(walletLoans([card({}), card({ id: "y" })])).toEqual([]);
  });
});

describe("updatedAgo", () => {
  const now = Date.parse("2026-11-24T12:00:00.000Z");
  it("says just now under a minute", () => {
    expect(updatedAgo("2026-11-24T11:59:30.000Z", now)).toBe("just now");
  });
  it("counts minutes within the hour, then hours within the day", () => {
    expect(updatedAgo("2026-11-24T11:22:00.000Z", now)).toBe("38m ago");
    expect(updatedAgo("2026-11-24T09:00:00.000Z", now)).toBe("3h ago");
  });
  it("gives the date after a day", () => {
    expect(updatedAgo("2026-11-20T09:00:00.000Z", now)).toBe("on 20 Nov");
  });
  it("says nothing for a time it cannot read", () => {
    expect(updatedAgo("not a time", now)).toBe("");
  });
});

describe("walletStatus", () => {
  const now = Date.parse("2026-11-24T12:00:00.000Z");
  const card = (over: Partial<WalletCard>): WalletCard => ({
    id: "x",
    name: "x",
    isPrimary: false,
    valueUsd: "100",
    changePct: null,
    isLive: true,
    asOf: null,
    loan: null,
    debtUsd: "0",
    calculating: false,
    ...over,
  });

  it("says a wallet with no reading yet is being read, whatever else", () => {
    expect(walletStatus(card({ valueUsd: null, calculating: true }), now)).toBe("Reading this wallet…");
  });
  it("puts P&L calculating before anything about where the figure came from", () => {
    expect(walletStatus(card({ calculating: true }), now)).toBe("P&L calculating…");
  });
  it("names the wallet when its figures are live", () => {
    expect(walletStatus(card({ isPrimary: true }), now)).toBe("Your Mercury wallet");
    expect(walletStatus(card({}), now)).toBe("Linked wallet");
  });
  it("dates an hourly reading when the live one is not there", () => {
    expect(walletStatus(card({ isLive: false, asOf: "2026-11-24T11:22:00.000Z" }), now)).toBe(
      "Updated 38m ago",
    );
    expect(walletStatus(card({ isLive: false, asOf: null }), now)).toBe("");
  });
});

describe("moveOnWebUrl and moveFromSearch", () => {
  it("opens the web app on the wallet with the move open", () => {
    expect(moveOnWebUrl("https://beta.trymercury.xyz/", "w-1")).toBe(
      "https://beta.trymercury.xyz/?wallet=w-1&move=1",
    );
    expect(walletFromSearch("?wallet=w-1&move=1")).toBe("w-1");
  });

  it("asks for the move only when the link says so", () => {
    expect(moveFromSearch("?wallet=w-1&move=1")).toBe(true);
    expect(moveFromSearch("?wallet=w-1")).toBe(false);
    expect(moveFromSearch("?move=yes")).toBe(false);
  });
});

describe("manageOnWebUrl and walletFromSearch", () => {
  it("opens the web app on the wallet, whatever the base ends with", () => {
    expect(manageOnWebUrl("https://beta.trymercury.xyz", "w-1")).toBe(
      "https://beta.trymercury.xyz/?wallet=w-1",
    );
    expect(manageOnWebUrl("https://beta.trymercury.xyz/", "w-1")).toBe(
      "https://beta.trymercury.xyz/?wallet=w-1",
    );
  });

  it("encodes the id, so a link cannot carry anything else", () => {
    expect(manageOnWebUrl("https://x.test", "a&b=c")).toBe("https://x.test/?wallet=a%26b%3Dc");
  });

  it("reads the wallet back from the address, and nothing when it names none", () => {
    expect(walletFromSearch("?wallet=w-1")).toBe("w-1");
    expect(walletFromSearch("?other=1&wallet=a%26b%3Dc")).toBe("a&b=c");
    expect(walletFromSearch("?wallet=")).toBeNull();
    expect(walletFromSearch("?wallet=%20%20")).toBeNull();
    expect(walletFromSearch("")).toBeNull();
  });
});

describe("pledgedStocks and liquidationLine", () => {
  const row = (over: Partial<BorrowRow>): BorrowRow =>
    ({
      ticker: "TSLA",
      isStock: true,
      depositedUsd: 0,
      liquidationPrice: null,
      liquidationDistance: null,
      ...over,
    }) as BorrowRow;

  it("lists the pledged stocks, largest first, and leaves out cash and what is not pledged", () => {
    const b = {
      collateral: [
        row({ ticker: "NVDA", depositedUsd: 400 }),
        row({ ticker: "TSLA", depositedUsd: 2100 }),
        row({ ticker: "USDC", isStock: false, depositedUsd: 900 }),
        row({ ticker: "AAPL", depositedUsd: 0 }),
      ],
    } as unknown as Borrow;
    expect(pledgedStocks(b).map((r) => r.ticker)).toEqual(["TSLA", "NVDA"]);
  });

  it("says where Kamino starts selling and how far off it is", () => {
    expect(liquidationLine(row({ liquidationPrice: 319.4, liquidationDistance: 0.094 }))).toBe(
      "Kamino sells below $319.40 · 9% away",
    );
  });

  it("never says a negative distance once the price is through it", () => {
    expect(liquidationLine(row({ liquidationPrice: 300, liquidationDistance: -0.02 }))).toBe(
      "Kamino sells below $300.00 · 0% away",
    );
  });

  it("leaves the distance off when it is not known, and says why there is no price", () => {
    expect(liquidationLine(row({ liquidationPrice: 300 }))).toBe("Kamino sells below $300.00");
    expect(liquidationLine(row({}))).toBe("No liquidation price while nothing is owed");
  });
});

describe("linkOnWebUrl", () => {
  it("opens web's linked wallets panel", () => {
    expect(linkOnWebUrl("https://beta.trymercury.xyz/")).toBe(
      "https://beta.trymercury.xyz/?settings=wallets",
    );
  });
});

describe("heldElsewhere and alsoHoldLine", () => {
  const holding = (ticker: string, shares: string, valueUsd = "100") => ({ ticker, shares, valueUsd });
  const wallets = [
    { id: "p", name: "Phantom main", holdings: [holding("TSLA", "2.1", "740.25"), holding("NVDA", "1")] },
    { id: "n", name: "9xQe…3Kp4", holdings: [holding("TSLA", "0.5")] },
    { id: "z", name: "Zero", holdings: [holding("TSLA", "0")] },
    { id: "u", name: "Unread", holdings: undefined },
  ];

  it("finds each linked wallet's shares of the stock, in wallet order, leaving out none and unread", () => {
    expect(heldElsewhere("TSLA", wallets)).toEqual([
      { walletId: "p", name: "Phantom main", shares: 2.1, valueUsd: 740.25 },
      { walletId: "n", name: "9xQe…3Kp4", shares: 0.5, valueUsd: 100 },
    ]);
    expect(heldElsewhere("AAPL", wallets)).toEqual([]);
  });

  it("says it as the spec does, under the Mercury wallet's position", () => {
    expect(alsoHoldLine(heldElsewhere("NVDA", wallets), true)).toBe("You also hold 1 in Phantom main");
    expect(alsoHoldLine(heldElsewhere("TSLA", wallets), true)).toBe(
      "You also hold 2.1 in Phantom main and 0.5 in 9xQe…3Kp4",
    );
  });

  it("drops 'also' when the Mercury wallet holds none, and lists three with commas", () => {
    const three = [
      { walletId: "a", name: "A", shares: 1.23456, valueUsd: 1 },
      { walletId: "b", name: "B", shares: 2, valueUsd: 1 },
      { walletId: "c", name: "C", shares: 0.0004, valueUsd: 1 },
    ];
    expect(alsoHoldLine(three, false)).toBe("You hold 1.235 in A, 2 in B and <0.001 in C");
  });

  it("says nothing when no linked wallet holds it", () => {
    expect(alsoHoldLine([], true)).toBeNull();
  });
});

describe("estimateLine and estimateMark", () => {
  it("says where an estimated cost came from, and marks it", () => {
    const h = { estimatedCostUsd: "120", estimateSource: "link_day_price" as const };
    expect(estimateLine(h)).toBe("Estimated from the price when you linked this wallet");
    expect(estimateMark(h)).toBe("~");
    expect(estimateLine({ estimatedCostUsd: "1", estimateSource: "sol_price" })).toBe(
      "Estimated from what SOL was worth when it was swapped in",
    );
    expect(estimateLine({ estimatedCostUsd: "1", estimateSource: "own_wallet" })).toBe(
      "The cost it had in your other wallet",
    );
  });

  it("still says so when the server named no source", () => {
    expect(estimateLine({ estimatedCostUsd: "1", estimateSource: null })).toBe(
      "Part of this cost is estimated",
    );
  });

  it("says nothing, and marks nothing, for an exact cost or an older server", () => {
    expect(estimateLine({ estimatedCostUsd: "0", estimateSource: "market_price" })).toBeNull();
    expect(estimateLine({})).toBeNull();
    expect(estimateMark({ estimatedCostUsd: "0" })).toBe("");
    expect(estimateMark({})).toBe("");
  });
});
