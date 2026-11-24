import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApproveIn } from "./ApproveIn";

const render = (props: Parameters<typeof ApproveIn>[0]) =>
  renderToStaticMarkup(createElement(ApproveIn, props));

describe("ApproveIn", () => {
  it("says where a linked wallet's action is approved, with the quiet tip beneath", () => {
    const html = render({ approver: "Phantom" });
    expect(html).toContain("You&#x27;ll approve this in Phantom.");
    expect(html).toContain("Tip: this would be one tap from your Mercury wallet.");
  });

  it("leaves the tip off where asked: the move into the Mercury wallet itself", () => {
    expect(render({ approver: "Phantom", tip: false })).not.toContain("Tip:");
  });

  it("says nothing for the Mercury wallet, which approves in Mercury", () => {
    expect(render({ approver: null })).toBe("");
  });
});
