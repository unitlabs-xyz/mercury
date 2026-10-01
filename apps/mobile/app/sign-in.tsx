import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, CodeInput, Field, Screen, Text } from "../src/ui";
import { useEmailLogin } from "../src/auth/useEmailLogin";
import { space } from "../src/theme";

const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
  const { send, submit, pending, rejected } = useEmailLogin();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);

  const busy = pending !== null;
  const canSend = LOOKS_LIKE_EMAIL.test(email.trim());

  const sendTo = () => {
    void send(email.trim()).then((ok) => ok && setSent(true));
  };

  if (!sent) {
    return (
      <Screen
        onBack={() => router.back()}
        title="What's your email?"
        subtitle="We'll send a six-digit code. There's no password to choose and none to forget."
        footer={<Button label="Send code" busy={busy} disabled={!canSend} onPress={sendTo} />}
      >
        <Field
          label="EMAIL"
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
      </Screen>
    );
  }

  return (
    <Screen
      onBack={() => {
        setSent(false);
        setCode("");
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
          onPress={() => void submit(code)}
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
          onFilled={(full) => void submit(full)}
        />
        {rejected !== null && (
          <Text variant="small" tone="down" style={s.problem}>
            {rejected}
          </Text>
        )}
      </View>

      <Text variant="small" tone="brand" style={s.again} onPress={() => void send(email.trim())}>
        Send another code
      </Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  code: { gap: space.sm },
  problem: { paddingHorizontal: space.xs },
  again: { textAlign: "center", paddingVertical: space.xs },
});
