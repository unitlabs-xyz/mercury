import { useCallback, useState } from "react";
import { useLoginWithEmail, useEmbeddedSolanaWallet } from "@privy-io/expo";

export type Pending = "sending" | "resending" | "checking" | "creating" | null;

/**
 * Email, a code, a wallet.
 *
 * The same three steps the web app runs, and the same trap at the end of them:
 * `embeddedWallets.solana.createOnLogin` does **not** cover this. Privy applies
 * it to logins through their own modal and explicitly not to whitelabel flows
 * like `loginWithCode`, so without the explicit `create()` below a person ends
 * up with an email linked and no wallet at all — signed in, and unable to hold
 * anything.
 *
 * No minimum display duration here, unlike the web. That exists to stop a
 * progress hairline flickering through three states in under 100ms; a phone
 * shows a spinner in a button and has nothing to flicker.
 */
export const useEmailLogin = () => {
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const wallet = useEmbeddedSolanaWallet();
  const [pending, setPending] = useState<Pending>(null);
  const [rejected, setRejected] = useState<string | null>(null);

  const send = useCallback(
    async (email: string, resend = false): Promise<boolean> => {
      setRejected(null);
      setPending(resend ? "resending" : "sending");
      try {
        await sendCode({ email });
        return true;
      } catch (cause: unknown) {
        setRejected(cause instanceof Error ? cause.message : "That email was not accepted.");
        return false;
      } finally {
        setPending(null);
      }
    },
    [sendCode],
  );

  const submit = useCallback(
    async (code: string): Promise<boolean> => {
      setRejected(null);
      setPending("checking");
      try {
        await loginWithCode({ code });
      } catch (cause: unknown) {
        setRejected(cause instanceof Error ? cause.message : "That code did not work.");
        setPending(null);
        return false;
      }

      // Accepted. Now actually make the wallet; see the note above.
      setPending("creating");
      // Already having one is success, not failure.
      await wallet.create?.().catch(() => undefined);
      setPending(null);
      return true;
    },
    [loginWithCode, wallet],
  );

  const reset = useCallback(() => {
    setPending(null);
    setRejected(null);
  }, []);

  return { send, submit, reset, pending, rejected };
};
