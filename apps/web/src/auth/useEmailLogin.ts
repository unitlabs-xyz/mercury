import { useLoginWithEmail } from "@privy-io/react-auth";
import { useCreateWallet } from "@privy-io/react-auth/solana";
import { useCallback, useEffect, useRef, useState } from "react";

export type Pending = "sending" | "resending" | "checking" | "creating" | null;

export const SEND_MS = 800;
export const RESEND_MS = 650;
export const CHECK_MS = 700;
export const CREATE_MS = 800;

/**
 * A minimum display duration, not simulated latency — and the distinction
 * matters, because this looks like a bug otherwise. The progress hairline is
 * drawn to fill over a known time. A response that beats it would flicker
 * through three designed states in under 100ms, so we hold.
 *
 * A rejection is never held: making a typo wait feels like a network fault.
 */
export const atLeast = async <T>(ms: number, work: Promise<T>): Promise<T> => {
  const floor = new Promise<void>((resolve) => setTimeout(resolve, ms));
  const result = await work;
  await floor;
  return result;
};

export const useEmailLogin = () => {
  const { sendCode, loginWithCode, state } = useLoginWithEmail();

  /**
   * Privy's own flow state, mirrored into a ref so the async helpers below can
   * read it without being re-created on every transition.
   */
  const status = useRef(state.status);
  useEffect(() => {
    status.current = state.status;
  }, [state.status]);

  /**
   * On a cold page load `sendCode` dispatches the email but its promise does
   * not settle until the provider finishes initialising — observed repeatedly,
   * with the code already in the inbox while the button still read "Sending".
   * The documented state machine is the reliable signal, so we take whichever
   * arrives first.
   */
  const reaches = (target: string, timeoutMs = 20_000) =>
    new Promise<void>((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        if (status.current === target) return resolve();
        if (status.current === "error") return reject(new Error("Privy rejected that."));
        if (Date.now() - started > timeoutMs) return reject(new Error("Privy did not respond."));
        setTimeout(tick, 120);
      };
      tick();
    });
  const { createWallet } = useCreateWallet();
  const [pending, setPending] = useState<Pending>(null);
  const [rejected, setRejected] = useState<string | null>(null);

  const send = useCallback(
    async (email: string, resend = false) => {
      setPending(resend ? "resending" : "sending");
      setRejected(null);
      try {
        const call = sendCode({ email }).catch(() => undefined);
        await atLeast(resend ? RESEND_MS : SEND_MS, Promise.race([call, reaches("awaiting-code-input")]));
        return true;
      } catch (cause) {
        setRejected(cause instanceof Error ? cause.message : "That did not work.");
        return false;
      } finally {
        setPending(null);
      }
    },
    [sendCode],
  );

  const submit = useCallback(
    async (code: string) => {
      setPending("checking");
      setRejected(null);
      try {
        await atLeast(CHECK_MS, loginWithCode({ code }));
      } catch (cause) {
        setRejected(cause instanceof Error ? cause.message : "That code did not work.");
        setPending(null);
        return false;
      }
      // Accepted. Now actually make the wallet.
      //
      // `config.embeddedWallets.solana.createOnLogin` does NOT cover us: Privy
      // applies it only to logins through their own modal, and explicitly not
      // to whitelabel flows like `loginWithCode`. Without this call a user ends
      // up with an email linked and no wallet at all.
      setPending("creating");
      await atLeast(
        CREATE_MS,
        // Already having one is success, not failure.
        createWallet().catch(() => undefined),
      );
      setPending(null);
      return true;
    },
    [loginWithCode],
  );

  const reset = useCallback(() => {
    setPending(null);
    setRejected(null);
  }, []);

  return { pending, rejected, send, submit, reset };
};
