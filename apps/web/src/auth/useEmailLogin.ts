import { useLoginWithEmail } from "@privy-io/react-auth";
import { useCallback, useState } from "react";

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
export const atLeast = async <T,>(ms: number, work: Promise<T>): Promise<T> => {
  const floor = new Promise<void>((resolve) => setTimeout(resolve, ms));
  const result = await work;
  await floor;
  return result;
};

export const useEmailLogin = () => {
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const [pending, setPending] = useState<Pending>(null);
  const [rejected, setRejected] = useState<string | null>(null);

  const send = useCallback(
    async (email: string, resend = false) => {
      setPending(resend ? "resending" : "sending");
      setRejected(null);
      try {
        await atLeast(resend ? RESEND_MS : SEND_MS, sendCode({ email }));
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
      // Accepted. Privy is provisioning the wallet behind this step.
      setPending("creating");
      await atLeast(CREATE_MS, Promise.resolve());
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
