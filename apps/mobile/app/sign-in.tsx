import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, CodeInput, Field, Screen, Text } from "../src/ui";
import { useEmailLogin } from "../src/auth/useEmailLogin";
import { color, radius, space } from "../src/theme";

const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/* The web's wait before another code can be asked for, so a double tap is one email. */
const RESEND_SECONDS = 30;

/**
 * Email, then the code.
 *
 * Two steps, and the second replaces the first rather than sitting beside it —
 * the web's modal does the same. A screen that keeps the email field visible
 * while asking for a code invites someone to edit the address the code was
 * already sent to.
 */
export default function SignIn() {
  const router = useRouter();
  const { send, submit, reset, pending, rejected } = useEmailLogin();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [resent, setResent] = useState(false);

  const busy = pending !== null;
  const canSend = LOOKS_LIKE_EMAIL.test(email.trim());

  useEffect(() => {
    if (!sent || pending !== null || seconds <= 0) return undefined;
    const t = setTimeout(() => setSeconds((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [sent, pending, seconds]);

  useEffect(() => {
    if (!resent) return undefined;
    const t = setTimeout(() => setResent(false), 2600);
    return () => clearTimeout(t);
  }, [resent]);

  const sendTo = () => {
    void send(email.trim()).then((ok) => {
      if (!ok) return;
      setSeconds(RESEND_SECONDS);
      setSent(true);
    });
  };

  /*
   * The old digits go before the new code arrives. Left in place, iOS autofills
   * the new code onto the end of them, the field keeps the first six — the old
   * code — and submits that on its own, so a resend looked like it re-sent the
   * stale code and never let the new one in.
   */
  const sendAgain = () => {
    if (busy || seconds > 0) return;
    setCode("");
    void send(email.trim(), true).then((ok) => {
      if (!ok) return;
      setSeconds(RESEND_SECONDS);
      setResent(true);
    });
  };

  const check = (full: string) => {
    void submit(full).then((ok) => {
      // A refused code is cleared, as on the web, so the next one starts in an empty field.
      if (!ok) setCode("");
    });
  };

  if (!sent) {
    return (
      <Screen
        onBack={() => router.back()}
        title="What's your email?"
        subtitle="We'll send a six-digit code. There's no password to choose and none to forget."
        footer={<Button label="Send code" busy={busy} disabled={!canSend} onPress={sendTo} />}
      >
        {/* On a white card, as the web sets it in its dialog and Send sets its fields. */}
        <View style={s.card}>
          <Field
            label="Email"
            icon="mail"
            value={email}
            onChangeText={setEmail}
            problem={rejected}
            placeholder="you@email.com"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            editable={!busy}
            returnKeyType="go"
            onSubmitEditing={() => canSend && sendTo()}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      onBack={() => {
        /* A wrong code is no fault of the address, so it does not follow it back. */
        reset();
        setSent(false);
        setCode("");
        setResent(false);
      }}
      title="Enter the code"
      subtitle={`Sent to ${email.trim()}.`}
      footer={
        <Button
          /* Named for what is happening. Making the wallet is the slow step and
             the one that looks like nothing, so it says so. */
          label={pending === "creating" ? "Setting up your wallet" : "Continue"}
          busy={busy}
          disabled={code.length < 6}
          onPress={() => check(code)}
        />
      }
    >
      <View style={s.code}>
        <CodeInput
          value={code}
          onChange={setCode}
          editable={!busy}
          /* Submits itself on the sixth digit: having typed the whole code,
             reaching for a button is a step that buys nothing. */
          onFilled={check}
        />
        {rejected !== null && (
          <Text variant="small" tone="down" style={s.problem}>
            {rejected}
          </Text>
        )}
      </View>

      {pending === "resending" ? (
        <Text variant="small" tone="muted" style={s.again}>
          Sending a new code
        </Text>
      ) : resent ? (
        <Text variant="small" tone="up" style={s.again}>
          A new code is on its way
        </Text>
      ) : seconds > 0 ? (
        <Text variant="small" tone="muted" style={s.again}>
          Didn't get a code? Send another in {seconds}s
        </Text>
      ) : (
        <Text
          variant="small"
          tone="brand"
          style={s.again}
          accessibilityRole="button"
          disabled={busy}
          onPress={sendAgain}
        >
          Send another code
        </Text>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: radius.lg, backgroundColor: color.surface, padding: space.md },
  code: { gap: space.sm },
  problem: { paddingHorizontal: space.xs },
  again: { textAlign: "center", paddingVertical: space.xs },
});
