import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ wallets: undefined as { isPrimary: boolean }[] | undefined }));
vi.mock("../../api/wallets", () => ({
  useAccountWallets: () => ({ data: state.wallets === undefined ? undefined : { wallets: state.wallets } }),
}));
vi.mock("../Panels", () => ({ usePanels: () => ({ linkedWallets: () => undefined }) }));
const { LinkPrompt } = await import("./LinkPrompt");

const render = () => renderToStaticMarkup(createElement(LinkPrompt));

beforeEach(() => {
  state.wallets = undefined;
});

describe("LinkPrompt", () => {
  it("offers to link a wallet to someone who has only the Mercury wallet", () => {
    state.wallets = [{ isPrimary: true }];
    const html = render();
    expect(html).toContain("Link a wallet");
    expect(html).toContain("Phantom or another Solana wallet");
    expect(html).toContain("Not now");
  });

  it("says nothing once a wallet is linked: Home shows every wallet then", () => {
    state.wallets = [{ isPrimary: true }, { isPrimary: false }];
    expect(render()).toBe("");
  });

  it("says nothing before the wallets have loaded, so it never flashes", () => {
    expect(render()).toBe("");
  });
});
