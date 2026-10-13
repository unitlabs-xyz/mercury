import { NETWORK, p2wpkh, WIF } from "@scure/btc-signer";
import { secp256k1 } from "@noble/curves/secp256k1";

/**
 * A Bitcoin address from the key that spends it, as p2wpkh.
 *
 * `bc1q…`, segwit v0, which is the format Relay's own tooling speaks — their
 * native BTC identifier in `GET /chains` is bech32 v0. Taproot would also work
 * and buys nothing here, and the choice is not an implementation detail:
 * Bitcoin addresses are case-sensitive and a refund sent to the wrong format
 * is not recoverable. See docs/adr/0015-treasury-service.md.
 *
 * Both input formats are accepted for the reason `parseSolanaSecretKey`
 * records: a deploy that fails on a format nobody documented costs more than a
 * branch.
 */
export const bvmAddressFrom = (raw: string, label = "Bitcoin key"): string => {
  const text = raw.trim();
  if (text.length === 0) throw new Error(`The ${label} is empty.`);

  let priv: Uint8Array;
  if (/^(0x)?[0-9a-f]{64}$/i.test(text)) {
    const hex = text.replace(/^0x/i, "");
    priv = Uint8Array.from({ length: 32 }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  } else {
    try {
      /*
       * Mainnet only, and `WIF(NETWORK)` enforces it — a testnet key carries a
       * different version byte and is refused with "Wrong WIF prefix". Letting
       * one through would derive a perfectly plausible mainnet address for a
       * key that cannot spend from it, which is the exact failure this module
       * exists to make impossible.
       */
      priv = WIF(NETWORK).decode(text);
    } catch {
      throw new Error(`The ${label} is neither 32 bytes of hex nor a mainnet WIF.`);
    }
  }

  const { address } = p2wpkh(secp256k1.getPublicKey(priv, true));
  /* v8 ignore next -- p2wpkh always names an address for a valid public key;
     the narrowing exists because the type allows what the library does not. */
  if (address === undefined) throw new Error(`The ${label} did not produce an address.`);
  return address;
};
