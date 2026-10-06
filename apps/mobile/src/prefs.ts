import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";

/**
 * The few things a person sets once and expects remembered. Kept on the
 * phone, not the account: hiding balances is about who is looking at this
 * screen, and haptics about this device.
 */
export interface Prefs {
  /** Open with the figures hidden, for checking the app in company. */
  readonly hideBalances: boolean;
  readonly haptics: boolean;
}

const KEY = "mercury.prefs.v1";
const DEFAULTS: Prefs = { hideBalances: false, haptics: true };

let prefs: Prefs = DEFAULTS;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/* Read once at start. Until it lands, the defaults stand, which is what a first launch would show anyway. */
void SecureStore.getItemAsync(KEY)
  .then((raw) => {
    if (raw === null) return;
    prefs = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
    listeners.forEach((l) => l());
  })
  .catch(() => undefined);

export const usePrefs = () => useSyncExternalStore(subscribe, () => prefs);

/** For code outside React — the haptics wrapper — that only needs the current value. */
export const currentPrefs = () => prefs;

export const setPref = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
  prefs = { ...prefs, [key]: value };
  listeners.forEach((l) => l());
  void SecureStore.setItemAsync(KEY, JSON.stringify(prefs)).catch(() => undefined);
};
