import { useQuery } from "@tanstack/react-query";

/**
 * One token's dollar price from Relay, or null when it has none.
 *
 * Asked of Relay directly. Its price endpoint is public, keyless and open to
 * browsers, and it is the same index that will quote the swap, so the figure
 * on screen and the quote come from one source. Going through our API would
 * add a hop and a deploy for no key to protect.
 */
export const fetchRelayPrice = async (
  chainId: number,
  currency: string,
  signal?: AbortSignal,
): Promise<number | null> => {
  const qs = new URLSearchParams({ address: currency, chainId: String(chainId) });
  const res = await fetch(`https://api.relay.link/currencies/token/price?${qs.toString()}`, {
    signal: signal ?? null,
  });
  if (!res.ok) throw new Error(`relay price ${res.status}`);
  const body = (await res.json()) as { price?: unknown };
  return typeof body.price === "number" && Number.isFinite(body.price) && body.price > 0 ? body.price : null;
};

/**
 * What one whole token is worth in dollars, for the amount field.
 *
 * A display figure only: it lets somebody type dollars and see the tokens
 * that takes, or the other way round. Nothing is priced from it — Relay
 * prices the quote itself when the swap is asked for. `null` is a token with
 * no price.
 */
export const useFundPrice = (chainId: number, currency: string) =>
  useQuery<number | null>({
    queryKey: ["fund-price", chainId, currency],
    /* A figure under a text field does not need to move faster than this. */
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: 1,
    queryFn: ({ signal }) => fetchRelayPrice(chainId, currency, signal),
  });
