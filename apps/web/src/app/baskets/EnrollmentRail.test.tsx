import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EnrollmentRail } from "./EnrollmentRail";
import { EnrollmentSheet } from "./EnrollmentSheet";

const base = { name: "Magnificent Seven", assetCount: 7, busy: false, signedIn: true, onReview: () => undefined };

describe("basket enrollment rail", () => {
  it("offers enrollment to a signed-in owner without a portfolio", () => {
    const html = renderToStaticMarkup(<EnrollmentRail {...base} portfolio={null} />);
    expect(html).toContain("Enroll in Magnificent Seven");
    expect(html).toContain("Sign to create your own Glider smart account");
    expect(html).toContain("No USDC is invested during enrollment; network fees may apply.");
    expect(html).toContain("Review enrollment");
  });

  it("shows funding, not another enrollment, for an enrolled owner", () => {
    const html = renderToStaticMarkup(<EnrollmentRail {...base} portfolio={{ portfolioId: "portfolio-1" }} />);
    expect(html).toContain("Fund Magnificent Seven");
    expect(html).toContain("Fund with USDC");
    expect(html).not.toContain("Review enrollment");
  });
});

describe("basket enrollment review", () => {
  it("explains the wallet action and separates enrollment from funding", () => {
    const html = renderToStaticMarkup(
      <EnrollmentSheet open name="Magnificent Seven" assetCount={7} walletReady busy={false} completed={false} onClose={() => undefined} onConfirm={() => undefined} />,
    );
    expect(html).toContain("Enroll in Magnificent Seven");
    expect(html).toContain("7 target assets");
    expect(html).toContain("No USDC is invested now");
    expect(html).toContain("Enroll now");
    expect(html).toContain("Cancel");
  });
});
