import { defaultFetch } from "@mercury/chain";
import type { VmAddresses } from "../routes/fund.js";

/**
 * The addresses `services/treasury` derives from the keys it holds.
 *
 * Asked once, at boot, and held. They come from keys that do not change, and a
 * refund address that depends on an HTTP call succeeding is a deposit that
 * fails for a reason the user cannot act on.
 *
 * This API never sees a key. It asks for addresses and gets addresses — which
 * is the whole point of the split, and the reason `RELAY_REFUND_ADDRESS_*`
 * does not exist. See docs/adr/0015-treasury-service.md.
 */
export const fetchTreasuryAddresses = async (
  url: string,
  secret: string,
  doFetch: typeof fetch = defaultFetch(),
): Promise<VmAddresses> => {
  const res = await doFetch(`${url.replace(/\/$/, "")}/addresses`, {
    headers: { "x-treasury-secret": secret },
  });
  if (!res.ok) throw new Error(`treasury /addresses failed: ${res.status}`);

  const body = (await res.json()) as { readonly addresses?: Partial<VmAddresses> };
  const { evm, svm, bvm } = body.addresses ?? {};
  /*
   * All three or nothing. A partial answer would have the funding routes mount
   * with an address family missing, and the first deposit on that chain would
   * either be quoted with `undefined` or silently skip its refund address.
   * Refusing here means the method is not offered, which is the safe failure.
   */
  if (
    typeof evm !== "string" ||
    typeof svm !== "string" ||
    typeof bvm !== "string" ||
    evm.length === 0 ||
    svm.length === 0 ||
    bvm.length === 0
  ) {
    throw new Error("treasury /addresses did not return all three families");
  }
  return { evm, svm, bvm };
};
