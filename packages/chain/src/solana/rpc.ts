import { D, ONE, type Decimal } from "@mercury/core";
import type { ChainReader, MintConfig, TokenBalance } from "../ports.js";

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

interface RpcEnvelope<T> {
  readonly result?: T;
  readonly error?: { readonly code: number; readonly message: string };
}

interface ParsedTokenAccount {
  readonly account: {
    readonly data: {
      readonly parsed: {
        readonly info: {
          readonly mint: string;
          readonly tokenAmount: { readonly amount: string; readonly decimals: number };
        };
      };
    };
  };
}

interface ParsedMint {
  readonly data: {
    readonly parsed?: {
      readonly info?: {
        readonly decimals?: number;
        readonly extensions?: readonly {
          readonly extension: string;
          readonly state?: Record<string, unknown>;
        }[];
      };
    };
  };
}

export interface SolanaRpcConfig {
  readonly rpcUrl: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
}

/**
 * Solana JSON-RPC over plain `fetch`. No SDK: `@solana/kit` is not installed
 * until subsystem 3, where signing needs it, and everything read here is
 * already decoded by the node when asked for `jsonParsed`.
 */
export class SolanaRpc implements ChainReader {
  private readonly doFetch: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly config: SolanaRpcConfig) {
    this.doFetch = config.fetch ?? fetch;
    this.now = config.now ?? Date.now;
  }

  private async call<T>(method: string, params: readonly unknown[]): Promise<T> {
    const res = await this.doFetch(this.config.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!res.ok) throw new Error(`solana ${method} returned ${res.status}`);
    const body = (await res.json()) as RpcEnvelope<T>;
    if (body.error !== undefined) throw new Error(`solana ${method}: ${body.error.message}`);
    if (body.result === undefined) throw new Error(`solana ${method} returned no result`);
    return body.result;
  }

  /**
   * Both token programs, because xStocks are Token-2022 and USDC is classic SPL.
   *
   * `tokenAmount.amount` is the raw balance and is the only field read.
   * `uiAmount` is deliberately ignored: whether a node applies the
   * ScaledUiAmount multiplier to it depends on its version, so a portfolio
   * built on it would be right on one RPC provider and wrong on another. The
   * multiplier is applied once, by us, from `mintConfig`.
   */
  async tokenBalances(owner: string): Promise<readonly TokenBalance[]> {
    const pages = await Promise.all(
      [TOKEN_PROGRAM, TOKEN_2022_PROGRAM].map((programId) =>
        this.call<{ value: readonly ParsedTokenAccount[] }>("getTokenAccountsByOwner", [
          owner,
          { programId },
          { encoding: "jsonParsed" },
        ]),
      ),
    );

    const byMint = new Map<string, TokenBalance>();
    for (const page of pages) {
      for (const entry of page.value) {
        const info = entry.account.data.parsed.info;
        const raw = BigInt(info.tokenAmount.amount);
        if (raw === 0n) continue; // a closed position is not a holding
        const seen = byMint.get(info.mint);
        byMint.set(info.mint, {
          mint: info.mint,
          // A wallet may hold several accounts for one mint. They are one holding.
          rawAmount: (seen?.rawAmount ?? 0n) + raw,
          decimals: info.tokenAmount.decimals,
        });
      }
    }
    return [...byMint.values()];
  }

  async mintConfig(mint: string): Promise<MintConfig | null> {
    const result = await this.call<{ value: ParsedMint | null }>("getAccountInfo", [
      mint,
      { encoding: "jsonParsed" },
    ]);
    const info = result.value?.data.parsed?.info;
    if (info === undefined || info.decimals === undefined) return null;

    const extensions = info.extensions ?? [];
    const scaled = extensions.find((e) => e.extension === "scaledUiAmountConfig")?.state;
    const pausable = extensions.find((e) => e.extension === "pausableConfig")?.state;

    return {
      decimals: info.decimals,
      multiplier: this.effectiveMultiplier(scaled),
      isPaused: pausable?.["paused"] === true,
    };
  }

  /**
   * A ScaledUiAmount mint carries the multiplier in force and the next one, with
   * the second taking over at a timestamp. Reading `multiplier` unconditionally
   * understates every share count from the moment a dividend goes effective —
   * measured at 0.08% on NVDAx two weeks after its September 2026 switchover.
   *
   * The values arrive as decimal strings, so they go into Decimal untouched. A
   * mint with no extension has a multiplier of one: one token, one share.
   */
  private effectiveMultiplier(state: Record<string, unknown> | undefined): Decimal {
    if (state === undefined) return ONE;
    const current = typeof state["multiplier"] === "string" ? D(state["multiplier"]) : ONE;
    const next = state["newMultiplier"];
    const at = state["newMultiplierEffectiveTimestamp"];
    if (typeof next !== "string" || typeof at !== "number") return current;
    return this.now() >= at * 1000 ? D(next) : current;
  }
}
