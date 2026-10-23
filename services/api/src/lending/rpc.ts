import { createDefaultRpcTransport, createSolanaRpcFromTransport, type RpcTransport } from "@solana/kit";
import { isRefusalMessage, type Rotation } from "@mercury/chain";

/** Solana's own public endpoint. Slow and rate-limited, but it answers a full program scan. */
export const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";

/**
 * Scans of a whole program's accounts. Kamino's SDK runs one to find a market's
 * reserves, and it costs more than a starter RPC plan allows in a second, so
 * those go to an endpoint that serves them. It runs about every 30 seconds.
 */
const SCANS = new Set(["getProgramAccounts"]);

const isRateLimited = (e: unknown) =>
  (e as { context?: { statusCode?: number } } | null)?.context?.statusCode === 429;

/** Retry a rate-limited request a few times with backoff, as the provider asks. */
const withRetry =
  (transport: RpcTransport, attempts = 4): RpcTransport =>
  async <T>(config: Parameters<RpcTransport>[0]): Promise<T> => {
    for (let i = 0; ; i++) {
      try {
        return await transport<T>(config);
      } catch (e) {
        if (!isRateLimited(e) || i >= attempts - 1) throw e;
        await new Promise((r) => setTimeout(r, 250 * 2 ** i));
      }
    }
  };

const statusOf = (e: unknown) => (e as { context?: { statusCode?: unknown } } | null)?.context?.statusCode;

/** Worth another endpoint: any answer but a 2xx, or a dropped connection. */
const isRefusal = (e: unknown) => typeof statusOf(e) === "number" || e instanceof TypeError;

/** An answer whose error says the endpoint refused the call (`isRefusalMessage`), not that the call was wrong. */
const refusedInside = (answer: unknown) => {
  const message = (answer as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === "string" && isRefusalMessage(message);
};

/**
 * A transport over a rotation of endpoints (see `rotation` in @mercury/chain),
 * for the background jobs' Kamino reads, resting each per method. One that
 * refuses passes the request on to the next at once: any answer but a 2xx, or
 * a 200 refusing the call in words. When every one refuses, the fallback is
 * asked at its own pace; when that refuses too, the last refusal is the
 * answer, or a 429 if all are resting, so `withRetry` backs off as it does for
 * one endpoint.
 */
export const rotatingTransport = (
  r: Rotation,
  make: (url: string) => RpcTransport = (url) => createDefaultRpcTransport({ url }),
): RpcTransport => {
  const transports = new Map(r.urls.map((url) => [url, make(url)]));
  const fallback = r.fallback === null ? null : make(r.fallback);
  return async <T>(config: Parameters<RpcTransport>[0]): Promise<T> => {
    const method = (config.payload as { method?: string } | null)?.method;
    let thrown: unknown = null;
    let answered: { readonly answer: T } | null = null;
    for (let i = 0; i < r.urls.length; i++) {
      const url = r.next(method);
      if (url === null) break;
      await r.wait();
      try {
        const answer = await transports.get(url)!<T>(config);
        if (!refusedInside(answer)) {
          r.served(url, method);
          return answer;
        }
        r.refused(url, method);
        answered = { answer };
      } catch (error: unknown) {
        if (!isRefusal(error)) throw error;
        r.refused(url, method);
        thrown = error;
      }
    }
    if (fallback !== null) {
      await r.waitFallback();
      try {
        const answer = await fallback<T>(config);
        if (!refusedInside(answer)) return answer;
        answered = { answer };
      } catch (error: unknown) {
        if (!isRefusal(error)) throw error;
        thrown = error;
      }
    }
    r.strained();
    if (answered !== null) return answered.answer;
    throw (
      thrown ?? Object.assign(new Error("every RPC endpoint is resting"), { context: { statusCode: 429 } })
    );
  };
};

/**
 * One RPC client over two endpoints: `rpcUrl` for everything, `scanRpcUrl` for
 * program scans. Both retry on a 429. With `rotation`, everything but the
 * scans goes over it instead of `rpcUrl`.
 */
export function createLendingRpc(rpcUrl: string, scanRpcUrl: string = PUBLIC_RPC, rotation?: Rotation) {
  const main = withRetry(
    rotation === undefined ? createDefaultRpcTransport({ url: rpcUrl }) : rotatingTransport(rotation),
  );
  const scan = withRetry(createDefaultRpcTransport({ url: scanRpcUrl }));
  const transport: RpcTransport = (config) => {
    const method = (config.payload as { method?: string } | null)?.method;
    return (method !== undefined && SCANS.has(method) ? scan : main)(config);
  };
  return createSolanaRpcFromTransport(transport);
}
