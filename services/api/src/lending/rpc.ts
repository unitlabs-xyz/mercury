import { createDefaultRpcTransport, createSolanaRpcFromTransport, type RpcTransport } from "@solana/kit";
import type { Rotation } from "@mercury/chain";

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

/** Worth another endpoint: rate limited, broken, refusing the method, or a dropped connection. */
const isRefusal = (e: unknown) => {
  const status = statusOf(e);
  if (typeof status === "number") return status === 429 || status === 403 || status >= 500;
  return e instanceof TypeError;
};

/**
 * A transport over a rotation of endpoints (see `rotation` in @mercury/chain),
 * for the background jobs' Kamino reads. One that refuses passes the request
 * on to the next at once. When every one refuses, the last refusal is thrown,
 * or a 429 if all are resting, so `withRetry` backs off as it does for one.
 */
export const rotatingTransport = (
  r: Rotation,
  make: (url: string) => RpcTransport = (url) => createDefaultRpcTransport({ url }),
): RpcTransport => {
  const transports = new Map(r.urls.map((url) => [url, make(url)]));
  return async <T>(config: Parameters<RpcTransport>[0]): Promise<T> => {
    let refusal: unknown = null;
    for (let i = 0; i < r.urls.length; i++) {
      const url = r.next();
      if (url === null) break;
      try {
        const answer = await transports.get(url)!<T>(config);
        r.served(url);
        return answer;
      } catch (error: unknown) {
        if (!isRefusal(error)) throw error;
        r.refused(url);
        refusal = error;
      }
    }
    r.strained();
    throw (
      refusal ?? Object.assign(new Error("every RPC endpoint is resting"), { context: { statusCode: 429 } })
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
