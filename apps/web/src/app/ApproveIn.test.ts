import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApproveIn, MercuryTip } from "./ApproveIn";

const render = (props: Parameters<typeof ApproveIn>[0]) =>
  renderToStaticMarkup(createElement(ApproveIn, props));
const tip = (props: Parameters<typeof MercuryTip>[0]) =>
  renderToStaticMarkup(createElement(MercuryTip, props));

describe("ApproveIn", () => {
  it("says where a linked wallet's action is approved, and nothing else: the tip goes under the button", () => {
    const html = render({ approver: "Phantom" });
    expect(html).toContain("You&#x27;ll approve this in Phantom.");
    expect(html).not.toContain("Tip:");
  });

  it("says nothing for the Mercury wallet, which approves in Mercury", () => {
    expect(render({ approver: null })).toBe("");
  });
});

describe("MercuryTip", () => {
  it("is the quiet line under a linked wallet's button", () => {
    expect(tip({ approver: "Phantom" })).toContain("Tip: this would be one tap from your Mercury wallet.");
  });

  it("says nothing for the Mercury wallet", () => {
    expect(tip({ approver: null })).toBe("");
  });
});
