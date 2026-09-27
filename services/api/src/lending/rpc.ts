import { createDefaultRpcTransport, createSolanaRpcFromTransport, type RpcTransport } from "@solana/kit";

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

/**
 * One RPC client over two endpoints: `rpcUrl` for everything, `scanRpcUrl` for
 * program scans. Both retry on a 429.
 */
export function createLendingRpc(rpcUrl: string, scanRpcUrl: string = PUBLIC_RPC) {
  const main = withRetry(createDefaultRpcTransport({ url: rpcUrl }));
  const scan = withRetry(createDefaultRpcTransport({ url: scanRpcUrl }));
  const transport: RpcTransport = (config) => {
    const method = (config.payload as { method?: string } | null)?.method;
    return (method !== undefined && SCANS.has(method) ? scan : main)(config);
  };
  return createSolanaRpcFromTransport(transport);
}
