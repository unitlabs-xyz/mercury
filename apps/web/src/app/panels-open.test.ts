import { describe, expect, it, vi } from "vitest";

// The sheets themselves are not what is tested; only which addresses open one.
vi.mock("./ActionGate", () => ({ ActionGate: () => null }));
vi.mock("./ActivityReceipt", () => ({ ActivityReceipt: () => null }));
vi.mock("./AddCash", () => ({ AddCash: () => null }));
vi.mock("./borrow/BorrowSheet", () => ({ BorrowSheet: () => null }));
vi.mock("./Send", () => ({ Send: () => null }));
vi.mock("./money/EarnSheet", () => ({ EarnSheet: () => null }));
vi.mock("./settings/LinkedWallets", () => ({ LinkedWallets: () => null }));
vi.mock("./move/MoveSheet", () => ({ MoveSheet: () => null }));
const { opensPanel } = await import("./Panels");

describe("opensPanel", () => {
  it("is true for an address that opens a panel, the phone's move link among them", () => {
    expect(opensPanel("?move=1")).toBe(true);
    expect(opensPanel("?send=usdc")).toBe(true);
    expect(opensPanel("?other=1&borrow=repay")).toBe(true);
  });

  it("is false for a plain visit", () => {
    expect(opensPanel("")).toBe(false);
    expect(opensPanel("?utm_source=ios")).toBe(false);
  });
});
