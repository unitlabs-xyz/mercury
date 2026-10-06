import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { EnrollmentRail, EnrollmentSheet, FundingSheet } from "./Ticket";

const base = {
  name: "Magnificent Seven",
  assetCount: 7,
  busy: false,
  signedIn: true,
  onReview: () => undefined,
};

describe("basket enrollment rail", () => {
  it("offers enrollment to a signed-in owner without a portfolio", () => {
    const html = renderToStaticMarkup(<EnrollmentRail {...base} portfolio={null} />);
    expect(html).toContain("Enroll in Magnificent Seven");
    expect(html).toContain("Sign to create your own Glider smart account");
    expect(html).toContain("No USDC is invested during enrollment; network fees may apply.");
    expect(html).toContain("Review enrollment");
  });

  it("shows funding, not another enrollment, for an enrolled owner", () => {
    const html = renderToStaticMarkup(
      <EnrollmentRail {...base} portfolio={{ portfolioId: "portfolio-1", smartAccounts: [] }} />,
    );
    expect(html).toContain("Fund Magnificent Seven");
    expect(html).toContain("Fund with USDC");
    expect(html).not.toContain("Review enrollment");
    expect(html).not.toContain(' disabled=""');
  });
});

it("reviews the exact USDC transfer destination before wallet signing", () => {
  const html = renderToStaticMarkup(
    <FundingSheet
      open
      name="Magnificent Seven"
      amount="12.50"
      onAmount={() => undefined}
      cash={20}
      portfolio={{
        portfolioId: "portfolio-1",
        ownerAccountId: "solana:owner",
        strategyId: "strategy-1",
        smartAccounts: [{ accountId: "solana:mainnet:VaultAddress" }],
      }}
      review
      busy={false}
      walletReady
      receipt={null}
      onReview={() => undefined}
      onBack={() => undefined}
      onConfirm={() => undefined}
      onClose={() => undefined}
    />,
  );
  expect(html).toContain("12.50 USDC");
  expect(html).toContain("VaultAddress");
  expect(html).toContain("Source wallet");
  expect(html).toContain("SOL network fee");
  expect(html).toContain("Amount is within your USDC balance.");
  expect(html).toContain("Sign and send USDC");
});

it("blocks a basket transfer above wallet USDC and offers Add cash", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <FundingSheet
        open
        name="Magnificent Seven"
        amount="12.50"
        onAmount={() => undefined}
        cash={5}
        portfolio={{
          portfolioId: "portfolio-1",
          ownerAccountId: "solana:owner",
          strategyId: "strategy-1",
          smartAccounts: [{ accountId: "solana:mainnet:VaultAddress" }],
        }}
        review={false}
        busy={false}
        walletReady
        receipt={null}
        onReview={() => undefined}
        onBack={() => undefined}
        onConfirm={() => undefined}
        onClose={() => undefined}
      />
    </MemoryRouter>,
  );
  expect(html).toContain("$5.00 available");
  expect(html).toContain('href="/money"');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Review transfer<\/button>/);
});

describe("basket enrollment review", () => {
  it("explains the wallet action and separates enrollment from funding", () => {
    const html = renderToStaticMarkup(
      <EnrollmentSheet
        open
        name="Magnificent Seven"
        assetCount={7}
        walletReady
        busy={false}
        completed={false}
        onClose={() => undefined}
        onConfirm={() => undefined}
      />,
    );
    expect(html).toContain("Enroll in Magnificent Seven");
    expect(html).toContain("7 target assets");
    expect(html).toContain("No USDC is invested now");
    expect(html).toContain("Enroll now");
    expect(html).toContain("Cancel");
  });
});
