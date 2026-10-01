import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Button, Card, Screen, Text } from "../src/ui";
import { useEmailLogin } from "../src/auth/useEmailLogin";
import { color, space, type } from "../src/theme";

/**
 * The way in.
 *
 * Two steps, and the second replaces the first rather than sitting beside it —
 * the web's modal does the same. A screen that keeps the email field visible
 * while asking for a code invites someone to edit the address the code was
 * already sent to.
 */
export default function SignIn() {
  const { send, submit, pending, rejected } = useEmailLogin();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);

  const busy = pending !== null;
  const canSend = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  return (
    <Screen
      title={sent ? "Check your email" : "Your wealth. Onchain."}
      subtitle={
        sent
          ? `We sent a six-digit code to ${email.trim()}.`
          : "Sign in with an email. No seed phrase to write down, and you can export the wallet whenever you like."
      }
      footer={
        sent ? (
          <Button
            label={pending === "creating" ? "Making your wallet" : "Continue"}
            busy={busy}
            disabled={code.trim().length < 6}
            onPress={() => void submit(code.trim())}
          />
        ) : (
          <Button
            label="Get code"
            busy={busy}
            disabled={!canSend}
            onPress={() => {
              void send(email.trim()).then((ok) => ok && setSent(true));
            }}
          />
        )
      }
    >
      <Card>
        {sent ? (
          <TextInput
            style={s.code}
            value={code}
            onChangeText={setCode}
            placeholder="000000"
            placeholderTextColor={color.divider}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            editable={!busy}
          />
        ) : (
          <TextInput
            style={s.field}
            value={email}
            onChangeText={setEmail}
            placeholder="you@email.com"
            placeholderTextColor={color.muted}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            editable={!busy}
          />
        )}
      </Card>

      {rejected !== null && (
        <View style={s.problem}>
          <Text variant="small" tone="down">
            {rejected}
          </Text>
        </View>
      )}

      {sent && (
        <Text variant="small" tone="muted" style={s.again} onPress={() => void send(email.trim())}>
          Send another code
        </Text>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  field: { ...type.headline, color: color.ink, paddingVertical: space.sm },
  code: {
    ...type.hero,
    color: color.ink,
    textAlign: "center",
    letterSpacing: 8,
    paddingVertical: space.sm,
  },
  problem: { paddingHorizontal: space.xs },
  again: { textAlign: "center", paddingVertical: space.sm, textDecorationLine: "underline" },
});
