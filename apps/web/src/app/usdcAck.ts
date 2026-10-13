import { useSyncExternalStore } from "react";

const KEY = "mercury.usdc-only-ack";
const EVENT = "mercury:usdc-only-ack";

/* Held here too, so agreeing works for this visit even where storage is blocked. */
let agreed = false;

const read = (): boolean => {
  if (agreed) return true;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false; // private mode, blocked storage: ask again, which is the safe way to be wrong
  }
};

const subscribe = (onChange: () => void) => {
  // Our own event for the other copy on this page, `storage` for other tabs.
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};

/**
 * Whether this browser has agreed to send only USDC on Solana to the address.
 *
 * The address is not shown in full, or as a code, until it has. People sent SOL
 * to it: the warning sat beside the address, and an address is the thing a
 * person copies without reading what is next to it. Asked once, in whichever
 * place they first reach for the address — Add cash or the account menu — and
 * both open together, because it is one rule about one address.
 *
 * A per-browser convenience, not account state: a new browser asks again,
 * which costs a click and might save a deposit.
 */
export const useUsdcAck = () => {
  const acked = useSyncExternalStore(subscribe, read, () => false);
  const ack = () => {
    agreed = true;
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* not stored: the next visit asks again */
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [acked, ack] as const;
};
